// shared/cuidadoPastoralDb.js (v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo)
//
// A camada de banco da regra pura de shared/cuidadoPastoral.js. Reúne os fatos, pede a decisão à regra e grava só o que ela decidiu. Nada aqui inventa regra.
//
// Quem vê o quê (decidido uma vez, aqui, e conferido pelos roteiros ponta a ponta):
//   - a LIDERANÇA (permissão cuidado_pastoral, sessão de liderança territorial: Extensão e Departamento não operam a fila) vê a fila, os pedidos de oração e o boletim do seu
//     território (o Dirigente, a congregação; o Pastor de Área, a área; o Superintendente, a região; o nível geral, tudo), abre, atribui, adia, conclui e cancela itens, e
//     escreve e lê notas conforme o nível;
//   - o RESPONSÁVEL nomeado (qualquer membro, inclusive por PIN) vê só os itens ABERTOS dele, registra contato, conclui e escreve nota de nível "equipe";
//   - a PESSOA ACOMPANHADA nunca vê o item nem as notas sobre ela (nem se for da liderança): para ela não existem; ela vê só os pedidos que ela mesma fez;
//   - quem mudou de congregação ou saiu some da visão da congregação antiga na hora (Regimento Art. 132 §1º, II): o item, as notas e os pedidos dele; o item aberto passa para a
//     congregação nova na rotina da manhã;
//   - o caso de violência que cita alguém da liderança fica SÓ com o nível geral (SoNivelGeral): a pessoa citada pode ser quem receberia o aviso, leria o texto e desmarcaria o risco;
//   - cada abertura de nota fica registrada (quem e quando, nunca o conteúdo); a auditoria guarda só ids e códigos.
// Toda resposta de escrita é { sucesso, mensagem, ... }; `naoExiste` = 404 (a mesma resposta para o que não existe e para o que a pessoa não pode ver), `proibido` = 403,
// `mudou` = 409, `limite` = 429.
//
// Revisão independente (21/10/2026): 2 críticos, 7 altos, 6 médios e 8 baixos, todos tratados aqui — a lista de risco ampliada (shared/cuidadoPastoral.js), o pedido de socorro que
// nunca se perde (nem no limite do dia, nem com outro pedido aberto), a fila filtrada pelo território NO BANCO (antes do TOP), a Extensão fora da fila, o acesso que acaba na mudança
// de congregação, o responsável que só vê item aberto, o risco marcado em pedido de item encerrado (abre outro), a anonimização sem sobra de matrícula, a marca de purga num lote só.
//
// Trava de Revisão 7-C (23/10/2026), as costuras com a proteção de crianças (a regra da Trava 7-B, já no check-in): quem tem pendência reservada à Diretoria (afastamento
// cautelar, comunicação em análise, cadastro nacional, restrição, fora de comunhão) não vê item, nota nem pedido de criança ou adolescente, não é o destino nem o responsável
// deles e sai dos que já tinha (a rotina e cada ato da Diretoria); o pedido com sinal de risco sobre criança, ou feito por um menor, fica só com o nível geral, longe de quem tem
// pendência ou é envolvido de incidente aberto, e a Proteção de crianças é avisada do prazo do Conselho Tutelar; o mural do site responde sem abrir o banco quando não precisa.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const cp = require("./cuidadoPastoral");
const { hojeBrasilia } = require("./dataBrasilia");
const { notificarAgora, lerPrazoDias } = require("./canaisDb");
const { resolverDestinatariosPorPermissao } = require("./notificacoes");
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
const NOTAS_DE_VISITANTE_DIAS = 365;        // a nota sobre quem não é do cadastro sai 1 ano depois que o item encerra (a pessoa não tem "saída do rol")
const DEGRAU_DO_ESCOPO = { CONGREGACAO: "CONGREGACAO", AREA: "AREA", REGIAO: "REGIAO", QUADRANTE: "QUADRANTE", DISTRITO: "DISTRITO", GLOBAL: "GERAL" };
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
const contagem = (x) => Number((((x && x.recordset) || [])[0] || {}).n) || 0;
const NAO_EXISTE = { sucesso: false, naoExiste: true };
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const destinatarioDe = (m) => ({ membroId: m.membroId != null ? m.membroId : m.MembroId, nome: m.nome != null ? m.nome : m.Nome, email: m.email !== undefined ? m.email : m.Email });
function semRepetidos(lista, fora = []) {
  const excluir = new Set(fora.filter((x) => x != null).map(Number));
  const vistos = new Set();
  return (lista || []).filter((d) => { if (!d || excluir.has(Number(d.membroId)) || vistos.has(Number(d.membroId))) return false; vistos.add(Number(d.membroId)); return true; });
}
// A auditoria guarda só o id e o código do ato: nunca texto de nota, de pedido, nome de quem é acompanhado nem o tipo do risco.
async function auditar(tabela, registroId, acao, usuarioId) {
  await registrarAuditoria({ tabela, registroId: registroId || 0, acao, usuarioId: usuarioId || null, dadosDepois: {} });
}
// A marca de sessão que o gatilho das notas aceita para apagar: ligada, usada e DESLIGADA no MESMO lote, e desligada também no erro (TRY/CATCH). Num lote só, a conexão nunca volta
// ao pool com a marca ligada — nem quando o gatilho desfaz a transação no meio (revisão: o `finally` de antes não rodava nesse caso). `corpo` soma o que apagou em @apagadas.
function comMarcaDePurga(corpo) {
  return `DECLARE @apagadas INT = 0;
BEGIN TRY
  EXEC sp_set_session_context @key = N'cuidado_purga', @value = 1;
  ${corpo}
  EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL;
END TRY
BEGIN CATCH
  EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL;
  THROW;
END CATCH;
SELECT @apagadas AS n`;
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

// { CONGREGACAO, AREA, REGIAO, QUADRANTE, DISTRITO, GERAL } com { membroId, nome, email, pastor } de quem tem a permissão no escopo que alcança a congregação. A escada usa
// CONGREGACAO → AREA → REGIAO → GERAL; Quadrante e Distrito (se alguém lá tiver a permissão) recebem o aviso de risco, que vai a todo o território.
// (Trava 7-C) A concessão restrita a um departamento não entra: o mesmo critério da rota (e da crise).
async function liderancaDoTerritorio(pool, congregacaoId) {
  const anc = await ancestraisTerritoriais(pool, sql, 1, congregacaoId);
  const r = await pool.request().input("perm", sql.NVarChar(60), `%,${PERMISSAO},%`).input("c", sql.Int, congregacaoId).input("a", sql.Int, anc.areaId || null)
    .input("rg", sql.Int, anc.regiaoId || null).input("q", sql.Int, anc.quadranteId || null).input("d", sql.Int, anc.distritoId || null).query(`
    SELECT DISTINCT l.EscopoTipo, m.MembroId AS membroId, m.Nome AS nome, m.Email AS email, m.CargoMinisterial
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE (',' + p.Permissoes + ',') LIKE @perm AND m.Status = 'ATIVO' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)) AND l.DepartamentoId IS NULL
      AND ((l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @c) OR (l.EscopoTipo = 'AREA' AND l.EscopoId = @a) OR (l.EscopoTipo = 'REGIAO' AND l.EscopoId = @rg)
        OR (l.EscopoTipo = 'QUADRANTE' AND l.EscopoId = @q) OR (l.EscopoTipo = 'DISTRITO' AND l.EscopoId = @d) OR l.EscopoTipo = 'GLOBAL')`);
  const t = { CONGREGACAO: [], AREA: [], REGIAO: [], QUADRANTE: [], DISTRITO: [], GERAL: [] };
  for (const l of r.recordset) {
    const degrau = DEGRAU_DO_ESCOPO[l.EscopoTipo];
    if (degrau) t[degrau].push({ membroId: l.membroId, nome: l.nome, email: l.email, pastor: l.CargoMinisterial === "PASTOR" });
  }
  for (const k of Object.keys(t)) t[k] = semRepetidos(t[k]);
  return t;
}
const degrausComGente = (territorio, fora = []) => new Set(cp.ORDEM_DEGRAUS.filter((k) => semRepetidos(territorio[k], fora).length > 0));
const todosDoTerritorio = (territorio, fora = []) => semRepetidos(Object.values(territorio).flat(), fora);

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

// ---------------------------------------------------------------
// Trava 7-C — a regra da Trava 7-B (GestaoCheckinInfantil) no cuidado pastoral
// ---------------------------------------------------------------
// A liderança com pendência reservada à Diretoria (afastamento cautelar da v7.8, comunicação em análise, cadastro nacional, restrição nos antecedentes, fora de comunhão) não vê
// o item, as notas nem o pedido de uma criança ou adolescente, não é nomeada nem fica responsável por eles e não recebe o aviso sobre eles. Para ela, o que é sobre o menor
// simplesmente não existe (a mesma resposta de "não encontrado": o motivo segue reservado). Na dúvida (a aptidão não pôde ser lida), fecha.
const menorPelaData = (nascimento, hoje) => { const idade = require("./voluntariado").idadeEmAnos(nascimento, hoje); return idade != null && idade < cp.MAIORIDADE; };
// O conjunto de quem, nesta lista, tem pendência reservada (aptidão do ministério com menores, em lote).
async function bloqueadosEntre(pool, membroIds, hoje = hojeBrasilia()) {
  const ids = [...new Set((membroIds || []).filter((x) => x != null).map(Number))];
  if (!ids.length) return new Set();
  try {
    const mm = require("./ministerioMenores");
    const mapa = await require("./ministerioMenoresDb").aptidaoEmLote(pool, ids, { hoje });
    return new Set(ids.filter((id) => { const ap = mapa.get(id); return !ap || mm.temBloqueioReservado(ap.bloqueios); }));
  } catch (e) {
    console.error("[CUIDADO] a aptidão não pôde ser conferida (fecha):", e && e.message);
    return new Set(ids);
  }
}
// Quem é ENVOLVIDO num incidente de proteção ainda aberto (v7.8), qualquer que seja o nível: fica fora do que é sobre criança (o aviso do risco).
async function envolvidosEmIncidenteAberto(pool, membroIds) {
  const ids = [...new Set((membroIds || []).filter((x) => x != null).map(Number))];
  if (!ids.length) return new Set();
  try {
    const r = await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
      SELECT DISTINCT e.MembroId FROM IncidenteEnvolvidos e JOIN IncidentesProtecao i ON i.IncidenteId = e.IncidenteId
      WHERE i.Status = 'ABERTO' AND e.MembroId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`);
    return new Set(r.recordset.map((x) => Number(x.MembroId)));
  } catch (e) {
    console.error("[CUIDADO] os envolvidos de incidente não puderam ser lidos (fecha):", e && e.message);
    return new Set(ids);
  }
}
// Quem fica fora de tudo que é sobre criança: a pendência reservada E o envolvido de incidente aberto.
async function foraDoQueESobreCrianca(pool, membroIds, hoje = hojeBrasilia()) {
  const [a, b] = await Promise.all([bloqueadosEntre(pool, membroIds, hoje), envolvidosEmIncidenteAberto(pool, membroIds)]);
  return new Set([...a, ...b]);
}
// O bloqueio de quem olha, calculado uma vez por requisição e guardado no próprio `ver` (só quando aparece algo sobre um menor).
async function conferirBloqueio(pool, ver, agora = new Date()) {
  if (ver && ver.bloqueioReservado === undefined) ver.bloqueioReservado = (await bloqueadosEntre(pool, [ver.membroId], hojeBrasilia(agora))).has(Number(ver.membroId));
  return ver;
}
const bloqueado = (ver) => !ver || ver.bloqueioReservado !== false;
// `ver`: { membroId, gestao, geral, acima, podeVerCongregacao(nome) } — montado pela rota a partir da sessão de liderança.
const alcanca = (ver, congregacaoNome) => !!(ver && ver.gestao && (ver.geral || (congregacaoNome && ver.podeVerCongregacao && ver.podeVerCongregacao(congregacaoNome))));
// As congregações do território, como lista de ids para a consulta (null = todas, nível geral). O filtro vai NO BANCO, antes do TOP (revisão: o TOP 400 da igreja inteira
// filtrado depois deixava a fila do Dirigente vazia).
async function idsDoTerritorio(pool, ver) {
  if (ver && ver.gestao && ver.geral) return null;
  const r = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes`);
  return r.recordset.filter((c) => alcanca(ver, c.Nome)).map((c) => c.CongregacaoId);
}
function filtroDeIds(rq, coluna, ids, prefixo = "t") {
  if (ids === null) return "1 = 1";
  if (!ids.length) return "1 = 0";
  return `${coluna} IN (${ids.map((id, i) => { rq.input(`${prefixo}${i}`, sql.Int, id); return `@${prefixo}${i}`; }).join(", ")})`;
}

// ---------------------------------------------------------------
// O item
// ---------------------------------------------------------------

const SELECT_ITEM = `
  SELECT i.ItemId, i.Tipo, i.CongregacaoId, c.Nome AS CongregacaoNome, i.MembroId, COALESCE(m.Nome, i.PessoaNome) AS PessoaNomeExibido, i.PessoaContato,
         m.Telefone AS MembroTelefone, m.Email AS MembroEmail, m.DataNascimento AS MembroNascimento, m.Status AS MembroStatus, m.CongregacaoId AS MembroCongregacaoId,
         mc.Nome AS MembroCongregacaoNome, i.Motivo, i.Origem, i.PedidoOracaoId, i.Urgente, i.SoNivelGeral, i.DeteccaoResumo,
         i.ResponsavelMembroId, r.Nome AS ResponsavelNome, i.PrazoEm, i.Nivel, i.Escalonamentos, i.LembretesGerais, i.Status, i.Desfecho, i.EncerradoEm, i.PrimeiroContatoEm,
         i.CriadoEm, i.CriadoPorMembroId, i.AnonimizadoEm
  FROM CuidadoItens i JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId LEFT JOIN MembroReferencia m ON m.MembroId = i.MembroId
  LEFT JOIN Congregacoes mc ON mc.CongregacaoId = m.CongregacaoId LEFT JOIN MembroReferencia r ON r.MembroId = i.ResponsavelMembroId`;

async function carregarItem(pool, itemId) {
  return (await pool.request().input("id", sql.Int, itemId).query(`${SELECT_ITEM} WHERE i.ItemId = @id`)).recordset[0] || null;
}
// A pessoa do item deixou de ser membro ativo DESTA congregação (mudou, saiu): a congregação antiga não a vê mais.
const pessoaMudou = (item) => !!item.MembroId && (item.MembroStatus !== "ATIVO" || !mesmo(item.MembroCongregacaoId, item.CongregacaoId));
// "GESTAO" | "RESPONSAVEL" | null. A pessoa acompanhada nunca tem acesso ao próprio item.
// (Trava 7-C) O item de criança ou adolescente: só com o bloqueio de quem olha já conferido (conferirBloqueio) e sem pendência reservada; sem a conferência, fecha.
function acessoAoItem(ver, item) {
  if (!ver || !item) return null;
  if (item.MembroId && mesmo(item.MembroId, ver.membroId)) return null;
  if (ehMenor(item, hojeBrasilia()) && bloqueado(ver)) return null;
  const mudou = pessoaMudou(item);
  if (ver.gestao) {
    if (ver.geral) return "GESTAO";
    if (!item.SoNivelGeral && alcanca(ver, item.CongregacaoNome) && (!mudou || (item.MembroStatus === "ATIVO" && alcanca(ver, item.MembroCongregacaoNome)))) return "GESTAO";
  }
  // o responsável voluntário só enquanto o item está aberto e a pessoa continua na congregação (o encerrado guarda motivo e histórico que não são mais dele)
  if (item.Status === "ABERTO" && !mudou && mesmo(item.ResponsavelMembroId, ver.membroId)) return "RESPONSAVEL";
  return null;
}
function ehMenor(item, hoje) {
  return !!item && menorPelaData(item.MembroNascimento, hoje);
}
// Antes de decidir o acesso a uma lista de itens: confere o bloqueio de quem olha se algum deles é de um menor (uma vez por requisição).
async function prepararVer(pool, ver, itens, agora = new Date()) {
  const hoje = hojeBrasilia(agora);
  if ((itens || []).some((i) => i && ehMenor(i, hoje))) await conferirBloqueio(pool, ver, agora);
  return ver;
}
function formatarItem(i, { agora = new Date(), acesso = "GESTAO", completo = false } = {}) {
  const hoje = hojeBrasilia(agora);
  const base = {
    itemId: i.ItemId, tipo: i.Tipo, tipoRotulo: (cp.TIPOS[i.Tipo] || {}).rotulo || i.Tipo, congregacaoId: i.CongregacaoId, congregacaoNome: i.CongregacaoNome,
    pessoaNome: i.PessoaNomeExibido || (i.AnonimizadoEm ? "(anonimizado)" : null), menor: ehMenor(i, hoje), origem: i.Origem, origemRotulo: cp.ORIGENS[i.Origem] || i.Origem,
    urgente: !!i.Urgente, soNivelGeral: !!i.SoNivelGeral, responsavel: i.ResponsavelMembroId ? { membroId: i.ResponsavelMembroId, nome: i.ResponsavelNome } : null,
    prazoEm: iso(i.PrazoEm), prazo: i.Status === "ABERTO" ? cp.situacaoDoPrazo(i.PrazoEm, agora) : null, nivel: i.Nivel, nivelRotulo: cp.DEGRAUS[i.Nivel] || i.Nivel,
    status: i.Status, desfecho: i.Desfecho, desfechoRotulo: cp.DESFECHOS_CONCLUSAO[i.Desfecho] || cp.DESFECHOS_CANCELAMENTO[i.Desfecho] || null,
    encerradoEm: iso(i.EncerradoEm), criadoEm: iso(i.CriadoEm), primeiroContatoEm: iso(i.PrimeiroContatoEm)
  };
  if (acesso === "GESTAO") { base.membroId = i.MembroId || null; base.pedidoOracaoId = i.PedidoOracaoId || null; base.deteccaoResumo = i.DeteccaoResumo || null; }
  else if (i.Origem === "DETECCAO") base.deteccaoResumo = i.DeteccaoResumo || null;
  if (completo) {
    base.motivo = i.Motivo || null;
    // o contato é o de agora no cadastro: só sai com o item aberto (o encerrado não é porta para o telefone novo de quem já foi atendido)
    base.contato = i.Status !== "ABERTO" ? null : i.MembroId ? [i.MembroTelefone, i.MembroEmail].filter(Boolean).join(" · ") || null : i.PessoaContato || null;
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

// Quem pode ser nomeado responsável por um item desta congregação. Fora do território de quem nomeia, a resposta é sempre "não encontrada" (revisão: as mensagens diferentes
// para "não existe", "não está ativo" e "é menor" serviam de sonda sobre o cadastro da igreja inteira).
async function conferirResponsavel(pool, membroId, item, hoje, ver) {
  const p = await pessoa(pool, membroId);
  const NAO = { ok: false, mensagem: "Pessoa não encontrada." };
  if (!p) return NAO;
  const territorio = await liderancaDoTerritorio(pool, item.congregacaoId);
  const alcancaPorLideranca = todosDoTerritorio(territorio).some((d) => mesmo(d.membroId, membroId));
  if (!alcancaPorLideranca && !(ver && (ver.geral || alcanca(ver, p.CongregacaoNome)))) return NAO;
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

// Para onde vai o item que nasce: o responsável (o escolhido; sem escolha, o Dirigente, se ele não for a própria pessoa) e o degrau. Sem ninguém na congregação, o item nasce
// no degrau de cima que tem gente (revisão: o item sobre o Dirigente ficava sem dono e sem aviso até vencer). O caso "só nível geral" nasce no topo, sem responsável.
// (Trava 7-C) O item de criança ou adolescente nunca vai a quem tem pendência reservada: nem o Dirigente vira o responsável, nem quem tem a pendência conta como "gente" num
// degrau (o item sobe ao degrau de cima) ou recebe o aviso. `fora`: essas pessoas.
async function destinoDoItem(pool, { congregacaoId, membroId, soGeral = false, responsavel, agora = new Date() }) {
  const territorio = await liderancaDoTerritorio(pool, congregacaoId);
  const dir = responsavel === undefined && !soGeral ? await dirigenteDa(pool, congregacaoId) : null;
  let fora = [];
  if (membroId) {
    const p = await pessoa(pool, membroId);
    if (p && menorPelaData(p.DataNascimento, hojeBrasilia(agora))) {
      fora = [...(await bloqueadosEntre(pool, [...todosDoTerritorio(territorio).map((d) => d.membroId), ...(dir ? [dir.membroId] : [])], hojeBrasilia(agora)))];
    }
  }
  if (soGeral) return { territorio, responsavel: null, nivel: "GERAL", soGeral: true, fora };
  let resp = responsavel;
  if (resp === undefined) resp = dir && !mesmo(dir.membroId, membroId) && !fora.some((f) => mesmo(f, dir.membroId)) ? dir : null;
  if (resp) return { territorio, responsavel: resp, nivel: "CONGREGACAO", soGeral: false, fora };
  return { territorio, responsavel: null, nivel: cp.proximoDegrau("CONGREGACAO", degrausComGente(territorio, [membroId, ...fora])) || "CONGREGACAO", soGeral: false, fora };
}
// Depois de gravado: o responsável recebe "você é o responsável" (se não foi ele mesmo que se nomeou); sem responsável, quem está no degrau em que o item nasceu é avisado.
async function avisarDestino(pool, { destino, g, membroId, pessoaNome, congregacaoNome, prazoEm, agora, por }) {
  if (destino.responsavel) {
    if (mesmo(destino.responsavel.membroId, por)) return null;
    return avisarResponsavel(pool, { responsavel: destino.responsavel, eventoId: g.eventoAtribuido, pessoaNome, congregacaoNome, prazoEm, agora });
  }
  if (destino.soGeral || destino.nivel === "CONGREGACAO") return null;
  return notificarAgora(pool, { regraChave: "CUIDADO_DEGRAU", destinatarios: semRepetidos(destino.territorio[destino.nivel], [membroId, por, ...(destino.fora || [])]), referenciaTabela: "CuidadoEventos",
    referenciaId: g.eventoCriado, mensagem: cp.textoSemResponsavel({ congregacaoNome, para: destino.nivel }) });
}

// Grava um item novo (e o evento CRIADO, e o ATRIBUIDO se houver responsável) numa transação. `d`: { tipo, congregacaoId, membroId, pessoaNome, pessoaContato, motivo,
// origem, pedidoOracaoId, urgente, soGeral, deteccaoResumo, prazoEm, responsavelMembroId, nivel, criadoPor }. Devolve { itemId, eventoCriado, eventoAtribuido } ou { repetido:true }.
async function gravarItem(pool, d, { transaction: externa = null } = {}) {
  const transaction = externa || new sql.Transaction(pool);
  try {
    if (!externa) await transaction.begin();
    const ins = await new sql.Request(transaction).input("t", sql.NVarChar(20), d.tipo).input("c", sql.Int, d.congregacaoId).input("m", sql.Int, d.membroId || null)
      .input("pn", sql.NVarChar(150), d.pessoaNome || null).input("pc", sql.NVarChar(150), d.pessoaContato || null).input("mo", sql.NVarChar(300), d.motivo || null)
      .input("o", sql.NVarChar(16), d.origem).input("po", sql.Int, d.pedidoOracaoId || null).input("u", sql.Bit, d.urgente ? 1 : 0).input("sg", sql.Bit, d.soGeral ? 1 : 0)
      .input("dr", sql.NVarChar(200), d.deteccaoResumo || null).input("r", sql.Int, d.responsavelMembroId || null).input("pz", sql.DateTime2, d.prazoEm)
      .input("nv", sql.NVarChar(12), d.nivel || "CONGREGACAO").input("cp", sql.Int, d.criadoPor || null)
      .query(`INSERT INTO CuidadoItens (Tipo, CongregacaoId, MembroId, PessoaNome, PessoaContato, Motivo, Origem, PedidoOracaoId, Urgente, SoNivelGeral, DeteccaoResumo, ResponsavelMembroId, PrazoEm, Nivel, CriadoPorMembroId)
              VALUES (@t, @c, @m, @pn, @pc, @mo, @o, @po, @u, @sg, @dr, @r, @pz, @nv, @cp); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    const itemId = ins.recordset[0].id;
    const eventoCriado = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "CRIADO", membroId: d.criadoPor || null, prazoNovo: d.prazoEm, nivelPara: d.nivel && d.nivel !== "CONGREGACAO" ? d.nivel : null });
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

// Dentro de uma transação: o item ABERTO deste tipo para esta pessoa, com trava de faixa (UPDLOCK, HOLDLOCK) — ninguém abre outro igual até o fim da transação. Conferir ANTES de
// gravar, em vez de contar com o erro do índice único dentro da transação (o erro de chave dentro da transação é frágil: um driver ou uma ponte que recicla a conexão desfaz o resto).
async function abertoDoTipo(transaction, membroId, tipo) {
  if (!membroId || !cp.TIPOS_UM_ABERTO.includes(tipo)) return null;
  return (await new sql.Request(transaction).input("m", sql.Int, membroId).input("t", sql.NVarChar(20), tipo)
    .query(`SELECT TOP 1 ItemId FROM CuidadoItens WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND Tipo = @t AND Status = 'ABERTO'`)).recordset[0] || null;
}

// Abrir um item à mão (liderança).
async function abrirItem(pool, { dados, ver, agora = new Date() }) {
  const v = cp.validarAbertura(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const cong = await congregacao(pool, d.congregacaoId);
  if (!cong || !alcanca(ver, cong.Nome)) return { sucesso: false, mensagem: "Esta congregação não está no seu território." };
  const hoje = hojeBrasilia(agora);
  let acompanhadoMenor = false, nome = d.pessoaNome;
  if (d.membroId) {
    const p = await pessoa(pool, d.membroId);
    if (!p || p.Status !== "ATIVO" || !mesmo(p.CongregacaoId, d.congregacaoId)) return { sucesso: false, mensagem: "A matrícula não é de um membro ativo desta congregação." };
    if (mesmo(p.MembroId, ver.membroId)) return { sucesso: false, mensagem: "Ninguém abre acompanhamento sobre si mesmo: peça a outra pessoa da liderança." };
    acompanhadoMenor = menorPelaData(p.DataNascimento, hoje);
    // (Trava 7-C) quem tem pendência reservada não age como gestão sobre uma criança: a mesma resposta de matrícula que não alcança (o motivo segue reservado)
    if (acompanhadoMenor && bloqueado(await conferirBloqueio(pool, ver, agora))) return { sucesso: false, mensagem: "A matrícula não é de um membro ativo desta congregação." };
    nome = p.Nome;
  }
  let escolhido;
  if (d.responsavelMembroId) {
    const c = await conferirResponsavel(pool, d.responsavelMembroId, { congregacaoId: d.congregacaoId, membroId: d.membroId, acompanhadoMenor }, hoje, ver);
    if (!c.ok) return { sucesso: false, mensagem: c.mensagem };
    escolhido = c.pessoa;
  }
  const destino = await destinoDoItem(pool, { congregacaoId: d.congregacaoId, membroId: d.membroId, responsavel: escolhido });
  const prazoEm = cp.prazoInicial(d.tipo, agora, await lerPrazos(pool), { urgente: d.urgente });
  const g = await gravarItem(pool, { ...d, origem: "LIDERANCA", prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, criadoPor: ver.membroId });
  if (g.repetido) return { sucesso: false, mudou: true, mensagem: "Já existe um acompanhamento aberto deste tipo para esta pessoa: trabalhe nele." };
  await auditar("CuidadoItens", g.itemId, "CUIDADO_ITEM_ABERTO", ver.membroId);
  const a = await avisarDestino(pool, { destino, g, membroId: d.membroId, pessoaNome: nome, congregacaoNome: cong.Nome, prazoEm, agora, por: ver.membroId });
  return { sucesso: true, itemId: g.itemId, prazoEm: iso(prazoEm), responsavel: destino.responsavel ? { membroId: destino.responsavel.membroId, nome: destino.responsavel.nome } : null,
    responsavelAvisado: destino.responsavel && !mesmo(destino.responsavel.membroId, ver.membroId) ? !!(a && a.externas > 0) : null, nivel: destino.nivel,
    mensagem: destino.responsavel ? `Acompanhamento aberto. Responsável: ${destino.responsavel.nome}.`
      : `Acompanhamento aberto sem responsável na congregação: ele foi para ${destino.nivel === "CONGREGACAO" ? "a fila da congregação" : cp.DEGRAUS[destino.nivel]}, que foi avisado. Nomeie alguém.` };
}

// A fila da liderança. `filtros`: { congregacaoId, situacao: ABERTOS|VENCIDOS|SEM_RESPONSAVEL|URGENTES|ENCERRADOS, tipo }.
async function listarFila(pool, { ver, filtros = {}, agora = new Date() }) {
  const situacao = ["ABERTOS", "VENCIDOS", "SEM_RESPONSAVEL", "URGENTES", "ENCERRADOS"].includes(filtros.situacao) ? filtros.situacao : "ABERTOS";
  const rq = pool.request().input("lim", sql.Int, LIMITE_FILA).input("enc", sql.Int, ENCERRADOS_DIAS).input("eu", sql.Int, ver.membroId);
  const cond = [situacao === "ENCERRADOS" ? "i.Status <> 'ABERTO' AND i.EncerradoEm >= DATEADD(DAY, -@enc, SYSUTCDATETIME())" : "i.Status = 'ABERTO'"];
  if (situacao === "VENCIDOS") cond.push("i.PrazoEm < SYSUTCDATETIME()");
  if (situacao === "SEM_RESPONSAVEL") cond.push("i.ResponsavelMembroId IS NULL");
  if (situacao === "URGENTES") cond.push("i.Urgente = 1");
  if (filtros.congregacaoId) { rq.input("c", sql.Int, filtros.congregacaoId); cond.push("i.CongregacaoId = @c"); }
  if (cp.TIPOS[filtros.tipo]) { rq.input("t", sql.NVarChar(20), filtros.tipo); cond.push("i.Tipo = @t"); }
  cond.push("(i.MembroId IS NULL OR i.MembroId <> @eu)");                                       // a pessoa acompanhada não vê o próprio item
  if (!ver.geral) cond.push("i.SoNivelGeral = 0");
  cond.push(filtroDeIds(rq, "i.CongregacaoId", await idsDoTerritorio(pool, ver)));
  const ordem = situacao === "ENCERRADOS" ? "i.EncerradoEm DESC" : "i.Urgente DESC, i.PrazoEm ASC";
  const r = await rq.query(`SELECT TOP (@lim) * FROM (${SELECT_ITEM} WHERE ${cond.join(" AND ")}) i ORDER BY ${ordem}`);
  await prepararVer(pool, ver, r.recordset, agora);
  return r.recordset.filter((i) => acessoAoItem(ver, i) === "GESTAO").map((i) => formatarItem(i, { agora, acesso: "GESTAO" }));
}

// O detalhe (liderança ou responsável). null = "não existe".
async function detalheItem(pool, itemId, { ver, agora = new Date() }) {
  const i = await carregarItem(pool, itemId);
  await prepararVer(pool, ver, [i], agora);
  const acesso = acessoAoItem(ver, i);
  if (!acesso) return null;
  const notas = await notasVisiveis(pool, i.MembroId ? { membroId: i.MembroId } : { itemId: i.ItemId }, { ver });
  return {
    item: formatarItem(i, { agora, acesso, completo: true }), eventos: await eventosDoItem(pool, itemId), notas: notas || [],
    podeGerir: acesso === "GESTAO", podeNotaNiveis: notas == null ? [] : cp.CODIGOS_NIVEL_NOTA.filter((n) => cp.podeEscreverNota(n, { gestao: acesso === "GESTAO", responsavelAberto: i.Status === "ABERTO" })),
    agora: agora.toISOString()
  };
}

// Os itens de que a pessoa é responsável (Meu Painel): os abertos completos; os encerrados nos últimos 30 dias, só a lembrança (tipo, primeiro nome, desfecho).
async function meusItens(pool, membroId, { agora = new Date() } = {}) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`${SELECT_ITEM}
    WHERE i.ResponsavelMembroId = @m AND (i.MembroId IS NULL OR i.MembroId <> @m) AND (i.Status = 'ABERTO' OR i.EncerradoEm >= DATEADD(DAY, -30, SYSUTCDATETIME()))
    ORDER BY CASE WHEN i.Status = 'ABERTO' THEN 0 ELSE 1 END, i.Urgente DESC, i.PrazoEm`);
  const ver = { membroId, gestao: false, geral: false };
  await prepararVer(pool, ver, r.recordset, agora);
  const hoje = hojeBrasilia(agora);
  return r.recordset.map((i) => {
    if (acessoAoItem(ver, i) === "RESPONSAVEL") return formatarItem(i, { agora, acesso: "RESPONSAVEL", completo: true });
    if (i.Status === "ABERTO") return null;                                                     // a pessoa mudou de congregação: o item vai para a outra
    if (ehMenor(i, hoje) && bloqueado(ver)) return null;                                         // (Trava 7-C) nem a lembrança do item de um menor
    return { itemId: i.ItemId, tipo: i.Tipo, tipoRotulo: (cp.TIPOS[i.Tipo] || {}).rotulo, pessoaNome: cp.primeiroNome(i.PessoaNomeExibido) || null, status: i.Status,
      desfechoRotulo: cp.DESFECHOS_CONCLUSAO[i.Desfecho] || cp.DESFECHOS_CANCELAMENTO[i.Desfecho] || null, encerradoEm: iso(i.EncerradoEm), encerrado: true };
  }).filter(Boolean);
}

// O esqueleto de toda escrita num item aberto: confere o acesso, trava a linha, confere de novo (o responsável pode ter sido trocado no meio) e grava.
// `exige`: "GESTAO" ou "QUALQUER" (liderança ou responsável). `fazer(transaction, linha, item, acesso)` devolve o resultado.
async function noItemAberto(pool, itemId, ver, exige, fazer) {
  const item = await carregarItem(pool, itemId);
  await prepararVer(pool, ver, [item]);
  const acesso = acessoAoItem(ver, item);
  if (!acesso || (exige === "GESTAO" && acesso !== "GESTAO")) return acesso && exige === "GESTAO" ? { sucesso: false, proibido: true, mensagem: "Isto é da liderança do território." } : NAO_EXISTE;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const linha = (await new sql.Request(transaction).input("id", sql.Int, itemId).query(`
      SELECT Status, ResponsavelMembroId, PrazoEm, Nivel, PrimeiroContatoEm, Urgente FROM CuidadoItens WITH (UPDLOCK, ROWLOCK) WHERE ItemId = @id`)).recordset[0];
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
  await prepararVer(pool, ver, [item], agora);
  if (acessoAoItem(ver, item) !== "GESTAO") return NAO_EXISTE;
  const hoje = hojeBrasilia(agora);
  const c = await conferirResponsavel(pool, responsavelMembroId, { congregacaoId: item.CongregacaoId, membroId: item.MembroId, acompanhadoMenor: ehMenor(item, hoje) }, hoje, ver);
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
  return noItemAberto(pool, itemId, ver, exige, async (t, linha) => {
    // cancelar um item URGENTE (sinal de risco) é da Área para cima: o Dirigente sozinho não apaga um pedido de socorro como "engano" (revisão: pode ser ele o citado)
    if (tipo === "CANCELADO" && linha.Urgente && !ver.acima) return { sucesso: false, proibido: true, mensagem: "Cancelar um acompanhamento urgente (sinal de risco) é da Área para cima: peça ao Pastor de Área ou à Diretoria." };
    await new sql.Request(t).input("id", sql.Int, itemId).input("s", sql.NVarChar(10), tipo === "CANCELADO" ? "CANCELADO" : "CONCLUIDO").input("d", sql.NVarChar(20), desfecho).input("m", sql.Int, ver.membroId)
      .query(`UPDATE CuidadoItens SET Status = @s, Desfecho = @d, EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @m WHERE ItemId = @id AND Status = 'ABERTO'`);
    await inserirEvento(new sql.Request(t), { itemId, tipo, membroId: ver.membroId, observacao });
    return { sucesso: true };
  });
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
  let congregacaoNome = null, alvoMembroId = null, soGeral = false;
  if (alvo.membroId) {
    const p = await pessoa(pool, alvo.membroId);
    if (!p) return null;
    congregacaoNome = p.Status === "ATIVO" ? p.CongregacaoNome : null;        // quem saiu: só o nível geral alcança (e a rotina apaga as notas em 30 dias)
    alvoMembroId = p.MembroId;
    // (Trava 7-C) as notas sobre uma criança ou adolescente não existem para quem tem pendência reservada (nem para escrever)
    if (!mesmo(alvoMembroId, ver.membroId) && menorPelaData(p.DataNascimento, hojeBrasilia()) && bloqueado(await conferirBloqueio(pool, ver))) return null;
  } else {
    const i = await carregarItem(pool, alvo.itemId);
    if (!i || i.MembroId) return null;                                       // item de membro: a nota é sobre o membro, não sobre o item
    congregacaoNome = i.CongregacaoNome;
    soGeral = !!i.SoNivelGeral;
  }
  if (alvoMembroId && mesmo(alvoMembroId, ver.membroId)) return { alvoProprio: true };
  const gestao = !!(ver.gestao && (ver.geral || (!soGeral && congregacaoNome && alcanca(ver, congregacaoNome))));
  const rq = pool.request().input("v", sql.Int, ver.membroId);
  let responsavelAberto;
  // o responsável de um item aberto da pessoa, NESTA congregação (o item da congregação antiga de quem mudou não dá acesso às notas que a congregação nova escreve)
  if (alvoMembroId) responsavelAberto = !!(await rq.input("m", sql.Int, alvoMembroId).query(`SELECT TOP 1 1 AS x FROM CuidadoItens i JOIN MembroReferencia m ON m.MembroId = i.MembroId
    WHERE i.Status = 'ABERTO' AND i.ResponsavelMembroId = @v AND i.MembroId = @m AND m.Status = 'ATIVO' AND m.CongregacaoId = i.CongregacaoId`)).recordset[0];
  else responsavelAberto = !!(await rq.input("i", sql.Int, alvo.itemId).query(`SELECT TOP 1 1 AS x FROM CuidadoItens WHERE Status = 'ABERTO' AND ResponsavelMembroId = @v AND ItemId = @i`)).recordset[0];
  return { alvoProprio: false, gestao, responsavelAberto, alvoMembroId };
}

// As notas que esta pessoa pode ler (só os dados de cabeçalho: o texto sai em lerNota). null = sem acesso nenhum ao alvo.
async function notasVisiveis(pool, alvo, { ver }) {
  const ctx = await contextoDoAlvo(pool, alvo, ver);
  // quem não alcança mais a pessoa (mudou de congregação, deixou de ser responsável) não lê nada sobre ela, nem o que ele mesmo escreveu (Regimento Art. 132 §1º, II)
  if (!ctx || ctx.alvoProprio || (!ctx.gestao && !ctx.responsavelAberto)) return null;
  const pastor = await ehPastor(pool, ver.membroId);
  const rq = pool.request();
  const filtro = alvo.membroId ? (rq.input("m", sql.Int, alvo.membroId), "n.MembroId = @m") : (rq.input("i", sql.Int, alvo.itemId), "n.ItemId = @i");
  const r = await rq.query(`SELECT n.NotaId, n.Nivel, n.AutorMembroId, a.Nome AS AutorNome, n.CriadaEm, n.RetificaNotaId, LEN(n.Texto) AS Tamanho
    FROM NotasPastorais n JOIN MembroReferencia a ON a.MembroId = n.AutorMembroId WHERE ${filtro} ORDER BY n.NotaId DESC`);
  const legiveis = r.recordset.filter((n) => cp.podeLerNota(n, { membroId: ver.membroId, gestao: ctx.gestao, pastor, responsavelAberto: ctx.responsavelAberto }));
  const ids = new Set(legiveis.map((n) => n.NotaId));
  return legiveis.map((n) => ({ notaId: n.NotaId, nivel: n.Nivel, nivelRotulo: cp.NIVEIS_NOTA[n.Nivel].rotulo, autor: n.AutorNome, minha: mesmo(n.AutorMembroId, ver.membroId), criadaEm: iso(n.CriadaEm),
    // a correção que aponta uma nota que esta pessoa não lê não revela que ela existe
    retificaNotaId: n.RetificaNotaId && ids.has(n.RetificaNotaId) ? n.RetificaNotaId : null, tamanho: Number(n.Tamanho) || 0, pedeConfirmacao: cp.notaPedeFator(n.Nivel) && !mesmo(n.AutorMembroId, ver.membroId) }));
}
// O item de um MEMBRO não tem notas próprias: as notas são sobre a pessoa. Quem chega pelo item (o responsável voluntário, que não recebe a matrícula) é levado à pessoa.
async function alvoDasNotas(pool, alvo) {
  if (!alvo || !alvo.itemId) return alvo;
  const i = await carregarItem(pool, alvo.itemId);
  return i && i.MembroId ? { membroId: i.MembroId } : alvo;
}
async function listarNotas(pool, alvo, { ver }) { return notasVisiveis(pool, await alvoDasNotas(pool, alvo), { ver }); }

async function escreverNota(pool, { dados, ver }) {
  const v = cp.validarNota(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  if (d.membroId && d.itemId) return { sucesso: false, mensagem: "A nota é sobre um membro OU sobre o item de quem não é do cadastro." };
  if (d.itemId) { const a = await alvoDasNotas(pool, { itemId: d.itemId }); if (a.membroId) { d.membroId = a.membroId; d.itemId = null; } }
  const ctx = await contextoDoAlvo(pool, d.membroId ? { membroId: d.membroId } : { itemId: d.itemId }, ver);
  if (!ctx || ctx.alvoProprio || (!ctx.gestao && !ctx.responsavelAberto)) return NAO_EXISTE;
  if (!cp.podeEscreverNota(d.nivel, ctx)) return { sucesso: false, proibido: true, mensagem: "Como responsável, você escreve notas de nível \"Equipe\". As restritas são da liderança." };
  if (d.retificaNotaId) {
    const ant = (await pool.request().input("n", sql.Int, d.retificaNotaId).query(`SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n`)).recordset[0];
    const mesmoAlvo = ant && (d.membroId ? mesmo(ant.MembroId, d.membroId) : mesmo(ant.ItemId, d.itemId));
    if (!mesmoAlvo || !cp.podeLerNota(ant, { membroId: ver.membroId, gestao: ctx.gestao, pastor: await ehPastor(pool, ver.membroId), responsavelAberto: ctx.responsavelAberto })) {
      return { sucesso: false, mensagem: "A nota que você quer corrigir não está entre as que você pode ler sobre esta pessoa." };
    }
    if (!cp.podeCorrigir(d.nivel, ant.Nivel)) return { sucesso: false, mensagem: "A correção não pode ter um sigilo mais aberto que a nota corrigida: escolha o mesmo nível ou um mais restrito." };
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

// Quem abriu a nota (as últimas 30 aberturas): quem a escreveu (enquanto alcança a pessoa) e o nível geral — este, mesmo sem ser pastor: ver QUEM leu não é ler o texto.
async function leiturasDaNota(pool, notaId, { ver }) {
  const n = (await pool.request().input("n", sql.Int, notaId).query(`SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n`)).recordset[0];
  if (!n || (n.MembroId && mesmo(n.MembroId, ver.membroId))) return null;
  if (mesmo(n.AutorMembroId, ver.membroId)) { if (!(await notaLegivel(pool, notaId, { ver }))) return null; }
  else if (!(ver.gestao && ver.geral)) return null;
  else if (n.MembroId) {
    // (Trava 7-C) quem leu a nota sobre um menor também é dado sobre ele: não para quem tem pendência reservada
    const p = await pessoa(pool, n.MembroId);
    if (p && menorPelaData(p.DataNascimento, hojeBrasilia()) && bloqueado(await conferirBloqueio(pool, ver))) return null;
  }
  const r = await pool.request().input("n", sql.Int, notaId).query(`SELECT TOP 30 l.LidaEm, m.Nome FROM NotasPastoraisLeituras l JOIN MembroReferencia m ON m.MembroId = l.MembroId WHERE l.NotaId = @n ORDER BY l.LeituraId DESC`);
  return r.recordset.map((l) => ({ nome: l.Nome, lidaEm: iso(l.LidaEm) }));
}

// ---------------------------------------------------------------
// O sinal de risco (fora da fila normal)
// ---------------------------------------------------------------

// O que o texto pede: { risco (cp.avaliarRisco), citados (ids da liderança do território citados pelo nome), soGeral }. Violência que cita a liderança (pela função ou pelo nome)
// fica só com o nível geral.
// (Trava 7-C) `menor`: quem pediu é criança ou adolescente. O sinal de risco SOBRE criança (violência que fala de criança) ou num pedido FEITO por um menor fica só com o nível
// geral, como o relato de criança da v7.8 (protecaoDb.somenteNivelGeral): o Dirigente pode ser justamente a pessoa de quem se fala.
async function riscoDoTexto(pool, texto, congregacaoId, { menor = false } = {}) {
  const risco = cp.avaliarRisco(texto);
  if (!risco.risco) return { risco, citados: [], soGeral: false, sobreCrianca: false };
  const territorio = await liderancaDoTerritorio(pool, congregacaoId);
  const citados = risco.violencia ? todosDoTerritorio(territorio).filter((l) => cp.citaPeloNome(texto, l.nome)).map((l) => l.membroId) : [];
  const sobreCrianca = !!(risco.crianca || menor);
  return { risco, citados, soGeral: (risco.violencia && (risco.liderancaCitada || citados.length > 0)) || sobreCrianca, sobreCrianca, menor: !!menor, territorio };
}
// Avisa NA HORA toda a liderança do território (Dirigente, Área, Região, Quadrante, Distrito e nível geral), menos a própria pessoa e quem o texto cita; o caso "só nível geral"
// avisa só o nível geral (e, se não sobrar ninguém lá, o resto do território). O aviso não leva o texto.
// (Trava 7-C) Sobre criança (`sobreCrianca`): ninguém com pendência reservada nem envolvido de incidente aberto recebe; e quem cuida da Proteção de crianças no nível geral é
// avisado do prazo do Conselho Tutelar, com o caminho para registrar o incidente (o sistema não abre incidente sozinho: quem registra é uma pessoa, que leu o pedido).
async function avisarRisco(pool, { congregacaoId, congregacaoNome, eventoId, crianca, menor = false, sobreCrianca = false, fora = [], citados = [], soGeral = false, territorio = null }) {
  const t = territorio || await liderancaDoTerritorio(pool, congregacaoId);
  let excluir = [...fora, ...citados];
  if (sobreCrianca) excluir = [...excluir, ...(await foraDoQueESobreCrianca(pool, todosDoTerritorio(t).map((d) => d.membroId)))];
  let destinatarios = soGeral ? semRepetidos(t.GERAL, excluir) : todosDoTerritorio(t, excluir);
  if (!destinatarios.length) destinatarios = todosDoTerritorio(t, excluir);
  const aviso = await notificarAgora(pool, { regraChave: "CUIDADO_RISCO", destinatarios, mensagem: cp.textoRisco({ congregacaoNome, crianca }), referenciaTabela: "CuidadoEventos", referenciaId: eventoId, aguardarEntrega: false });
  if (sobreCrianca) await avisarProtecao(pool, { referenciaTabela: "CuidadoEventosProtecao", referenciaId: eventoId, crianca, menor, fora: excluir });
  return aviso;
}
// O aviso à Proteção de crianças (permissão protecao_menores, nível geral: a Diretoria e o Comitê), sem o texto do pedido: o prazo do Conselho Tutelar e onde registrar.
async function avisarProtecao(pool, { referenciaTabela, referenciaId, crianca, menor, doSite = false, fora = [] }) {
  try {
    const todos = (await resolverDestinatariosPorPermissao(pool, { permissao: "protecao_menores", nivel: "GLOBAL" })).map(destinatarioDe);
    const longe = await foraDoQueESobreCrianca(pool, todos.map((d) => d.membroId));
    const destinatarios = semRepetidos(todos, [...fora, ...longe]);
    if (!destinatarios.length) return { criadas: 0, externas: 0 };
    return await notificarAgora(pool, { regraChave: "CUIDADO_RISCO_CRIANCA", destinatarios, mensagem: cp.textoRiscoCrianca({ crianca, menor, doSite }), referenciaTabela, referenciaId, aguardarEntrega: false, prazoMs: 4000 });
  } catch (e) { console.error("[CUIDADO] aviso à Proteção de crianças:", e && e.message); return { criadas: 0, externas: 0 }; }
}
const MENSAGEM_RISCO_A_QUEM_PEDIU = (aviso) => `Recebemos o seu pedido. ${cp.textoAvisoRisco(aviso)} Se você está em perigo agora, ligue 190. Se está sofrendo, o CVV atende de graça, 24 horas, no 188.`;
const MENSAGEM_RISCO_A_LIDERANCA = (aviso) => `Pedido registrado COM SINAL DE RISCO. ${Number((aviso || {}).externas) > 0 ? "A liderança do território foi avisada agora." : "O aviso NÃO saiu do sistema: ligue agora para o Pastor de Área e a Diretoria."} `
  + "Atenda a pessoa já: em perigo, Polícia 190; em sofrimento, CVV 188.";

// ---------------------------------------------------------------
// Pedidos de oração e de visita
// ---------------------------------------------------------------

const SITUACAO_PEDIDO_PARA_QUEM_PEDIU = { AGUARDANDO: "Recebido: a liderança vai ler", APROVADO: "No boletim de oração (sem o seu nome)", NAO_PUBLICAR: "Lido pela liderança" };
const TEXTO_GUARDADO = "(o texto deste pedido fica guardado só com a liderança, por cuidado com você)";

// Grava o pedido; com sinal de risco ou pedido de contato, abre o item (urgente no risco) e, no risco, avisa a liderança na hora. Um pedido com sinal de risco NUNCA é recusado
// pelo limite do dia nem se perde porque já existe outro pedido aberto (revisão: o socorro era descartado com 409/429). `quem`: { solicitanteMembroId?, solicitanteNome?,
// solicitanteContato?, registradoPor, congregacaoId, congregacaoNome }. `item`: o item que nasce ({ tipo, origem, motivo }; padrão: pedido de oração).
async function gravarPedidoOracao(pool, { d, quem, agora = new Date(), item: comoItem = null }) {
  const solicitante = quem.solicitanteMembroId ? await pessoa(pool, quem.solicitanteMembroId) : null;
  const rk = await riscoDoTexto(pool, d.texto, quem.congregacaoId, { menor: !!solicitante && menorPelaData(solicitante.DataNascimento, hojeBrasilia(agora)) });
  const risco = rk.risco;
  const prazos = await lerPrazos(pool);
  const tipoItem = comoItem ? comoItem.tipo : "PEDIDO_ORACAO";
  const destino = (risco.risco || d.querContato) ? await destinoDoItem(pool, { congregacaoId: quem.congregacaoId, membroId: quem.solicitanteMembroId || null, soGeral: rk.soGeral }) : null;
  const transaction = new sql.Transaction(pool);
  let pedidoId, item = null;
  try {
    await transaction.begin();
    if (!(await obterTrava(() => new sql.Request(transaction), `cuidado-pedido-${quem.registradoPor}`, 8000))) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: "Tente de novo em instantes.", ajuda: cp.CONTATOS_DE_AJUDA }; }
    // o mesmo texto da mesma pessoa em 10 minutos é o MESMO pedido (o celular que perdeu a resposta e mandou de novo): devolve o que já chegou, sem item nem aviso novos
    // (revisão da tela: o reenvio depois do tempo esgotado criava outro acompanhamento urgente e outro alerta a todo o território)
    const repetido = (await new sql.Request(transaction).input("r", sql.Int, quem.registradoPor).input("t", sql.NVarChar(1000), d.texto)
      .query(`SELECT TOP 1 PedidoId, Risco FROM PedidosOracao WHERE RegistradoPorMembroId = @r AND Texto = @t AND CriadoEm >= DATEADD(MINUTE, -10, SYSUTCDATETIME()) ORDER BY PedidoId DESC`)).recordset[0];
    if (repetido) {
      await fecharTransacao(transaction, false);
      return { sucesso: true, repetido: true, pedidoId: repetido.PedidoId, risco: !!repetido.Risco, ...(repetido.Risco ? { ajuda: cp.CONTATOS_DE_AJUDA } : {}),
        mensagem: repetido.Risco ? "Este pedido já tinha chegado e a liderança já está cuidando dele. Se você está em perigo agora, ligue 190. Se está sofrendo, o CVV atende de graça, 24 horas, no 188."
          : "Este pedido já tinha chegado: não foi preciso enviar de novo." };
    }
    if (!risco.risco) {
      const n = (await new sql.Request(transaction).input("r", sql.Int, quem.registradoPor).query(`SELECT COUNT(*) AS n FROM PedidosOracao WHERE RegistradoPorMembroId = @r AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
      if (Number(n.n) >= cp.LIMITE_PEDIDOS_ORACAO_DIA) { await fecharTransacao(transaction, false); return { sucesso: false, limite: true, mensagem: `Limite de ${cp.LIMITE_PEDIDOS_ORACAO_DIA} pedidos em 24 horas. Se for urgente, ligue para o Dirigente ou o pastor.`, ajuda: cp.CONTATOS_DE_AJUDA }; }
    }
    pedidoId = (await new sql.Request(transaction).input("c", sql.Int, quem.congregacaoId).input("s", sql.Int, quem.solicitanteMembroId || null).input("r", sql.Int, quem.registradoPor)
      .input("sn", sql.NVarChar(150), quem.solicitanteNome || null).input("sc", sql.NVarChar(150), quem.solicitanteContato || null).input("pq", sql.NVarChar(12), d.paraQuem)
      .input("cat", sql.NVarChar(12), d.categoria).input("t", sql.NVarChar(1000), d.texto).input("pb", sql.Bit, d.podeBoletim ? 1 : 0).input("qc", sql.Bit, d.querContato ? 1 : 0)
      .input("rk", sql.Bit, risco.risco ? 1 : 0).input("ro", sql.NVarChar(10), risco.risco ? "AUTOMATICO" : null).input("rc", sql.Bit, risco.crianca ? 1 : 0).input("sg", sql.Bit, rk.soGeral ? 1 : 0)
      .query(`INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, SolicitanteNome, SolicitanteContato, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato,
                Risco, RiscoOrigem, RiscoCrianca, RiscoJaTeve, RiscoMarcadoEm, SoNivelGeral)
              VALUES (@c, @s, @r, @sn, @sc, @pq, @cat, @t, @pb, @qc, @rk, @ro, @rc, @rk, CASE WHEN @rk = 1 THEN SYSUTCDATETIME() ELSE NULL END, @sg); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    if (destino) {
      const prazoEm = cp.prazoInicial(tipoItem, agora, prazos, { urgente: risco.risco });
      const jaAberto = await abertoDoTipo(transaction, quem.solicitanteMembroId, tipoItem);
      const motivo = comoItem && !risco.risco ? comoItem.motivo
        : risco.risco ? `${cp.TIPOS[tipoItem].rotulo} com SINAL DE RISCO (o texto está em Pedidos de oração → Sinal de risco).`
          : `Pedido de oração: ${cp.CATEGORIAS_ORACAO[d.categoria].rotulo}${d.querContato ? " (pediu contato)" : ""}.`;
      const g = jaAberto ? { repetido: true } : await gravarItem(pool, {
        tipo: tipoItem, congregacaoId: quem.congregacaoId, membroId: quem.solicitanteMembroId || null, pessoaNome: quem.solicitanteMembroId ? null : quem.solicitanteNome,
        pessoaContato: quem.solicitanteMembroId ? null : quem.solicitanteContato, motivo, origem: comoItem ? comoItem.origem : "PEDIDO_ORACAO", pedidoOracaoId: pedidoId,
        urgente: risco.risco, soGeral: rk.soGeral, prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, criadoPor: quem.registradoPor
      }, { transaction });
      if (g.repetido) {
        // já há um pedido de visita (ou pós-internação) aberto desta pessoa: com risco, ESSE vira urgente — o socorro não se perde
        const aberto = jaAberto || await abertoDoTipo(transaction, quem.solicitanteMembroId, tipoItem);
        if (!aberto) throw new Error("item repetido sumiu");
        await new sql.Request(transaction).input("i", sql.Int, aberto.ItemId).input("pz", sql.DateTime2, prazoEm).input("sg", sql.Bit, rk.soGeral ? 1 : 0)
          .query(`UPDATE CuidadoItens SET Urgente = 1, PrazoEm = CASE WHEN PrazoEm > @pz THEN @pz ELSE PrazoEm END, SoNivelGeral = CASE WHEN @sg = 1 THEN 1 ELSE SoNivelGeral END WHERE ItemId = @i AND Status = 'ABERTO'`);
        const ev = await inserirEvento(new sql.Request(transaction), { itemId: aberto.ItemId, tipo: "URGENTE", membroId: quem.registradoPor });
        item = { itemId: aberto.ItemId, eventoCriado: ev, eventoAtribuido: null, responsavel: null, prazoEm, jaExistia: true };
      } else item = { ...g, responsavel: destino.responsavel, prazoEm };
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_REGISTRADO", quem.registradoPor);
  const nomeDeQuem = quem.solicitanteMembroId ? ((await pessoa(pool, quem.solicitanteMembroId)) || {}).Nome : quem.solicitanteNome;
  const aQuemPediu = mesmo(quem.registradoPor, quem.solicitanteMembroId);
  const resposta = { sucesso: true, pedidoId, itemId: item ? item.itemId : null, risco: risco.risco };
  if (risco.risco) {
    const aviso = await avisarRisco(pool, { congregacaoId: quem.congregacaoId, congregacaoNome: quem.congregacaoNome, eventoId: item.eventoCriado, crianca: risco.crianca,
      menor: rk.menor, sobreCrianca: rk.sobreCrianca, fora: [quem.solicitanteMembroId], citados: rk.citados, soGeral: rk.soGeral, territorio: rk.territorio });
    resposta.avisada = Number((aviso || {}).externas) > 0;
    resposta.ajuda = cp.CONTATOS_DE_AJUDA;
    resposta.mensagem = aQuemPediu ? MENSAGEM_RISCO_A_QUEM_PEDIU(aviso) : MENSAGEM_RISCO_A_LIDERANCA(aviso);
  } else {
    if (item) await avisarDestino(pool, { destino, g: item, membroId: quem.solicitanteMembroId, pessoaNome: nomeDeQuem, congregacaoNome: quem.congregacaoNome, prazoEm: item.prazoEm, agora, por: quem.registradoPor });
    resposta.mensagem = comoItem ? "Pedido de visita recebido. A liderança vai combinar com você." : d.querContato ? "Pedido recebido. Alguém da liderança vai falar com você." : "Pedido recebido. A liderança vai orar por ele.";
  }
  return resposta;
}

// O membro pede (Meu Painel), por ele ou por outra pessoa; a congregação é a dele.
async function pedirOracao(pool, { dados, membroId, agora = new Date() }) {
  const v = cp.validarPedidoOracao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const p = await pessoa(pool, membroId);
  if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return { sucesso: false, mensagem: "Seu cadastro não tem congregação: fale com a secretaria.", ajuda: cp.CONTATOS_DE_AJUDA };
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
    // (Trava 7-C) quem tem pendência reservada não registra pedido em nome de uma criança: a mesma resposta (o motivo segue reservado)
    if (menorPelaData(p.DataNascimento, hojeBrasilia(agora)) && bloqueado(await conferirBloqueio(pool, ver, agora))) return { sucesso: false, mensagem: "A matrícula não é de um membro ativo desta congregação." };
  }
  return gravarPedidoOracao(pool, { d: v.dados, agora, quem: { ...s.dados, solicitanteMembroId: s.dados.membroId, registradoPor: ver.membroId, congregacaoId: cong.CongregacaoId, congregacaoNome: cong.Nome } });
}

// O membro pede uma visita para ele (ou porque está, ou esteve, internado). Com sinal de risco no texto, o pedido vira também um pedido com sinal de risco (o texto fica na aba
// do risco, onde a liderança o lê e pode desmarcar o alarme falso) e o item nasce urgente — ou o pedido aberto que já existe vira urgente.
async function pedirVisita(pool, { dados, membroId, agora = new Date() }) {
  const v = cp.validarPedidoVisita(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const p = await pessoa(pool, membroId);
  if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return { sucesso: false, mensagem: "Seu cadastro não tem congregação: fale com a secretaria.", ajuda: cp.CONTATOS_DE_AJUDA };
  const tipo = v.dados.hospital ? "POS_INTERNACAO" : "PEDIDO_VISITA";
  const texto = v.dados.contato ? `${v.dados.motivo} — Melhor contato/horário: ${v.dados.contato}`.slice(0, cp.MAX_MOTIVO) : v.dados.motivo;
  if (cp.avaliarRisco(v.dados.motivo, v.dados.contato).risco) {
    return gravarPedidoOracao(pool, { d: { paraQuem: "PROPRIO", categoria: "OUTRO", texto, podeBoletim: false, querContato: true }, agora,
      quem: { solicitanteMembroId: membroId, registradoPor: membroId, congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome }, item: { tipo, origem: "PEDIDO_MEMBRO", motivo: texto } });
  }
  const destino = await destinoDoItem(pool, { congregacaoId: p.CongregacaoId, membroId, agora });
  const prazoEm = cp.prazoInicial(tipo, agora, await lerPrazos(pool));
  // (Trava 7-C) o teto do dia é contado DENTRO da trava da pessoa, na mesma transação que grava: dois pedidos ao mesmo tempo não passam juntos pela contagem
  const LIMITE = { sucesso: false, limite: true, mensagem: "Você já fez pedidos de visita hoje. Se for urgente, ligue para o Dirigente.", ajuda: cp.CONTATOS_DE_AJUDA };
  const REPETIDO = { sucesso: false, mudou: true, mensagem: "Você já tem um pedido de visita em andamento. A liderança vai procurar você." };
  const transaction = new sql.Transaction(pool);
  let g;
  try {
    await transaction.begin();
    if (!(await obterTrava(() => new sql.Request(transaction), `cuidado-pedido-${membroId}`, 8000))) { await fecharTransacao(transaction, false); return { sucesso: false, mudou: true, mensagem: "Tente de novo em instantes.", ajuda: cp.CONTATOS_DE_AJUDA }; }
    const n = (await new sql.Request(transaction).input("m", sql.Int, membroId).query(`SELECT COUNT(*) AS n FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO' AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
    if (Number(n.n) >= cp.LIMITE_PEDIDOS_VISITA_DIA) { await fecharTransacao(transaction, false); return LIMITE; }
    if (await abertoDoTipo(transaction, membroId, tipo)) { await fecharTransacao(transaction, false); return REPETIDO; }
    g = await gravarItem(pool, { tipo, congregacaoId: p.CongregacaoId, membroId, motivo: texto, origem: "PEDIDO_MEMBRO", prazoEm,
      responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, criadoPor: membroId }, { transaction });
    await fecharTransacao(transaction, !g.repetido);
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  if (g.repetido) return REPETIDO;
  await auditar("CuidadoItens", g.itemId, "CUIDADO_PEDIDO_VISITA", membroId);
  await avisarDestino(pool, { destino, g, membroId, pessoaNome: p.Nome, congregacaoNome: p.CongregacaoNome, prazoEm, agora, por: membroId });
  return { sucesso: true, itemId: g.itemId, risco: false, mensagem: "Pedido de visita recebido. A liderança vai combinar com você." };
}

// O que a própria pessoa vê dos pedidos que fez (sem o responsável, sem as notas, sem o histórico, sem o sinal de risco). O texto do pedido que teve sinal de risco não volta à
// tela (revisão: num celular que a família divide com quem agride, "meu marido me bate" reaparecendo é perigo).
async function meusPedidos(pool, membroId) {
  const oracao = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 50 PedidoId, Categoria, ParaQuem, Texto, PodeBoletim, Moderacao, BoletimAte, CriadoEm, AnonimizadoEm, RiscoJaTeve FROM PedidosOracao
    WHERE SolicitanteMembroId = @m ORDER BY PedidoId DESC`)).recordset.map((p) => ({
    pedidoId: p.PedidoId, categoria: p.Categoria, categoriaRotulo: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, paraQuem: p.ParaQuem, texto: p.RiscoJaTeve ? TEXTO_GUARDADO : p.Texto,
    podeBoletim: !!p.PodeBoletim, situacao: p.RiscoJaTeve ? "Recebido: a liderança está cuidando" : (SITUACAO_PEDIDO_PARA_QUEM_PEDIU[p.Moderacao] || "Recebido"), criadoEm: iso(p.CriadoEm)
  }));
  const visitas = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 30 ItemId, Tipo, Status, CriadoEm, EncerradoEm FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO' ORDER BY ItemId DESC`)).recordset.map((i) => ({
    itemId: i.ItemId, tipoRotulo: cp.TIPOS[i.Tipo].rotulo, situacao: i.Status === "ABERTO" ? "Recebido: a liderança vai procurar você" : "Atendido", criadoEm: iso(i.CriadoEm), encerradoEm: iso(i.EncerradoEm)
  }));
  return { oracao, visitas };
}

const SELECT_PEDIDO = `
  SELECT p.PedidoId, p.CongregacaoId, c.Nome AS CongregacaoNome, p.SolicitanteMembroId, COALESCE(s.Nome, p.SolicitanteNome) AS SolicitanteNome, p.SolicitanteContato,
         s.Status AS SolicitanteStatus, s.CongregacaoId AS SolicitanteCongregacaoId, s.DataNascimento AS SolicitanteNascimento, rg.Nome AS RegistradoPorNome, p.RegistradoPorMembroId, p.ParaQuem, p.Categoria, p.Texto,
         p.PodeBoletim, p.QuerContato, p.Moderacao, p.TextoBoletim, p.BoletimAte, p.ModeradoEm, md.Nome AS ModeradoPorNome, p.Risco, p.RiscoOrigem, p.RiscoCrianca, p.RiscoJaTeve,
         p.SoNivelGeral, p.RiscoMarcadoEm, p.RiscoDesmarcadoEm, p.RiscoDesmarcadoMotivo, p.CriadoEm, p.AnonimizadoEm, p.Origem, p.SiteItemId, ci.ItemId, ci.Status AS ItemStatus
  FROM PedidosOracao p LEFT JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId LEFT JOIN MembroReferencia s ON s.MembroId = p.SolicitanteMembroId
  LEFT JOIN MembroReferencia rg ON rg.MembroId = p.RegistradoPorMembroId LEFT JOIN MembroReferencia md ON md.MembroId = p.ModeradoPorMembroId
  OUTER APPLY (SELECT TOP 1 x.ItemId, x.Status FROM CuidadoItens x WHERE x.PedidoOracaoId = p.PedidoId ORDER BY CASE WHEN x.Status = 'ABERTO' THEN 0 ELSE 1 END, x.ItemId DESC) ci`;
// A liderança não modera nem lê o pedido que ela mesma fez (quem modera é o degrau de cima); o pedido "só nível geral" é só do nível geral; e o pedido de quem mudou de
// congregação ou saiu some da congregação antiga (Regimento Art. 132 §1º, II).
// (Trava 7-C) O pedido sobre criança (o sinal de risco que fala de criança) ou feito por um menor não existe para quem tem pendência reservada.
const pedidoSobreCrianca = (p) => !!p && (!!p.RiscoCrianca || menorPelaData(p.SolicitanteNascimento, hojeBrasilia()));
async function prepararVerPedidos(pool, ver, pedidos) {
  if ((pedidos || []).some(pedidoSobreCrianca)) await conferirBloqueio(pool, ver);
  return ver;
}
function pedidoVisivel(ver, p) {
  if (!p || !ver || !ver.gestao) return false;
  if (p.SolicitanteMembroId && mesmo(p.SolicitanteMembroId, ver.membroId)) return false;
  if (pedidoSobreCrianca(p) && bloqueado(ver)) return false;
  if (ver.geral) return true;
  if (p.SoNivelGeral || !alcanca(ver, p.CongregacaoNome)) return false;
  return !p.SolicitanteMembroId || (p.SolicitanteStatus === "ATIVO" && mesmo(p.SolicitanteCongregacaoId, p.CongregacaoId));
}
function formatarPedido(p) {
  return {
    pedidoId: p.PedidoId, congregacaoId: p.CongregacaoId, congregacaoNome: p.Origem === "SITE" ? "Mural de oração do site" : p.CongregacaoNome, origem: p.Origem || "SISTEMA",
    siteItemId: p.SiteItemId || null, solicitante: p.SolicitanteNome || (p.AnonimizadoEm ? "(anonimizado)" : null),
    solicitanteMembroId: p.SolicitanteMembroId || null, solicitanteContato: p.SolicitanteContato || null, registradoPor: p.RegistradoPorNome || null,
    paraQuem: p.ParaQuem, paraQuemRotulo: cp.PARA_QUEM[p.ParaQuem], categoria: p.Categoria, categoriaRotulo: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, texto: p.Texto,
    podeBoletim: !!p.PodeBoletim, querContato: !!p.QuerContato, moderacao: p.Moderacao, textoBoletim: p.TextoBoletim, boletimAte: dia(p.BoletimAte), moderadoPor: p.ModeradoPorNome || null,
    moderadoEm: iso(p.ModeradoEm), risco: !!p.Risco, riscoOrigem: p.RiscoOrigem, riscoCrianca: !!p.RiscoCrianca, riscoJaTeve: !!p.RiscoJaTeve, soNivelGeral: !!p.SoNivelGeral,
    riscoDesmarcadoMotivo: p.RiscoDesmarcadoMotivo || null, riscoDesmarcadoEm: iso(p.RiscoDesmarcadoEm), criadoEm: iso(p.CriadoEm), itemId: p.ItemId || null, itemAberto: p.ItemStatus === "ABERTO",
    sugestaoBoletim: p.PodeBoletim ? cp.linhaDoBoletim({ categoria: p.Categoria, paraQuem: p.ParaQuem, congregacaoNome: p.CongregacaoNome }) : null
  };
}
// `situacao`: AGUARDANDO (sem risco) | RISCO | APROVADOS (no boletim agora) | TODOS (últimos 90 dias).
async function listarPedidos(pool, { ver, situacao = "AGUARDANDO", congregacaoId = null }) {
  const rq = pool.request().input("eu", sql.Int, ver.membroId);
  const cond = ["p.AnonimizadoEm IS NULL", "(p.SolicitanteMembroId IS NULL OR p.SolicitanteMembroId <> @eu)"];
  if (situacao === "RISCO") cond.push("p.Risco = 1");
  else if (situacao === "APROVADOS") cond.push("p.Moderacao = 'APROVADO' AND p.BoletimAte >= CAST(DATEADD(HOUR, -3, SYSUTCDATETIME()) AS DATE)");
  else if (situacao === "TODOS") cond.push("p.CriadoEm >= DATEADD(DAY, -90, SYSUTCDATETIME())");
  else cond.push("p.Moderacao = 'AGUARDANDO' AND p.Risco = 0");
  if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); cond.push("p.CongregacaoId = @c"); }
  if (!ver.geral) cond.push("p.SoNivelGeral = 0");
  cond.push(filtroDeIds(rq, "p.CongregacaoId", await idsDoTerritorio(pool, ver)));
  const r = await rq.query(`SELECT TOP 300 * FROM (${SELECT_PEDIDO}) p WHERE ${cond.join(" AND ")} ORDER BY p.Risco DESC, p.PedidoId DESC`);
  await prepararVerPedidos(pool, ver, r.recordset);
  return r.recordset.filter((p) => pedidoVisivel(ver, p)).map(formatarPedido);
}
// (com `ver`, já confere o bloqueio de quem olha quando o pedido é sobre criança)
async function carregarPedido(pool, pedidoId, ver = null) {
  const p = (await pool.request().input("id", sql.Int, pedidoId).query(`${SELECT_PEDIDO} WHERE p.PedidoId = @id`)).recordset[0] || null;
  if (p && ver) await prepararVerPedidos(pool, ver, [p]);
  return p;
}

// Moderar: APROVAR (vai ao boletim, só a linha sem nome; só do que espera moderação) ou NAO_PUBLICAR ("lido, fica só com a liderança"; também tira do boletim o que já foi).
async function moderar(pool, { pedidoId, dados, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId, ver);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  const decisao = typeof (dados || {}).decisao === "string" ? dados.decisao : "";
  if (!["APROVAR", "NAO_PUBLICAR"].includes(decisao)) return { sucesso: false, mensagem: "Escolha: publicar no boletim (sem nome) ou deixar só com a liderança." };
  if (p.Risco) return { sucesso: false, mensagem: "Este pedido tem sinal de risco: ele não vai ao boletim. Atenda a pessoa; se for alarme falso, desmarque o risco (com o motivo) antes." };
  if (decisao === "APROVAR" && p.Origem === "SITE") return { sucesso: false, mensagem: "Este pedido veio do mural do site: o que vai ao mural público é decidido no painel do site (moderação do mural). Aqui ele só pode ser marcado como lido." };
  if (decisao === "APROVAR" && p.Moderacao !== "AGUARDANDO") return { sucesso: false, mensagem: p.Moderacao === "APROVADO" ? "Este pedido já está no boletim." : "Este pedido foi marcado como lido: ele não volta ao boletim." };
  if (decisao === "NAO_PUBLICAR" && p.Moderacao === "NAO_PUBLICAR") return { sucesso: false, mensagem: "Este pedido já está marcado como lido." };
  let textoBoletim = null, boletimAte = null;
  if (decisao === "APROVAR") {
    if (!p.PodeBoletim) return { sucesso: false, mensagem: "Quem pediu escolheu \"só para a liderança\": este pedido não vai ao boletim." };
    const escrito = dados.textoBoletim == null || dados.textoBoletim === "" ? cp.linhaDoBoletim({ categoria: p.Categoria, paraQuem: p.ParaQuem, congregacaoNome: p.CongregacaoNome }) : dados.textoBoletim;
    const v = cp.validarTextoBoletim(escrito, { nomes: [p.SolicitanteNome, p.RegistradoPorNome].filter(Boolean), congregacaoNome: p.CongregacaoNome });
    if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
    textoBoletim = v.texto;
    boletimAte = cp.somarDiasIso(hojeBrasilia(agora), cp.BOLETIM_DIAS);
  }
  const r = await pool.request().input("id", sql.Int, pedidoId).input("mo", sql.NVarChar(12), decisao === "APROVAR" ? "APROVADO" : "NAO_PUBLICAR").input("tb", sql.NVarChar(200), textoBoletim)
    .input("ba", sql.Date, boletimAte).input("m", sql.Int, ver.membroId).input("de", sql.NVarChar(12), p.Moderacao)
    .query(`UPDATE PedidosOracao SET Moderacao = @mo, TextoBoletim = @tb, BoletimAte = @ba, ModeradoPorMembroId = @m, ModeradoEm = SYSUTCDATETIME()
            WHERE PedidoId = @id AND Risco = 0 AND AnonimizadoEm IS NULL AND Moderacao = @de; SELECT @@ROWCOUNT AS n`);
  if (!Number(r.recordset[0].n)) return MUDOU("O pedido mudou enquanto você moderava. Abra de novo.");
  await auditar("PedidosOracao", pedidoId, decisao === "APROVAR" ? "CUIDADO_PEDIDO_PUBLICADO" : "CUIDADO_PEDIDO_LIDO", ver.membroId);
  return { sucesso: true, mensagem: decisao === "APROVAR" ? `Publicado no boletim até ${boletimAte.split("-").reverse().join("/")}, sem nome.`
    : p.Moderacao === "APROVADO" ? "Retirado do boletim: fica só com a liderança." : "Marcado como lido: fica só com a liderança." };
}

// Marcar (a lista não pegou, mas a liderança percebeu) ou desmarcar (alarme falso, com motivo; da Área para cima) o sinal de risco. Marcar tira o pedido do boletim, deixa o
// acompanhamento urgente (abre outro se o do pedido já foi encerrado) e avisa na hora.
async function marcarRisco(pool, { pedidoId, dados, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId, ver);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  if ((dados || {}).marcar !== true && (dados || {}).marcar !== false) return { sucesso: false, mensagem: "Diga se é para marcar ou desmarcar o sinal de risco." };
  if (dados.marcar === false) {
    if (!ver.acima) return { sucesso: false, proibido: true, mensagem: "Desmarcar um sinal de risco é da Área para cima (dois olhares): peça ao Pastor de Área ou à Diretoria." };
    if (!p.Risco) return { sucesso: false, mensagem: "Este pedido não está com sinal de risco." };
    const motivo = typeof dados.motivo === "string" ? dados.motivo.trim() : "";
    if (motivo.length < 5 || motivo.length > cp.MAX_OBSERVACAO || /[<>]/.test(motivo)) return { sucesso: false, mensagem: "Escreva por que é alarme falso (de 5 a 300 caracteres, sem < e >)." };
    const r = await pool.request().input("id", sql.Int, pedidoId).input("m", sql.Int, ver.membroId).input("mo", sql.NVarChar(300), motivo)
      .query(`UPDATE PedidosOracao SET Risco = 0, RiscoDesmarcadoPorMembroId = @m, RiscoDesmarcadoEm = SYSUTCDATETIME(), RiscoDesmarcadoMotivo = @mo WHERE PedidoId = @id AND Risco = 1; SELECT @@ROWCOUNT AS n`);
    if (!Number(r.recordset[0].n)) return MUDOU("O pedido mudou enquanto você decidia. Abra de novo.");
    await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_DESMARCADO", ver.membroId);
    return { sucesso: true, mensagem: "Sinal de risco desmarcado. O pedido volta para a moderação comum; o acompanhamento continua aberto." };
  }
  if (p.Risco) return { sucesso: false, mensagem: "Este pedido já está com sinal de risco." };
  if (p.Origem === "SITE") return marcarRiscoDoSite(pool, { p, ver });
  const menor = menorPelaData(p.SolicitanteNascimento, hojeBrasilia(agora));
  const rk = await riscoDoTexto(pool, p.Texto || "", p.CongregacaoId, { menor });
  const sobreCrianca = rk.sobreCrianca || menor;                      // (Trava 7-C) marcado à mão no pedido de um menor: também só o nível geral
  const soGeral = !!p.SoNivelGeral || rk.soGeral || sobreCrianca;
  const prazos = await lerPrazos(pool);
  const prazoRisco = cp.prazoInicial("PEDIDO_ORACAO", agora, prazos, { urgente: true });
  const destino = await destinoDoItem(pool, { congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, soGeral, agora });
  const transaction = new sql.Transaction(pool);
  let eventoId, itemId = null, abriuNovo = false;
  try {
    await transaction.begin();
    const r = await new sql.Request(transaction).input("id", sql.Int, pedidoId).input("sg", sql.Bit, soGeral ? 1 : 0)
      .query(`UPDATE PedidosOracao SET Risco = 1, RiscoOrigem = 'LIDERANCA', RiscoJaTeve = 1, RiscoMarcadoEm = SYSUTCDATETIME(), SoNivelGeral = CASE WHEN @sg = 1 THEN 1 ELSE SoNivelGeral END,
              Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'AGUARDANDO' ELSE Moderacao END,
              TextoBoletim = CASE WHEN Moderacao = 'APROVADO' THEN NULL ELSE TextoBoletim END, BoletimAte = CASE WHEN Moderacao = 'APROVADO' THEN NULL ELSE BoletimAte END
              WHERE PedidoId = @id AND Risco = 0 AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`);
    if (!Number(r.recordset[0].n)) { await fecharTransacao(transaction, false); return MUDOU("O pedido mudou enquanto você decidia. Abra de novo."); }
    // o item ABERTO do pedido (travado: um "abrir acompanhamento" ao mesmo tempo espera); se não há, abre um novo urgente
    const tornarUrgente = async (id) => {
      await new sql.Request(transaction).input("i", sql.Int, id).input("pz", sql.DateTime2, prazoRisco).input("sg", sql.Bit, soGeral ? 1 : 0)
        .query(`UPDATE CuidadoItens SET Urgente = 1, PrazoEm = CASE WHEN PrazoEm > @pz THEN @pz ELSE PrazoEm END, SoNivelGeral = CASE WHEN @sg = 1 THEN 1 ELSE SoNivelGeral END WHERE ItemId = @i AND Status = 'ABERTO'`);
      return inserirEvento(new sql.Request(transaction), { itemId: id, tipo: "URGENTE", membroId: ver.membroId });
    };
    const aberto = async () => (await new sql.Request(transaction).input("p", sql.Int, pedidoId).query(`SELECT TOP 1 ItemId FROM CuidadoItens WITH (UPDLOCK, HOLDLOCK) WHERE PedidoOracaoId = @p AND Status = 'ABERTO'`)).recordset[0];
    const existente = await aberto();
    if (existente) { itemId = existente.ItemId; eventoId = await tornarUrgente(itemId); }
    else {
      const g = await gravarItem(pool, {
        tipo: "PEDIDO_ORACAO", congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, pessoaNome: p.SolicitanteMembroId ? null : p.SolicitanteNome,
        pessoaContato: p.SolicitanteMembroId ? null : p.SolicitanteContato, motivo: `Pedido de oração com SINAL DE RISCO marcado pela liderança: ${cp.CATEGORIAS_ORACAO[p.Categoria].rotulo}.`, origem: "PEDIDO_ORACAO",
        pedidoOracaoId: pedidoId, urgente: true, soGeral, prazoEm: prazoRisco, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, criadoPor: ver.membroId
      }, { transaction });
      if (g.repetido) { const outro = await aberto(); if (!outro) throw new Error("item do pedido sumiu"); itemId = outro.ItemId; eventoId = await tornarUrgente(itemId); }
      else { itemId = g.itemId; abriuNovo = true; eventoId = await inserirEvento(new sql.Request(transaction), { itemId, tipo: "URGENTE", membroId: ver.membroId }); }
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_MARCADO", ver.membroId);
  const aviso = await avisarRisco(pool, { congregacaoId: p.CongregacaoId, congregacaoNome: p.CongregacaoNome, eventoId, crianca: rk.risco.crianca, menor, sobreCrianca,
    fora: [p.SolicitanteMembroId], citados: rk.citados, soGeral, territorio: destino.territorio });
  const avisou = Number((aviso || {}).externas) > 0;
  return { sucesso: true, itemId, avisada: avisou,
    mensagem: `Sinal de risco marcado: ${abriuNovo ? "um acompanhamento urgente (24 horas) foi aberto" : "o acompanhamento ficou urgente (24 horas)"}. `
      + (avisou ? "A liderança do território foi avisada agora." : "MAS o aviso não saiu do sistema: ligue agora para o Pastor de Área e a Diretoria.") };
}

// Abre o acompanhamento a partir de um pedido que não tem um aberto (a liderança quer falar com quem pediu). O pedido fica travado durante a abertura (um "marcar risco" ao mesmo
// tempo espera e vê o item).
async function acompanharPedido(pool, { pedidoId, ver, agora = new Date() }) {
  const p = await carregarPedido(pool, pedidoId, ver);
  if (!pedidoVisivel(ver, p) || p.AnonimizadoEm) return NAO_EXISTE;
  if (p.Origem === "SITE") return { sucesso: false, mensagem: "Este pedido veio do mural do site: não há congregação nem contato para abrir um acompanhamento. Se o texto traz um contato, procure a pessoa e registre o pedido em mãos." };
  if (p.ItemId && p.ItemStatus === "ABERTO") return { sucesso: false, mudou: true, itemId: p.ItemId, mensagem: "Este pedido já tem um acompanhamento aberto." };
  const destino = await destinoDoItem(pool, { congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, soGeral: !!p.SoNivelGeral });
  const prazoEm = cp.prazoInicial("PEDIDO_ORACAO", agora, await lerPrazos(pool), { urgente: !!p.Risco });
  const transaction = new sql.Transaction(pool);
  let g;
  try {
    await transaction.begin();
    await new sql.Request(transaction).input("p", sql.Int, pedidoId).query(`SELECT PedidoId FROM PedidosOracao WITH (UPDLOCK, ROWLOCK) WHERE PedidoId = @p`);
    g = await gravarItem(pool, {
      tipo: "PEDIDO_ORACAO", congregacaoId: p.CongregacaoId, membroId: p.SolicitanteMembroId || null, pessoaNome: p.SolicitanteMembroId ? null : p.SolicitanteNome,
      pessoaContato: p.SolicitanteMembroId ? null : p.SolicitanteContato, motivo: `Pedido de oração: ${cp.CATEGORIAS_ORACAO[p.Categoria].rotulo}.`, origem: "PEDIDO_ORACAO",
      pedidoOracaoId: pedidoId, urgente: !!p.Risco, soGeral: !!p.SoNivelGeral, prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel, criadoPor: ver.membroId
    }, { transaction });
    await fecharTransacao(transaction, !g.repetido);
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  if (g.repetido) return { sucesso: false, mudou: true, mensagem: "Este pedido já tem um acompanhamento aberto." };
  await auditar("CuidadoItens", g.itemId, "CUIDADO_ITEM_ABERTO", ver.membroId);
  await avisarDestino(pool, { destino, g, membroId: p.SolicitanteMembroId, pessoaNome: p.SolicitanteNome, congregacaoNome: p.CongregacaoNome, prazoEm, agora, por: ver.membroId });
  return { sucesso: true, itemId: g.itemId, mensagem: "Acompanhamento aberto." };
}

// O boletim: só as linhas aprovadas e ainda no prazo, por congregação. Nunca o texto do pedido.
async function boletim(pool, { ver = null, congregacaoId = null, membroId = null, agora = new Date() }) {
  const rq = pool.request().input("hoje", sql.Date, hojeBrasilia(agora));
  const cond = ["p.Moderacao = 'APROVADO'", "p.Risco = 0", "p.BoletimAte >= @hoje", "p.AnonimizadoEm IS NULL"];
  if (membroId) {
    const p = await pessoa(pool, membroId);
    if (!p || p.Status !== "ATIVO" || !p.CongregacaoId) return [];
    rq.input("c", sql.Int, p.CongregacaoId); cond.push("p.CongregacaoId = @c");
  } else {
    if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); cond.push("p.CongregacaoId = @c"); }
    cond.push(filtroDeIds(rq, "p.CongregacaoId", await idsDoTerritorio(pool, ver)));
  }
  const r = await rq.query(`SELECT p.PedidoId, p.TextoBoletim, p.ModeradoEm, p.BoletimAte, p.Categoria, c.Nome AS CongregacaoNome FROM PedidosOracao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE ${cond.join(" AND ")} ORDER BY c.Nome, p.ModeradoEm DESC`);
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
  // (Trava 7-C) quem tem pendência reservada não acha criança pela busca (não abre item nem registra pedido sobre ela)
  const temMenor = r.recordset.some((m) => menorPelaData(m.DataNascimento, hoje));
  const semMenores = temMenor && bloqueado(await conferirBloqueio(pool, ver, agora));
  const lista = r.recordset.filter((m) => !(semMenores && menorPelaData(m.DataNascimento, hoje)))
    .map((m) => { const idade = vol.idadeEmAnos(m.DataNascimento, hoje); return { membroId: m.MembroId, nome: m.Nome, lideranca: false, maior: idade != null && idade >= cp.MAIORIDADE }; });
  for (const l of lideres) if (!lista.some((x) => mesmo(x.membroId, l.membroId))) lista.push({ membroId: l.membroId, nome: l.nome, lideranca: true, maior: true });
  return lista;
}

// Os números por congregação do território: abertos, vencidos, sem responsável, urgentes, pedidos esperando moderação e com risco, detectados em 30 dias e o tempo médio até o
// primeiro contato (itens criados nos últimos 90 dias). Só números — e sem contar o que é SOBRE quem olha (revisão: o painel do Dirigente acompanhado denunciava o item dele).
async function painel(pool, { ver }) {
  const congs = await congregacoesDoTerritorio(pool, { ver });
  if (!congs.length) return [];
  const ids = ver.geral ? null : congs.map((c) => c.congregacaoId);
  const ri = pool.request().input("eu", sql.Int, ver.membroId);
  const itens = (await ri.query(`
    SELECT i.CongregacaoId,
      SUM(CASE WHEN i.Status = 'ABERTO' THEN 1 ELSE 0 END) AS Abertos,
      SUM(CASE WHEN i.Status = 'ABERTO' AND i.PrazoEm < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS Vencidos,
      SUM(CASE WHEN i.Status = 'ABERTO' AND i.ResponsavelMembroId IS NULL THEN 1 ELSE 0 END) AS SemResponsavel,
      SUM(CASE WHEN i.Status = 'ABERTO' AND i.Urgente = 1 THEN 1 ELSE 0 END) AS Urgentes,
      SUM(CASE WHEN i.Origem = 'DETECCAO' AND i.CriadoEm >= DATEADD(DAY, -30, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS Detectados30,
      AVG(CASE WHEN i.PrimeiroContatoEm IS NOT NULL AND i.CriadoEm >= DATEADD(DAY, -90, SYSUTCDATETIME()) THEN CAST(DATEDIFF(MINUTE, i.CriadoEm, i.PrimeiroContatoEm) AS FLOAT) END) / 60.0 AS HorasAtePrimeiroContato
    FROM CuidadoItens i WHERE (i.MembroId IS NULL OR i.MembroId <> @eu) ${ver.geral ? "" : "AND i.SoNivelGeral = 0"} AND ${filtroDeIds(ri, "i.CongregacaoId", ids)}
    GROUP BY i.CongregacaoId`)).recordset;
  const rp = pool.request().input("eu", sql.Int, ver.membroId);
  const pedidos = (await rp.query(`
    SELECT p.CongregacaoId, SUM(CASE WHEN p.Moderacao = 'AGUARDANDO' AND p.Risco = 0 THEN 1 ELSE 0 END) AS Aguardando, SUM(CASE WHEN p.Risco = 1 THEN 1 ELSE 0 END) AS ComRisco
    FROM PedidosOracao p WHERE p.AnonimizadoEm IS NULL AND (p.SolicitanteMembroId IS NULL OR p.SolicitanteMembroId <> @eu) ${ver.geral ? "" : "AND p.SoNivelGeral = 0"} AND ${filtroDeIds(rp, "p.CongregacaoId", ids)}
    GROUP BY p.CongregacaoId`)).recordset;
  const porI = new Map(itens.map((x) => [x.CongregacaoId, x])), porP = new Map(pedidos.map((x) => [x.CongregacaoId, x]));
  return congs.map((c) => {
    const i = porI.get(c.congregacaoId) || {}, p = porP.get(c.congregacaoId) || {};
    return { congregacaoId: c.congregacaoId, congregacaoNome: c.nome, abertos: Number(i.Abertos) || 0, vencidos: Number(i.Vencidos) || 0, semResponsavel: Number(i.SemResponsavel) || 0,
      urgentes: Number(i.Urgentes) || 0, detectados30Dias: Number(i.Detectados30) || 0, horasAtePrimeiroContato: i.HorasAtePrimeiroContato == null ? null : Math.round(Number(i.HorasAtePrimeiroContato) * 10) / 10,
      pedidosAguardando: Number(p.Aguardando) || 0, pedidosRisco: Number(p.ComRisco) || 0 };
  });
}

// As congregações do território (para os seletores da tela).
async function congregacoesDoTerritorio(pool, { ver }) {
  const r = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE Ativa = 1 ORDER BY Nome`);
  return r.recordset.filter((c) => alcanca(ver, c.Nome)).map((c) => ({ congregacaoId: c.CongregacaoId, nome: c.Nome }));
}

// ---------------------------------------------------------------
// A rotina diária (07h, NotificacoesAgendador): passar adiante o item de quem mudou, detectar, subir a escada, apagar as notas de quem saiu e aplicar a retenção
// ---------------------------------------------------------------

// O item aberto de quem foi DESLIGADO se encerra; o de quem MUDOU de congregação (continua ativo) passa para a congregação nova — o mesmo tipo, a mesma urgência, o Dirigente de
// lá como responsável (ou o degrau de cima) e o aviso. Licença, candidatura e outras situações não mexem no item (revisão: a rotina fechava até o item urgente de risco).
async function acompanharQuemMudou(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT i.ItemId, i.Tipo, i.CongregacaoId, i.MembroId, i.Motivo, i.Origem, i.PedidoOracaoId, i.Urgente, i.SoNivelGeral, i.DeteccaoResumo, m.Status AS MembroStatus, m.Nome AS MembroNome,
           m.CongregacaoId AS NovaCongregacaoId, nc.Nome AS NovaCongregacaoNome
    FROM CuidadoItens i JOIN MembroReferencia m ON m.MembroId = i.MembroId LEFT JOIN Congregacoes nc ON nc.CongregacaoId = m.CongregacaoId
    WHERE i.Status = 'ABERTO' AND (m.Status = 'DESLIGADO' OR (m.Status = 'ATIVO' AND m.CongregacaoId IS NOT NULL AND m.CongregacaoId <> i.CongregacaoId))`);
  const prazos = await lerPrazos(pool);
  let encerrados = 0, passados = 0;
  for (const it of r.recordset) {
    const muda = it.MembroStatus === "ATIVO";
    const destino = muda ? await destinoDoItem(pool, { congregacaoId: it.NovaCongregacaoId, membroId: it.MembroId, soGeral: !!it.SoNivelGeral }) : null;
    const t = new sql.Transaction(pool);
    let g = null, prazoEm = null;
    try {
      await t.begin();
      const u = await new sql.Request(t).input("id", sql.Int, it.ItemId)
        .query(`UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'ENCAMINHADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = NULL WHERE ItemId = @id AND Status = 'ABERTO'; SELECT @@ROWCOUNT AS n`);
      if (Number(u.recordset[0].n)) {
        await inserirEvento(new sql.Request(t), { itemId: it.ItemId, tipo: "CONCLUIDO", observacao: muda ? "A pessoa mudou de congregação: o acompanhamento continua na congregação nova." : "Encerrado pela rotina: a pessoa foi desligada do rol." });
        if (muda) {
          prazoEm = cp.prazoInicial(it.Tipo, agora, prazos, { urgente: !!it.Urgente });
          g = (await abertoDoTipo(t, it.MembroId, it.Tipo)) ? { repetido: true } : await gravarItem(pool, { tipo: it.Tipo, congregacaoId: it.NovaCongregacaoId, membroId: it.MembroId, motivo: it.Motivo, origem: it.Origem, pedidoOracaoId: it.PedidoOracaoId,
            urgente: !!it.Urgente, soGeral: !!it.SoNivelGeral, deteccaoResumo: it.DeteccaoResumo, prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel }, { transaction: t });
          if (g.repetido) g = null;                                                              // já há um igual aberto na congregação nova: ele segue
        }
        await t.commit();
        if (muda) passados++; else encerrados++;
      } else await fecharTransacao(t, false);
    } catch (e) { await fecharTransacao(t, false); console.error("[CUIDADO] passar adiante o item de quem mudou falhou:", e.message); continue; }
    await auditar("CuidadoItens", it.ItemId, muda ? "CUIDADO_PASSADO_A_OUTRA_CONGREGACAO" : "CUIDADO_ENCERRADO_POR_SAIDA", null);
    if (g) {
      await auditar("CuidadoItens", g.itemId, "CUIDADO_ITEM_ABERTO", null);
      await avisarDestino(pool, { destino, g, membroId: it.MembroId, pessoaNome: it.MembroNome, congregacaoNome: it.NovaCongregacaoNome, prazoEm, agora, por: null });
    }
  }
  return { encerrados, passados };
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
    ), porDia AS (
      SELECT o.MembroId, o.Dia, MAX(o.Presente) AS Presente, o.Fonte FROM ops o GROUP BY o.MembroId, o.Dia, o.Fonte
    )
    SELECT d.MembroId, m.CongregacaoId, d.Dia, d.Presente, d.Fonte
    FROM porDia d JOIN MembroReferencia m ON m.MembroId = d.MembroId
    WHERE m.Status = 'ATIVO' AND m.CongregacaoId IS NOT NULL AND ISNULL(m.SituacaoMembro, '') <> 'SEM_COMUNHAO'
      AND d.MembroId IN (SELECT MembroId FROM porDia GROUP BY MembroId HAVING COUNT(DISTINCT Dia) >= ${cp.DETECCAO_MIN_BASE + cp.DETECCAO_MIN_RECENTES})
      AND NOT EXISTS (SELECT 1 FROM CuidadoItens ci WHERE ci.MembroId = m.MembroId AND ci.Tipo = 'AFASTAMENTO'
                      AND (ci.Status = 'ABERTO' OR ci.EncerradoEm >= DATEADD(DAY, -@car, SYSUTCDATETIME())))
      AND NOT EXISTS (SELECT 1 FROM ProcedimentosAbandono pa WHERE pa.MembroId = m.MembroId AND pa.Status = 'NOTIFICADO')`);
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
    const cong = await congregacao(pool, congregacaoId);
    for (const s of lista) {
      const destino = await destinoDoItem(pool, { congregacaoId, membroId: s.membroId });
      const prazoEm = cp.prazoInicial("AFASTAMENTO", agora, prazos);
      const g = await gravarItem(pool, {
        tipo: "AFASTAMENTO", congregacaoId, membroId: s.membroId, motivo: "A frequência caiu em relação ao costume da própria pessoa.", origem: "DETECCAO",
        deteccaoResumo: s.avaliacao.resumo.slice(0, 200), prazoEm, responsavelMembroId: destino.responsavel ? destino.responsavel.membroId : null, nivel: destino.nivel
      });
      if (!g.itemId) continue;
      abertos++;
      // o Dirigente responsável fica sabendo pelo resumo do dia; sem Dirigente (ou se é ele o acompanhado), o degrau de cima é avisado agora
      if (!destino.responsavel) await avisarDestino(pool, { destino, g, membroId: s.membroId, congregacaoNome: cong && cong.Nome, prazoEm, agora, por: null });
    }
  }
  return { avaliados: candidatos.length, sinais: sinais.length, abertos };
}

// (Trava 7-C) Tirar o responsável de um item aberto, DENTRO de uma transação (`r` cria a requisição nela): o item fica sem responsável, no degrau `nivelPara` (o mesmo, ou o
// de cima quando o dele ficou sem ninguém), com um evento ATRIBUIDO sem pessoa e a observação neutra — o motivo nunca aparece (pode ser pendência reservada ou a exclusão
// LGPD de quem era o responsável). Devolve o id do evento, ou null se o item já não estava com ele.
const OBS_RESPONSAVEL_SAIU = "O responsável deixou este acompanhamento (rotina do sistema). Nomeie outra pessoa.";
async function soltarNaTransacao(r, { itemId, responsavelMembroId, nivelDe, nivelPara }) {
  const u = await r().input("i", sql.Int, itemId).input("rp", sql.Int, responsavelMembroId).input("nv", sql.NVarChar(12), nivelPara)
    .query(`UPDATE CuidadoItens SET ResponsavelMembroId = NULL, Nivel = @nv WHERE ItemId = @i AND Status = 'ABERTO' AND ResponsavelMembroId = @rp; SELECT @@ROWCOUNT AS n`);
  if (!contagem(u)) return null;
  return inserirEvento(r(), { itemId, tipo: "ATRIBUIDO", observacao: OBS_RESPONSAVEL_SAIU, ...(nivelPara !== nivelDe ? { nivelDe, nivelPara } : {}) });
}
// O degrau do item que ficou sem responsável: o dele, se ainda tem alguém lá (fora quem saiu e quem tem pendência); senão o próximo com gente.
function nivelSemResponsavel(item, territorio, fora) {
  const comGente = degrausComGente(territorio, [item.MembroId, ...fora]);
  return comGente.has(item.Nivel) ? item.Nivel : cp.proximoDegrau(item.Nivel, comGente) || item.Nivel;
}
// Depois do commit: quem está no degrau do item é avisado de que ele ficou sem responsável (nunca a pessoa acompanhada nem quem saiu).
async function avisarResponsavelSaiu(pool, { eventoId, congregacaoId, congregacaoNome, membroId, nivel, fora = [] }) {
  if (!eventoId) return null;
  const territorio = await liderancaDoTerritorio(pool, congregacaoId);
  const destinatarios = semRepetidos(territorio[nivel] || [], [membroId, ...fora]);
  if (!destinatarios.length) return null;
  return notificarAgora(pool, { regraChave: "CUIDADO_DEGRAU", destinatarios, referenciaTabela: "CuidadoEventos", referenciaId: eventoId, mensagem: cp.textoResponsavelSaiu({ congregacaoNome, para: nivel }) });
}
// (Trava 7-C) A regra da 7-B depois do fato: quem passou a ter pendência reservada (afastamento cautelar, comunicação em análise, cadastro nacional, restrição, fora de comunhão)
// deixa de ser o responsável pelos itens ABERTOS de crianças e adolescentes. Roda junto com a retirada das escalas (ministerioMenoresDb.retirarInaptosDasEscalas: cada ato da
// Diretoria, com `membroId`, e a rotina diária, sem). Aqui a dúvida NÃO solta ninguém: se a aptidão não pôde ser lida, o erro sobe (a rotina avisa; a próxima refaz).
async function soltarItensDeMenores(pool, { membroId = null, hoje = hojeBrasilia() } = {}) {
  const rq = pool.request();
  let filtro = "";
  if (membroId) { rq.input("r", sql.Int, membroId); filtro = " AND i.ResponsavelMembroId = @r"; }
  const linhas = (await rq.query(`
    SELECT i.ItemId, i.CongregacaoId, c.Nome AS CongregacaoNome, i.MembroId, i.ResponsavelMembroId, i.Nivel, m.DataNascimento AS MembroNascimento
    FROM CuidadoItens i JOIN MembroReferencia m ON m.MembroId = i.MembroId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
    WHERE i.Status = 'ABERTO' AND i.ResponsavelMembroId IS NOT NULL AND m.DataNascimento IS NOT NULL${filtro}`)).recordset.filter((i) => ehMenor(i, hoje));
  if (!linhas.length) return { soltos: 0 };
  const mm = require("./ministerioMenores");
  const aptidoes = await require("./ministerioMenoresDb").aptidaoEmLote(pool, linhas.map((l) => l.ResponsavelMembroId), { hoje });
  const comPendencia = (id) => { const ap = aptidoes.get(Number(id)); return !!ap && mm.temBloqueioReservado(ap.bloqueios); };
  const territorios = new Map(), memo = new Map();
  let soltos = 0;
  for (const it of linhas.filter((l) => comPendencia(l.ResponsavelMembroId))) {
    if (!territorios.has(it.CongregacaoId)) territorios.set(it.CongregacaoId, await liderancaDoTerritorio(pool, it.CongregacaoId));
    const territorio = territorios.get(it.CongregacaoId);
    const fora = [...(await bloqueadosDoTerritorio(pool, territorio, it.CongregacaoId, hoje, memo)), it.ResponsavelMembroId];
    const nivelPara = nivelSemResponsavel(it, territorio, fora);
    const t = new sql.Transaction(pool);
    let eventoId = null;
    try {
      await t.begin();
      eventoId = await soltarNaTransacao(() => new sql.Request(t), { itemId: it.ItemId, responsavelMembroId: it.ResponsavelMembroId, nivelDe: it.Nivel, nivelPara });
      await fecharTransacao(t, !!eventoId);
    } catch (e) { await fecharTransacao(t, false); throw e; }
    if (!eventoId) continue;
    soltos++;
    // a auditoria guarda só o item e o código (nunca quem era o responsável: somado à hora, apontaria quem tem pendência)
    await auditar("CuidadoItens", it.ItemId, "CUIDADO_RESPONSAVEL_RETIRADO", null);
    await avisarResponsavelSaiu(pool, { eventoId, congregacaoId: it.CongregacaoId, congregacaoNome: it.CongregacaoNome, membroId: it.MembroId, nivel: nivelPara, fora });
  }
  return { soltos };
}

// (Trava 7-C) Quem tem pendência reservada na liderança do território de uma congregação: uma conferência por congregação e por rodada (`memo` vive só durante a rodada;
// quem tem pendência é dado reservado e não fica em cache).
async function bloqueadosDoTerritorio(pool, territorio, congregacaoId, hoje, memo) {
  if (!memo.has(congregacaoId)) memo.set(congregacaoId, await bloqueadosEntre(pool, todosDoTerritorio(territorio).map((d) => d.membroId), hoje));
  return memo.get(congregacaoId);
}

// Sobe um degrau (ou lembra, no topo) cada item aberto vencido. Os avisos saem pelos detectores do motor, que leem os eventos de hoje.
async function subirEscada(pool, { agora = new Date() } = {}) {
  const prazos = await lerPrazos(pool);
  const r = await pool.request().query(`SELECT i.ItemId, i.CongregacaoId, i.MembroId, i.Nivel, i.PrazoEm, i.Status, i.LembretesGerais, i.Urgente, m.DataNascimento AS MembroNascimento
    FROM CuidadoItens i LEFT JOIN MembroReferencia m ON m.MembroId = i.MembroId WHERE i.Status = 'ABERTO' AND i.PrazoEm < SYSUTCDATETIME()`);
  const territorios = new Map(), memo = new Map();
  const hoje = hojeBrasilia(agora);
  let subiram = 0, lembretes = 0;
  for (const item of r.recordset) {
    if (!territorios.has(item.CongregacaoId)) territorios.set(item.CongregacaoId, await liderancaDoTerritorio(pool, item.CongregacaoId));
    // (Trava 7-C) no item de um menor, quem tem pendência reservada não conta como "gente" no degrau (o item passa por cima dele)
    const fora = ehMenor(item, hoje) ? [...(await bloqueadosDoTerritorio(pool, territorios.get(item.CongregacaoId), item.CongregacaoId, hoje, memo))] : [];
    const comGente = degrausComGente(territorios.get(item.CongregacaoId), [item.MembroId, ...fora]);
    const dec = cp.decidirEscada(item, comGente, agora);
    if (dec.acao === "NADA") continue;
    const novoPrazo = cp.prazoDoDegrau(item, agora, prazos);
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

// Regimento Art. 132 §2º, II: as anotações pastorais de quem foi DESLIGADO do rol (carta, abandono, desligamento: todos gravam a data de saída) há mais de 30 dias são eliminadas.
// Licença e outras situações não contam (revisão: a regra apagava as notas de quem estava só de licença de candidatura e voltava).
async function apagarNotasDeQuemSaiu(pool, { agora = new Date() } = {}) {
  const dias = await diasDeRetencao(pool, "notas");
  const limite = cp.somarDiasIso(hojeBrasilia(agora), -dias);
  const t = new sql.Transaction(pool);
  try {
    await t.begin();
    // uma rodada por vez (duas rotinas ao mesmo tempo apagando as mesmas linhas se travavam: prova de corrida no banco real); quem não pega a vez sai sem fazer nada
    if (!(await obterTrava(() => new sql.Request(t), 'cuidado-purga', 30000))) { await fecharTransacao(t, false); return 0; }
    const alvo = `SELECT n.NotaId FROM NotasPastorais n JOIN MembroReferencia m ON m.MembroId = n.MembroId WHERE m.Status = 'DESLIGADO' AND m.DataSaida IS NOT NULL AND m.DataSaida <= @lim`;
    const r = await new sql.Request(t).input("lim", sql.Date, limite).query(comMarcaDePurga(`
      DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (${alvo});
      DELETE FROM NotasPastorais WHERE NotaId IN (${alvo}); SET @apagadas = @apagadas + @@ROWCOUNT;`));
    await t.commit();
    return contagem(r);
  } catch (e) { await fecharTransacao(t, false); throw e; }
}

// O que fica guardado além do prazo perde a identificação: o item encerrado há mais de 5 anos (o histórico, quem o criou e quem agiu nele), a nota sobre quem não é do cadastro
// 1 ano depois que o item encerra, e o pedido de oração (1 ano; 5 se teve sinal de risco).
async function aplicarRetencao(pool, { agora = new Date() } = {}) {
  const diasItens = await diasDeRetencao(pool, "itens");
  const diasPedidos = await diasDeRetencao(pool, "pedidos");
  const diasRisco = await diasDeRetencao(pool, "pedidosRisco");
  const t = new sql.Transaction(pool);
  let itens = 0, pedidos = 0, notas = 0;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), 'cuidado-purga', 30000))) { await fecharTransacao(t, false); return { itens: 0, pedidos: 0, notasDeVisitante: 0 }; }
    const rq = () => new sql.Request(t);
    const alvo = `SELECT ItemId FROM CuidadoItens WHERE Status <> 'ABERTO' AND AnonimizadoEm IS NULL AND EncerradoEm < DATEADD(DAY, -@d, SYSUTCDATETIME())`;
    const notasDeItem = `SELECT n.NotaId FROM NotasPastorais n JOIN CuidadoItens i ON i.ItemId = n.ItemId WHERE i.Status <> 'ABERTO' AND i.EncerradoEm < DATEADD(DAY, -@dv, SYSUTCDATETIME())`;
    notas = contagem(await rq().input("dv", sql.Int, NOTAS_DE_VISITANTE_DIAS).query(comMarcaDePurga(`
      DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (${notasDeItem});
      DELETE FROM NotasPastorais WHERE NotaId IN (${notasDeItem}); SET @apagadas = @apagadas + @@ROWCOUNT;`)));
    await rq().input("d", sql.Int, diasItens).query(`UPDATE CuidadoEventos SET Observacao = NULL, Acompanhante = CASE WHEN Acompanhante IS NULL THEN NULL ELSE N'(anonimizado)' END,
      MembroId = NULL, ResponsavelMembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE AnonimizadoEm IS NULL AND ItemId IN (${alvo})`);
    itens = contagem(await rq().input("d", sql.Int, diasItens).query(`UPDATE CuidadoItens SET MembroId = NULL, PessoaNome = NULL, PessoaContato = NULL, Motivo = NULL, DeteccaoResumo = NULL,
      CriadoPorMembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE ItemId IN (${alvo}); SELECT @@ROWCOUNT AS n`));
    pedidos = contagem(await rq().input("dp", sql.Int, diasPedidos).input("dr", sql.Int, diasRisco).query(`
      UPDATE PedidosOracao SET Texto = NULL, SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, SolicitanteNome = NULL, SolicitanteContato = NULL, TextoBoletim = NULL,
        RiscoDesmarcadoMotivo = NULL, Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'NAO_PUBLICAR' ELSE Moderacao END, BoletimAte = NULL, AnonimizadoEm = SYSUTCDATETIME()
      WHERE AnonimizadoEm IS NULL AND CriadoEm < DATEADD(DAY, -CASE WHEN RiscoJaTeve = 1 THEN @dr ELSE @dp END, SYSUTCDATETIME()); SELECT @@ROWCOUNT AS n`));
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  return { itens, pedidos, notasDeVisitante: notas };
}

// A rotina inteira. Cada passo é independente: um que falha não impede os outros (e a resposta diz qual falhou).
async function rotinaDiaria(pool, { agora = new Date() } = {}) {
  const r = { falhas: [] };
  const passo = async (nome, f) => { try { r[nome] = await f(); } catch (e) { r.falhas.push(nome); console.error(`[CUIDADO] a rotina "${nome}" falhou:`, e && e.message); } };
  await passo("quemMudou", () => acompanharQuemMudou(pool, { agora }));
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
      FROM CuidadoItens i LEFT JOIN MembroReferencia mb ON mb.MembroId = i.MembroId
      WHERE i.Status = 'ABERTO' AND i.ResponsavelMembroId IS NOT NULL AND (i.MembroId IS NULL OR (i.MembroId <> i.ResponsavelMembroId AND mb.Status = 'ATIVO' AND mb.CongregacaoId = i.CongregacaoId))
    ) x JOIN MembroReferencia m ON m.MembroId = x.ResponsavelMembroId
    WHERE m.Status = 'ATIVO'
      AND NOT EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')
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
    SELECT e.EventoId, e.NivelPara, i.ItemId, i.CongregacaoId, i.MembroId, c.Nome AS CongregacaoNome, m.DataNascimento AS MembroNascimento
    FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId LEFT JOIN MembroReferencia m ON m.MembroId = i.MembroId
    WHERE e.Tipo IN ('ESCALONADO', 'LEMBRETE_GERAL') AND e.Em >= DATEADD(HOUR, -26, SYSUTCDATETIME()) AND i.Status = 'ABERTO'`);
  const territorios = new Map(), memo = new Map();
  const hoje = hojeBrasilia(agora);
  const fatos = [];
  for (const ev of r.recordset) {
    if (!territorios.has(ev.CongregacaoId)) territorios.set(ev.CongregacaoId, await liderancaDoTerritorio(pool, ev.CongregacaoId));
    // (Trava 7-C) o aviso do item de um menor não vai a quem tem pendência reservada
    const fora = ehMenor(ev, hoje) ? [...(await bloqueadosDoTerritorio(pool, territorios.get(ev.CongregacaoId), ev.CongregacaoId, hoje, memo))] : [];
    const destinatarios = semRepetidos(territorios.get(ev.CongregacaoId)[ev.NivelPara] || [], [ev.MembroId, ...fora]);
    if (!destinatarios.length) continue;
    fatos.push({ referenciaId: ev.EventoId, destinatarios, fatoGerador: cp.textoDegrau({ congregacaoNome: ev.CongregacaoNome, para: ev.NivelPara }) });
  }
  return fatos;
}

// Um aviso por congregação, por dia, à liderança do degrau mais baixo que tem gente, quando há pedido esperando moderação (o pedido com risco já avisou na hora; o "só nível
// geral" é do nível geral).
async function detectarModeracao(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT p.CongregacaoId, c.Nome AS CongregacaoNome, COUNT(*) AS n
    FROM PedidosOracao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE p.Moderacao = 'AGUARDANDO' AND p.Risco = 0 AND p.SoNivelGeral = 0 AND p.AnonimizadoEm IS NULL GROUP BY p.CongregacaoId, c.Nome`);
  const hoje = cp.referenciaDoDia(hojeBrasilia(agora));
  const fatos = [];
  for (const l of r.recordset) {
    const territorio = await liderancaDoTerritorio(pool, l.CongregacaoId);
    const degrau = cp.ORDEM_DEGRAUS.find((k) => territorio[k].length > 0);
    if (!degrau) continue;
    fatos.push({ referenciaId: hoje * 10000 + (Number(l.CongregacaoId) % 10000), destinatarios: territorio[degrau], fatoGerador: cp.textoModeracao({ quantos: Number(l.n), congregacaoNome: l.CongregacaoNome }) });
  }
  // (v7.11.1) os confidenciais do mural do site esperando leitura: ao nível geral, um aviso por dia (o do risco já saiu na hora)
  const site = Number(((await pool.request().query(`SELECT COUNT(*) AS n FROM PedidosOracao WHERE Origem = 'SITE' AND Moderacao = 'AGUARDANDO' AND Risco = 0 AND AnonimizadoEm IS NULL`)).recordset[0] || {}).n) || 0;
  if (site > 0) {
    const gerais = await geraisDoCuidado(pool);
    if (gerais.length) fatos.push({ referenciaId: hoje * 10000 + 9999, destinatarios: gerais, fatoGerador: cp.textoModeracao({ quantos: site, congregacaoNome: null }).replace("moderação.", "leitura no mural de oração do site (confidenciais).") });
  }
  return fatos;
}

// ---------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------

// Meus Dados: os pedidos que a pessoa fez (com o texto, menos o do pedido que teve sinal de risco, que sai pelo Encarregado) e QUANTAS notas existem sobre ela e de quando, e
// quantos acompanhamentos JÁ ENCERRADOS (o aberto não aparece: seria contar a ela que alguém está para procurá-la). O texto escrito por outros sobre ela pode ser pedido ao Encarregado.
async function dadosDoTitular(pool, membroId) {
  const id = Number(membroId);
  const linha = async (consulta) => (await pool.request().input("m", sql.Int, id).query(consulta)).recordset[0] || {};
  const notas = await linha(`SELECT COUNT(*) AS n, MIN(CriadaEm) AS primeira, MAX(CriadaEm) AS ultima FROM NotasPastorais WHERE MembroId = @m`);
  const itens = await linha(`SELECT COUNT(*) AS n, MIN(EncerradoEm) AS primeiro, MAX(EncerradoEm) AS ultimo FROM CuidadoItens WHERE MembroId = @m AND Status <> 'ABERTO'`);
  const resp = await linha(`SELECT COUNT(*) AS n FROM CuidadoItens WHERE ResponsavelMembroId = @m AND Status = 'ABERTO'`);
  const pedidos = (await pool.request().input("m", sql.Int, id).query(`SELECT PedidoId, Categoria, ParaQuem, Texto, PodeBoletim, Moderacao, CriadoEm, RiscoJaTeve FROM PedidosOracao WHERE SolicitanteMembroId = @m ORDER BY PedidoId DESC`))
    .recordset.map((p) => ({ criadoEm: iso(p.CriadoEm), assunto: cp.CATEGORIAS_ORACAO[p.Categoria].rotulo, paraQuem: cp.PARA_QUEM[p.ParaQuem], texto: p.RiscoJaTeve ? `${TEXTO_GUARDADO} — peça ao Encarregado de Dados` : p.Texto,
      podeBoletim: !!p.PodeBoletim, situacao: p.RiscoJaTeve ? "Recebido: a liderança está cuidando" : SITUACAO_PEDIDO_PARA_QUEM_PEDIU[p.Moderacao] }));
  return {
    pedidosDeOracao: pedidos,
    notasPastoraisSobreVoce: { quantidade: Number(notas.n) || 0, primeira: iso(notas.primeira), ultima: iso(notas.ultima), comoPedirOTexto: "O texto escrito pela liderança pode ser pedido ao Encarregado de Dados (Meus Dados → Solicitações)." },
    acompanhamentosEncerradosSobreVoce: { quantidade: Number(itens.n) || 0, primeiro: iso(itens.primeiro), ultimo: iso(itens.ultimo) },
    acompanhamentosComoResponsavel: { abertos: Number(resp.n) || 0 }
  };
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD; `r()` cria um pedido nessa transação): apaga as notas sobre a pessoa, encerra e anonimiza os itens sobre ela (o
// histórico inteiro, quem criou e quem agiu: o pedido que ela mesma fez a deixaria identificável) e anonimiza os pedidos que ela fez. Devolve as contagens.
async function exclusaoLgpd(r, membroId) {
  const id = Number(membroId);
  const notas = contagem(await r().input("m", sql.Int, id).query(comMarcaDePurga(`
    DELETE FROM NotasPastoraisLeituras WHERE NotaId IN (SELECT NotaId FROM NotasPastorais WHERE MembroId = @m);
    DELETE FROM NotasPastorais WHERE MembroId = @m; SET @apagadas = @apagadas + @@ROWCOUNT;`)));
  const abertos = ((await r().input("m", sql.Int, id).query(`SELECT ItemId FROM CuidadoItens WHERE MembroId = @m AND Status = 'ABERTO'`)) || {}).recordset || [];
  for (const { ItemId } of abertos) {
    await r().input("i", sql.Int, ItemId).query(`UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'OUTRO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = NULL WHERE ItemId = @i AND Status = 'ABERTO'`);
    await inserirEvento(r(), { itemId: ItemId, tipo: "CONCLUIDO" });
  }
  await r().input("m", sql.Int, id).query(`UPDATE CuidadoEventos SET Observacao = NULL, Acompanhante = CASE WHEN Acompanhante IS NULL THEN NULL ELSE N'(anonimizado)' END,
    MembroId = NULL, ResponsavelMembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE AnonimizadoEm IS NULL AND ItemId IN (SELECT ItemId FROM CuidadoItens WHERE MembroId = @m)`);
  const itens = contagem(await r().input("m", sql.Int, id).query(`UPDATE CuidadoItens SET MembroId = NULL, PessoaNome = NULL, PessoaContato = NULL, Motivo = NULL, DeteccaoResumo = NULL,
    CriadoPorMembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId = @m AND Status <> 'ABERTO'; SELECT @@ROWCOUNT AS n`));
  const pedidos = contagem(await r().input("m", sql.Int, id).query(`
    UPDATE PedidosOracao SET Texto = NULL, SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, SolicitanteNome = NULL, SolicitanteContato = NULL, TextoBoletim = NULL,
      RiscoDesmarcadoMotivo = NULL, Moderacao = CASE WHEN Moderacao = 'APROVADO' THEN 'NAO_PUBLICAR' ELSE Moderacao END, BoletimAte = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE SolicitanteMembroId = @m AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`));
  // (Trava 7-C) os itens ABERTOS de que a pessoa era a RESPONSÁVEL ficam sem responsável (no mesmo degrau, ou no de cima se o dela ficou vazio), com o evento neutro; quem
  // chama avisa o degrau depois do commit (avisarItensSoltos). Sem isto, a fila mostrava um responsável que já não existe e o item vencia sem ninguém saber.
  const deResponsavel = ((await r().input("m", sql.Int, id).query(`
    SELECT i.ItemId, i.CongregacaoId, c.Nome AS CongregacaoNome, i.MembroId, i.Nivel FROM CuidadoItens i JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
    WHERE i.ResponsavelMembroId = @m AND i.Status = 'ABERTO'`)) || {}).recordset || [];
  const itensSoltos = [];
  for (const it of deResponsavel) {
    const eventoId = await soltarNaTransacao(r, { itemId: it.ItemId, responsavelMembroId: id, nivelDe: it.Nivel, nivelPara: it.Nivel });
    if (eventoId) itensSoltos.push({ eventoId, congregacaoId: it.CongregacaoId, congregacaoNome: it.CongregacaoNome, membroId: it.MembroId, nivel: it.Nivel });
  }
  return { notas, itens, pedidos, soltos: itensSoltos.length, itensSoltos };
}
// Depois do commit da exclusão LGPD: quem está no degrau de cada item que ficou sem responsável é avisado (ou, sem ninguém lá, o próximo degrau com gente; o item segue no
// degrau dele e a escada da rotina o leva adiante se vencer). Fail-soft: o item já está na fila "Sem responsável".
async function avisarItensSoltos(pool, itensSoltos, membroExcluido) {
  for (const it of itensSoltos || []) {
    try {
      const territorio = await liderancaDoTerritorio(pool, it.congregacaoId);
      const nivel = nivelSemResponsavel({ MembroId: it.membroId, Nivel: it.nivel }, territorio, [membroExcluido]);
      await avisarResponsavelSaiu(pool, { eventoId: it.eventoId, congregacaoId: it.congregacaoId, congregacaoNome: it.congregacaoNome, membroId: it.membroId, nivel, fora: [membroExcluido] });
    } catch (e) { console.error("[CUIDADO] aviso do item sem responsável (exclusão LGPD):", e && e.message); }
  }
}

