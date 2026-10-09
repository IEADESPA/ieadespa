// shared/ministerioMenoresDb.js (v7.7 — Habilitação para Ministério com Menores)
//
// A camada de banco da regra pura de shared/ministerioMenores.js: reúne os fatos (cadastro, esteira da v5.7, Termo de Vistoria da v7.6, trilha de formação
// da v6.9, aceite da política, auto-denúncia), pede a decisão à regra e grava só o que ela decidiu. Nada aqui inventa regra.
//
// Os módulos de escala (escalas.js, voluntariadoDb.js, GestaoEscalas) e o de canais (canaisDb.js) chamam `aptidaoEmLote`/`aptosParaEquipe` de dentro de funções,
// com `require` sob demanda, para não criar ciclo entre os arquivos.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const mm = require("./ministerioMenores");
const vol = require("./voluntariado");
const trilhas = require("./trilhas");
const habMod = require("./habilitacaoVoluntarios");
const { hojeBrasilia } = require("./dataBrasilia");
const { lerPrazoDias, notificarAgora, isoInstante } = require("./canaisDb");

const LIMITE_IN = 400;
const STATUS_ATIVOS = ["CONVIDADO", "ACEITO", "CONFIRMADO"];
const STATUS_ATIVOS_SQL = STATUS_ATIVOS.map((s) => `'${s}'`).join(",");
const AVISOS_AO_VOLUNTARIO_POR_DIA = 3;

function idsValidos(lista) { return [...new Set((lista || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]; }
function fatiar(lista, n) { const out = []; for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n)); return out; }
function listaIn(request, prefixo, valores, tipo = sql.Int) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(",");
}
const numeroDoErro = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const duplicado = (e) => numeroDoErro(e) === 2627 || numeroDoErro(e) === 2601;
// DATE do banco vem como meia-noite UTC (a data é a do cadastro); instante (DATETIME2, em UTC) vira a data de Brasília.
const dataBr = (v) => (v instanceof Date ? hojeBrasilia(v) : mm.paraIso(v));
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
function chaveMensal(hoje) { const [a, m] = hoje.split("-").map(Number); return (a - 2000) * 12 + m; }

async function lerMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Email, m.DataNascimento, m.DataAdmissao, m.Status, m.SituacaoMembro, m.CongregacaoId, c.Nome AS CongregacaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}
const destinatarioDe = (m) => ({ membroId: m.MembroId, nome: m.Nome, email: m.Email });

// ---------------------------------------------------------------
// Prazos configuráveis
// ---------------------------------------------------------------

async function lerPrazos(pool) {
  const s = mm.SIGLAS_PRAZO;
  return {
    antecedentesDias: await lerPrazoDias(pool, s.antecedentesDias, mm.ANTECEDENTES_DIAS_PADRAO),
    treinamentoDias: await lerPrazoDias(pool, s.treinamentoDias, mm.TREINAMENTO_DIAS_PADRAO),
    fichaDias: await lerPrazoDias(pool, s.fichaDias, mm.FICHA_DIAS_PADRAO),
    adultosMinimos: await lerPrazoDias(pool, s.adultosMinimos, mm.ADULTOS_MINIMOS_PADRAO)
  };
}
async function lerPrazosFaixas(pool) {
  const out = {};
  for (const [codigo, f] of Object.entries(mm.FAIXAS)) out[codigo] = await lerPrazoDias(pool, f.sigla, f.padrao);
  return out;
}

// ---------------------------------------------------------------
// Os fatos de cada pessoa
// ---------------------------------------------------------------

function esteiraDe(h, hoje) {
  if (!h) return { existe: false };
  const validoAte = mm.paraIso(h.aptoValidoAte);
  let status;
  if (h.inaptoEm) status = "INAPTO";
  else if (!habMod.todasEtapasConcluidas(h)) status = "PENDENTE";
  else if (validoAte && hoje > validoAte) status = "VENCIDO";
  else status = "APTO";
  const prox = habMod.proximaEtapaPendente(h);
  return { existe: true, status, proximaEtapaTitulo: prox ? habMod.TITULO_ETAPA[prox] : null, validoAte };
}

// Treinamento pela trilha (v6.9) quando há requisito BLOQUEIA configurado para a habilitação; senão, a atestação da esteira (com validade).
function treinamentoDeTrilha(reqs, mapa, membroId) {
  const avs = reqs.map((r) => trilhas.avaliarRequisito({ requisito: r, melhor: trilhas.escolherMelhor(mapa.get(`${membroId}|${r.trilhaId}`) || []) }));
  const validades = avs.map((a) => a.validoAte).filter(Boolean).sort();
  if (avs.every((a) => a.ok)) return { modo: "TRILHA", situacao: "VIGENTE", validoAte: validades[0] || null };
  if (avs.some((a) => a.situacao === "VENCIDA")) return { modo: "TRILHA", situacao: "VENCIDA", validoAte: validades[0] || null };
  return { modo: "TRILHA", situacao: "AUSENTE", validoAte: null };
}

