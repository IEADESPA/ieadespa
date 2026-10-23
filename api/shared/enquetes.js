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
const { CONDICAO_SQL_ATIVO } = require("./disciplina");
const estatuto = require("./estatuto");

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
                                 WHERE ProcessosDisciplinares.MembroId = m.MembroId AND ${CONDICAO_SQL_ATIVO})
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

// Encerra UMA enquete aberta. `agendada`: fecha no instante marcado (DataFechamento = DataFechamentoPrevista) e a vinculante conta só os votos de antes dele.
// Devolve { encerrada, resultadoAprovado } — encerrada=false quando outra chamada a fechou antes (UPDATE condicional).
async function encerrarEnquete(pool, enqueteId, { agendada = false, sql = sqlPadrao } = {}) {
  const e = (await pool.request().input("id", sql.Int, enqueteId)
    .query(`SELECT EnqueteId, Vinculante, QuorumTipo, Status, DataFechamentoPrevista FROM Enquetes WHERE EnqueteId = @id`)).recordset[0];
  if (!e || e.Status !== "ABERTA") return { encerrada: false, resultadoAprovado: null };
  let resultadoAprovado = null;
  if (e.Vinculante) {
    const filtro = agendada && e.DataFechamentoPrevista ? "AND r.DataResposta < e.DataFechamentoPrevista" : "";
    const contagem = (await pool.request().input("id", sql.Int, enqueteId).query(`
      SELECT o.OpcaoId, (SELECT COUNT(*) FROM RespostasEnquete r JOIN Enquetes e ON e.EnqueteId = @id WHERE r.OpcaoId = o.OpcaoId ${filtro}) AS votos
      FROM OpcoesEnquete o WHERE o.PerguntaId = (SELECT TOP 1 PerguntaId FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem)`)).recordset;
    const total = contagem.reduce((s, o) => s + Number(o.votos), 0);
    const maisVotada = contagem.reduce((m, o) => Math.max(m, Number(o.votos)), 0);
    resultadoAprovado = estatuto.avaliarAprovacaoEnquete(total, maisVotada, e.QuorumTipo).aprovado;
  }
  const r = await pool.request().input("id", sql.Int, enqueteId).input("resultado", sql.Bit, resultadoAprovado).input("agendada", sql.Bit, agendada ? 1 : 0)
    .query(`UPDATE Enquetes SET Status = 'ENCERRADA', ResultadoAprovado = @resultado,
              DataFechamento = CASE WHEN @agendada = 1 AND DataFechamentoPrevista IS NOT NULL THEN DataFechamentoPrevista ELSE SYSUTCDATETIME() END
            WHERE EnqueteId = @id AND Status = 'ABERTA'`);
  const encerrada = !!(r.rowsAffected && r.rowsAffected[0] > 0);
  return { encerrada, resultadoAprovado: encerrada ? resultadoAprovado : null };
}

// Rotina diária: fecha as enquetes que passaram do instante marcado. As da identidade visual ficam de fora (o ciclo as fecha e apura junto: identidadeVisualDb).
async function encerrarVencidas(pool, { sql = sqlPadrao } = {}) {
  const ids = (await pool.request().query(`
    SELECT e.EnqueteId FROM Enquetes e WHERE e.Status = 'ABERTA' AND e.DataFechamentoPrevista IS NOT NULL AND e.DataFechamentoPrevista <= SYSUTCDATETIME()
      AND NOT EXISTS (SELECT 1 FROM IdentidadeCiclos c WHERE c.EnqueteId = e.EnqueteId)`)).recordset.map((x) => x.EnqueteId);
  let encerradas = 0;
  for (const id of ids) if ((await encerrarEnquete(pool, id, { agendada: true, sql })).encerrada) encerradas++;
  return { encerradas };
}

module.exports = { membrosElegiveis, membroElegivel, aptoEmComunhao, passouDoFechamento, encerrarEnquete, encerrarVencidas };