// ---------------------------------------------------------------
// v7.11.1 — o mural de oração do SITE
// ---------------------------------------------------------------

// O nível geral do cuidado (Diretoria): quem recebe o que vem do site, que não tem congregação.
async function geraisDoCuidado(pool) {
  return semRepetidos((await resolverDestinatariosPorPermissao(pool, { permissao: PERMISSAO, nivel: "GLOBAL" })).map(destinatarioDe));
}
const LIMITE_SITE_HORA = 30;                // pedidos do site guardados por hora (contra inundação vinda do site público); o de risco tem folga própria
const LIMITE_SITE_RISCO_HORA = 60;
const MAX_TEXTO_SITE = 1000, MAX_NOME_SITE = 150;

// O site manda, servidor a servidor, o pedido que acabou de receber no mural. Só o CONFIDENCIAL ou com SINAL DE RISCO é guardado aqui (os outros seguem só no
// Directus, com a moderação da Diretoria no painel do site) — e para esses o banco nem é aberto. Com risco, o aviso obrigatório sai na hora ao nível geral.
// Devolve { gravado, risco, avisada?, repetido? }; o site usa `risco` para mostrar o 188 e o 190 a quem escreveu e para guardar o pedido como confidencial.
// (Trava 7-C) O que dá para decidir SEM o banco: o texto vazio e o pedido comum (sem confidencialidade e sem sinal de risco), que nem abre o banco. A rota usa isto ANTES de
// pedir a conexão: com o banco pausado (o Azure SQL dorme quando ninguém usa), o pedido comum responde na hora em vez de esperar o banco acordar e estourar o tempo do site.
function preverDoSite({ texto, confidencial }) {
  const t = cp.limparTextoDoSite(texto, MAX_TEXTO_SITE);
  if (t.length < 2) return { invalido: true, precisaBanco: false, risco: false };
  const risco = cp.avaliarRisco(t);
  return { invalido: false, precisaBanco: !!confidencial || risco.risco, risco: risco.risco };
}
const PRAZO_AVISO_SITE_MS = 4000;          // (Trava 7-C) o aviso do risco não segura a resposta ao site: o sininho de todos nasce antes; e-mail e celular têm 4 s (o e-mail que não sair
                                           // fica pendente e o reenvio da proteção o manda: CUIDADO_RISCO é obrigatória)
