// ListarConsagracoes
// Adaptado de listarConsagracoesAdminApp(). Traz apenas processos ainda não
// concluídos/reprovados (a "esteira" ativa). Exige a permissão "consagracoes".
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT c.ConsagracaoId AS consagracaoId, c.MembroId AS membroId, m.Nome AS nome,
           c.CargoAtual AS cargoAtual, c.Assunto AS assunto, p.Nome AS proponente,
           c.Status AS status, CONVERT(varchar(10), c.DataProtocolo, 120) AS dataProtocolo
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    WHERE c.Status NOT IN ('CONCLUIDO', 'REPROVADO')
    ORDER BY c.DataProtocolo ASC
  `);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
