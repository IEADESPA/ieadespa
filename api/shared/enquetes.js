// shared/enquetes.js (v2.8, Parte A)
// Quem pode votar numa Enquete: TODOS_ATIVOS reaproveita o mesmo universo
// "todo mundo ATIVO, em comunhão, sem disciplina" já usado pelo resto do
// sistema (shared/universo.js — mesmo padrão de "não é enquete se a pessoa
// já perdeu direitos"); LISTA_CUSTOM é a lista específica cadastrada em
// PublicoEnqueteCustom (ex: só os membros de um departamento).
//
// v7.14 — (1) a mesma regra para UMA pessoa (membroElegivel/aptoEmComunhao), sem carregar o cadastro inteiro a cada voto: com a membresia toda votando pelo Meu Painel
// (a identidade visual), cada voto relia todos os membros ativos; (2) a enquete que fecha sozinha (DataFechamentoPrevista): encerrarEnquete fecha uma (a manual e a
// agendada, com o resultado da vinculante contando só os votos de antes do instante marcado) e encerrarVencidas fecha as que passaram do instante (rotina diária).
const { sql: sqlPadrao } = require("./db");
const { universoDoOrgao } = require("./universo");
const { CONDICAO_SQL_ATIVO, foraDaReadmissao } = require("./disciplina");
const estatuto = require("./estatuto");
const { registrarAuditoria } = require("./auditoria");

async function membrosElegiveis(pool, sql, enquete) {
  if (enquete.publicoTipo === "LISTA_CUSTOM") {
    const result = await pool.request().input("id", sql.Int, enquete.enqueteId)
      .query(`SELECT MembroId AS membroId FROM PublicoEnqueteCustom WHERE EnqueteId = @id`);
    return new Set(result.recordset.map(r => r.membroId));
  }
  const universo = await universoDoOrgao(pool, null);
  return new Set(universo.map(m => m.membroId));
}

