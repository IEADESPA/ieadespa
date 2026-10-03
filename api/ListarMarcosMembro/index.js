// ListarMarcosMembro
// Exige a permissão "pessoas". GET /api/marcos-membro?membroId=
// ESCOPO: os marcos são da PESSOA — só lista quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo, matrícula inexistente ou malformada: lista vazia, a
// mesma resposta de quem não tem marcos lançados.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const { membroId: membroIdBruto } = req.query || {};
  if (!membroIdBruto) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!pessoa) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
    return;
  }
  const result = await pool.request().input("id", sql.Int, pessoa.membroId).query(`
    SELECT MarcoId AS marcoId, Tipo AS tipo, Descricao AS descricao,
           CONVERT(varchar(10), DataMarco, 120) AS dataMarco, DataAproximada AS dataAproximada,
           Justificativa AS justificativa,
           CONVERT(varchar(10), CriadoEm, 120) AS criadoEm, CONVERT(varchar(10), AtualizadoEm, 120) AS atualizadoEm
    FROM MarcosMembro
    WHERE MembroId = @id
    ORDER BY DataMarco ASC, CriadoEm ASC
  `);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