async function carregarFatos(pool, membroIds, { hoje = hojeBrasilia() } = {}) {
  const todos = idsValidos(membroIds);
  const fatos = new Map();
  for (const id of todos) {
    fatos.set(id, { membro: {}, esteira: { existe: false }, vistoria: null, treinamento: null, fichaEm: null, politicaVersaoAceita: null,
      politicaVersaoVigente: mm.POLITICA_VERSAO, autoDenunciaAberta: false, cadastroNacional: null });
  }
  if (!todos.length) return fatos;
  const reqs = (await trilhas.listarRequisitos(pool, { contexto: "HABILITACAO_TREINAMENTO" }))
    .filter((r) => r.ativo && r.trilhaAtiva && r.modo === "BLOQUEIA" && trilhas.alvoCorresponde(r.alvoChave, ""));

  for (const lote of fatiar(todos, LIMITE_IN)) {
    let rq = pool.request();
    const membros = (await rq.query(`SELECT MembroId, DataNascimento, DataAdmissao, Status, SituacaoMembro FROM MembroReferencia WHERE MembroId IN (${listaIn(rq, "m", lote)})`)).recordset;
    for (const r of membros) fatos.get(r.MembroId).membro = { dataNascimento: mm.paraIso(r.DataNascimento), dataAdmissao: mm.paraIso(r.DataAdmissao), status: r.Status, situacao: r.SituacaoMembro };

    rq = pool.request();
    const habs = (await rq.query(`SELECT * FROM VoluntariosHabilitacao WHERE MembroId IN (${listaIn(rq, "m", lote)})`)).recordset;
    const habPorMembro = new Map();
    for (const row of habs) habPorMembro.set(row.MembroId, habMod.mapearHabilitacao(row));

    rq = pool.request();
    const vistorias = (await rq.query(`
      SELECT v.VistoriaId, v.MembroId, v.Resultado, v.DataVerificacao FROM VistoriasAntecedentes v
      WHERE v.MembroId IN (${listaIn(rq, "m", lote)}) AND NOT EXISTS (SELECT 1 FROM VistoriasAnulacoes an WHERE an.VistoriaId = v.VistoriaId)
      ORDER BY v.MembroId, v.VistoriaId DESC`)).recordset;
    const ultimaVistoria = new Map();
    for (const v of vistorias) if (!ultimaVistoria.has(v.MembroId)) ultimaVistoria.set(v.MembroId, v);
    const docsPorVistoria = new Map();
    const idsVistoria = [...ultimaVistoria.values()].map((v) => v.VistoriaId);
    if (idsVistoria.length) {
      rq = pool.request();
      const docs = (await rq.query(`SELECT VistoriaId, Tipo, DataEmissao FROM VistoriasDocumentos WHERE VistoriaId IN (${listaIn(rq, "v", idsVistoria)})`)).recordset;
      for (const d of docs) {
        if (!docsPorVistoria.has(d.VistoriaId)) docsPorVistoria.set(d.VistoriaId, []);
        docsPorVistoria.get(d.VistoriaId).push({ tipo: d.Tipo, dataEmissao: mm.paraIso(d.DataEmissao) });
      }
    }

    const situacoes = reqs.length ? await trilhas.carregarSituacoes(pool, { membroIds: lote, trilhaIds: reqs.map((r) => r.trilhaId), hojeIso: hoje }) : null;

    rq = pool.request();
    const politicas = (await rq.query(`SELECT MembroId, MAX(Versao) AS V FROM MinisterioMenoresPoliticaAceites WHERE MembroId IN (${listaIn(rq, "m", lote)}) GROUP BY MembroId`)).recordset;
    const versaoPorMembro = new Map(politicas.map((p) => [p.MembroId, p.V]));

    rq = pool.request();
    const abertas = new Set((await rq.query(`
      SELECT DISTINCT MembroId FROM MinisterioMenoresAutoDenuncias
      WHERE MembroId IN (${listaIn(rq, "m", lote)}) AND (Decisao IS NULL OR (Decisao = 'AFASTADO_PREVENTIVAMENTE' AND LiberadoEm IS NULL))`)).recordset.map((x) => x.MembroId));

    rq = pool.request();
    const cadastro = (await rq.query(`
      SELECT x.MembroId, x.Resultado FROM (SELECT MembroId, Resultado, ROW_NUMBER() OVER (PARTITION BY MembroId ORDER BY ConsultaId DESC) AS rn
      FROM MinisterioMenoresCadastroNacional WHERE MembroId IN (${listaIn(rq, "m", lote)})) x WHERE x.rn = 1`)).recordset;
    const cadastroPorMembro = new Map(cadastro.map((c) => [c.MembroId, c.Resultado]));

    for (const id of lote) {
      const f = fatos.get(id);
      const h = habPorMembro.get(id) || null;
      f.esteira = esteiraDe(h, hoje);
      const v = ultimaVistoria.get(id);
      f.vistoria = v ? { vistoriaId: v.VistoriaId, resultado: v.Resultado, dataVerificacao: mm.paraIso(v.DataVerificacao), documentos: docsPorVistoria.get(v.VistoriaId) || [] } : null;
      f.treinamento = reqs.length ? treinamentoDeTrilha(reqs, situacoes, id) : { modo: "MANUAL", atestadoEm: h ? dataBr(h.etapaTreinamentoEm) : null };
      f.fichaEm = h ? [dataBr(h.fichaAtualizadaEm), dataBr(h.etapaFichaInscricaoEm)].filter(Boolean).sort().pop() || null : null;
      f.politicaVersaoAceita = versaoPorMembro.has(id) ? versaoPorMembro.get(id) : null;
      f.autoDenunciaAberta = abertas.has(id);
      f.cadastroNacional = cadastroPorMembro.get(id) || null;
      f.habilitacaoId = h ? h.habilitacaoId : null;
    }
  }
  return fatos;
}

// Aptidão de cada pessoa (Map membroId -> resultado de mm.avaliarAptidao, com o habilitacaoId junto para os avisos).
async function aptidaoEmLote(pool, membroIds, { hoje = hojeBrasilia(), prazos = null } = {}) {
  const p = prazos || await lerPrazos(pool);
  const fatos = await carregarFatos(pool, membroIds, { hoje });
  const mapa = new Map();
  for (const [id, f] of fatos) mapa.set(id, { ...mm.avaliarAptidao(f, { hoje, prazos: p }), habilitacaoId: f.habilitacaoId || null, fatos: f });
  return mapa;
}

async function aptidaoDe(pool, membroId, opcoes) {
  return (await aptidaoEmLote(pool, [membroId], opcoes)).get(Number(membroId)) || null;
}

// A equipe tem contato com menores? (a marca da v5.7). Fora delas, nada muda: todos passam.
async function equipeComMenores(pool, equipeId) {
  const r = await pool.request().input("e", sql.Int, equipeId).query(`SELECT ContatoComMenores FROM EscalasEquipes WHERE EquipeId = @e`);
  return !!(r.recordset[0] && r.recordset[0].ContatoComMenores);
}

function motivoCurto(aptidao) {
  const b = mm.mascararParaGestao(aptidao.bloqueios)[0];
  return `habilitação para servir com menores pendente (${(mm.ROTULO_BLOQUEIO[b.codigo] || b.codigo).toLowerCase()})`;
}

// O portão que as escalas usam: quem, dentre `membroIds`, pode ser escalado na equipe. Equipe sem a marca de menores libera todos.
// `bloqueados`: membroId -> motivo curto (sem o detalhe de pendência com a Diretoria).
async function aptosParaEquipe(pool, { equipeId, membroIds, hoje = hojeBrasilia() }) {
  const ids = idsValidos(membroIds);
  if (!ids.length || !(await equipeComMenores(pool, equipeId))) return { contatoComMenores: false, aptos: new Set(ids), bloqueados: new Map() };
  const aptidoes = await aptidaoEmLote(pool, ids, { hoje });
  const aptos = new Set(), bloqueados = new Map();
  for (const id of ids) {
    const a = aptidoes.get(id);
    if (a && a.apto) aptos.add(id); else bloqueados.set(id, a ? motivoCurto(a) : "habilitação para servir com menores pendente");
  }
  return { contatoComMenores: true, aptos, bloqueados };
}

// "Pode servir nesta equipe?" para quem responde, confirma ou assume uma troca. Quem lê a resposta define o quanto ela diz:
//   PROPRIO — a própria pessoa: vê o que falta, com todas as letras;
//   LIDER   — o líder que aprova a troca: vê o motivo curto, sem o detalhe de pendência com a Diretoria;
//   COLEGA  — o colega que pede a troca: nada além de "não pode" (a situação de habilitação de um voluntário não é assunto de outro voluntário).
async function conferirParaServir(pool, { equipeId, membroId, visao = "COLEGA", hoje = hojeBrasilia() }) {
  const p = await aptosParaEquipe(pool, { equipeId, membroIds: [membroId], hoje });
  if (!p.contatoComMenores || p.aptos.has(Number(membroId))) return { ok: true };
  if (visao === "PROPRIO") {
    const ap = await aptidaoDe(pool, membroId, { hoje });
    const primeiro = ap && ap.bloqueios[0];
    return { ok: false, mensagem: `Você ainda não está habilitado para servir com menores nesta equipe${primeiro ? `: ${primeiro.mensagem}` : "."}` };
  }
  if (visao === "LIDER") return { ok: false, mensagem: `O voluntário não pode assumir esta escala: ${p.bloqueados.get(Number(membroId))}.` };
  return { ok: false, mensagem: "O voluntário destino não pode assumir esta escala." };
}

// Os antecedentes da esteira (a etapa só fecha com certidões válidas). Menor de 18 anos é dispensado: não existe certidão de antecedentes para ele.
async function antecedentesDe(pool, membroId, { hoje = hojeBrasilia() } = {}) {
  const f = (await carregarFatos(pool, [membroId], { hoje })).get(Number(membroId));
  if (!f) return { situacao: "AUSENTE", faltam: [...mm.CERTIDOES_CRIMINAIS] };
  const idade = f.membro.dataNascimento ? vol.idadeEmAnos(f.membro.dataNascimento, hoje) : null;
  if (idade != null && idade < mm.MAIORIDADE) return { situacao: "DISPENSADO", faltam: [] };
  return mm.avaliarAntecedentes(f.vistoria, { hoje, validadeDias: (await lerPrazos(pool)).antecedentesDias });
}