// "Apto e em comunhão" para uma pessoa: o mesmo critério de universoDoOrgao(pool, null) — ATIVO, não SEM_COMUNHAO, sem processo disciplinar ativo.
async function aptoEmComunhao(pool, membroId, sql = sqlPadrao) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT CASE WHEN m.Status = 'ATIVO' AND ISNULL(m.SituacaoMembro, '') <> 'SEM_COMUNHAO'
                 AND NOT EXISTS (SELECT 1 FROM ProcessosDisciplinares LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = ProcessosDisciplinares.PenalidadeId
                                 WHERE ProcessosDisciplinares.MembroId = m.MembroId AND ${CONDICAO_SQL_ATIVO} AND ${foraDaReadmissao("m")})
           THEN 1 ELSE 0 END AS apto
    FROM MembroReferencia m WHERE m.MembroId = @m`);
  return !!(r.recordset[0] && Number(r.recordset[0].apto) === 1);
}

async function membroElegivel(pool, sql, enquete, membroId) {
  if (enquete.publicoTipo === "LISTA_CUSTOM") {
    const r = await pool.request().input("id", sql.Int, enquete.enqueteId).input("m", sql.Int, membroId)
      .query(`SELECT 1 AS ok FROM PublicoEnqueteCustom WHERE EnqueteId = @id AND MembroId = @m`);
    return r.recordset.length > 0;
  }
  return aptoEmComunhao(pool, membroId, sql);
}

// A enquete agendada já passou do instante de fechar? (lida na hora: a rotina só a encerra de vez depois)
function passouDoFechamento(enquete, agora = new Date()) {
  const p = enquete && enquete.dataFechamentoPrevista;
  return !!p && Date.parse(p.endsWith("Z") ? p : `${p}Z`) <= agora.getTime();
}

// Encerra UMA enquete aberta, em dois passos e nesta ordem (revisão de 23/10/2026):
//   1) marca ENCERRADA (UPDATE condicional: só a que ainda está ABERTA; na agendada, só se a hora do BANCO já passou de DataFechamentoPrevista);
//   2) só então conta os votos e grava o resultado da vinculante.
// Por que nesta ordem: o voto (GestaoEnquetes) só entra com a enquete ABERTA e lê a enquete com trava (UPDLOCK); com o banco em READ_COMMITTED_SNAPSHOT (o padrão do Azure
// SQL), uma contagem feita ANTES de fechar não via o voto que estava sendo gravado — e ele entrava depois, fora da conta. Fechada primeiro, o voto em curso termina antes
// (a trava) e entra na contagem, e nenhum voto novo entra depois. Se algo cair entre os dois passos, a leitura seguinte refaz o resultado (recuperarResultado).
// `enquete` (opcional): { vinculante, quorumTipo } já lidos por quem chama. `acao`/`usuarioId`: a trilha (a manual leva quem encerrou; a agendada, ninguém).
// Devolve { encerrada, resultadoAprovado } — encerrada=false quando outra chamada a fechou antes (ou a hora ainda não chegou).
async function encerrarEnquete(pool, enqueteId, { agendada = false, sql = sqlPadrao, enquete = null, usuarioId = null, acao = null } = {}) {
  let e = enquete;
  if (!e) {
    const l = (await pool.request().input("id", sql.Int, enqueteId).query(`SELECT Vinculante AS vinculante, QuorumTipo AS quorumTipo FROM Enquetes WHERE EnqueteId = @id`)).recordset[0];
    if (!l) return { encerrada: false, resultadoAprovado: null };
    e = l;
  }
  const r = await pool.request().input("id", sql.Int, enqueteId).input("agendada", sql.Bit, agendada ? 1 : 0)
    .query(`UPDATE Enquetes SET Status = 'ENCERRADA',
              DataFechamento = CASE WHEN @agendada = 1 AND DataFechamentoPrevista IS NOT NULL THEN DataFechamentoPrevista ELSE SYSUTCDATETIME() END
            WHERE EnqueteId = @id AND Status = 'ABERTA' AND (@agendada = 0 OR (DataFechamentoPrevista IS NOT NULL AND DataFechamentoPrevista <= SYSUTCDATETIME()))`);
  const encerrada = !!(r.rowsAffected && r.rowsAffected[0] > 0);
  if (!encerrada) return { encerrada: false, resultadoAprovado: null };
  const resultadoAprovado = e.vinculante ? await gravarResultado(pool, enqueteId, { sql, quorumTipo: e.quorumTipo }) : null;
  await registrarAuditoria({ tabela: "Enquetes", registroId: Number(enqueteId), acao: acao || (agendada ? "Encerrou enquete (fechamento agendado)" : "Encerrou enquete"), usuarioId: usuarioId || null,
    dadosDepois: { resultadoAprovado, agendada: !!agendada } });
  return { encerrada: true, resultadoAprovado };
}
// O resultado da vinculante, contado com a enquete JÁ encerrada (os votos de antes do instante marcado, quando há um), gravado uma vez só.
// FASE 10 (migração 173, decisão do responsável e do Presidente): pelo TIPO da votação (estatuto.apurarVotacao). Na PROPOSTA conta o papel de cada opção (aprova,
// rejeita; o branco não conta) — antes, a opção mais votada "aprovava" fosse ela o Sim ou o Não. Na ESCOLHA ganha a mais votada: ResultadoAprovado = 1 quer dizer
// "houve uma escolhida" (OpcaoVencedoraId) e 0, empate (ResultadoEmpate = 1). Sem tipo gravado (não deveria acontecer depois da 173), deduz pelos textos.
async function gravarResultado(pool, enqueteId, { sql = sqlPadrao, quorumTipo } = {}) {
  const linhas = (await pool.request().input("id", sql.Int, enqueteId).query(`
    SELECT o.OpcaoId AS opcaoId, o.Texto AS texto, o.Papel AS papel,
      (SELECT TipoApuracao FROM Enquetes WHERE EnqueteId = @id) AS tipo, (SELECT QuorumTipo FROM Enquetes WHERE EnqueteId = @id) AS quorumTipo,
      (SELECT COUNT(*) FROM RespostasEnquete r JOIN Enquetes e ON e.EnqueteId = @id
        WHERE r.OpcaoId = o.OpcaoId AND (e.DataFechamentoPrevista IS NULL OR r.DataResposta < e.DataFechamentoPrevista)) AS votos
    FROM OpcoesEnquete o WHERE o.PerguntaId = (SELECT TOP 1 PerguntaId FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem)
    ORDER BY o.OpcaoId`)).recordset;
  let tipo = linhas.length ? linhas[0].tipo : null;
  let opcoes = linhas;
  if (!tipo) {
    const inferido = estatuto.inferirApuracao(linhas.map((l) => l.texto));
    tipo = inferido.tipo;
    opcoes = linhas.map((l, i) => Object.assign({}, l, { papel: inferido.papeis[i] }));
  }
  const r = estatuto.apurarVotacao({ tipo, quorumTipo: quorumTipo || (linhas[0] && linhas[0].quorumTipo), opcoes });
  await pool.request().input("id", sql.Int, enqueteId).input("resultado", sql.Bit, !!r.aprovado)
    .input("vencedora", sql.Int, tipo === "ESCOLHA" ? (r.opcaoVencedoraId || null) : null)
    .input("empate", sql.Bit, tipo === "ESCOLHA" ? !!r.empate : null)
    .input("tipo", sql.NVarChar(20), tipo)
    .query(`UPDATE Enquetes SET ResultadoAprovado = @resultado, OpcaoVencedoraId = @vencedora, ResultadoEmpate = @empate,
              TipoApuracao = ISNULL(TipoApuracao, @tipo), ApuradaEm = SYSUTCDATETIME()
            WHERE EnqueteId = @id AND Status = 'ENCERRADA' AND ResultadoAprovado IS NULL`);
  return !!r.aprovado;
}
// A vinculante encerrada sem resultado gravado (caiu entre os dois passos): refaz na leitura.
async function recuperarResultado(pool, enquete, { sql = sqlPadrao } = {}) {
  if (!enquete || !enquete.vinculante || enquete.status !== "ENCERRADA" || enquete.resultadoAprovado !== null && enquete.resultadoAprovado !== undefined) return enquete;
  enquete.resultadoAprovado = await gravarResultado(pool, enquete.enqueteId, { sql, quorumTipo: enquete.quorumTipo });
  return enquete;
}

// Rotina diária: fecha as enquetes que passaram do instante marcado (com a trilha, como a manual). As da identidade visual ficam de fora (o ciclo as fecha e apura junto:
// identidadeVisualDb), embora a leitura de qualquer uma delas também a feche.
async function encerrarVencidas(pool, { sql = sqlPadrao } = {}) {
  const ids = (await pool.request().query(`
    SELECT e.EnqueteId FROM Enquetes e WHERE e.Status = 'ABERTA' AND e.DataFechamentoPrevista IS NOT NULL AND e.DataFechamentoPrevista <= SYSUTCDATETIME()
      AND NOT EXISTS (SELECT 1 FROM IdentidadeCiclos c WHERE c.EnqueteId = e.EnqueteId)`)).recordset.map((x) => x.EnqueteId);
  let encerradas = 0;
  for (const id of ids) if ((await encerrarEnquete(pool, id, { agendada: true, sql })).encerrada) encerradas++;
  return { encerradas };
}

module.exports = { membrosElegiveis, membroElegivel, aptoEmComunhao, passouDoFechamento, encerrarEnquete, gravarResultado, recuperarResultado, encerrarVencidas };