async function receberDoSite(pool, { texto, nome, confidencial, siteItemId = null }) {
  const t = cp.limparTextoDoSite(texto, MAX_TEXTO_SITE);
  const n = cp.limparTextoDoSite(nome, MAX_NOME_SITE) || null;
  if (t.length < 2) return { gravado: false, risco: false, invalido: true };
  const risco = cp.avaliarRisco(t);
  if (!confidencial && !risco.risco) return { gravado: false, risco: false };
  const si = Number.isInteger(siteItemId) && siteItemId > 0 ? siteItemId : null;
  const transaction = new sql.Transaction(pool);
  let pedidoId;
  try {
    await transaction.begin();
    if (!(await obterTrava(() => new sql.Request(transaction), "cuidado-site", 8000))) { await fecharTransacao(transaction, false); return { gravado: false, risco: risco.risco, ocupado: true }; }
    // (Trava 7-C) o mesmo item do site já entregue (o site reenvia o que ficou sem resposta, e a primeira tentativa pode ter gravado depois que o site desistiu): é o MESMO pedido
    const rep = (si ? (await new sql.Request(transaction).input("si", sql.Int, si)
      .query(`SELECT TOP 1 PedidoId, Risco FROM PedidosOracao WHERE Origem = 'SITE' AND SiteItemId = @si ORDER BY PedidoId`)).recordset[0] : null)
      || (await new sql.Request(transaction).input("t", sql.NVarChar(1000), t)
        .query(`SELECT TOP 1 PedidoId, Risco FROM PedidosOracao WHERE Origem = 'SITE' AND Texto = @t AND CriadoEm >= DATEADD(MINUTE, -10, SYSUTCDATETIME()) ORDER BY PedidoId DESC`)).recordset[0];
    if (rep) { await fecharTransacao(transaction, false); return { gravado: true, repetido: true, risco: !!rep.Risco, pedidoId: rep.PedidoId }; }
    const naHora = Number((await new sql.Request(transaction).input("r", sql.Bit, risco.risco ? 1 : 0)
      .query(`SELECT COUNT(*) AS n FROM PedidosOracao WHERE Origem = 'SITE' AND Risco = @r AND CriadoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())`)).recordset[0].n);
    if (naHora >= (risco.risco ? LIMITE_SITE_RISCO_HORA : LIMITE_SITE_HORA)) { await fecharTransacao(transaction, false); return { gravado: false, risco: risco.risco, limite: true }; }
    pedidoId = (await new sql.Request(transaction).input("sn", sql.NVarChar(150), n).input("t", sql.NVarChar(1000), t).input("rk", sql.Bit, risco.risco ? 1 : 0)
      .input("ro", sql.NVarChar(10), risco.risco ? "AUTOMATICO" : null).input("rc", sql.Bit, risco.crianca ? 1 : 0).input("si", sql.Int, si)
      .query(`INSERT INTO PedidosOracao (CongregacaoId, SolicitanteMembroId, RegistradoPorMembroId, SolicitanteNome, ParaQuem, Categoria, Texto, PodeBoletim, QuerContato,
                Risco, RiscoOrigem, RiscoCrianca, RiscoJaTeve, RiscoMarcadoEm, SoNivelGeral, Origem, SiteItemId)
              VALUES (NULL, NULL, NULL, @sn, 'PROPRIO', 'OUTRO', @t, 0, 0, @rk, @ro, @rc, @rk, CASE WHEN @rk = 1 THEN SYSUTCDATETIME() ELSE NULL END, 1, 'SITE', @si);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar("PedidosOracao", pedidoId, "CUIDADO_PEDIDO_DO_SITE", null);
  if (!risco.risco) return { gravado: true, risco: false, pedidoId };
  const aviso = await avisarRiscoDoSite(pool, { referenciaTabela: "PedidosOracaoSite", referenciaId: pedidoId, crianca: risco.crianca, prazoMs: PRAZO_AVISO_SITE_MS });
  return { gravado: true, risco: true, pedidoId, avisada: Number((aviso || {}).externas) > 0 };
}
// O aviso do risco que veio do site: ao nível geral do cuidado; (Trava 7-C) sobre criança, sem quem tem pendência reservada ou é envolvido de incidente aberto, e com o aviso
// à Proteção de crianças.
async function avisarRiscoDoSite(pool, { referenciaTabela, referenciaId, crianca, fora = [], prazoMs = null }) {
  const gerais = await geraisDoCuidado(pool);
  const longe = crianca ? [...(await foraDoQueESobreCrianca(pool, gerais.map((d) => d.membroId)))] : [];
  const aviso = await notificarAgora(pool, { regraChave: "CUIDADO_RISCO", destinatarios: semRepetidos(gerais, [...fora, ...longe]), mensagem: cp.textoRisco({ doSite: true, crianca }),
    referenciaTabela, referenciaId, aguardarEntrega: false, ...(prazoMs ? { prazoMs } : {}) });
  if (crianca) await avisarProtecao(pool, { referenciaTabela: `${referenciaTabela}Protecao`, referenciaId, crianca, doSite: true, fora: [...fora, ...longe] });
  return aviso;
}

// Marcar o risco num pedido do site (a lista não pegou): o pedido fica com o sinal e o nível geral é avisado — sem acompanhamento (não há congregação nem contato).
// Cada marcação avisa de novo (a referência leva o número da marcação, para o motor não calar a segunda), numa tabela de referência própria: pedido×10+vez na mesma
// "PedidosOracaoSite" do aviso automático coincidiria com outro pedido (o 5 marcado = 51 = o pedido 51 com risco) e o motor calaria o aviso do 51.
async function marcarRiscoDoSite(pool, { p, ver }) {
  const r = await pool.request().input("id", sql.Int, p.PedidoId)
    .query(`UPDATE PedidosOracao SET Risco = 1, RiscoOrigem = 'LIDERANCA', RiscoJaTeve = 1, RiscoMarcadoEm = SYSUTCDATETIME() WHERE PedidoId = @id AND Risco = 0 AND AnonimizadoEm IS NULL; SELECT @@ROWCOUNT AS n`);
  if (!Number(r.recordset[0].n)) return MUDOU("O pedido mudou enquanto você decidia. Abra de novo.");
  await auditar("PedidosOracao", p.PedidoId, "CUIDADO_PEDIDO_MARCADO", ver.membroId);
  const vez = Number((await pool.request().input("id", sql.Int, p.PedidoId).query(`SELECT COUNT(*) AS n FROM AuditLog WHERE Tabela = 'PedidosOracao' AND RegistroId = @id AND Acao = 'CUIDADO_PEDIDO_MARCADO'`)).recordset[0].n) || 1;
  const aviso = await avisarRiscoDoSite(pool, { referenciaTabela: "PedidosOracaoSiteMarcado", referenciaId: p.PedidoId * 10 + Math.min(vez, 9), crianca: cp.avaliarRisco(p.Texto || "").crianca, fora: [ver.membroId] });
  return { sucesso: true, itemId: null, avisada: Number((aviso || {}).externas) > 0,
    mensagem: `Sinal de risco marcado no pedido do site. ${Number((aviso || {}).externas) > 0 ? "O nível geral foi avisado agora." : "O aviso não saiu do sistema: avise a Diretoria por telefone."} Não há acompanhamento a abrir (o site não tem congregação nem contato): se o texto traz um contato, procure a pessoa.` };
}

module.exports = {
  receberDoSite, preverDoSite, soltarItensDeMenores, avisarItensSoltos, conferirBloqueio,
  PERMISSAO, lerPrazos, limparCaches, liderancaDoTerritorio, dirigenteDa, ehPastor, acessoAoItem,
  abrirItem, listarFila, detalheItem, meusItens, registrarContato, atribuir, adiar, concluir, cancelar,
  listarNotas, escreverNota, notaLegivel, lerNota, leiturasDaNota,
  pedirOracao, registrarPedidoRecebido, pedirVisita, meusPedidos, listarPedidos, moderar, marcarRisco, acompanharPedido, boletim,
  buscarPessoas, painel, congregacoesDoTerritorio,
  rotinaDiaria, acompanharQuemMudou, detectarAfastamentos, subirEscada, apagarNotasDeQuemSaiu, aplicarRetencao,
  detectarResumoDiario, detectarDegraus, detectarModeracao, dadosDoTitular, exclusaoLgpd
};