// ---------------------------------------------------------------
// Salas: dois adultos e proporção
// ---------------------------------------------------------------

// Confere as salas com menores de uma lista de serviços. Só entram as equipes com a marca de menores que têm ao menos uma pessoa segurando o posto.
async function salasDosServicos(pool, servicoIds, { hoje = hojeBrasilia() } = {}) {
  const ids = idsValidos(servicoIds);
  if (!ids.length) return [];
  const rq = pool.request();
  const alocs = (await rq.query(`
    SELECT a.ServicoId, a.EquipeId, a.MembroId, m.Nome AS MembroNome, e.Nome AS EquipeNome, e.FaixaEtariaMenores, e.LiderMembroId, e.CongregacaoId, s.DataHora, s.Status AS ServicoStatus
    FROM EscalasAlocacoes a JOIN EscalasEquipes e ON e.EquipeId = a.EquipeId JOIN EscalasServicos s ON s.ServicoId = a.ServicoId JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE a.ServicoId IN (${listaIn(rq, "s", ids)}) AND a.Status IN (${STATUS_ATIVOS_SQL}) AND e.ContatoComMenores = 1`)).recordset;
  if (!alocs.length) return [];
  const rq2 = pool.request();
  const previstas = new Map((await rq2.query(`SELECT ServicoId, EquipeId, CriancasPrevistas FROM MinisterioMenoresSalas WHERE ServicoId IN (${listaIn(rq2, "s", ids)})`)).recordset
    .map((x) => [`${x.ServicoId}|${x.EquipeId}`, x.CriancasPrevistas]));
  const prazos = await lerPrazos(pool);
  const faixas = await lerPrazosFaixas(pool);
  const aptidoes = await aptidaoEmLote(pool, alocs.map((a) => a.MembroId), { hoje, prazos });
  const grupos = new Map();
  for (const a of alocs) {
    const chave = `${a.ServicoId}|${a.EquipeId}`;
    if (!grupos.has(chave)) grupos.set(chave, { servicoId: a.ServicoId, equipeId: a.EquipeId, equipeNome: a.EquipeNome, faixa: a.FaixaEtariaMenores || null, liderMembroId: a.LiderMembroId,
      congregacaoId: a.CongregacaoId, dataHora: a.DataHora, servicoStatus: a.ServicoStatus, membros: [] });
    grupos.get(chave).membros.push({ membroId: a.MembroId, nome: a.MembroNome });
  }
  const saida = [];
  for (const g of grupos.values()) {
    let adultos = 0;
    const semHabilitacao = [];
    for (const m of g.membros) {
      const ap = aptidoes.get(m.membroId);
      if (!ap || !ap.apto) semHabilitacao.push(m.nome);
      else if (ap.contaComoAdulto) adultos++;
    }
    const criancasPrevistas = previstas.has(`${g.servicoId}|${g.equipeId}`) ? previstas.get(`${g.servicoId}|${g.equipeId}`) : null;
    const avaliacao = mm.avaliarSala({ equipeNome: g.equipeNome, faixa: g.faixa, criancasPrevistas, adultos, semHabilitacao,
      adultosMinimos: prazos.adultosMinimos, criancasPorAdulto: g.faixa ? mm.criancasPorAdulto(g.faixa, faixas) : null });
    saida.push({ ...g, criancasPrevistas, adultos, avaliacao });
  }
  return saida;
}

// O portão da publicação: o serviço só vai ao ar se TODA sala com menores tem adultos habilitados em número suficiente.
async function avaliarPublicacao(pool, servicoId, { hoje = hojeBrasilia() } = {}) {
  const salas = await salasDosServicos(pool, [servicoId], { hoje });
  const problemas = [];
  for (const s of salas) for (const p of s.avaliacao.problemas) problemas.push({ equipeId: s.equipeId, equipeNome: s.equipeNome, codigo: p.codigo, mensagem: p.mensagem });
  return {
    ok: problemas.length === 0,
    salas: salas.map((s) => ({ equipeId: s.equipeId, equipeNome: s.equipeNome, faixa: s.faixa, criancasPrevistas: s.criancasPrevistas, adultos: s.adultos, necessarios: s.avaliacao.necessarios, ok: s.avaliacao.ok })),
    problemas
  };
}

