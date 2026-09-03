// ListarProcedimentosAbandono
// Exige a permissão "disciplina". GET /api/procedimentos-abandono?status=&membroId=&tipo=
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { status, membroId, tipo } = req.query || {};
  const pool = await getPool();
  const request = pool.request();
  const condicoes = [];
  if (status) { request.input("status", sql.NVarChar(30), status); condicoes.push("pa.Status = @status"); }
  if (membroId) { request.input("membroId", sql.Int, membroId); condicoes.push("pa.MembroId = @membroId"); }
  if (tipo) { request.input("tipo", sql.NVarChar(20), tipo); condicoes.push("pa.Tipo = @tipo"); }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT pa.ProcedimentoId AS procedimentoId, pa.MembroId AS membroId, m.Nome AS nome,
           pa.Tipo AS tipo, pa.Status AS status, CONVERT(varchar(10), pa.DataNotificacao, 120) AS dataNotificacao,
           CONVERT(varchar(10), pa.DataEdital, 120) AS dataEdital, pa.PrazoDias AS prazoDias,
           CONVERT(varchar(10), pa.DataHomologacao, 120) AS dataHomologacao,
           pa.RecursoInterposto AS recursoInterposto,
           CONVERT(varchar(10), pa.DataRecurso, 120) AS dataRecurso, pa.ResultadoRecurso AS resultadoRecurso
    FROM ProcedimentosAbandono pa
    JOIN MembroReferencia m ON m.MembroId = pa.MembroId
    ${where}
    ORDER BY pa.ProcedimentoId DESC
  `);

  const hoje = new Date().toISOString().slice(0, 10);
  const procedimentos = result.recordset.map(p => ({
    ...p,
    prazoVencido: p.status === "NOTIFICADO" ? estatuto.diasDesde(p.dataNotificacao, hoje) >= p.prazoDias : null
  }));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: procedimentos };
};
