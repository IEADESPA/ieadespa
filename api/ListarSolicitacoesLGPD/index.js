// ListarSolicitacoesLGPD — painel do Encarregado de Dados. Exige a permissão "protecaodedados".
// GET /api/lgpd/dpo/solicitacoes?status=&tipo=
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "protecaodedados");
  if (!usuario) return;

  const { status, tipo } = req.query || {};
  const pool = await getPool();
  const request = pool.request();
  const condicoes = [];
  if (status) { request.input("status", sql.NVarChar(20), status); condicoes.push("s.Status = @status"); }
  if (tipo) { request.input("tipo", sql.NVarChar(30), tipo); condicoes.push("s.Tipo = @tipo"); }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT s.SolicitacaoId AS solicitacaoId, s.MembroId AS membroId, m.Nome AS nome, s.Tipo AS tipo,
           s.Descricao AS descricao, s.Status AS status,
           CONVERT(varchar(33), s.DataSolicitacao, 126) AS dataSolicitacao,
           CONVERT(varchar(33), s.DataResposta, 126) AS dataResposta, s.RespostaTexto AS respostaTexto,
           a.Nome AS atendidoPorNome
    FROM SolicitacoesTitularLGPD s
    JOIN MembroReferencia m ON m.MembroId = s.MembroId
    LEFT JOIN MembroReferencia a ON a.MembroId = s.AtendidoPor
    ${where}
    ORDER BY s.DataSolicitacao DESC`);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