async function definirFaixaEquipe(pool, { equipeId, faixa, por }) {
  const v = mm.validarFaixa(faixa);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await pool.request().input("e", sql.Int, equipeId).input("f", sql.NVarChar(12), v.faixa).query(`UPDATE EscalasEquipes SET FaixaEtariaMenores = @f WHERE EquipeId = @e`);
  if (!r.rowsAffected || r.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Equipe não encontrada." };
  await registrarAuditoria({ tabela: "EscalasEquipes", registroId: equipeId, acao: "MENORES_FAIXA_DEFINIDA", usuarioId: por, dadosDepois: { faixa: v.faixa } });
  return { sucesso: true, faixa: v.faixa, mensagem: v.faixa ? `Faixa etária da equipe: ${mm.FAIXAS[v.faixa].rotulo}.` : "Faixa etária da equipe removida." };
}

// Quantas crianças a sala espera naquele serviço: o número com que a proporção é conferida.
async function definirCriancasPrevistas(pool, { servicoId, equipeId, criancas, por }) {
  const v = mm.validarCriancasPrevistas(criancas);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  await pool.request().input("s", sql.Int, servicoId).input("e", sql.Int, equipeId).input("c", sql.Int, v.criancas).input("por", sql.Int, por).query(`
    MERGE MinisterioMenoresSalas WITH (HOLDLOCK) AS t USING (SELECT @s AS ServicoId, @e AS EquipeId) AS o ON t.ServicoId = o.ServicoId AND t.EquipeId = o.EquipeId
    WHEN MATCHED THEN UPDATE SET CriancasPrevistas = @c, DefinidoPorMembroId = @por, DefinidoEm = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (ServicoId, EquipeId, CriancasPrevistas, DefinidoPorMembroId) VALUES (@s, @e, @c, @por);`);
  await registrarAuditoria({ tabela: "MinisterioMenoresSalas", registroId: servicoId, acao: "MENORES_CRIANCAS_PREVISTAS", usuarioId: por, dadosDepois: { equipeId, criancas: v.criancas } });
  return { sucesso: true, criancas: v.criancas, mensagem: `Crianças previstas: ${v.criancas}.` };
}

async function criancasPrevistasDoServico(pool, servicoId) {
  const r = await pool.request().input("s", sql.Int, servicoId).query(`SELECT EquipeId, CriancasPrevistas FROM MinisterioMenoresSalas WHERE ServicoId = @s`);
  return r.recordset.map((x) => ({ equipeId: x.EquipeId, criancasPrevistas: x.CriancasPrevistas }));
}

// ---------------------------------------------------------------
// A retirada automática: quem não está apto sai das escalas futuras das equipes com menores
// ---------------------------------------------------------------

async function lerEmail(pool, membroId) {
  const m = await lerMembro(pool, membroId);
  return m ? destinatarioDe(m) : null;
}

// `membroId`: reavalia só uma pessoa (logo depois de um ato da Diretoria); sem ele, é a rotina diária sobre todos.
async function retirarInaptosDasEscalas(pool, { hoje = hojeBrasilia(), membroId = null, equipeId = null, deps } = {}) {
  const vdb = require("./voluntariadoDb");
  const rq = pool.request().input("hoje", sql.Date, hoje);
  let filtro = "";
  if (membroId) { rq.input("m", sql.Int, membroId); filtro += " AND a.MembroId = @m"; }
  if (equipeId) { rq.input("eq", sql.Int, equipeId); filtro += " AND a.EquipeId = @eq"; }
  const linhas = (await rq.query(`
    SELECT a.AlocacaoId, a.ServicoId, a.EquipeId, a.MembroId, a.Status, s.DataHora, s.Descricao, e.Nome AS EquipeNome, e.LiderMembroId, e.CongregacaoId
    FROM EscalasAlocacoes a JOIN EscalasServicos s ON s.ServicoId = a.ServicoId JOIN EscalasEquipes e ON e.EquipeId = a.EquipeId
    WHERE a.Status IN (${STATUS_ATIVOS_SQL}) AND s.Status <> 'CANCELADA' AND CAST(s.DataHora AS DATE) >= @hoje AND e.ContatoComMenores = 1${filtro}`)).recordset;
  if (!linhas.length) return { retirados: 0, alocacoes: 0 };

  const aptidoes = await aptidaoEmLote(pool, linhas.map((l) => l.MembroId), { hoje });
  const pares = new Map();
  for (const l of linhas) {
    const ap = aptidoes.get(l.MembroId);
    if (ap && ap.apto) continue;
    const chave = `${l.MembroId}|${l.EquipeId}`;
    if (!pares.has(chave)) pares.set(chave, { membroId: l.MembroId, equipeId: l.EquipeId, equipeNome: l.EquipeNome, liderMembroId: l.LiderMembroId, alocacoes: [],
      motivos: ap ? ap.bloqueios.map((b) => b.codigo) : ["SEM_HABILITACAO"] });
    pares.get(chave).alocacoes.push({ alocacaoId: l.AlocacaoId, servicoId: l.ServicoId, equipeId: l.EquipeId, dataHora: l.DataHora });
  }
  if (!pares.size) return { retirados: 0, alocacoes: 0 };

  const feitos = [];
  for (const par of pares.values()) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let retiradaId;
    try {
      // Relê, com trava, quais escalas ainda estão vivas: se uma varredura concorrente (a rotina diária e um ato da Diretoria ao mesmo tempo) já as desmarcou,
      // esta não registra a retirada nem avisa de novo.
      const rv = new sql.Request(transaction);
      const vivas = new Set((await rv.query(`SELECT AlocacaoId FROM EscalasAlocacoes WITH (UPDLOCK, HOLDLOCK) WHERE AlocacaoId IN (${listaIn(rv, "a", par.alocacoes.map((a) => a.alocacaoId))}) AND Status IN (${STATUS_ATIVOS_SQL})`)).recordset.map((x) => x.AlocacaoId));
      par.alocacoes = par.alocacoes.filter((a) => vivas.has(a.alocacaoId));
      if (!par.alocacoes.length) { await fecharTransacao(transaction, false); continue; }
      await vdb.cancelarAlocacoes(transaction, { alocacoes: par.alocacoes, membroId: par.membroId, por: null, de: hoje, equipeIds: [par.equipeId] });
      const ins = await new sql.Request(transaction).input("m", sql.Int, par.membroId).input("e", sql.Int, par.equipeId).input("mot", sql.NVarChar(200), par.motivos.join(",").slice(0, 200))
        .input("n", sql.Int, par.alocacoes.length)
        .query(`INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, Motivos, AlocacoesCanceladas) VALUES (@m, @e, @mot, @n); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
      retiradaId = ins.recordset[0].id;
      await transaction.commit();
    } catch (e) { await fecharTransacao(transaction, false); throw e; }
    // A trilha de auditoria é imutável e lida por quem tem "auditoria": nada dos motivos (podem ser pendência com a Diretoria) — só quem, onde e quantas.
    await registrarAuditoria({ tabela: "MinisterioMenoresRetiradas", registroId: retiradaId, acao: "MENORES_RETIRADO_DA_ESCALA", usuarioId: null,
      dadosDepois: { membroId: par.membroId, equipeId: par.equipeId, alocacoesCanceladas: par.alocacoes.length } });
    feitos.push({ ...par, retiradaId });
  }

  // Avisos: um por pessoa (listando as equipes) e um ao líder de cada equipe. Nenhum cita o motivo.
  const porMembro = new Map();
  for (const f of feitos) { if (!porMembro.has(f.membroId)) porMembro.set(f.membroId, []); porMembro.get(f.membroId).push(f); }
  for (const [id, lista] of porMembro) {
    const pessoa = await lerEmail(pool, id);
    if (pessoa) {
      await notificarAgora(pool, { regraChave: "MENORES_RETIRADO_DA_ESCALA", destinatarios: [pessoa],
        mensagem: mm.textoRetiradaPessoa({ equipes: lista.map((x) => x.equipeNome), nEscalas: lista.reduce((s, x) => s + x.alocacoes.length, 0) }),
        referenciaId: lista[0].retiradaId, referenciaTabela: "MinisterioMenoresRetiradas", limiteDia: AVISOS_AO_VOLUNTARIO_POR_DIA, deps });
    }
    for (const f of lista) {
      if (!f.liderMembroId || f.liderMembroId === id) continue;
      const lider = await lerEmail(pool, f.liderMembroId);
      if (!lider) continue;
      await notificarAgora(pool, { regraChave: "MENORES_VAGA_ABERTA", destinatarios: [lider],
        mensagem: mm.textoVagaAberta({ nome: pessoa ? pessoa.nome : "Um voluntário", equipe: f.equipeNome, nEscalas: f.alocacoes.length }),
        referenciaId: f.retiradaId, referenciaTabela: "MinisterioMenoresRetiradas", deps });
    }
  }
  return { retirados: porMembro.size, alocacoes: feitos.reduce((s, f) => s + f.alocacoes.length, 0) };
}

// ---------------------------------------------------------------
// Quem serve com menores: a base do painel e dos avisos
// ---------------------------------------------------------------

// Membros ativos de equipes ativas com a marca de menores, com as equipes onde servem. `congregacaoIds`: null = todas.
async function voluntariosComMenores(pool, { congregacaoIds = null } = {}) {
  const rq = pool.request();
  let filtro = "";
  if (congregacaoIds) {
    if (!congregacaoIds.length) return [];
    filtro = ` AND e.CongregacaoId IN (${listaIn(rq, "c", congregacaoIds)})`;
  }
  const r = await rq.query(`
    SELECT em.MembroId, m.Nome, e.CongregacaoId, c.Nome AS CongregacaoNome, e.EquipeId, e.Nome AS EquipeNome, e.LiderMembroId
    FROM EscalasEquipeMembros em JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId AND e.Ativa = 1 AND e.ContatoComMenores = 1
    JOIN MembroReferencia m ON m.MembroId = em.MembroId JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE em.Ativo = 1${filtro} ORDER BY c.Nome, m.Nome`);
  const porMembro = new Map();
  for (const x of r.recordset) {
    if (!porMembro.has(x.MembroId)) porMembro.set(x.MembroId, { membroId: x.MembroId, nome: x.Nome, congregacaoId: x.CongregacaoId, congregacaoNome: x.CongregacaoNome, equipes: [] });
    porMembro.get(x.MembroId).equipes.push({ equipeId: x.EquipeId, nome: x.EquipeNome, liderMembroId: x.LiderMembroId });
  }
  return [...porMembro.values()];
}

async function linhasDoPainel(pool, { congregacaoIds = null, hoje = hojeBrasilia() } = {}) {
  const pessoas = await voluntariosComMenores(pool, { congregacaoIds });
  const aptidoes = await aptidaoEmLote(pool, pessoas.map((p) => p.membroId), { hoje });
  return pessoas.map((p) => ({ ...p, aptidao: aptidoes.get(p.membroId) }));
}

// O painel de conformidade: o campo inteiro para a Secretaria Geral, a congregação para o dirigente. `reservado` = quem é da Diretoria (vê o motivo de
// uma pendência com ela); os demais veem só "pendência com a Diretoria".
async function painel(pool, { congregacaoIds = null, reservado = false, hoje = hojeBrasilia() } = {}) {
  const linhas = await linhasDoPainel(pool, { congregacaoIds, hoje });
  const itens = linhas.map((l) => {
    const status = mm.statusDaLinha(l.aptidao);
    return {
      membroId: l.membroId, nome: l.nome, congregacaoId: l.congregacaoId, congregacaoNome: l.congregacaoNome, equipes: l.equipes.map((e) => e.nome),
      status, bloqueios: mm.bloqueiosParaPainel(l.aptidao.bloqueios, { reservado }), proximoVencimento: l.aptidao.proximoVencimento,
      validades: reservado ? l.aptidao.validades : mm.validadesParaGestao(l.aptidao.validades)
    };
  }).sort((a, b) => ({ BLOQUEADO: 0, VENCENDO: 1, APTO: 2 }[a.status] - { BLOQUEADO: 0, VENCENDO: 1, APTO: 2 }[b.status]) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  return { resumo: mm.resumirPainel(linhas, { reservado }), porCongregacao: mm.agruparPorCongregacao(linhas, { reservado }), voluntarios: itens };
}

// ---------------------------------------------------------------
// A situação da própria pessoa (Meu Painel)
// ---------------------------------------------------------------

async function minhaSituacao(pool, membroId, { hoje = hojeBrasilia() } = {}) {
  const ap = await aptidaoDe(pool, membroId, { hoje });
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.EquipeId, e.Nome FROM EscalasEquipeMembros em JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId AND e.Ativa = 1 AND e.ContatoComMenores = 1 WHERE em.MembroId = @m AND em.Ativo = 1 ORDER BY e.Nome`);
  const politicaAceita = ap.fatos.politicaVersaoAceita != null && ap.fatos.politicaVersaoAceita >= mm.POLITICA_VERSAO;
  const aberta = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 1 AutoDenunciaId, Tipo, DataCiencia, DeclaradaEm, Decisao, DecididaEm, LiberadoEm FROM MinisterioMenoresAutoDenuncias WHERE MembroId = @m ORDER BY AutoDenunciaId DESC`)).recordset[0];
  return {
    apto: ap.apto, contaComoAdulto: ap.contaComoAdulto, bloqueios: ap.bloqueios, validades: ap.validades, proximoVencimento: ap.proximoVencimento,
    equipes: r.recordset.map((x) => ({ equipeId: x.EquipeId, nome: x.Nome })),
    habilitacaoAberta: ap.fatos.esteira.existe,
    politica: { vigente: { versao: mm.POLITICA_VERSAO }, aceita: politicaAceita },
    autoDenuncia: aberta ? {
      autoDenunciaId: aberta.AutoDenunciaId, tipo: aberta.Tipo, tipoRotulo: mm.TIPOS_AUTODENUNCIA[aberta.Tipo], dataCiencia: mm.paraIso(aberta.DataCiencia), declaradaEm: isoInstante(aberta.DeclaradaEm),
      decisao: aberta.Decisao || null, decisaoRotulo: aberta.Decisao ? mm.DECISOES_AUTODENUNCIA[aberta.Decisao] : null, decididaEm: isoInstante(aberta.DecididaEm), liberadoEm: isoInstante(aberta.LiberadoEm),
      emAnalise: !aberta.Decisao
    } : null
  };
}

// ---------------------------------------------------------------
// Política de comunicação com menores
// ---------------------------------------------------------------

async function aceitarPolitica(pool, { membroId, aceito, textoHash, ip, cadeia = null }) {
  const v = mm.validarAceitePolitica({ aceito });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  if (!ip) return { sucesso: false, mensagem: "Não foi possível identificar a origem da sua conexão, e o aceite digital precisa registrá-la. Tente de novo pela rede de casa ou do celular, ou peça à Secretaria para registrar o aceite em ficha." };
  if (typeof textoHash !== "string" || textoHash.trim().toLowerCase() !== mm.POLITICA_HASH) return { sucesso: false, politicaMudou: true, mensagem: "O texto da política mudou desde que você abriu a tela (ou a tela está desatualizada): recarregue e leia de novo antes de aceitar." };
  try {
    const r = await pool.request().input("m", sql.Int, membroId).input("v", sql.Int, mm.POLITICA_VERSAO).input("h", sql.NVarChar(64), mm.POLITICA_HASH).input("ip", sql.NVarChar(45), ip).input("c", sql.NVarChar(400), cadeia ? String(cadeia).slice(0, 400) : null)
      .query(`INSERT INTO MinisterioMenoresPoliticaAceites (MembroId, Versao, TextoHash, Forma, EnderecoIp, CadeiaCabecalhos) VALUES (@m, @v, @h, 'CLICKWRAP', @ip, @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    await registrarAuditoria({ tabela: "MinisterioMenoresPoliticaAceites", registroId: r.recordset[0].id, acao: "MENORES_POLITICA_ACEITA", usuarioId: membroId, dadosDepois: { versao: mm.POLITICA_VERSAO } });
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: "Você já aceitou esta versão da política." };
    throw e;
  }
  return { sucesso: true, mensagem: "Política aceita. Obrigado por proteger as crianças e os adolescentes." };
}

// Aceite em ficha assinada, registrado pela Secretaria (quem não tem como aceitar pela internet). Quem registra não é quem aceita.
async function registrarPoliticaManual(pool, { membroId, referencia, por }) {
  const ref = typeof referencia === "string" ? referencia.trim() : "";
  if (ref.length < 3 || ref.length > 200 || /[<>]/.test(ref)) return { sucesso: false, mensagem: "Informe onde a ficha assinada está arquivada (de 3 a 200 caracteres, sem < ou >), por exemplo: Pasta 3, ficha 12." };
  if (Number(membroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Ninguém registra o próprio aceite em ficha: peça a outra pessoa da Secretaria." };
  const m = await lerMembro(pool, membroId);
  if (!m) return { sucesso: false, mensagem: "Pessoa não encontrada." };
  try {
    const r = await pool.request().input("m", sql.Int, membroId).input("v", sql.Int, mm.POLITICA_VERSAO).input("h", sql.NVarChar(64), mm.POLITICA_HASH).input("ref", sql.NVarChar(200), ref).input("por", sql.Int, por)
      .query(`INSERT INTO MinisterioMenoresPoliticaAceites (MembroId, Versao, TextoHash, Forma, Referencia, RegistradoPorMembroId) VALUES (@m, @v, @h, 'FICHA_FISICA', @ref, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    await registrarAuditoria({ tabela: "MinisterioMenoresPoliticaAceites", registroId: r.recordset[0].id, acao: "MENORES_POLITICA_REGISTRADA", usuarioId: por, dadosDepois: { membroId, versao: mm.POLITICA_VERSAO, referenciaTamanho: ref.length } });
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: "Esta pessoa já aceitou esta versão da política." };
    throw e;
  }
  return { sucesso: true, mensagem: `Aceite de ${m.Nome} registrado em ficha.` };
}

// ---------------------------------------------------------------
// Ficha cadastral atualizada (semestral)
// ---------------------------------------------------------------

async function confirmarFicha(pool, { membroId, por, confirmo }) {
  const v = mm.validarConfirmacaoFicha({ confirmo });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const hab = await habMod.buscarHabilitacaoPorMembro(pool, membroId);
  if (!hab) return { sucesso: false, mensagem: "A habilitação ainda não foi aberta: peça à Secretaria da congregação para iniciá-la." };
  await pool.request().input("id", sql.Int, hab.habilitacaoId).query(`UPDATE VoluntariosHabilitacao SET FichaAtualizadaEm = SYSUTCDATETIME(), AtualizadoEm = SYSUTCDATETIME() WHERE HabilitacaoId = @id`);
  await registrarAuditoria({ tabela: "VoluntariosHabilitacao", registroId: hab.habilitacaoId, acao: "MENORES_FICHA_CONFIRMADA", usuarioId: por, dadosDepois: { membroId } });
  return { sucesso: true, mensagem: "Ficha confirmada. Ela vale por mais 6 meses." };
}

// ---------------------------------------------------------------
// Auto-denúncia (Regimento Art. 133 §5º, V)
// ---------------------------------------------------------------

async function diretoria(pool) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  // Só quem tem a permissão num papel de nível GLOBAL (a Diretoria Executiva e o Conselho de Ética): o aviso cita o nome de quem se comunicou.
  return (await resolverDestinatariosPorPermissao(pool, { permissao: "vistoria_antecedentes", nivel: "GLOBAL" })).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
}

async function declararAutoDenuncia(pool, { membroId, dados, hoje = hojeBrasilia(), deps }) {
  const v = mm.validarAutoDenuncia(dados, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const m = await lerMembro(pool, membroId);
  if (!m) return { sucesso: false, mensagem: "Pessoa não encontrada." };
  // Uma comunicação em aberto por vez: o que a Diretoria precisa é decidir, não receber a mesma coisa repetida.
  const aberta = (await pool.request().input("m", sql.Int, membroId).query(`SELECT TOP 1 AutoDenunciaId FROM MinisterioMenoresAutoDenuncias WHERE MembroId = @m AND (Decisao IS NULL OR (Decisao = 'AFASTADO_PREVENTIVAMENTE' AND LiberadoEm IS NULL))`)).recordset[0];
  if (aberta) return { sucesso: false, mensagem: "Você já comunicou à Diretoria e a decisão ainda está pendente. Se houve fato novo, fale diretamente com a Diretoria Executiva." };
  const JA_COMUNICOU = { sucesso: false, mensagem: "Você já comunicou à Diretoria e a decisão ainda está pendente. Se houve fato novo, fale diretamente com a Diretoria Executiva." };
  let r;
  try {
    r = await pool.request().input("m", sql.Int, membroId).input("t", sql.NVarChar(20), v.dados.tipo).input("d", sql.Date, v.dados.dataCiencia)
      .query(`INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (@m, @t, @d); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
  } catch (e) {
    if (duplicado(e)) return JA_COMUNICOU;     // duas declarações ao mesmo tempo: a segunda bate no índice único (uma sem decisão por pessoa)
    throw e;
  }
  const id = r.recordset[0].id;
  // A trilha só diz que houve a comunicação: nem o tipo nem a data (quem lê a auditoria não é a Diretoria).
  await registrarAuditoria({ tabela: "MinisterioMenoresAutoDenuncias", registroId: id, acao: "MENORES_AUTODENUNCIA", usuarioId: membroId, dadosDepois: {} });
  // Por cautela, o contato com menores já fica suspenso (a aptidão enxerga a comunicação em aberto): tira das escalas futuras agora, sem esperar a rotina.
  const retirada = await retirarInaptosDasEscalas(pool, { hoje, membroId, deps });
  const dir = await diretoria(pool);
  if (dir.length) await notificarAgora(pool, { regraChave: "MENORES_AUTODENUNCIA", destinatarios: dir, mensagem: mm.textoAutoDenuncia({ nome: m.Nome, tipo: v.dados.tipo }), referenciaId: id, referenciaTabela: "MinisterioMenoresAutoDenuncias", deps });
  await notificarAgora(pool, { regraChave: "MENORES_AUTODENUNCIA_DECIDIDA", destinatarios: [destinatarioDe(m)], mensagem: mm.textoAutoDenunciaPessoa(), referenciaId: id * 2, referenciaTabela: "MinisterioMenoresAutoDenuncias", limiteDia: 2, deps });
  return { sucesso: true, autoDenunciaId: id, escalasDesmarcadas: retirada.alocacoes, mensagem: "Comunicação recebida pela Diretoria Executiva. Obrigado por avisar. Por cautela, o seu contato com menores fica suspenso até a decisão, o que não é punição e não afeta os seus outros serviços." };
}

function mapearAutoDenuncia(x, { comPessoa = false } = {}) {
  return {
    autoDenunciaId: x.AutoDenunciaId, membroId: x.MembroId, ...(comPessoa ? { nome: x.Nome, congregacaoNome: x.CongregacaoNome || null } : {}),
    tipo: x.Tipo, tipoRotulo: mm.TIPOS_AUTODENUNCIA[x.Tipo], dataCiencia: mm.paraIso(x.DataCiencia), declaradaEm: isoInstante(x.DeclaradaEm),
    decisao: x.Decisao || null, decisaoRotulo: x.Decisao ? mm.DECISOES_AUTODENUNCIA[x.Decisao] : null, decididaEm: isoInstante(x.DecididaEm), decisaoObservacao: x.DecisaoObservacao || null,
    liberadoEm: isoInstante(x.LiberadoEm), liberacaoObservacao: x.LiberacaoObservacao || null,
    situacao: !x.Decisao ? "AGUARDANDO_DECISAO" : x.Decisao === "MANTIDO" ? "MANTIDO" : x.LiberadoEm ? "LIBERADO" : "AFASTADO"
  };
}

// A fila da Diretoria: as sem decisão e as de afastamento ainda não levantado primeiro.
async function listarAutoDenuncias(pool, { abertas = false, limite = 100 } = {}) {
  const filtro = abertas ? "WHERE (a.Decisao IS NULL OR (a.Decisao = 'AFASTADO_PREVENTIVAMENTE' AND a.LiberadoEm IS NULL))" : "";
  const r = await pool.request().input("lim", sql.Int, Math.min(Math.max(Number(limite) || 100, 1), 300)).query(`
    SELECT TOP (@lim) a.*, m.Nome, c.Nome AS CongregacaoNome FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m ON m.MembroId = a.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    ${filtro} ORDER BY CASE WHEN a.Decisao IS NULL THEN 0 WHEN a.Decisao = 'AFASTADO_PREVENTIVAMENTE' AND a.LiberadoEm IS NULL THEN 1 ELSE 2 END, a.AutoDenunciaId DESC`);
  return r.recordset.map((x) => mapearAutoDenuncia(x, { comPessoa: true }));
}

async function buscarAutoDenuncia(pool, id) {
  const r = await pool.request().input("id", sql.Int, id).query(`SELECT a.*, m.Nome, c.Nome AS CongregacaoNome FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m ON m.MembroId = a.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE a.AutoDenunciaId = @id`);
  return r.recordset[0] || null;
}

async function decidirAutoDenuncia(pool, { autoDenunciaId, dados, por, hoje = hojeBrasilia(), deps }) {
  const a = await buscarAutoDenuncia(pool, autoDenunciaId);
  if (!a) return { sucesso: false, mensagem: "Comunicação não encontrada." };
  const v = mm.validarDecisaoAutoDenuncia(dados, { atorId: por, membroId: a.MembroId });
  if (!v.valido) return { sucesso: false, proibido: v.proibido, mensagem: v.mensagem };
  if (a.Decisao) return { sucesso: false, mensagem: "Esta comunicação já foi decidida." };
  const u = await pool.request().input("id", sql.Int, autoDenunciaId).input("d", sql.NVarChar(26), v.dados.decisao).input("por", sql.Int, por).input("obs", sql.NVarChar(300), v.dados.observacao)
    .query(`UPDATE MinisterioMenoresAutoDenuncias SET Decisao = @d, DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME(), DecisaoObservacao = @obs WHERE AutoDenunciaId = @id AND Decisao IS NULL`);
  if (!u.rowsAffected || u.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Esta comunicação já foi decidida." };
  await registrarAuditoria({ tabela: "MinisterioMenoresAutoDenuncias", registroId: autoDenunciaId, acao: "MENORES_AUTODENUNCIA_DECIDIDA", usuarioId: por, dadosDepois: { observacaoTamanho: v.dados.observacao.length } });
  const pessoa = await lerEmail(pool, a.MembroId);
  if (pessoa) await notificarAgora(pool, { regraChave: "MENORES_AUTODENUNCIA_DECIDIDA", destinatarios: [pessoa], mensagem: mm.textoAutoDenunciaDecidida({ decisao: v.dados.decisao }), referenciaId: autoDenunciaId * 2 + 1, referenciaTabela: "MinisterioMenoresAutoDenuncias", limiteDia: 2, deps });
  return { sucesso: true, mensagem: v.dados.decisao === "MANTIDO" ? "Decisão registrada: a pessoa volta a poder servir com menores, desde que a habilitação esteja em dia." : "Decisão registrada: a pessoa fica afastada preventivamente do ministério com menores até a Diretoria levantar o afastamento." };
}

async function liberarAutoDenuncia(pool, { autoDenunciaId, dados, por, deps }) {
  const a = await buscarAutoDenuncia(pool, autoDenunciaId);
  if (!a) return { sucesso: false, mensagem: "Comunicação não encontrada." };
  const v = mm.validarLiberacaoAutoDenuncia(dados, { atorId: por, membroId: a.MembroId });
  if (!v.valido) return { sucesso: false, proibido: v.proibido, mensagem: v.mensagem };
  if (a.Decisao !== "AFASTADO_PREVENTIVAMENTE") return { sucesso: false, mensagem: "Só se levanta um afastamento preventivo já decidido." };
  if (a.LiberadoEm) return { sucesso: false, mensagem: "Este afastamento já foi levantado." };
  const u = await pool.request().input("id", sql.Int, autoDenunciaId).input("por", sql.Int, por).input("obs", sql.NVarChar(300), v.dados.observacao)
    .query(`UPDATE MinisterioMenoresAutoDenuncias SET LiberadoEm = SYSUTCDATETIME(), LiberadoPorMembroId = @por, LiberacaoObservacao = @obs WHERE AutoDenunciaId = @id AND Decisao = 'AFASTADO_PREVENTIVAMENTE' AND LiberadoEm IS NULL`);
  if (!u.rowsAffected || u.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Este afastamento já foi levantado." };
  await registrarAuditoria({ tabela: "MinisterioMenoresAutoDenuncias", registroId: autoDenunciaId, acao: "MENORES_AUTODENUNCIA_LIBERADA", usuarioId: por, dadosDepois: { observacaoTamanho: v.dados.observacao.length } });
  const pessoa = await lerEmail(pool, a.MembroId);
  if (pessoa) await notificarAgora(pool, { regraChave: "MENORES_AUTODENUNCIA_DECIDIDA", destinatarios: [pessoa], mensagem: mm.textoAutoDenunciaDecidida({ decisao: "MANTIDO" }), referenciaId: autoDenunciaId * 2 + 1000000, referenciaTabela: "MinisterioMenoresAutoDenuncias", limiteDia: 2, deps });
  return { sucesso: true, mensagem: "Afastamento levantado: a pessoa volta a poder servir com menores, desde que a habilitação esteja em dia." };
}

// ---------------------------------------------------------------
// Detectores diários (motor de avisos da vB.2)
// ---------------------------------------------------------------

async function gestoresDaCongregacao(pool, congregacaoId) {
  const psc = require("./psc");
  return (await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "habilitacao_voluntarios", congregacaoId })).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
}
function unicosPorMembro(lista) {
  const vistos = new Set();
  return lista.filter((d) => d && !vistos.has(d.membroId) && vistos.add(d.membroId));
}

// A escada de avisos de vencimento (60, 30 e 15 dias). Uma rodada por degrau, cada uma ligada à sua regra. Quem já está bloqueado não recebe aviso de vencimento
// (o aviso útil, então, é o do próprio bloqueio). A referência leva o ciclo de validade: a renovação reabre a escada.
async function detectarVencimentos(pool, { faixa, hoje = hojeBrasilia() } = {}) {
  const linhas = await linhasDoPainel(pool, { hoje });
  const fatos = [];
  for (const l of linhas) {
    const ap = l.aptidao;
    if (!ap || !ap.apto || !ap.habilitacaoId) continue;
    const itens = mm.itensAVencer(ap.validades, hoje).filter((i) => mm.faixaDeAlerta(i.dias) === faixa);
    if (!itens.length) continue;
    const proximo = itens[0];
    const referenciaId = mm.referenciaDoAviso(ap.habilitacaoId, proximo.data);
    const pessoa = await lerEmail(pool, l.membroId);
    if (pessoa) fatos.push({ referenciaId, destinatarios: [pessoa], fatoGerador: mm.textoVencendo({ itens, faixa }) });
    // Os líderes das equipes e a secretaria da congregação sabem com a mesma antecedência (não é só problema do voluntário).
    const lideres = [];
    for (const e of l.equipes) if (e.liderMembroId && e.liderMembroId !== l.membroId) { const d = await lerEmail(pool, e.liderMembroId); if (d) lideres.push(d); }
    const destinatarios = unicosPorMembro([...lideres, ...(await gestoresDaCongregacao(pool, l.congregacaoId))]).filter((d) => d.membroId !== l.membroId);
    if (destinatarios.length) {
      const lista = itens.map((i) => `${i.rotulo} (${mm.formatarDataBr(i.data)})`).join(", ");
      fatos.push({ referenciaId, destinatarios, fatoGerador: `Ministério com menores: a habilitação de ${l.nome} vence em até ${faixa} dias — ${lista}. Acompanhe a renovação: no dia do vencimento a pessoa sai automaticamente das escalas com menores.`.slice(0, 1000) });
    }
  }
  return fatos;
}

// Dois adultos por sala: confere os próximos dias. Avisa o líder da equipe e a secretaria da congregação UMA vez por (serviço, equipe).
async function detectarSalasSemSegundoAdulto(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, mm.SIGLAS_PRAZO.salaAlertaDias, mm.SALA_ALERTA_DIAS_PADRAO);
  const rq = pool.request().input("hoje", sql.Date, hoje).input("ate", sql.Date, mm.somarDiasIso(hoje, dias));
  const servicos = (await rq.query(`
    SELECT DISTINCT s.ServicoId FROM EscalasServicos s JOIN EscalasAlocacoes a ON a.ServicoId = s.ServicoId JOIN EscalasEquipes e ON e.EquipeId = a.EquipeId AND e.ContatoComMenores = 1
    WHERE s.Status = 'PUBLICADA' AND CAST(s.DataHora AS DATE) BETWEEN @hoje AND @ate AND a.Status IN (${STATUS_ATIVOS_SQL})`)).recordset.map((x) => x.ServicoId);
  if (!servicos.length) return [];
  const salas = await salasDosServicos(pool, servicos, { hoje });
  const fatos = [];
  for (const s of salas) {
    // Só o que é gente: proporção e um adulto sozinho. (Faltar a faixa ou o número de crianças é pendência de cadastro, avisada na hora de publicar.)
    if (!s.avaliacao.problemas.some((p) => p.codigo === "UM_ADULTO_SOZINHO" || p.codigo === "PROPORCAO" || p.codigo === "ESCALADO_SEM_HABILITACAO")) continue;
    const lider = s.liderMembroId ? await lerEmail(pool, s.liderMembroId) : null;
    const destinatarios = unicosPorMembro([lider, ...(await gestoresDaCongregacao(pool, s.congregacaoId))]);
    if (!destinatarios.length) continue;
    const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(s.dataHora instanceof Date ? s.dataHora : new Date(s.dataHora));
    fatos.push({ referenciaId: s.servicoId * 1000 + (s.equipeId % 1000), destinatarios, fatoGerador: mm.textoSalaSemAdulto({ equipe: s.equipeNome, dataHora: quando, adultos: s.adultos, necessarios: s.avaliacao.necessarios }) });
  }
  return fatos;
}

// Aviso mensal à Diretoria: quem serve com menores e precisa de certidões novas (já sem elas, ou vencendo em 60 dias).
async function detectarVistoriasARenovar(pool, { hoje = hojeBrasilia() } = {}) {
  const linhas = await linhasDoPainel(pool, { hoje });
  const nomes = [];
  for (const l of linhas) {
    const v = l.aptidao.validades.antecedentes;
    const falta = ["AUSENTE", "INCOMPLETO", "VENCIDO"].includes(v.situacao);
    const vencendo = v.situacao === "VIGENTE" && v.validoAte && mm.diasEntreIso(hoje, v.validoAte) <= Math.max(...mm.ALERTAS_DIAS);
    if ((falta || vencendo) && l.aptidao.contaComoAdulto !== false) nomes.push(l.nome);
  }
  if (!nomes.length) return [];
  const dir = await diretoria(pool);
  if (!dir.length) return [];
  return [{ referenciaId: chaveMensal(hoje), destinatarios: dir, fatoGerador: mm.textoVistoriasARenovar({ total: nomes.length, nomes }) }];
}

// A decisão pendente é cobrada da Diretoria todo dia, até sair. A referência leva os dias desde a declaração (cada dia é um aviso).
async function detectarAutoDenunciaPendente(pool, { hoje = hojeBrasilia() } = {}) {
  const lembrete = await lerPrazoDias(pool, mm.SIGLAS_PRAZO.autodenunciaLembreteDias, mm.AUTODENUNCIA_LEMBRETE_DIAS_PADRAO);
  const r = await pool.request().query(`SELECT a.AutoDenunciaId, a.DeclaradaEm, m.Nome FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.Decisao IS NULL`);
  if (!r.recordset.length) return [];
  const dir = await diretoria(pool);
  if (!dir.length) return [];
  const fatos = [];
  for (const x of r.recordset) {
    const declarada = dataBr(x.DeclaradaEm);
    if (!declarada) continue;
    const dias = mm.diasEntreIso(declarada, hoje);
    if (dias < lembrete) continue;
    fatos.push({ referenciaId: x.AutoDenunciaId * 1000 + Math.min(dias, 999), destinatarios: dir, fatoGerador: mm.textoAutoDenunciaPendente({ nome: x.Nome, dias }) });
  }
  return fatos;
}

// ---------------------------------------------------------------
// LGPD: retenção do IP e direito de acesso do titular
// ---------------------------------------------------------------

async function anonimizarIpsVencidos(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "VOLUNTARIADO_IP_RETENCAO_DIAS", vol.IP_RETENCAO_DIAS_PADRAO);
  const limite = mm.somarDiasIso(hoje, -dias);
  const r = await pool.request().input("limite", sql.Date, limite).query(`
    UPDATE MinisterioMenoresPoliticaAceites SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL
    WHERE EnderecoIp IS NOT NULL AND EnderecoIp <> N'anonimizado' AND CAST(AceitoEm AS DATE) < @limite`);
  const total = r.rowsAffected ? r.rowsAffected.reduce((s, n) => s + n, 0) : 0;
  if (total > 0) await registrarAuditoria({ tabela: "MinisterioMenoresPoliticaAceites", registroId: 0, acao: "MENORES_IP_ANONIMIZADO", usuarioId: null, dadosDepois: { quantidade: total, retencaoDias: dias, referencia: hoje } });
  return { anonimizados: total, retencaoDias: dias };
}

// O direito de acesso do titular (LGPD art. 18, I): o que a Igreja guarda sobre a PRÓPRIA pessoa no ministério com menores.
async function dadosDoTitular(pool, membroId) {
  const pol = (await pool.request().input("m", sql.Int, membroId).query(`SELECT Versao, Forma, AceitoEm, EnderecoIp, Referencia FROM MinisterioMenoresPoliticaAceites WHERE MembroId = @m ORDER BY AceiteId DESC`)).recordset;
  const hab = await habMod.buscarHabilitacaoPorMembro(pool, membroId);
  const ret = (await pool.request().input("m", sql.Int, membroId).query(`SELECT r.RetiradoEm, r.AlocacoesCanceladas, e.Nome AS EquipeNome FROM MinisterioMenoresRetiradas r JOIN EscalasEquipes e ON e.EquipeId = r.EquipeId WHERE r.MembroId = @m ORDER BY r.RetiradaId DESC`)).recordset;
  const auto = (await pool.request().input("m", sql.Int, membroId).query(`SELECT * FROM MinisterioMenoresAutoDenuncias WHERE MembroId = @m ORDER BY AutoDenunciaId DESC`)).recordset;
  const cad = (await pool.request().input("m", sql.Int, membroId).query(`SELECT Fonte, Resultado, ConsultadoEm FROM MinisterioMenoresCadastroNacional WHERE MembroId = @m ORDER BY ConsultaId DESC`)).recordset;
  return {
    politicaDeComunicacao: pol.map((x) => ({ versao: x.Versao, forma: x.Forma, aceitoEm: isoInstante(x.AceitoEm), enderecoIp: x.EnderecoIp || null, referencia: x.Referencia || null })),
    fichaConfirmadaEm: hab ? isoInstante(hab.fichaAtualizadaEm) : null,
    retiradasDaEscala: ret.map((x) => ({ equipe: x.EquipeNome, em: isoInstante(x.RetiradoEm), escalasDesmarcadas: x.AlocacoesCanceladas })),
    comunicacoesADiretoria: auto.map((x) => mapearAutoDenuncia(x)),
    consultasAoCadastroNacional: cad.map((x) => ({ fonte: x.Fonte, resultado: x.Resultado, em: isoInstante(x.ConsultadoEm) })),
    aviso: "A validade das certidões é calculada pela data de emissão das certidões do Termo de Vistoria (que aparece no bloco de vistorias). A Igreja guarda só o código (hash) de cada certidão, nunca o documento."
  };
}

module.exports = {
  lerPrazos, lerPrazosFaixas, carregarFatos, aptidaoEmLote, aptidaoDe, equipeComMenores, aptosParaEquipe, motivoCurto, conferirParaServir, antecedentesDe,
  salasDosServicos, avaliarPublicacao, definirFaixaEquipe, definirCriancasPrevistas, criancasPrevistasDoServico,
  retirarInaptosDasEscalas, voluntariosComMenores, linhasDoPainel, painel, minhaSituacao,
  aceitarPolitica, registrarPoliticaManual, confirmarFicha,
  declararAutoDenuncia, listarAutoDenuncias, decidirAutoDenuncia, liberarAutoDenuncia, mapearAutoDenuncia,
  detectarVencimentos, detectarSalasSemSegundoAdulto, detectarVistoriasARenovar, detectarAutoDenunciaPendente,
  anonimizarIpsVencidos, dadosDoTitular
};
