// shared/cuidadoPastoralDb.js (v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo)
//
// A camada de banco da regra pura de shared/cuidadoPastoral.js. Reúne os fatos, pede a decisão à regra e grava só o que ela decidiu. Nada aqui inventa regra.
//
// Quem vê o quê (decidido uma vez, aqui, e conferido pelos roteiros ponta a ponta):
//   - a LIDERANÇA (permissão cuidado_pastoral, sessão de liderança) vê a fila, os pedidos de oração e o boletim do seu território (o Dirigente, a congregação; o Pastor de Área, a
//     área; o Superintendente, a região; o nível geral, tudo), abre, atribui, adia, conclui e cancela itens, e escreve e lê notas conforme o nível;
//   - o RESPONSÁVEL nomeado (qualquer membro, inclusive por PIN) vê só os itens dele, registra contato, conclui e escreve nota de nível "equipe";
//   - a PESSOA ACOMPANHADA nunca vê o item nem as notas sobre ela (nem se for da liderança): para ela não existem; ela vê só os pedidos que ela mesma fez;
//   - as notas sobre um membro seguem a congregação ATUAL dele (Regimento Art. 132 §1º, II: quem mudou de congregação some da visão do Dirigente antigo);
//   - cada abertura de nota fica registrada (quem e quando, nunca o conteúdo); a auditoria guarda só ids e códigos.
// Toda resposta de escrita é { sucesso, mensagem, ... }; `naoExiste` = 404 (a mesma resposta para o que não existe e para o que a pessoa não pode ver), `mudou` = 409, `limite` = 429.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const cp = require("./cuidadoPastoral");
const { hojeBrasilia } = require("./dataBrasilia");
const { notificarAgora, lerPrazoDias } = require("./canaisDb");
const { ancestraisTerritoriais } = require("./escopo");
const { obterTrava } = require("./financeiroSeguro");

const PERMISSAO = "cuidado_pastoral";
const PAPEL_DIRIGENTE = "Dirigente de Congregação";
const RETENCAO = {
  itens: { categoria: "Cuidado pastoral — acompanhamentos", padrao: 1825 },
  pedidos: { categoria: "Cuidado pastoral — pedidos de oração", padrao: 365 },
  pedidosRisco: { categoria: "Cuidado pastoral — pedidos de oração com sinal de risco", padrao: 1825 },
  notas: { categoria: "Cuidado pastoral — notas pastorais após a saída", padrao: 30 }
};
const DEGRAU_DO_ESCOPO = { CONGREGACAO: "CONGREGACAO", AREA: "AREA", REGIAO: "REGIAO", GLOBAL: "GERAL" };
const LIMITE_FILA = 400;
const ENCERRADOS_DIAS = 90;                 // a aba "encerrados" mostra os últimos 90 dias

const numeroDoErro = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const duplicado = (e) => numeroDoErro(e) === 2627 || numeroDoErro(e) === 2601;
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const mesmo = (a, b) => a != null && b != null && Number(a) === Number(b);
const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const destinatarioDe = (m) => ({ membroId: m.membroId != null ? m.membroId : m.MembroId, nome: m.nome != null ? m.nome : m.Nome, email: m.email !== undefined ? m.email : m.Email });
function semRepetidos(lista, fora = []) {
  const excluir = new Set(fora.filter((x) => x != null).map(Number));
  const vistos = new Set();
  return (lista || []).filter((d) => { if (!d || excluir.has(Number(d.membroId)) || vistos.has(Number(d.membroId))) return false; vistos.add(Number(d.membroId)); return true; });
}
// A auditoria guarda só o id e o código do ato: nunca texto de nota, de pedido, nome de quem é acompanhado nem sinal de risco.
async function auditar(tabela, registroId, acao, usuarioId) {
  await registrarAuditoria({ tabela, registroId: registroId || 0, acao, usuarioId: usuarioId || null, dadosDepois: {} });
}

// ---------------------------------------------------------------
// Configuração (em memória por 15 segundos: só os prazos, nunca dado de pessoa)
// ---------------------------------------------------------------

const CACHE_CONFIG_MS = 15000;
const CACHES = new Map();
function comCache(chave, ler) {
  const agora = Date.now();
  const e = CACHES.get(chave);
  if (e && e.ate > agora) return e.promessa;
  const promessa = Promise.resolve().then(ler);
  const entrada = { ate: agora + CACHE_CONFIG_MS, promessa };
  CACHES.set(chave, entrada);
  promessa.catch(() => { if (CACHES.get(chave) === entrada) CACHES.delete(chave); });
  return promessa;
}
function limparCaches() { CACHES.clear(); }
async function lerPrazos(pool) {
  return comCache("prazos", async () => {
    const lidos = {};
    for (const sigla of cp.SIGLAS_PRAZO) lidos[sigla] = await lerPrazoDias(pool, sigla, null);
    return cp.prazosDoCuidado(lidos);
  });
}
async function diasDeRetencao(pool, chave) {
  const r = RETENCAO[chave];
  const linha = (await pool.request().input("c", sql.NVarChar(60), r.categoria).query(`SELECT TOP 1 DiasRetencao FROM PoliticasRetencao WHERE Categoria = @c AND Ativo = 1`)).recordset[0];
  const n = linha ? Number(linha.DiasRetencao) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : r.padrao;
}

// ---------------------------------------------------------------
// O território: quem está em cada degrau da escada
// ---------------------------------------------------------------

// { CONGREGACAO:[...], AREA:[...], REGIAO:[...], GERAL:[...] } com { membroId, nome, email, pastor } de quem tem a permissão no degrau que alcança a congregação.
async function liderancaDoTerritorio(pool, congregacaoId) {
  const anc = await ancestraisTerritoriais(pool, sql, 1, congregacaoId);
  const r = await pool.request().input("perm", sql.NVarChar(60), `%,${PERMISSAO},%`).input("c", sql.Int, congregacaoId).input("a", sql.Int, anc.areaId || null).input("rg", sql.Int, anc.regiaoId || null).query(`
    SELECT DISTINCT l.EscopoTipo, m.MembroId AS membroId, m.Nome AS nome, m.Email AS email, m.CargoMinisterial
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE (',' + p.Permissoes + ',') LIKE @perm AND m.Status = 'ATIVO' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      AND ((l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c) OR (l.EscopoTipo = 'AREA' AND l.EscopoId = @a) OR (l.EscopoTipo = 'REGIAO' AND l.EscopoId = @rg) OR l.EscopoTipo = 'GLOBAL')`);
  const t = { CONGREGACAO: [], AREA: [], REGIAO: [], GERAL: [] };
  for (const l of r.recordset) {
    const degrau = DEGRAU_DO_ESCOPO[l.EscopoTipo];
    if (degrau) t[degrau].push({ membroId: l.membroId, nome: l.nome, email: l.email, pastor: l.CargoMinisterial === "PASTOR" });
  }
  for (const k of Object.keys(t)) t[k] = semRepetidos(t[k]);
  return t;
}
const degrausComGente = (territorio, fora = []) => new Set(Object.keys(territorio).filter((k) => semRepetidos(territorio[k], fora).length > 0));
const todosDoTerritorio = (territorio, fora = []) => semRepetidos([...territorio.CONGREGACAO, ...territorio.AREA, ...territorio.REGIAO, ...territorio.GERAL], fora);

