// ListarConsagracoes
// Adaptado de listarConsagracoesAdminApp(). Traz apenas processos ainda não
// concluídos/reprovados (a "esteira" ativa). Exige a permissão "consagracoes"
// (ex: um "Secretário de Consagrações" que não mexe em Reuniões nem Pessoas).
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request().query(`
  //   SELECT c.ConsagracaoId, c.MembroId, m.Nome, c.CargoAtual, c.Assunto,
  //          p.Nome AS Proponente, c.Status, c.DataProtocolo
  //   FROM Consagracoes c
  //   JOIN MembroReferencia m ON m.MembroId = c.MembroId
  //   LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
  //   WHERE c.Status NOT IN ('CONCLUIDO', 'REPROVADO')
  //   ORDER BY c.DataProtocolo ASC
  // `);
  // context.res = { status: 200, body: result.recordset };
  // return;

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: mockDb.listarConsagracoesAtivas()
  };
};