// O Dirigente atual da congregação (o responsável padrão de todo item que nasce sem um).
async function dirigenteDa(pool, congregacaoId) {
  return (await pool.request().input("c", sql.Int, congregacaoId).input("papel", sql.NVarChar(100), PAPEL_DIRIGENTE).query(`
    SELECT TOP 1 m.MembroId AS membroId, m.Nome AS nome, m.Email AS email FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = @papel
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c AND m.Status = 'ATIVO' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    ORDER BY l.LiderancaId DESC`)).recordset[0] || null;
}
async function ehPastor(pool, membroId) {
  const m = (await pool.request().input("m", sql.Int, membroId).query(`SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
  return !!m && m.CargoMinisterial === "PASTOR";
}
async function congregacao(pool, congregacaoId) {
  return (await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0] || null;
}
async function pessoa(pool, membroId) {
  return (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Email, m.Telefone, m.Status, m.DataNascimento, m.CongregacaoId, c.Nome AS CongregacaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0] || null;
}
// `ver`: { membroId, gestao, geral, podeVerCongregacao(nome) } — montado pela rota a partir da sessão de liderança.
const alcanca = (ver, congregacaoNome) => !!(ver && ver.gestao && (ver.geral || (congregacaoNome && ver.podeVerCongregacao && ver.podeVerCongregacao(congregacaoNome))));

// ---------------------------------------------------------------
// O item
// ---------------------------------------------------------------

const SELECT_ITEM = `
  SELECT i.ItemId, i.Tipo, i.CongregacaoId, c.Nome AS CongregacaoNome, i.MembroId, COALESCE(m.Nome, i.PessoaNome) AS PessoaNomeExibido, i.PessoaContato,
         m.Telefone AS MembroTelefone, m.Email AS MembroEmail, m.DataNascimento AS MembroNascimento, i.Motivo, i.Origem, i.PedidoOracaoId, i.Urgente, i.DeteccaoResumo,
         i.ResponsavelMembroId, r.Nome AS ResponsavelNome, i.PrazoEm, i.Nivel, i.Escalonamentos, i.LembretesGerais, i.Status, i.Desfecho, i.EncerradoEm, i.PrimeiroContatoEm,
         i.CriadoEm, i.CriadoPorMembroId, i.AnonimizadoEm
  FROM CuidadoItens i JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId LEFT JOIN MembroReferencia m ON m.MembroId = i.MembroId
  LEFT JOIN MembroReferencia r ON r.MembroId = i.ResponsavelMembroId`;

async function carregarItem(pool, itemId) {
  return (await pool.request().input("id", sql.Int, itemId).query(`${SELECT_ITEM} WHERE i.ItemId = @id`)).recordset[0] || null;
}
// "GESTAO" | "RESPONSAVEL" | null. A pessoa acompanhada nunca tem acesso ao próprio item.
function acessoAoItem(ver, item) {
  if (!ver || !item) return null;
  if (item.MembroId && mesmo(item.MembroId, ver.membroId)) return null;
  if (alcanca(ver, item.CongregacaoNome)) return "GESTAO";
  if (mesmo(item.ResponsavelMembroId, ver.membroId)) return "RESPONSAVEL";
  return null;
}
function ehMenor(item, hoje) {
  const idade = require("./voluntariado").idadeEmAnos(item.MembroNascimento, hoje);
  return idade != null && idade < cp.MAIORIDADE;
}
function formatarItem(i, { agora = new Date(), acesso = "GESTAO", completo = false } = {}) {
  const hoje = hojeBrasilia(agora);
  const base = {
    itemId: i.ItemId, tipo: i.Tipo, tipoRotulo: (cp.TIPOS[i.Tipo] || {}).rotulo || i.Tipo, congregacaoId: i.CongregacaoId, congregacaoNome: i.CongregacaoNome,
    pessoaNome: i.PessoaNomeExibido || (i.AnonimizadoEm ? "(anonimizado)" : null), menor: ehMenor(i, hoje), origem: i.Origem, origemRotulo: cp.ORIGENS[i.Origem] || i.Origem,
    urgente: !!i.Urgente, responsavel: i.ResponsavelMembroId ? { membroId: i.ResponsavelMembroId, nome: i.ResponsavelNome } : null,
    prazoEm: iso(i.PrazoEm), prazo: i.Status === "ABERTO" ? cp.situacaoDoPrazo(i.PrazoEm, agora) : null, nivel: i.Nivel, nivelRotulo: cp.DEGRAUS[i.Nivel] || i.Nivel,
    status: i.Status, desfecho: i.Desfecho, desfechoRotulo: cp.DESFECHOS_CONCLUSAO[i.Desfecho] || cp.DESFECHOS_CANCELAMENTO[i.Desfecho] || null,
    encerradoEm: iso(i.EncerradoEm), criadoEm: iso(i.CriadoEm), primeiroContatoEm: iso(i.PrimeiroContatoEm)
  };
  if (acesso === "GESTAO") { base.membroId = i.MembroId || null; base.pedidoOracaoId = i.PedidoOracaoId || null; base.deteccaoResumo = i.DeteccaoResumo || null; }
  else if (i.Origem === "DETECCAO") base.deteccaoResumo = i.DeteccaoResumo || null;
  if (completo) {
    base.motivo = i.Motivo || null;
    base.contato = i.MembroId ? [i.MembroTelefone, i.MembroEmail].filter(Boolean).join(" · ") || null : i.PessoaContato || null;
    base.sugestaoAbandono = i.Tipo === "AFASTAMENTO" && cp.DESFECHOS_ABANDONO.includes(i.Desfecho);
  }
  return base;
}
async function eventosDoItem(pool, itemId) {
  const r = await pool.request().input("id", sql.Int, itemId).query(`
    SELECT e.EventoId, e.Tipo, e.Em, e.MembroId, p.Nome AS PorNome, e.Forma, e.Conseguiu, e.Acompanhante, e.Observacao, e.NivelDe, e.NivelPara, e.PrazoNovo, e.ResponsavelMembroId, rn.Nome AS ResponsavelNome
    FROM CuidadoEventos e LEFT JOIN MembroReferencia p ON p.MembroId = e.MembroId LEFT JOIN MembroReferencia rn ON rn.MembroId = e.ResponsavelMembroId
    WHERE e.ItemId = @id ORDER BY e.EventoId`);
  return r.recordset.map((e) => ({
    eventoId: e.EventoId, tipo: e.Tipo, em: iso(e.Em), por: e.MembroId ? e.PorNome : "Rotina do sistema", forma: e.Forma, formaRotulo: cp.FORMAS_CONTATO[e.Forma] || null,
    conseguiu: e.Conseguiu == null ? null : !!e.Conseguiu, acompanhante: e.Acompanhante, observacao: e.Observacao, nivelDe: e.NivelDe, nivelPara: e.NivelPara,
    nivelParaRotulo: cp.DEGRAUS[e.NivelPara] || null, prazoNovo: iso(e.PrazoNovo), responsavelNome: e.ResponsavelMembroId ? e.ResponsavelNome : null
  }));
}
async function inserirEvento(request, ev) {
  const r = await request.input("i", sql.Int, ev.itemId).input("t", sql.NVarChar(16), ev.tipo).input("m", sql.Int, ev.membroId || null).input("em", sql.DateTime2, ev.em || new Date())
    .input("f", sql.NVarChar(16), ev.forma || null).input("cs", sql.Bit, ev.conseguiu == null ? null : ev.conseguiu ? 1 : 0).input("ac", sql.NVarChar(150), ev.acompanhante || null)
    .input("ob", sql.NVarChar(300), ev.observacao || null).input("nd", sql.NVarChar(12), ev.nivelDe || null).input("np", sql.NVarChar(12), ev.nivelPara || null)
    .input("pz", sql.DateTime2, ev.prazoNovo || null).input("rp", sql.Int, ev.responsavelMembroId || null)
    .query(`INSERT INTO CuidadoEventos (ItemId, Tipo, MembroId, Em, Forma, Conseguiu, Acompanhante, Observacao, NivelDe, NivelPara, PrazoNovo, ResponsavelMembroId)
            VALUES (@i, @t, @m, @em, @f, @cs, @ac, @ob, @nd, @np, @pz, @rp); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
  return r.recordset[0].id;
}

// Quem pode ser nomeado responsável por um item desta congregação (o mesmo critério da abertura e da troca).
async function conferirResponsavel(pool, membroId, item, hoje) {
  const p = await pessoa(pool, membroId);
  if (!p) return { ok: false, mensagem: "Pessoa não encontrada." };
  const territorio = await liderancaDoTerritorio(pool, item.congregacaoId);
  const alcancaPorLideranca = todosDoTerritorio(territorio).some((d) => mesmo(d.membroId, membroId));
  let bloqueioReservado = false;
  if (item.acompanhadoMenor) {
    try {
      const mm = require("./ministerioMenores");
      const ap = await require("./ministerioMenoresDb").aptidaoDe(pool, membroId, { hoje });
      bloqueioReservado = !ap || mm.temBloqueioReservado(ap.bloqueios);
    } catch (e) { bloqueioReservado = true; }     // na dúvida, não entrega um menor a quem não foi conferido
  }
  const r = cp.avaliarResponsavel({ membroId: p.MembroId, status: p.Status, nascimento: p.DataNascimento, congregacaoId: p.CongregacaoId }, item, { hoje, alcancaPorLideranca, bloqueioReservado });
  return r.ok ? { ok: true, pessoa: { membroId: p.MembroId, nome: p.Nome, email: p.Email } } : r;
}

async function avisarResponsavel(pool, { responsavel, eventoId, pessoaNome, congregacaoNome, prazoEm, agora }) {
  if (!responsavel) return null;
  return notificarAgora(pool, {
    regraChave: "CUIDADO_ATRIBUIDO", destinatarios: [destinatarioDe(responsavel)], referenciaTabela: "CuidadoEventos", referenciaId: eventoId,
    mensagem: cp.textoAtribuido({ pessoaNome, congregacaoNome, prazoTexto: cp.situacaoDoPrazo(prazoEm, agora).texto })
  });
}

// Grava um item novo (e o evento CRIADO, e o ATRIBUIDO se houver responsável) numa transação. `d`: { tipo, congregacaoId, membroId, pessoaNome, pessoaContato, motivo,
// origem, pedidoOracaoId, urgente, deteccaoResumo, prazoEm, responsavelMembroId, criadoPor }. Devolve { itemId, eventoCriado, eventoAtribuido } ou { repetido:true }.
async function gravarItem(pool, d, { transaction: externa = null } = {}) {
  const transaction = externa || new sql.Transaction(pool);
  try {
    if (!externa) await transaction.begin();
    const ins = await new sql.Request(transaction).input("t", sql.NVarChar(20), d.tipo).input("c", sql.Int, d.congregacaoId).input("m", sql.Int, d.membroId || null)
      .input("pn", sql.NVarChar(150), d.pessoaNome || null).input("pc", sql.NVarChar(150), d.pessoaContato || null).input("mo", sql.NVarChar(300), d.motivo || null)
      .input("o", sql.NVarChar(16), d.origem).input("po", sql.Int, d.pedidoOracaoId || null).input("u", sql.Bit, d.urgente ? 1 : 0).input("dr", sql.NVarChar(200), d.deteccaoResumo || null)
      .input("r", sql.Int, d.responsavelMembroId || null).input("pz", sql.DateTime2, d.prazoEm).input("cp", sql.Int, d.criadoPor || null)
      .query(`INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, PessoaNome, PessoaContato, Motivo, Origem, PedidoOracaoId, Urgente, DeteccaoResumo, ResponsavelMembroId, PrazoEm, CriadoPorMembroId)
              VALUES (@t, @c, @m, @pn, @pc, @mo, @o, @po, @u, @dr, @r, @pz, @cp); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    const itemId = ins.recordset[0].id;
    const eventoCriado = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "CRIADO", membroId: d.criadoPor || null, prazoNovo: d.prazoEm });
    let eventoAtribuido = null;
    if (d.responsavelMembroId) eventoAtribuido = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "ATRIBUIDO", membroId: d.criadoPor || null, responsavelMembroId: d.responsavelMembroId });
    if (!externa) await transaction.commit();
    return { itemId, eventoCriado, eventoAtribuido };
  } catch (e) {
    if (!externa) await fecharTransacao(transaction, false);
    if (duplicado(e)) return { repetido: true };
    throw e;
  }
}

// Abrir um item à mão (liderança).
async function abrirItem(pool, { dados, ver, agora = new Date() }) {
  const v = cp.validarAbertura(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const cong = await congregacao(pool, d.congregacaoId);
  if (!cong || !alcanca(ver, cong.Nome)) return { sucesso: false, mensagem: "Esta congregação não está no seu território." };
  const hoje = hojeBrasilia(agora);
  let acompanhadoMenor = false;
  if (d.membroId) {
    const p = await pessoa(pool, d.membroId);
    if (!p || p.Status !== "ATIVO" || !mesmo(p.CongregacaoId, d.congregacaoId)) return { sucesso: false, mensagem: "A matrícula não é de um membro ativo desta congregação." };
    if (mesmo(p.MembroId, ver.membroId)) return { sucesso: false, mensagem: "Ninguém abre acompanhamento sobre si mesmo: peça a outra pessoa da liderança." };
    const idade = require("./voluntariado").idadeEmAnos(p.DataNascimento, hoje);
    acompanhadoMenor = idade != null && idade < cp.MAIORIDADE;
  }
  let responsavel = null;
  if (d.responsavelMembroId) {
    const c = await conferirResponsavel(pool, d.responsavelMembroId, { congregacaoId: d.congregacaoId, membroId: d.membroId, acompanhadoMenor }, hoje);
    if (!c.ok) return { sucesso: false, mensagem: c.mensagem };
    responsavel = c.pessoa;
  } else {
    const dir = await dirigenteDa(pool, d.congregacaoId);
    if (dir && !mesmo(dir.membroId, d.membroId)) responsavel = dir;
  }
  const prazos = await lerPrazos(pool);
  const prazoEm = cp.prazoInicial(d.tipo, agora, prazos, { urgente: d.urgente });
  const g = await gravarItem(pool, { ...d, origem: "LIDERANCA", prazoEm, responsavelMembroId: responsavel ? responsavel.membroId : null, criadoPor: ver.membroId });
  if (g.repetido) return { sucesso: false, mudou: true, mensagem: "Já existe um acompanhamento aberto deste tipo para esta pessoa: trabalhe nele." };
  await auditar("CuidadoItens", g.itemId, "CUIDADO_ITEM_ABERTO", ver.membroId);
  let avisado = null;
  if (responsavel && !mesmo(responsavel.membroId, ver.membroId)) {
    const nome = d.membroId ? (await pessoa(pool, d.membroId)).Nome : d.pessoaNome;
    const a = await avisarResponsavel(pool, { responsavel, eventoId: g.eventoAtribuido, pessoaNome: nome, congregacaoNome: cong.Nome, prazoEm, agora });
    avisado = !!(a && a.externas > 0);
  }
  return { sucesso: true, itemId: g.itemId, prazoEm: iso(prazoEm), responsavel: responsavel ? { membroId: responsavel.membroId, nome: responsavel.nome } : null, responsavelAvisado: avisado,
    mensagem: responsavel ? `Acompanhamento aberto. Responsável: ${responsavel.nome}.` : "Acompanhamento aberto SEM responsável (a congregação não tem Dirigente cadastrado): nomeie alguém." };
}

// A fila da liderança. `filtros`: { congregacaoId, situacao: ABERTOS|VENCIDOS|SEM_RESPONSAVEL|URGENTES|ENCERRADOS, tipo }.
async function listarFila(pool, { ver, filtros = {}, agora = new Date() }) {
  const situacao = ["ABERTOS", "VENCIDOS", "SEM_RESPONSAVEL", "URGENTES", "ENCERRADOS"].includes(filtros.situacao) ? filtros.situacao : "ABERTOS";
  const rq = pool.request().input("lim", sql.Int, LIMITE_FILA).input("enc", sql.Int, ENCERRADOS_DIAS);
  const cond = [situacao === "ENCERRADOS" ? "i.Status <> 'ABERTO' AND i.EncerradoEm >= DATEADD(DAY, -@enc, SYSUTCDATETIME())" : "i.Status = 'ABERTO'"];
  if (situacao === "VENCIDOS") cond.push("i.PrazoEm < SYSUTCDATETIME()");
  if (situacao === "SEM_RESPONSAVEL") cond.push("i.ResponsavelMembroId IS NULL");
  if (situacao === "URGENTES") cond.push("i.Urgente = 1");
  if (filtros.congregacaoId) { rq.input("c", sql.Int, filtros.congregacaoId); cond.push("i.CongregacaoId = @c"); }
  if (cp.TIPOS[filtros.tipo]) { rq.input("t", sql.NVarChar(20), filtros.tipo); cond.push("i.Tipo = @t"); }
  rq.input("eu", sql.Int, ver.membroId); cond.push("(i.MembroId IS NULL OR i.MembroId <> @eu)");      // a pessoa acompanhada não vê o próprio item
  const ordem = situacao === "ENCERRADOS" ? "i.EncerradoEm DESC" : "i.Urgente DESC, i.PrazoEm ASC";
  const r = await rq.query(`SELECT TOP (@lim) * FROM (${SELECT_ITEM} WHERE ${cond.join(" AND ")}) i ORDER BY ${ordem}`);
  return r.recordset.filter((i) => acessoAoItem(ver, i) === "GESTAO").map((i) => formatarItem(i, { agora, acesso: "GESTAO" }));
}

// O detalhe (liderança ou responsável). null = "não existe".
async function detalheItem(pool, itemId, { ver, agora = new Date() }) {
  const i = await carregarItem(pool, itemId);
  const acesso = acessoAoItem(ver, i);
  if (!acesso) return null;
  const pastor = await ehPastor(pool, ver.membroId);
  const notas = await notasVisiveis(pool, i.MembroId ? { membroId: i.MembroId } : { itemId: i.ItemId }, { ver, pastor });
  return {
    item: formatarItem(i, { agora, acesso, completo: true }), eventos: await eventosDoItem(pool, itemId), notas: notas || [],
    podeGerir: acesso === "GESTAO", podeNotaNiveis: cp.CODIGOS_NIVEL_NOTA.filter((n) => cp.podeEscreverNota(n, { gestao: acesso === "GESTAO", responsavelAberto: i.Status === "ABERTO" })),
    agora: agora.toISOString()
  };
}

// Os itens de que a pessoa é responsável (Meu Painel). Abertos e os encerrados nos últimos 30 dias.
async function meusItens(pool, membroId, { agora = new Date() } = {}) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`${SELECT_ITEM}
    WHERE i.ResponsavelMembroId = @m AND (i.MembroId IS NULL OR i.MembroId <> @m) AND (i.Status = 'ABERTO' OR i.EncerradoEm >= DATEADD(DAY, -30, SYSUTCDATETIME()))
    ORDER BY CASE WHEN i.Status = 'ABERTO' THEN 0 ELSE 1 END, i.Urgente DESC, i.PrazoEm`);
  return r.recordset.map((i) => formatarItem(i, { agora, acesso: "RESPONSAVEL", completo: true }));
}

// O esqueleto de toda escrita num item aberto: confere o acesso, trava a linha, confere de novo (o responsável pode ter sido trocado no meio) e grava.
// `exige`: "GESTAO" ou "QUALQUER" (liderança ou responsável). `fazer(transaction, linha, item)` devolve o resultado.
async function noItemAberto(pool, itemId, ver, exige, fazer) {
  const item = await carregarItem(pool, itemId);
  const acesso = acessoAoItem(ver, item);
  if (!acesso || (exige === "GESTAO" && acesso !== "GESTAO")) return acesso && exige === "GESTAO" ? { sucesso: false, proibido: true, mensagem: "Isto é da liderança do território." } : NAO_EXISTE;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const linha = (await new sql.Request(transaction).input("id", sql.Int, itemId).query(`
      SELECT Status, ResponsavelMembroId, PrazoEm, Nivel, PrimeiroContatoEm FROM CuidadoItens WITH (UPDLOCK, ROWLOCK) WHERE ItemId = @id`)).recordset[0];
    if (!linha || linha.Status !== "ABERTO") { await fecharTransacao(transaction, false); return MUDOU("Este acompanhamento já foi encerrado."); }
    if (acesso === "RESPONSAVEL" && !mesmo(linha.ResponsavelMembroId, ver.membroId)) { await fecharTransacao(transaction, false); return MUDOU("Você não é mais o responsável por este acompanhamento."); }
    const r = await fazer(transaction, linha, item, acesso);
    await fecharTransacao(transaction, !!(r && r.sucesso));
    return r;
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
}

async function registrarContato(pool, { itemId, dados, ver, agora = new Date() }) {
  const v = cp.validarContato(dados, { agora });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const r = await noItemAberto(pool, itemId, ver, "QUALQUER", async (t, linha) => {
    const eventoId = await inserirEvento(new sql.Request(t), { itemId, tipo: "CONTATO", membroId: ver.membroId, em: d.em, forma: d.forma, conseguiu: d.conseguiu, acompanhante: d.acompanhante, observacao: d.observacao });
    if (!linha.PrimeiroContatoEm && d.conseguiu) await new sql.Request(t).input("id", sql.Int, itemId).input("em", sql.DateTime2, d.em).query(`UPDATE CuidadoItens SET PrimeiroContatoEm = @em WHERE ItemId = @id AND PrimeiroContatoEm IS NULL`);
    return { sucesso: true, eventoId, mensagem: "Contato registrado." };
  });
  if (r.sucesso) await auditar("CuidadoItens", itemId, "CUIDADO_CONTATO", ver.membroId);
  return r;
}

async function atribuir(pool, { itemId, responsavelMembroId, ver, agora = new Date() }) {
  const item = await carregarItem(pool, itemId);
  if (acessoAoItem(ver, item) !== "GESTAO") return NAO_EXISTE;
  const hoje = hojeBrasilia(agora);
  const c = await conferirResponsavel(pool, responsavelMembroId, { congregacaoId: item.CongregacaoId, membroId: item.MembroId, acompanhadoMenor: ehMenor(item, hoje) }, hoje);
  if (!c.ok) return { sucesso: false, mensagem: c.mensagem };
  let eventoId = null;
  const r = await noItemAberto(pool, itemId, ver, "GESTAO", async (t, linha) => {
    if (mesmo(linha.ResponsavelMembroId, responsavelMembroId)) return { sucesso: false, mensagem: "Esta pessoa já é a responsável." };
    await new sql.Request(t).input("id", sql.Int, itemId).input("r", sql.Int, responsavelMembroId).query(`UPDATE CuidadoItens SET ResponsavelMembroId = @r WHERE ItemId = @id AND Status = 'ABERTO'`);
    eventoId = await inserirEvento(new sql.Request(t), { itemId, tipo: "ATRIBUIDO", membroId: ver.membroId, responsavelMembroId });
    return { sucesso: true, mensagem: `Responsável agora: ${c.pessoa.nome}.` };
  });
  if (!r.sucesso) return r;
  await auditar("CuidadoItens", itemId, "CUIDADO_ATRIBUIDO", ver.membroId);
  if (!mesmo(responsavelMembroId, ver.membroId)) {
    const a = await avisarResponsavel(pool, { responsavel: c.pessoa, eventoId, pessoaNome: item.PessoaNomeExibido, congregacaoNome: item.CongregacaoNome, prazoEm: item.PrazoEm, agora });
    r.responsavelAvisado = !!(a && a.externas > 0);
  }
  return r;
}

async function adiar(pool, { itemId, dados, ver, agora = new Date() }) {
  const v = cp.validarAdiamento(dados, { agora });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await noItemAberto(pool, itemId, ver, "GESTAO", async (t) => {
    await new sql.Request(t).input("id", sql.Int, itemId).input("pz", sql.DateTime2, v.dados.novoPrazo).query(`UPDATE CuidadoItens SET PrazoEm = @pz WHERE ItemId = @id AND Status = 'ABERTO'`);
    await inserirEvento(new sql.Request(t), { itemId, tipo: "PRAZO_ADIADO", membroId: ver.membroId, prazoNovo: v.dados.novoPrazo, observacao: v.dados.motivo });
    return { sucesso: true, prazoEm: iso(v.dados.novoPrazo), mensagem: "Prazo adiado." };
  });
  if (r.sucesso) await auditar("CuidadoItens", itemId, "CUIDADO_PRAZO_ADIADO", ver.membroId);
  return r;
}

async function encerrar(pool, { itemId, ver, tipo, desfecho, observacao, exige }) {
  const r = await noItemAberto(pool, itemId, ver, exige, async (t) => {
    await new sql.Request(t).input("id", sql.Int, itemId).input("s", sql.NVarChar(10), tipo === "CANCELADO" ? "CANCELADO" : "CONCLUIDO").input("d", sql.NVarChar(20), desfecho).input("m", sql.Int, ver.membroId)
      .query(`UPDATE CuidadoItens SET Status = @s, Desfecho = @d, EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @m WHERE ItemId = @id AND Status = 'ABERTO'`);
    await inserirEvento(new sql.Request(t), { itemId, tipo, membroId: ver.membroId, observacao });
    return { sucesso: true };
  });
  return r;
}
async function concluir(pool, { itemId, dados, ver }) {
  const v = cp.validarConclusao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await encerrar(pool, { itemId, ver, tipo: "CONCLUIDO", desfecho: v.dados.desfecho, observacao: v.dados.observacao, exige: "QUALQUER" });
  if (!r.sucesso) return r;
  await auditar("CuidadoItens", itemId, "CUIDADO_CONCLUIDO", ver.membroId);
  const item = await carregarItem(pool, itemId);
  const sugestaoAbandono = !!item && item.Tipo === "AFASTAMENTO" && cp.DESFECHOS_ABANDONO.includes(v.dados.desfecho);
  return { sucesso: true, sugestaoAbandono, mensagem: sugestaoAbandono
    ? "Acompanhamento concluído. Se a pessoa não voltar, o caminho é o procedimento de abandono (Disciplina → Abandono), que a liderança abre à mão: a fila não abre sozinha."
    : "Acompanhamento concluído." };
}
async function cancelar(pool, { itemId, dados, ver }) {
  const v = cp.validarCancelamento(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await encerrar(pool, { itemId, ver, tipo: "CANCELADO", desfecho: v.dados.desfecho, observacao: v.dados.motivo, exige: "GESTAO" });
  if (!r.sucesso) return r;
  await auditar("CuidadoItens", itemId, "CUIDADO_CANCELADO", ver.membroId);
  return { sucesso: true, mensagem: "Acompanhamento cancelado." };
}

// ---------------------------------------------------------------
// As notas pastorais
// ---------------------------------------------------------------

// O alvo de uma nota (um membro ou um item de quem não é do cadastro) e o contexto de quem lê: { gestao, responsavelAberto, alvoProprio }. null = alvo inexistente.
async function contextoDoAlvo(pool, alvo, ver) {
  let congregacaoNome = null, alvoMembroId = null;
  if (alvo.membroId) {
    const p = await pessoa(pool, alvo.membroId);
    if (!p) return null;
    congregacaoNome = p.Status === "ATIVO" ? p.CongregacaoNome : null;        // quem saiu: só o nível geral alcança (e a rotina apaga as notas em 30 dias)
    alvoMembroId = p.MembroId;
  } else {
    const i = await carregarItem(pool, alvo.itemId);
    if (!i || i.MembroId) return null;                                       // item de membro: a nota é sobre o membro, não sobre o item
    congregacaoNome = i.CongregacaoNome;
  }
  if (alvoMembroId && mesmo(alvoMembroId, ver.membroId)) return { alvoProprio: true };
  const gestao = !!(ver.gestao && (ver.geral || (congregacaoNome && alcanca(ver, congregacaoNome))));
  const rq = pool.request().input("v", sql.Int, ver.membroId);
  let responsavelAberto;
  if (alvoMembroId) responsavelAberto = !!(await rq.input("m", sql.Int, alvoMembroId).query(`SELECT TOP 1 1 AS x FROM CuidadoItens WHERE Status = 'ABERTO' AND ResponsavelMembroId = @v AND MembroId = @m`)).recordset[0];
  else responsavelAberto = !!(await rq.input("i", sql.Int, alvo.itemId).query(`SELECT TOP 1 1 AS x FROM CuidadoItens WHERE Status = 'ABERTO' AND ResponsavelMembroId = @v AND ItemId = @i`)).recordset[0];
  return { alvoProprio: false, gestao, responsavelAberto, alvoMembroId };
}

// As notas que esta pessoa pode ler (só os dados de cabeçalho: o texto sai em lerNota). null = sem acesso nenhum ao alvo.
async function notasVisiveis(pool, alvo, { ver, pastor = null }) {
  const ctx = await contextoDoAlvo(pool, alvo, ver);
  // quem não alcança mais a pessoa (mudou de congregação, deixou de ser responsável) não lê nada sobre ela, nem o que ele mesmo escreveu (Regimento Art. 132 §1º, II)
  if (!ctx || ctx.alvoProprio || (!ctx.gestao && !ctx.responsavelAberto)) return null;
  const eraPastor = pastor == null ? await ehPastor(pool, ver.membroId) : pastor;
  const rq = pool.request();
  const filtro = alvo.membroId ? (rq.input("m", sql.Int, alvo.membroId), "n.MembroId = @m") : (rq.input("i", sql.Int, alvo.itemId), "n.ItemId = @i");
  const r = await rq.query(`SELECT n.NotaId, n.Nivel, n.AutorMembroId, a.Nome AS AutorNome, n.CriadaEm, n.RetificaNotaId, LEN(n.Texto) AS Tamanho
    FROM NotasPastorais n JOIN MembroReferencia a ON a.MembroId = n.AutorMembroId WHERE ${filtro} ORDER BY n.NotaId DESC`);
  return r.recordset
    .filter((n) => cp.podeLerNota(n, { membroId: ver.membroId, gestao: ctx.gestao, pastor: eraPastor, responsavelAberto: ctx.responsavelAberto }))
    .map((n) => ({ notaId: n.NotaId, nivel: n.Nivel, nivelRotulo: cp.NIVEIS_NOTA[n.Nivel].rotulo, autor: n.AutorNome, minha: mesmo(n.AutorMembroId, ver.membroId), criadaEm: iso(n.CriadaEm),
      retificaNotaId: n.RetificaNotaId || null, tamanho: Number(n.Tamanho) || 0, pedeConfirmacao: cp.notaPedeFator(n.Nivel) && !mesmo(n.AutorMembroId, ver.membroId) }));
}

async function listarNotas(pool, alvo, { ver }) { return notasVisiveis(pool, alvo, { ver }); }

async function escreverNota(pool, { dados, ver }) {
  const v = cp.validarNota(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  if (d.membroId && d.itemId) return { sucesso: false, mensagem: "A nota é sobre um membro OU sobre o item de quem não é do cadastro." };
  const ctx = await contextoDoAlvo(pool, d.membroId ? { membroId: d.membroId } : { itemId: d.itemId }, ver);
  if (!ctx || ctx.alvoProprio || (!ctx.gestao && !ctx.responsavelAberto)) return NAO_EXISTE;
  if (!cp.podeEscreverNota(d.nivel, ctx)) return { sucesso: false, proibido: true, mensagem: "Como responsável, você escreve notas de nível \"Equipe\". As restritas são da liderança." };
  if (d.retificaNotaId) {
    const ant = (await pool.request().input("n", sql.Int, d.retificaNotaId).query(`SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n`)).recordset[0];
    const mesmoAlvo = ant && (d.membroId ? mesmo(ant.MembroId, d.membroId) : mesmo(ant.ItemId, d.itemId));
    if (!mesmoAlvo || !cp.podeLerNota(ant, { membroId: ver.membroId, gestao: ctx.gestao, pastor: await ehPastor(pool, ver.membroId), responsavelAberto: ctx.responsavelAberto })) {
      return { sucesso: false, mensagem: "A nota que você quer corrigir não está entre as que você pode ler sobre esta pessoa." };
    }
  }
  const transaction = new sql.Transaction(pool);
  let notaId;
  try {
    await transaction.begin();
    if (!(await obterTrava(() => new sql.Request(transaction), `cuidado-nota-${ver.membroId}`, 8000))) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: "Tente de novo em instantes." }; }
    const n = (await new sql.Request(transaction).input("a", sql.Int, ver.membroId).query(`SELECT COUNT(*) AS n FROM NotasPastorais WHERE AutorMembroId = @a AND CriadaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
    if (Number(n.n) >= cp.LIMITE_NOTAS_DIA) { await fecharTransacao(transaction, false); return { sucesso: false, limite: true, mensagem: `Limite de ${cp.LIMITE_NOTAS_DIA} notas em 24 horas.` }; }
    notaId = (await new sql.Request(transaction).input("m", sql.Int, d.membroId || null).input("i", sql.Int, d.itemId || null).input("nv", sql.NVarChar(10), d.nivel)
      .input("t", sql.NVarChar(2000), d.texto).input("a", sql.Int, ver.membroId).input("rt", sql.Int, d.retificaNotaId || null)
      .query(`INSERT INTO NotasPastorais (MembroId, ItemId, Nivel, Texto, AutorMembroId, RetificaNotaId) VALUES (@m, @i, @nv, @t, @a, @rt); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("NotasPastorais", notaId, "CUIDADO_NOTA_ESCRITA", ver.membroId);
  return { sucesso: true, notaId, mensagem: "Nota guardada. Ela não se edita: para corrigir, escreva outra nota que aponta esta." };
}

// O cabeçalho de uma nota que a pessoa pode ler (para a rota decidir se pede a confirmação reforçada ANTES de abrir). null = "não existe".
async function notaLegivel(pool, notaId, { ver }) {
  const n = (await pool.request().input("n", sql.Int, notaId).query(`SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n`)).recordset[0];
  if (!n) return null;
  const ctx = await contextoDoAlvo(pool, n.MembroId ? { membroId: n.MembroId } : { itemId: n.ItemId }, ver);
  if (!ctx || ctx.alvoProprio || (!ctx.gestao && !ctx.responsavelAberto)) return null;
  if (!cp.podeLerNota(n, { membroId: ver.membroId, gestao: ctx.gestao, pastor: await ehPastor(pool, ver.membroId), responsavelAberto: ctx.responsavelAberto })) return null;
  return { notaId: n.NotaId, nivel: n.Nivel, pedeFator: cp.notaPedeFator(n.Nivel) && !mesmo(n.AutorMembroId, ver.membroId) };
}

// Abre a nota: o texto sai e a abertura fica registrada (quem e quando). A rota já conferiu a confirmação reforçada quando é "somente pastor".
async function lerNota(pool, notaId, { ver }) {
  const cab = await notaLegivel(pool, notaId, { ver });
  if (!cab) return null;
  await pool.request().input("n", sql.Int, notaId).input("m", sql.Int, ver.membroId).query(`INSERT INTO NotasPastoraisLeituras (NotaId, MembroId) VALUES (@n, @m)`);
  const n = (await pool.request().input("n", sql.Int, notaId).query(`
    SELECT n.NotaId, n.Nivel, n.Texto, n.CriadaEm, n.RetificaNotaId, a.Nome AS AutorNome, n.AutorMembroId FROM NotasPastorais n JOIN MembroReferencia a ON a.MembroId = n.AutorMembroId WHERE n.NotaId = @n`)).recordset[0];
  if (!n) return null;
  await auditar("NotasPastorais", notaId, "CUIDADO_NOTA_ABERTA", ver.membroId);
  return { notaId: n.NotaId, nivel: n.Nivel, nivelRotulo: cp.NIVEIS_NOTA[n.Nivel].rotulo, texto: n.Texto, autor: n.AutorNome, minha: mesmo(n.AutorMembroId, ver.membroId),
    criadaEm: iso(n.CriadaEm), retificaNotaId: n.RetificaNotaId || null };
}

// Quem abriu a nota (as últimas 30 aberturas): só quem a escreveu e o nível geral veem.
async function leiturasDaNota(pool, notaId, { ver }) {
  const n = (await pool.request().input("n", sql.Int, notaId).query(`SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n`)).recordset[0];
  if (!n) return null;
  if (!mesmo(n.AutorMembroId, ver.membroId) && !(ver.gestao && ver.geral)) return null;
  if (!(await notaLegivel(pool, notaId, { ver }))) return null;
  const r = await pool.request().input("n", sql.Int, notaId).query(`SELECT TOP 30 l.LidaEm, m.Nome FROM NotasPastoraisLeituras l JOIN MembroReferencia m ON m.MembroId = l.MembroId WHERE l.NotaId = @n ORDER BY l.LeituraId DESC`);
  return r.recordset.map((l) => ({ nome: l.Nome, lidaEm: iso(l.LidaEm) }));
}

// ---------------------------------------------------------------
// O sinal de risco (fora da fila normal)
// ---------------------------------------------------------------

// Avisa NA HORA toda a liderança do território (Dirigente, Área, Região e nível geral), menos a própria pessoa. O aviso não leva o texto.
async function avisarRisco(pool, { congregacaoId, congregacaoNome, eventoId, crianca, fora = [] }) {
  const territorio = await liderancaDoTerritorio(pool, congregacaoId);
  const destinatarios = todosDoTerritorio(territorio, fora);
  return notificarAgora(pool, { regraChave: "CUIDADO_RISCO", destinatarios, mensagem: cp.textoRisco({ congregacaoNome, crianca }), referenciaTabela: "CuidadoEventos", referenciaId: eventoId, aguardarEntrega: false });
}

// ---------------------------------------------------------------
// Pedidos de oração e de visita
// ---------------------------------------------------------------

const SITUACAO_PEDIDO_PARA_QUEM_PEDIU = { AGUARDANDO: "Recebido: a liderança vai ler", APROVADO: "No boletim de oração (sem o seu nome)", NAO_PUBLICAR: "Lido pela liderança" };

// Grava o pedido; com sinal de risco ou pedido de contato, abre o item (urgente no risco) e, no risco, avisa a liderança na hora. `quem`: { solicitanteMembroId?, solicitanteNome?,
// solicitanteContato?, registradoPor, congregacaoId, congregacaoNome }.
async function gravarPedidoOracao(pool, { d, quem, agora = new Date() }) {
  const risco = cp.avaliarRisco(d.texto);
  const prazos = await lerPrazos(pool);
  const transaction = new sql.Transaction(pool);
  let pedidoId, item = null;
  try {
    await transaction.begin();
    if (!(await obterTrava(() => new sql.Request(transaction), `cuidado-pedido-${quem.registradoPor}`, 8000))) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: "Tente de novo em instantes." }; }
    const n = (await new sql.Request(transaction).input("r", sql.Int, quem.registradoPor).query(`SELECT COUNT(*) AS n FROM PedidosOracao WHERE RegistradoPorMembroId = @r AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
    if (Number(n.n) >= cp.LIMITE_PEDIDOS_ORACAO_DIA) { await fecharTransacao(transaction, false); return { sucesso: false, limite: true, mensagem: `Limite de ${cp.LIMITE_PEDIDOS_ORACAO_DIA} pedidos em 24 horas. Se for urgente, ligue para o Dirigente ou o pastor.`, ajuda: cp.CONTATOS_DE_AJUDA }; }
    pedidoId = (await new sql.Request(transaction).input("c", sql.Int, quem.congregacaoId).input("s", sql.Int, quem.solicitanteMembroId || null).input("r", sql.Int, quem.registradoPor)
      .input("sn", sql.NVarChar(150), quem.solicitanteNome || null).input("sc", sql.NVarChar(150), quem.solicitanteContato || null).input("pq", sql.NVarChar(12), d.paraQuem)
      .input("cat", sql.NVarChar(12), d.categoria).input("t", sql.NVarChar(1000), d.texto).input("pb", sql.Bit, d.podeBoletim ? 1 : 0).input("qc", sql.Bit, d.querContato ? 1 : 0)
      .input("rk", sql.Bit, risco.risco ? 1 : 0).input("ro", sql.NVarChar(10), risco.risco ? "AUTOMATICO" : null).input("rc", sql.Bit, risco.crianca ? 1 : 0)
      .query(`INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, SolicitanteNome, SolicitanteContato, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato,
                Risco, RiscoOrigem, RiscoCrianca, RiscoJaTeve, RiscoMarcadoEm)
              VALUES (@c, @s, @r, @sn, @sc, @pq, @cat, @t, @pb, @qc, @rk, @ro, @rc, @rk, CASE WHEN @rk = 1 THEN SYSUTCDATETIME() ELSE NULL END); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    if (risco.risco || d.querContato) {
      const dir = await dirigenteDa(pool, quem.congregacaoId);
      const responsavel = dir && !mesmo(dir.membroId, quem.solicitanteMembroId) ? dir : null;
      const prazoEm = cp.prazoInicial("PEDIDO_ORACAO", agora, prazos, { urgente: risco.risco });
      const g = await gravarItem(pool, {
        tipo: "PEDIDO_ORACAO", congregacaoId: quem.congregacaoId, membroId: quem.solicitanteMembroId || null, pessoaNome: quem.solicitanteMembroId ? null : quem.solicitanteNome,
        pessoaContato: quem.solicitanteMembroId ? null : quem.solicitanteContato, motivo: `Pedido de oração: ${cp.CATEGORIAS_ORACAO[d.categoria].rotulo}${d.querContato ? " (pediu contato)" : ""}.`,
        origem: "PEDIDO_ORACAO", pedidoOracaoId: pedidoId, urgente: risco.risco, prazoEm, responsavelMembroId: responsavel ? responsavel.membroId : null, criadoPor: quem.registradoPor
      }, { transaction });
      item = { ...g, responsavel, prazoEm };
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_REGISTRADO", quem.registradoPor);
  const nomeDeQuem = quem.solicitanteMembroId ? ((await pessoa(pool, quem.solicitanteMembroId)) || {}).Nome : quem.solicitanteNome;
  const resposta = { sucesso: true, pedidoId, itemId: item ? item.itemId : null, risco: risco.risco };
  if (risco.risco) {
    const aviso = await avisarRisco(pool, { congregacaoId: quem.congregacaoId, congregacaoNome: quem.congregacaoNome, eventoId: item.eventoCriado, crianca: risco.crianca, fora: [quem.solicitanteMembroId] });
    resposta.avisada = Number((aviso || {}).externas) > 0;
    resposta.ajuda = cp.CONTATOS_DE_AJUDA;
    resposta.mensagem = `Recebemos o seu pedido. ${cp.textoAvisoRisco(aviso)} Se você está em perigo agora, ligue 190. Se está sofrendo, o CVV atende de graça, 24 horas, no 188.`;
  } else {
    if (item && item.responsavel && !mesmo(item.responsavel.membroId, quem.registradoPor)) {
      await avisarResponsavel(pool, { responsavel: item.responsavel, eventoId: item.eventoAtribuido, pessoaNome: nomeDeQuem, congregacaoNome: quem.congregacaoNome, prazoEm: item.prazoEm, agora });
    }
    resposta.mensagem = d.querContato ? "Pedido recebido. Alguém da liderança vai falar com você." : "Pedido recebido. A liderança vai orar por ele.";
  }
  return resposta;
}

// O membro pede (Meu Painel), por ele ou por outra pessoa; a congregação é a dele.
async function pedirOracao(pool, { dados, membroId, agora = new Date() }) {
  const v = cp.validarPedidoOracao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const p = await pessoa(pool, membroId);
  if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return { sucesso: false, mensagem: "Seu cadastro não tem congregação: fale com a secretaria." };
  return gravarPedidoOracao(pool, { d: v.dados, agora, quem: { solicitanteMembroId: membroId, registradoPor: membroId, congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome } });
}
// A liderança registra o pedido recebido em mãos.
async function registrarPedidoRecebido(pool, { dados, ver, agora = new Date() }) {
  const s = cp.validarSolicitante(dados);
  if (!s.valido) return { sucesso: false, mensagem: s.mensagem };
  const v = cp.validarPedidoOracao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const cong = await congregacao(pool, s.dados.congregacaoId);
  if (!cong || !alcanca(ver, cong.Nome)) return { sucesso: false, mensagem: "Esta congregação não está no seu território." };
  if (s.dados.membroId) {
    const p = await pessoa(pool, s.dados.membroId);
    if (!p || p.Status !== "ATIVO" || !mesmo(p.CongregacaoId, cong.CongregacaoId)) return { sucesso: false, mensagem: "A matrícula não é de um membro ativo desta congregação." };
  }
  return gravarPedidoOracao(pool, { d: v.dados, agora, quem: { ...s.dados, solicitanteMembroId: s.dados.membroId, registradoPor: ver.membroId, congregacaoId: cong.CongregacaoId, congregacaoNome: cong.Nome } });
}

// O membro pede uma visita para ele (ou porque está, ou esteve, internado).
async function pedirVisita(pool, { dados, membroId, agora = new Date() }) {
  const v = cp.validarPedidoVisita(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const p = await pessoa(pool, membroId);
  if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return { sucesso: false, mensagem: "Seu cadastro não tem congregação: fale com a secretaria." };
  const risco = cp.avaliarRisco(v.dados.motivo, v.dados.contato);
  const tipo = v.dados.hospital ? "POS_INTERNACAO" : "PEDIDO_VISITA";
  const n = (await pool.request().input("m", sql.Int, membroId).query(`SELECT COUNT(*) AS n FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO' AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
  if (Number(n.n) >= cp.LIMITE_PEDIDOS_VISITA_DIA) return { sucesso: false, limite: true, mensagem: "Você já fez pedidos de visita hoje. Se for urgente, ligue para o Dirigente.", ajuda: cp.CONTATOS_DE_AJUDA };
  const dir = await dirigenteDa(pool, p.CongregacaoId);
  const responsavel = dir && !mesmo(dir.membroId, membroId) ? dir : null;
  const prazos = await lerPrazos(pool);
  const prazoEm = cp.prazoInicial(tipo, agora, prazos, { urgente: risco.risco });
  const g = await gravarItem(pool, { tipo, congregacaoId: p.CongregacaoId, membroId, pessoaContato: null, motivo: v.dados.contato ? `${v.dados.motivo} — Melhor contato/horário: ${v.dados.contato}`.slice(0, cp.MAX_MOTIVO) : v.dados.motivo,
    origem: "PEDIDO_MEMBRO", urgente: risco.risco, prazoEm, responsavelMembroId: responsavel ? responsavel.membroId : null, criadoPor: membroId });
  if (g.repetido) return { sucesso: false, mudou: true, mensagem: "Você já tem um pedido de visita em andamento. A liderança vai procurar você." };
  await auditar("CuidadoItens", g.itemId, "CUIDADO_PEDIDO_VISITA", membroId);
  if (risco.risco) {
    const aviso = await avisarRisco(pool, { congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome, eventoId: g.eventoCriado, crianca: risco.crianca, fora: [membroId] });
    return { sucesso: true, itemId: g.itemId, risco: true, avisada: Number((aviso || {}).externas) > 0, ajuda: cp.CONTATOS_DE_AJUDA,
      mensagem: `Recebemos o seu pedido. ${cp.textoAvisoRisco(aviso)} Se você está em perigo agora, ligue 190. Se está sofrendo, o CVV atende de graça, 24 horas, no 188.` };
  }
  if (responsavel) await avisarResponsavel(pool, { responsavel, eventoId: g.eventoAtribuido, pessoaNome: p.Nome, congregacaoNome: p.CongregacaoNome, prazoEm, agora });
  return { sucesso: true, itemId: g.itemId, risco: false, mensagem: "Pedido de visita recebido. A liderança vai combinar com você." };
}

// O que a própria pessoa vê dos pedidos que fez (sem o responsável, sem as notas, sem o histórico, sem o sinal de risco).
async function meusPedidos(pool, membroId) {
  const oracao = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 50 PedidoId, Categoria, ParaQuem, Texto, PodeBoletim, Moderacao, BoletimAte, CriadoEm, AnonimizadoEm FROM PedidosOracao
    WHERE SolicitanteMembroId = @m ORDER BY PedidoId DESC`)).recordset.map((p) => ({
    pedidoId: p.PedidoId, categoria: p.Categoria, categoriaRotulo: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, paraQuem: p.ParaQuem, texto: p.Texto, podeBoletim: !!p.PodeBoletim,
    situacao: SITUACAO_PEDIDO_PARA_QUEM_PEDIU[p.Moderacao] || "Recebido", criadoEm: iso(p.CriadoEm)
  }));
  const visitas = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 30 ItemId, Tipo, Status, CriadoEm, EncerradoEm FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO' ORDER BY ItemId DESC`)).recordset.map((i) => ({
    itemId: i.ItemId, tipoRotulo: cp.TIPOS[i.Tipo].rotulo, situacao: i.Status === "ABERTO" ? "Recebido: a liderança vai procurar você" : "Atendido", criadoEm: iso(i.CriadoEm), encerradoEm: iso(i.EncerradoEm)
  }));
  return { oracao, visitas };
}

const SELECT_PEDIDO = `
  SELECT p.PedidoId, p.CongregacaoId, c.Nome AS CongregacaoNome, p.SolicitanteMembroId, COALESCE(s.Nome, p.SolicitanteNome) AS SolicitanteNome, p.SolicitanteContato,
         rg.Nome AS RegistradoPorNome, p.RegistradoPorMembroId, p.ParaQuem, p.Categoria, p.Texto, p.PodeBoletim, p.QuerContato, p.Moderacao, p.TextoBoletim, p.BoletimAte,
         p.ModeradoEm, md.Nome AS ModeradoPorNome, p.Risco, p.RiscoOrigem, p.RiscoCrianca, p.RiscoJaTeve, p.RiscoMarcadoEm, p.RiscoDesmarcadoEm, p.RiscoDesmarcadoMotivo,
         p.CriadoEm, p.AnonimizadoEm, ci.ItemId
  FROM PedidosOracao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId LEFT JOIN MembroReferencia s ON s.MembroId = p.SolicitanteMembroId
  LEFT JOIN MembroReferencia rg ON rg.MembroId = p.RegistradoPorMembroId LEFT JOIN MembroReferencia md ON md.MembroId = p.ModeradoPorMembroId
  LEFT JOIN CuidadoItens ci ON ci.PedidoOracaoId = p.PedidoId`;
// A liderança não modera nem lê o pedido que ela mesma fez ou que fala dela como solicitante (quem modera é o degrau de cima).
const pedidoVisivel = (ver, p) => !!p && !mesmo(p.SolicitanteMembroId, ver.membroId) && alcanca(ver, p.CongregacaoNome);
function formatarPedido(p) {
  return {
    pedidoId: p.PedidoId, congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome, solicitante: p.SolicitanteNome || (p.AnonimizadoEm ? "(anonimizado)" : null),
    solicitanteMembroId: p.SolicitanteMembroId || null, solicitanteContato: p.SolicitanteContato || null, registradoPor: p.RegistradoPorNome || null,
    paraQuem: p.ParaQuem, paraQuemRotulo: cp.PARA_QUEM[p.ParaQuem], categoria: p.Categoria, categoriaRotulo: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, texto: p.Texto,
    podeBoletim: !!p.PodeBoletim, querContato: !!p.QuerContato, moderacao: p.Moderacao, textoBoletim: p.TextoBoletim, boletimAte: dia(p.BoletimAte), moderadoPor: p.ModeradoPorNome || null,
    moderadoEm: iso(p.ModeradoEm), risco: !!p.Risco, riscoOrigem: p.RiscoOrigem, riscoCrianca: !!p.RiscoCrianca, riscoJaTeve: !!p.RiscoJaTeve, riscoDesmarcadoMotivo: p.RiscoDesmarcadoMotivo || null,
    riscoDesmarcadoEm: iso(p.RiscoDesmarcadoEm), criadoEm: iso(p.CriadoEm), itemId: p.ItemId || null,
    sugestaoBoletim: p.PodeBoletim ? cp.linhaDoBoletim({ categoria: p.Categoria, paraQuem: p.ParaQuem, congregacaoNome: p.CongregacaoNome }) : null
  };
}
// `situacao`: AGUARDANDO (sem risco) | RISCO | APROVADOS (no boletim agora) | TODOS (últimos 90 dias).
async function listarPedidos(pool, { ver, situacao = "AGUARDANDO", congregacaoId = null }) {
  const rq = pool.request();
  const cond = ["p.AnonimizadoEm IS NULL"];
  if (situacao === "RISCO") cond.push("p.Risco = 1");
  else if (situacao === "APROVADOS") cond.push("p.Moderacao = 'APROVADO' AND p.BoletimAte >= CAST(DATEADD(HOUR, -3, SYSUTCDATETIME()) AS DATE)");
  else if (situacao === "TODOS") cond.push("p.CriadoEm >= DATEADD(DAY, -90, SYSUTCDATETIME())");
  else cond.push("p.Moderacao = 'AGUARDANDO' AND p.Risco = 0");
  if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); cond.push("p.CongregacaoId = @c"); }
  const r = await rq.query(`SELECT TOP 300 * FROM (${SELECT_PEDIDO}) p WHERE ${cond.join(" AND ")} ORDER BY p.Risco DESC, p.PedidoId DESC`);
  return r.recordset.filter((p) => pedidoVisivel(ver, p)).map(formatarPedido);
}
async function carregarPedido(pool, pedidoId) {
  return (await pool.request().input("id", sql.Int, pedidoId).query(`${SELECT_PEDIDO} WHERE p.PedidoId = @id`)).recordset[0] || null;
}

// Moderar: APROVAR (vai ao boletim, só a linha sem nome) ou NAO_PUBLICAR ("lido, fica só com a liderança").
async function moderar(pool, { pedidoId, dados, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  const decisao = typeof (dados || {}).decisao === "string" ? dados.decisao : "";
  if (!["APROVAR", "NAO_PUBLICAR"].includes(decisao)) return { sucesso: false, mensagem: "Escolha: publicar no boletim (sem nome) ou deixar só com a liderança." };
  if (p.Risco) return { sucesso: false, mensagem: "Este pedido tem sinal de risco: ele não vai ao boletim. Atenda a pessoa; se for alarme falso, desmarque o risco (com o motivo) antes." };
  let textoBoletim = null, boletimAte = null;
  if (decisao === "APROVAR") {
    if (!p.PodeBoletim) return { sucesso: false, mensagem: "Quem pediu escolheu \"só para a liderança\": este pedido não vai ao boletim." };
    const escrito = dados.textoBoletim == null || dados.textoBoletim === "" ? cp.linhaDoBoletim({ categoria: p.Categoria, paraQuem: p.ParaQuem, congregacaoNome: p.CongregacaoNome }) : dados.textoBoletim;
    const nomes = [p.SolicitanteNome, p.RegistradoPorNome].filter(Boolean);
    const v = cp.validarTextoBoletim(escrito, { nomes, congregacaoNome: p.CongregacaoNome });
    if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
    textoBoletim = v.texto;
    boletimAte = cp.somarDiasIso(hojeBrasilia(agora), cp.BOLETIM_DIAS);
  }
  const r = await pool.request().input("id", sql.Int, pedidoId).input("mo", sql.NVarChar(12), decisao === "APROVAR" ? "APROVADO" : "NAO_PUBLICAR").input("tb", sql.NVarChar(200), textoBoletim)
    .input("ba", sql.Date, boletimAte).input("m", sql.Int, ver.membroId)
    .query(`UPDATE PedidosOracao SET Moderacao = @mo, TextoBoletim = @tb, BoletimAte = @ba, ModeradoPorMembroId = @m, ModeradoEm = SYSUTCDATETIME()
            WHERE PedidoId = @id AND Risco = 0 AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`);
  if (!Number(r.recordset[0].n)) return MUDOU("O pedido mudou enquanto você moderava. Abra de novo.");
  await auditar("PedidosOracao", pedidoId, decisao === "APROVAR" ? "CUIDADO_PEDIDO_PUBLICADO" : "CUIDADO_PEDIDO_LIDO", ver.membroId);
  return { sucesso: true, mensagem: decisao === "APROVAR" ? `Publicado no boletim até ${boletimAte.split("-").reverse().join("/")}, sem nome.` : "Marcado como lido: fica só com a liderança." };
}

// Marcar (a lista não pegou, mas a liderança percebeu) ou desmarcar (alarme falso, com motivo) o sinal de risco. Marcar tira o pedido do boletim, deixa o item urgente e avisa na hora.
async function marcarRisco(pool, { pedidoId, dados, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  const marcar = (dados || {}).marcar === true;
  if ((dados || {}).marcar !== true && (dados || {}).marcar !== false) return { sucesso: false, mensagem: "Diga se é para marcar ou desmarcar o sinal de risco." };
  if (!marcar) {
    if (!p.Risco) return { sucesso: false, mensagem: "Este pedido não está com sinal de risco." };
    const motivo = typeof dados.motivo === "string" ? dados.motivo.trim() : "";
    if (motivo.length < 5 || motivo.length > cp.MAX_OBSERVACAO || /[<>]/.test(motivo)) return { sucesso: false, mensagem: "Escreva por que é alarme falso (de 5 a 300 caracteres, sem < e >)." };
    const r = await pool.request().input("id", sql.Int, pedidoId).input("m", sql.Int, ver.membroId).input("mo", sql.NVarChar(300), motivo)
      .query(`UPDATE PedidosOracao SET Risco = 0, RiscoDesmarcadoPorMembroId = @m, RiscoDesmarcadoEm = SYSUTCDATETIME(), RiscoDesmarcadoMotivo = @mo WHERE PedidoId = @id AND Risco = 1; SELECT @@ROWCOUNT AS n`);
    if (!Number(r.recordset[0].n)) return MUDOU("O pedido mudou enquanto você decidia. Abra de novo.");
    await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_DESMARCADO", ver.membroId);
    return { sucesso: true, mensagem: "Sinal de risco desmarcado. O pedido volta para a moderação comum; o item de acompanhamento continua aberto." };
  }
  if (p.Risco) return { sucesso: false, mensagem: "Este pedido já está com sinal de risco." };
  const prazos = await lerPrazos(pool);
  const transaction = new sql.Transaction(pool);
  let eventoId, itemId = p.ItemId;
  try {
    await transaction.begin();
    const r = await new sql.Request(transaction).input("id", sql.Int, pedidoId)
      .query(`UPDATE PedidosOracao SET Risco = 1, RiscoOrigem = 'LIDERANCA', RiscoJaTeve = 1, RiscoMarcadoEm = SYSUTCDATETIME(), Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'AGUARDANDO' ELSE Moderacao END,
              TextoBoletim = CASE WHEN Moderacao = 'APROVADO' THEN NULL ELSE TextoBoletim END, BoletimAte = CASE WHEN Moderacao = 'APROVADO' THEN NULL ELSE BoletimAte END
              WHERE PedidoId = @id AND Risco = 0 AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`);
    if (!Number(r.recordset[0].n)) { await fecharTransacao(transaction, false); return MUDOU("O pedido mudou enquanto você decidia. Abra de novo."); }
    const prazoRisco = cp.prazoInicial("PEDIDO_ORACAO", agora, prazos, { urgente: true });
    if (itemId) {
      const aberto = (await new sql.Request(transaction).input("i", sql.Int, itemId).query(`SELECT Status FROM CuidadoItens WITH (UPDLOCK, ROWLOCK) WHERE ItemId = @i`)).recordset[0];
      if (aberto && aberto.Status === "ABERTO") {
        await new sql.Request(transaction).input("i", sql.Int, itemId).input("pz", sql.DateTime2, prazoRisco)
          .query(`UPDATE CuidadoItens SET Urgente = 1, PrazoEm = CASE WHEN PrazoEm > @pz THEN @pz ELSE PrazoEm END WHERE ItemId = @i AND Status = 'ABERTO'`);
      }
      eventoId = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "URGENTE", membroId: ver.membroId });
    } else {
      const dir = await dirigenteDa(pool, p.CongregacaoId);
      const responsavel = dir && !mesmo(dir.membroId, p.SolicitanteMembroId) ? dir : null;
      const g = await gravarItem(pool, {
        tipo: "PEDIDO_ORACAO", congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, pessoaNome: p.SolicitanteMembroId ? null : p.SolicitanteNome,
        pessoaContato: p.SolicitanteMembroId ? null : p.SolicitanteContato, motivo: `Pedido de oração: ${cp.CATEGORIAS_ORACAO[p.Categoria].rotulo}.`, origem: "PEDIDO_ORACAO",
        pedidoOracaoId: pedidoId, urgente: true, prazoEm: prazoRisco, responsavelMembroId: responsavel ? responsavel.membroId : null, criadoPor: ver.membroId
      }, { transaction });
      itemId = g.itemId;
      eventoId = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "URGENTE", membroId: ver.membroId });
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_MARCADO", ver.membroId);
  const crianca = cp.avaliarRisco(p.Texto).crianca;
  const aviso = await avisarRisco(pool, { congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome, eventoId, crianca, fora: [p.SolicitanteMembroId] });
  return { sucesso: true, itemId, avisada: Number((aviso || {}).externas) > 0,
    mensagem: Number((aviso || {}).externas) > 0 ? "Sinal de risco marcado: a liderança do território foi avisada agora e o acompanhamento ficou urgente (24 horas)."
      : "Sinal de risco marcado e o acompanhamento ficou urgente, MAS o aviso não saiu do sistema: ligue para o Dirigente e o pastor agora." };
}

// Abre o acompanhamento a partir de um pedido que ainda não tem (a liderança quer falar com quem pediu).
async function acompanharPedido(pool, { pedidoId, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  if (p.ItemId) return { sucesso: false, mudou: true, itemId: p.ItemId, mensagem: "Este pedido já tem um acompanhamento." };
  const dir = await dirigenteDa(pool, p.CongregacaoId);
  const responsavel = dir && !mesmo(dir.membroId, p.SolicitanteMembroId) ? dir : null;
  const prazoEm = cp.prazoInicial("PEDIDO_ORACAO", agora, await lerPrazos(pool), { urgente: !!p.Risco });
  const g = await gravarItem(pool, {
    tipo: "PEDIDO_ORACAO", congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, pessoaNome: p.SolicitanteMembroId ? null : p.SolicitanteNome,
    pessoaContato: p.SolicitanteMembroId ? null : p.SolicitanteContato, motivo: `Pedido de oração: ${cp.CATEGORIAS_ORACAO[p.Categoria].rotulo}.`, origem: "PEDIDO_ORACAO",
    pedidoOracaoId: pedidoId, urgente: !!p.Risco, prazoEm, responsavelMembroId: responsavel ? responsavel.membroId : null, criadoPor: ver.membroId
  });
  if (g.repetido) return { sucesso: false, mudou: true, mensagem: "Este pedido já tem um acompanhamento." };
  await auditar("CuidadoItens", g.itemId, "CUIDADO_ITEM_ABERTO", ver.membroId);
  if (responsavel && !mesmo(responsavel.membroId, ver.membroId)) await avisarResponsavel(pool, { responsavel, eventoId: g.eventoAtribuido, pessoaNome: p.SolicitanteNome, congregacaoNome: p.CongregacaoNome, prazoEm, agora });
  return { sucesso: true, itemId: g.itemId, mensagem: "Acompanhamento aberto." };
}

// O boletim: só as linhas aprovadas e ainda no prazo, por congregação. Nunca o texto do pedido.
async function boletim(pool, { ver = null, congregacaoId = null, membroId = null, agora = new Date() }) {
  const rq = pool.request().input("hoje", sql.Date, hojeBrasilia(agora));
  let cond = "p.Moderacao = 'APROVADO' AND p.Risco = 0 AND p.BoletimAte >= @hoje AND p.AnonimizadoEm IS NULL";
  if (membroId) {
    const p = await pessoa(pool, membroId);
    if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return [];
    rq.input("c", sql.Int, p.CongregacaoId); cond += " AND p.CongregacaoId = @c";
  } else if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); cond += " AND p.CongregacaoId = @c"; }
  const r = await rq.query(`SELECT p.PedidoId, p.TextoBoletim, p.ModeradoEm, p.BoletimAte, p.Categoria, c.Nome AS CongregacaoNome FROM PedidosOracao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE ${cond} ORDER BY c.Nome, p.ModeradoEm DESC`);
  return r.recordset.filter((p) => membroId || alcanca(ver, p.CongregacaoNome))
    .map((p) => ({ linha: p.TextoBoletim, congregacaoNome: p.CongregacaoNome, categoriaRotulo: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, desde: iso(p.ModeradoEm), ate: dia(p.BoletimAte) }));
}

// ---------------------------------------------------------------
// Buscas e painel da liderança
// ---------------------------------------------------------------

// Pessoas da congregação (para abrir um item ou nomear o responsável) e a liderança que alcança a congregação. Por POST: o nome não vai no endereço.
async function buscarPessoas(pool, { ver, congregacaoId, q, agora = new Date() }) {
  const cong = await congregacao(pool, congregacaoId);
  if (!cong || !alcanca(ver, cong.Nome)) return null;
  const termo = typeof q === "string" ? q.trim() : "";
  if (termo.length < 2 || termo.length > 60 || /[<>%_[\]]/.test(termo)) return [];
  const hoje = hojeBrasilia(agora);
  const vol = require("./voluntariado");
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("q", sql.NVarChar(70), `%${termo}%`).query(`
    SELECT TOP 20 m.MembroId, m.Nome, m.DataNascimento FROM MembroReferencia m
    WHERE m.Status = 'ATIVO' AND m.CongregacaoId = @c AND m.Nome COLLATE Latin1_General_CI_AI LIKE @q COLLATE Latin1_General_CI_AI ORDER BY m.Nome`);
  const territorio = await liderancaDoTerritorio(pool, congregacaoId);
  const norm = cp.normalizar(termo);
  const lideres = todosDoTerritorio(territorio).filter((d) => cp.normalizar(d.nome).includes(norm));
  const lista = r.recordset.map((m) => { const idade = vol.idadeEmAnos(m.DataNascimento, hoje); return { membroId: m.MembroId, nome: m.Nome, lideranca: false, maior: idade != null && idade >= cp.MAIORIDADE }; });
  for (const l of lideres) if (!lista.some((x) => mesmo(x.membroId, l.membroId))) lista.push({ membroId: l.membroId, nome: l.nome, lideranca: true, maior: true });
  return lista;
}

// Os números por congregação do território: abertos, vencidos, sem responsável, urgentes, pedidos esperando moderação e com risco, detectados em 30 dias e o tempo
// médio até o primeiro contato (itens criados nos últimos 90 dias). Só números.
async function painel(pool, { ver }) {
  const r = await pool.request().query(`
    SELECT c.CongregacaoId, c.Nome,
      (SELECT COUNT(*) FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.Status = 'ABERTO') AS Abertos,
      (SELECT COUNT(*) FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.Status = 'ABERTO' AND i.PrazoEm < SYSUTCDATETIME()) AS Vencidos,
      (SELECT COUNT(*) FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.Status = 'ABERTO' AND i.ResponsavelMembroId IS NULL) AS SemResponsavel,
      (SELECT COUNT(*) FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.Status = 'ABERTO' AND i.Urgente = 1) AS Urgentes,
      (SELECT COUNT(*) FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.Origem = 'DETECCAO' AND i.CriadoEm >= DATEADD(DAY, -30, SYSUTCDATETIME())) AS Detectados30,
      (SELECT AVG(CAST(DATEDIFF(MINUTE, i.CriadoEm, i.PrimeiroContatoEm) AS FLOAT)) / 60.0 FROM CuidadoItens i WHERE i.CongregacaoId = c.CongregacaoId AND i.PrimeiroContatoEm IS NOT NULL
        AND i.CriadoEm >= DATEADD(DAY, -90, SYSUTCDATETIME())) AS HorasAtePrimeiroContato,
      (SELECT COUNT(*) FROM PedidosOracao p WHERE p.CongregacaoId = c.CongregacaoId AND p.Moderacao = 'AGUARDANDO' AND p.Risco = 0 AND p.AnonimizadoEm IS NULL) AS PedidosAguardando,
      (SELECT COUNT(*) FROM PedidosOracao p WHERE p.CongregacaoId = c.CongregacaoId AND p.Risco = 1 AND p.AnonimizadoEm IS NULL) AS PedidosRisco
    FROM Congregacoes c WHERE c.Ativa = 1 ORDER BY c.Nome`);
  return r.recordset.filter((c) => alcanca(ver, c.Nome)).map((c) => ({
    congregacaoId: c.CongregacaoId, congregacaoNome: c.Nome, abertos: Number(c.Abertos), vencidos: Number(c.Vencidos), semResponsavel: Number(c.SemResponsavel), urgentes: Number(c.Urgentes),
    detectados30Dias: Number(c.Detectados30), horasAtePrimeiroContato: c.HorasAtePrimeiroContato == null ? null : Math.round(Number(c.HorasAtePrimeiroContato) * 10) / 10,
    pedidosAguardando: Number(c.PedidosAguardando), pedidosRisco: Number(c.PedidosRisco)
  }));
}

// As congregações do território (para os seletores da tela).
async function congregacoesDoTerritorio(pool, { ver }) {
  const r = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE Ativa = 1 ORDER BY Nome`);
  return r.recordset.filter((c) => alcanca(ver, c.Nome)).map((c) => ({ congregacaoId: c.CongregacaoId, nome: c.Nome }));
}

// ---------------------------------------------------------------
// A rotina diária (07h, NotificacoesAgendador): encerrar de quem saiu, detectar, subir a escada, apagar as notas de quem saiu e aplicar a retenção
// ---------------------------------------------------------------

// O item aberto de quem deixou de ser membro ativo da congregação do item (carta, desligamento, mudança de congregação) se encerra sozinho: a outra congregação cuida.
async function encerrarDeQuemSaiu(pool) {
  const r = await pool.request().query(`
    SELECT i.ItemId FROM CuidadoItens i JOIN MembroReferencia m ON m.MembroId = i.MembroId
    WHERE i.Status = 'ABERTO' AND (m.Status <> 'ATIVO' OR m.CongregacaoId IS NULL OR m.CongregacaoId <> i.CongregacaoId)`);
  let n = 0;
  for (const { ItemId } of r.recordset) {
    const t = new sql.Transaction(pool);
    try {
      await t.begin();
      const u = await new sql.Request(t).input("id", sql.Int, ItemId)
        .query(`UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'ENCAMINHADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = NULL WHERE ItemId = @id AND Status = 'ABERTO'; SELECT @@ROWCOUNT AS n`);
      if (Number(u.recordset[0].n)) {
        await inserirEvento(new sql.Request(t), { itemId: ItemId, tipo: "CONCLUIDO", observacao: "Encerrado pela rotina: a pessoa deixou de ser membro ativo desta congregação." });
        n++;
      }
      await t.commit();
    } catch (e) { await fecharTransacao(t, false); console.error("[CUIDADO] encerrar item de quem saiu falhou:", e.message); }
  }
  return n;
}

// As oportunidades que o sistema conhece (aula da EBD da turma, com presença ou ausência; reunião encerrada em que a pessoa era esperada) dos membros que podem ser sinal.
async function oportunidadesParaDeteccao(pool, { hoje, semanas }) {
  const inicio = cp.somarDiasIso(cp.somarDiasIso(hoje, -semanas * 7), -cp.DETECCAO_BASE_DIAS);
  const r = await pool.request().input("ini", sql.Date, inicio).input("hoje", sql.Date, hoje).input("car", sql.Int, cp.DETECCAO_CARENCIA_DIAS).query(`
    WITH ops AS (
      SELECT a.MembroId, l.Data AS Dia, CASE WHEN ch.Status = 'PRESENTE' THEN 1 ELSE 0 END AS Presente, 'EBD' AS Fonte
      FROM EbdChamadas ch JOIN EbdLicoes l ON l.LicaoId = ch.LicaoId JOIN EbdAlunos a ON a.AlunoId = ch.AlunoId
      WHERE ch.Status IN ('PRESENTE', 'AUSENTE') AND a.MembroId IS NOT NULL AND l.Data >= @ini AND l.Data <= @hoje
      UNION ALL
      SELECT p.MembroId, s.DataSessao, CASE WHEN p.Presente = 1 THEN 1 ELSE 0 END, 'REUNIAO'
      FROM Presencas p JOIN Sessoes s ON s.SessaoId = p.SessaoId
      WHERE s.Status = 'ENCERRADA' AND s.DataSessao >= @ini AND s.DataSessao <= @hoje
    )
    SELECT o.MembroId, m.CongregacaoId, o.Dia, MAX(o.Presente) AS Presente, o.Fonte
    FROM ops o JOIN MembroReferencia m ON m.MembroId = o.MembroId
    WHERE m.Status = 'ATIVO' AND m.CongregacaoId IS NOT NULL AND ISNULL(m.SituacaoMembro, '') <> 'SEM_COMUNHAO'
      AND NOT EXISTS (SELECT 1 FROM CuidadoItens ci WHERE ci.MembroId = m.MembroId AND ci.Tipo = 'AFASTAMENTO'
                      AND (ci.Status = 'ABERTO' OR ci.EncerradoEm >= DATEADD(DAY, -@car, SYSUTCDATETIME())))
      AND NOT EXISTS (SELECT 1 FROM ProcedimentosAbandono pa WHERE pa.MembroId = m.MembroId AND pa.Status = 'NOTIFICADO')
    GROUP BY o.MembroId, m.CongregacaoId, o.Dia, o.Fonte`);
  const porMembro = new Map();
  for (const l of r.recordset) {
    if (!porMembro.has(l.MembroId)) porMembro.set(l.MembroId, { membroId: l.MembroId, congregacaoId: l.CongregacaoId, ops: [] });
    porMembro.get(l.MembroId).ops.push({ data: dia(l.Dia), presente: !!Number(l.Presente), fonte: l.Fonte });
  }
  return [...porMembro.values()];
}

async function detectarAfastamentos(pool, { agora = new Date() } = {}) {
  const hoje = hojeBrasilia(agora);
  const prazos = await lerPrazos(pool);
  const semanas = prazos.CUIDADO_DETECCAO_SEMANAS;
  const candidatos = await oportunidadesParaDeteccao(pool, { hoje, semanas });
  const sinais = [];
  for (const c of candidatos) {
    const a = cp.avaliarFrequencia(c.ops, { hoje, semanas, costumePct: prazos.CUIDADO_DETECCAO_COSTUME_PCT, quedaPct: prazos.CUIDADO_DETECCAO_QUEDA_PCT });
    if (a.sinal) sinais.push({ ...c, avaliacao: a });
  }
  const porCongregacao = new Map();
  for (const s of sinais.sort((x, y) => y.avaliacao.queda - x.avaliacao.queda)) {
    const lista = porCongregacao.get(s.congregacaoId) || [];
    if (lista.length < cp.DETECCAO_MAX_POR_CONGREGACAO) lista.push(s);
    porCongregacao.set(s.congregacaoId, lista);
  }
  let abertos = 0;
  for (const [congregacaoId, lista] of porCongregacao) {
    const dir = await dirigenteDa(pool, congregacaoId);
    for (const s of lista) {
      const responsavel = dir && !mesmo(dir.membroId, s.membroId) ? dir : null;
      const g = await gravarItem(pool, {
        tipo: "AFASTAMENTO", congregacaoId, membroId: s.membroId, motivo: "A frequência caiu em relação ao costume da própria pessoa.", origem: "DETECCAO",
        deteccaoResumo: s.avaliacao.resumo.slice(0, 200), prazoEm: cp.prazoInicial("AFASTAMENTO", agora, prazos), responsavelMembroId: responsavel ? responsavel.membroId : null
      });
      if (g.itemId) abertos++;
    }
  }
  return { avaliados: candidatos.length, sinais: sinais.length, abertos };
}

// Sobe um degrau (ou lembra, no topo) cada item aberto vencido. Os avisos saem pelos detectores do motor, que leem os eventos de hoje.
async function subirEscada(pool, { agora = new Date() } = {}) {
  const prazos = await lerPrazos(pool);
  const novoPrazo = new Date(agora.getTime() + prazos.CUIDADO_PRAZO_DEGRAU_DIAS * 24 * 3600000);
  const r = await pool.request().query(`SELECT ItemId, CongregacaoId, MembroId, Nivel, PrazoEm, Status, LembretesGerais FROM CuidadoItens WHERE Status = 'ABERTO' AND PrazoEm < SYSUTCDATETIME()`);
  const territorios = new Map();
  let subiram = 0, lembretes = 0;
  for (const item of r.recordset) {
    if (!territorios.has(item.CongregacaoId)) territorios.set(item.CongregacaoId, await liderancaDoTerritorio(pool, item.CongregacaoId));
    const comGente = degrausComGente(territorios.get(item.CongregacaoId), [item.MembroId]);
    const dec = cp.decidirEscada(item, comGente, agora);
    if (dec.acao === "NADA") continue;
    const t = new sql.Transaction(pool);
    try {
      await t.begin();
      const sobe = dec.acao === "SUBIR";
      const u = await new sql.Request(t).input("id", sql.Int, item.ItemId).input("pz", sql.DateTime2, novoPrazo).input("de", sql.NVarChar(12), item.Nivel).input("para", sql.NVarChar(12), dec.para)
        .input("antigo", sql.DateTime2, item.PrazoEm)
        .query(`UPDATE CuidadoItens SET Nivel = @para, PrazoEm = @pz, Escalonamentos = Escalonamentos + ${sobe ? 1 : 0}, LembretesGerais = LembretesGerais + ${sobe ? 0 : 1}
                WHERE ItemId = @id AND Status = 'ABERTO' AND Nivel = @de AND PrazoEm = @antigo; SELECT @@ROWCOUNT AS n`);
      if (Number(u.recordset[0].n)) {
        await inserirEvento(new sql.Request(t), { itemId: item.ItemId, tipo: sobe ? "ESCALONADO" : "LEMBRETE_GERAL", nivelDe: item.Nivel, nivelPara: dec.para, prazoNovo: novoPrazo });
        if (sobe) subiram++; else lembretes++;
      }
      await t.commit();
    } catch (e) { await fecharTransacao(t, false); console.error("[CUIDADO] subir a escada falhou:", e.message); }
  }
  return { subiram, lembretes };
}

// Liga a marca de sessão que o gatilho das notas aceita para apagar, roda `fazer` e DESLIGA a marca, tudo na mesma transação (a conexão volta ao pool sem a marca).
async function comMarcaDePurga(request, fazer) {
  await request().query(`EXEC sp_set_session_context @key = N'cuidado_purga', @value = 1`);
  try { return await fazer(); }
  finally { try { await request().query(`EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL`); } catch (e) { /* a transação vai ser desfeita de qualquer jeito */ } }
}

// Regimento Art. 132 §2º, II: as anotações pastorais de quem saiu (desligado) há mais de 30 dias são eliminadas.
async function apagarNotasDeQuemSaiu(pool, { agora = new Date() } = {}) {
  const dias = await diasDeRetencao(pool, "notas");
  const limite = cp.somarDiasIso(hojeBrasilia(agora), -dias);
  const t = new sql.Transaction(pool);
  try {
    await t.begin();
    const rq = () => new sql.Request(t);
    const n = await comMarcaDePurga(rq, async () => {
      const alvo = `SELECT n.NotaId FROM NotasPastorais n JOIN MembroReferencia m ON m.MembroId = n.MembroId WHERE m.Status <> 'ATIVO' AND ISNULL(m.DataSaida, '19000101') <= @lim`;
      await rq().input("lim", sql.Date, limite).query(`DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (${alvo})`);
      const d = await rq().input("lim", sql.Date, limite).query(`DELETE FROM NotasPastorais WHERE NotaId IN (${alvo}); SELECT @@ROWCOUNT AS n`);
      return Number(d.recordset[0].n);
    });
    await t.commit();
    return n;
  } catch (e) { await fecharTransacao(t, false); throw e; }
}

// O que fica guardado além do prazo perde a identificação: o item encerrado há mais de 5 anos (e o histórico, e as notas de quem não era do cadastro) e o pedido de oração
// (1 ano; 5 se teve sinal de risco).
async function aplicarRetencao(pool, { agora = new Date() } = {}) {
  const diasItens = await diasDeRetencao(pool, "itens");
  const diasPedidos = await diasDeRetencao(pool, "pedidos");
  const diasRisco = await diasDeRetencao(pool, "pedidosRisco");
  const t = new sql.Transaction(pool);
  let itens = 0, pedidos = 0;
  try {
    await t.begin();
    const rq = () => new sql.Request(t);
    const alvo = `SELECT ItemId FROM CuidadoItens WHERE Status <> 'ABERTO' AND AnonimizadoEm IS NULL AND EncerradoEm < DATEADD(DAY, -@d, SYSUTCDATETIME())`;
    await comMarcaDePurga(rq, async () => {
      await rq().input("d", sql.Int, diasItens).query(`DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (SELECT NotaId FROM NotasPastorais WHERE ItemId IN (${alvo}))`);
      await rq().input("d", sql.Int, diasItens).query(`DELETE FROM NotasPastorais WHERE ItemId IN (${alvo})`);
    });
    await rq().input("d", sql.Int, diasItens).query(`UPDATE CuidadoEventos SET Observacao = NULL, Acompanhante = CASE WHEN Acompanhante IS NULL THEN NULL ELSE N'(anonimizado)' END, AnonimizadoEm = SYSUTCDATETIME()
      WHERE AnonimizadoEm IS NULL AND ItemId IN (${alvo})`);
    itens = Number((await rq().input("d", sql.Int, diasItens).query(`UPDATE CuidadoItens SET MembroId = NULL, PessoaNome = NULL, PessoaContato = NULL, Motivo = NULL, DeteccaoResumo = NULL, AnonimizadoEm = SYSUTCDATETIME()
      WHERE ItemId IN (${alvo}); SELECT @@ROWCOUNT AS n`)).recordset[0].n);
    pedidos = Number((await rq().input("dp", sql.Int, diasPedidos).input("dr", sql.Int, diasRisco).query(`
      UPDATE PedidosOracao SET Texto = NULL, SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, SolicitanteNome = NULL, SolicitanteContato = NULL, TextoBoletim = NULL,
        RiscoDesmarcadoMotivo = NULL, Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'NAO_PUBLICAR' ELSE Moderacao END, BoletimAte = NULL, AnonimizadoEm = SYSUTCDATETIME()
      WHERE AnonimizadoEm IS NULL AND CriadoEm < DATEADD(DAY, -CASE WHEN RiscoJaTeve = 1 THEN @dr ELSE @dp END, SYSUTCDATETIME()); SELECT @@ROWCOUNT AS n`)).recordset[0].n);
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  return { itens, pedidos };
}

// A rotina inteira. Cada passo é independente: um que falha não impede os outros (e a resposta diz qual falhou).
async function rotinaDiaria(pool, { agora = new Date() } = {}) {
  const r = { falhas: [] };
  const passo = async (nome, f) => { try { r[nome] = await f(); } catch (e) { r.falhas.push(nome); console.error(`[CUIDADO] a rotina "${nome}" falhou:`, e && e.message); } };
  await passo("encerradosPorSaida", () => encerrarDeQuemSaiu(pool));
  await passo("deteccao", () => detectarAfastamentos(pool, { agora }));
  await passo("escada", () => subirEscada(pool, { agora }));
  await passo("notasApagadas", () => apagarNotasDeQuemSaiu(pool, { agora }));
  await passo("retencao", () => aplicarRetencao(pool, { agora }));
  return r;
}

// ---------------------------------------------------------------
// Os detectores do motor de avisos (rodam depois da rotina, na mesma manhã)
// ---------------------------------------------------------------

// Um resumo por responsável, por dia, quando há item novo (das últimas 26 horas), vencendo em 24 horas ou vencido.
async function detectarResumoDiario(pool, { agora = new Date() } = {}) {
  // (o SQL Server não soma um EXISTS: a marca "novo" de cada item é calculada antes, numa tabela derivada)
  const r = await pool.request().query(`
    SELECT x.ResponsavelMembroId AS membroId, m.Nome AS nome, m.Email AS email, COUNT(*) AS abertos, SUM(x.Novo) AS novos,
      SUM(CASE WHEN x.PrazoEm >= SYSUTCDATETIME() AND x.PrazoEm < DATEADD(HOUR, 24, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS vencendo,
      SUM(CASE WHEN x.PrazoEm < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS vencidos
    FROM (
      SELECT i.ItemId, i.ResponsavelMembroId, i.PrazoEm,
        CASE WHEN EXISTS (SELECT 1 FROM CuidadoEventos e WHERE e.ItemId = i.ItemId AND e.Tipo IN ('CRIADO', 'ATRIBUIDO') AND e.Em >= DATEADD(HOUR, -26, SYSUTCDATETIME())
                          AND (e.Tipo = 'CRIADO' OR e.ResponsavelMembroId = i.ResponsavelMembroId)) THEN 1 ELSE 0 END AS Novo
      FROM CuidadoItens i WHERE i.Status = 'ABERTO' AND i.ResponsavelMembroId IS NOT NULL AND (i.MembroId IS NULL OR i.MembroId <> i.ResponsavelMembroId)
    ) x JOIN MembroReferencia m ON m.MembroId = x.ResponsavelMembroId
    WHERE m.Status = 'ATIVO'
    GROUP BY x.ResponsavelMembroId, m.Nome, m.Email`);
  const ref = cp.referenciaDoDia(hojeBrasilia(agora));
  return r.recordset.filter((l) => Number(l.novos) + Number(l.vencendo) + Number(l.vencidos) > 0).map((l) => ({
    referenciaId: ref, destinatarios: [destinatarioDe(l)],
    fatoGerador: cp.textoResumo({ novos: Number(l.novos), vencendo: Number(l.vencendo), vencidos: Number(l.vencidos), abertos: Number(l.abertos) })
  }));
}

// Um aviso por item que subiu (ou lembrou no topo) nas últimas 26 horas, a quem está no degrau novo (menos a própria pessoa acompanhada).
async function detectarDegraus(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT e.EventoId, e.NivelPara, i.ItemId, i.CongregacaoId, i.MembroId, c.Nome AS CongregacaoNome
    FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
    WHERE e.Tipo IN ('ESCALONADO', 'LEMBRETE_GERAL') AND e.Em >= DATEADD(HOUR, -26, SYSUTCDATETIME()) AND i.Status = 'ABERTO'`);
  const territorios = new Map();
  const fatos = [];
  for (const ev of r.recordset) {
    if (!territorios.has(ev.CongregacaoId)) territorios.set(ev.CongregacaoId, await liderancaDoTerritorio(pool, ev.CongregacaoId));
    const destinatarios = semRepetidos(territorios.get(ev.CongregacaoId)[ev.NivelPara] || [], [ev.MembroId]);
    if (!destinatarios.length) continue;
    fatos.push({ referenciaId: ev.EventoId, destinatarios, fatoGerador: cp.textoDegrau({ congregacaoNome: ev.CongregacaoNome, para: ev.NivelPara }) });
  }
  return fatos;
}

// Um aviso por congregação, por dia, à liderança do degrau mais baixo que tem gente, quando há pedido esperando moderação (o pedido com risco já avisou na hora).
async function detectarModeracao(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT p.CongregacaoId, c.Nome AS CongregacaoNome, COUNT(*) AS n
    FROM PedidosOracao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE p.Moderacao = 'AGUARDANDO' AND p.Risco = 0 AND p.AnonimizadoEm IS NULL GROUP BY p.CongregacaoId, c.Nome`);
  const dia = cp.referenciaDoDia(hojeBrasilia(agora));
  const fatos = [];
  for (const l of r.recordset) {
    const territorio = await liderancaDoTerritorio(pool, l.CongregacaoId);
    const degrau = cp.ORDEM_DEGRAUS.find((k) => territorio[k].length > 0);
    if (!degrau) continue;
    fatos.push({ referenciaId: dia * 10000 + (Number(l.CongregacaoId) % 10000), destinatarios: territorio[degrau], fatoGerador: cp.textoModeracao({ quantos: Number(l.n), congregacaoNome: l.CongregacaoNome }) });
  }
  return fatos;
}

// ---------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------

// Meus Dados: os pedidos que a pessoa fez (com o texto: são dela) e QUANTAS notas e acompanhamentos existem sobre ela e de quando (o texto escrito por outros sobre ela pode
// ser pedido ao Encarregado; o mesmo critério da v7.5).
async function dadosDoTitular(pool, membroId) {
  const id = Number(membroId);
  const linha = async (consulta) => (await pool.request().input("m", sql.Int, id).query(consulta)).recordset[0] || {};
  const notas = await linha(`SELECT COUNT(*) AS n, MIN(CriadaEm) AS primeira, MAX(CriadaEm) AS ultima FROM NotasPastorais WHERE MembroId = @m`);
  const itens = await linha(`SELECT COUNT(*) AS n, SUM(CASE WHEN Status = 'ABERTO' THEN 1 ELSE 0 END) AS abertos, MIN(CriadoEm) AS primeiro, MAX(CriadoEm) AS ultimo FROM CuidadoItens WHERE MembroId = @m`);
  const resp = await linha(`SELECT COUNT(*) AS n FROM CuidadoItens WHERE ResponsavelMembroId = @m AND Status = 'ABERTO'`);
  const pedidos = (await pool.request().input("m", sql.Int, id).query(`SELECT PedidoId, Categoria, ParaQuem, Texto, PodeBoletim, Moderacao, CriadoEm FROM PedidosOracao WHERE SolicitanteMembroId = @m ORDER BY PedidoId DESC`))
    .recordset.map((p) => ({ criadoEm: iso(p.CriadoEm), assunto: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, paraQuem: cp.PARA_QUEM[p.ParaQuem], texto: p.Texto, podeBoletim: !!p.PodeBoletim, situacao: SITUACAO_PEDIDO_PARA_QUEM_PEDIU[p.Moderacao] }));
  return {
    pedidosDeOracao: pedidos,
    notasPastoraisSobreVoce: { quantidade: Number(notas.n) || 0, primeira: iso(notas.primeira), ultima: iso(notas.ultima), comoPedirOTexto: "O texto escrito pela liderança pode ser pedido ao Encarregado de Dados (Meus Dados → Solicitações)." },
    acompanhamentosSobreVoce: { quantidade: Number(itens.n) || 0, abertos: Number(itens.abertos) || 0, primeiro: iso(itens.primeiro), ultimo: iso(itens.ultimo) },
    acompanhamentosComoResponsavel: { abertos: Number(resp.n) || 0 }
  };
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD; `r()` cria um pedido nessa transação): apaga as notas sobre a pessoa, encerra e anonimiza os itens sobre ela
// e anonimiza os pedidos que ela fez. Devolve as contagens.
async function exclusaoLgpd(r, membroId) {
  const id = Number(membroId);
  const n = (x) => Number((((x && x.recordset) || [])[0] || {}).n) || 0;
  const notas = await comMarcaDePurga(r, async () => {
    await r().input("m", sql.Int, id).query(`DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (SELECT NotaId FROM NotasPastorais WHERE MembroId = @m)`);
    return n(await r().input("m", sql.Int, id).query(`DELETE FROM NotasPastorais WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`));
  });
  const abertos = ((await r().input("m", sql.Int, id).query(`SELECT ItemId FROM CuidadoItens WHERE MembroId = @m AND Status = 'ABERTO'`)) || {}).recordset || [];
  for (const { ItemId } of abertos) {
    await r().input("i", sql.Int, ItemId).query(`UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'OUTRO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = NULL WHERE ItemId = @i AND Status = 'ABERTO'`);
    await inserirEvento(r(), { itemId: ItemId, tipo: "CONCLUIDO" });
  }
  await r().input("m", sql.Int, id).query(`UPDATE CuidadoEventos SET Observacao = NULL, Acompanhante = CASE WHEN Acompanhante IS NULL THEN NULL ELSE N'(anonimizado)' END, AnonimizadoEm = SYSUTCDATETIME()
    WHERE AnonimizadoEm IS NULL AND ItemId IN (SELECT ItemId FROM CuidadoItens WHERE MembroId = @m)`);
  const itens = n((await r().input("m", sql.Int, id).query(`UPDATE CuidadoItens SET MembroId = NULL, PessoaNome = NULL, PessoaContato = NULL, Motivo = NULL, DeteccaoResumo = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE MembroId = @m AND Status <> 'ABERTO'; SELECT @@ROWCOUNT AS n`)));
  const pedidos = n((await r().input("m", sql.Int, id).query(`
    UPDATE PedidosOracao SET Texto = NULL, SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, SolicitanteNome = NULL, SolicitanteContato = NULL, TextoBoletim = NULL,
      RiscoDesmarcadoMotivo = NULL, Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'NAO_PUBLICAR' ELSE Moderacao END, BoletimAte = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE SolicitanteMembroId = @m AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`)));
  return { notas, itens, pedidos };
}

module.exports = {
  PERMISSAO, lerPrazos, limparCaches, liderancaDoTerritorio, dirigenteDa, ehPastor, acessoAoItem,
  abrirItem, listarFila, detalheItem, meusItens, registrarContato, atribuir, adiar, concluir, cancelar,
  listarNotas, escreverNota, notaLegivel, lerNota, leiturasDaNota,
  pedirOracao, registrarPedidoRecebido, pedirVisita, meusPedidos, listarPedidos, moderar, marcarRisco, acompanharPedido, boletim,
  buscarPessoas, painel, congregacoesDoTerritorio,
  rotinaDiaria, encerrarDeQuemSaiu, detectarAfastamentos, subirEscada, apagarNotasDeQuemSaiu, aplicarRetencao,
  detectarResumoDiario, detectarDegraus, detectarModeracao, dadosDoTitular, exclusaoLgpd
};
