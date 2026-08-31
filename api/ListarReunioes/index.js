// ListarReunioes
// Lista as sessões (abertas + encerradas), com contagem de presentes/faltas/justificadas.
// Usada tanto pela aba Reuniões (Ministério) quanto pela aba Assembleia Geral —
// aceita ?orgaoId= pra filtrar só as sessões daquele órgão.

const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const orgaoId = (req.query || {}).orgaoId;

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request().query(`
  //   SELECT s.SessaoId, s.Descricao, s.DataSessao, s.Status,
  //          SUM(CASE WHEN p.Presente = 1 THEN 1 ELSE 0 END) AS TotalPresentes,
  //          SUM(CASE WHEN p.Presente = 0 THEN 1 ELSE 0 END) AS TotalFaltas,
  //          SUM(CASE WHEN p.Presente = 0 AND p.FaltaJustificada = 1 THEN 1 ELSE 0 END) AS TotalJustificadas
  //   FROM Sessoes s
  //   LEFT JOIN Presencas p ON p.SessaoId = s.SessaoId
  //   GROUP BY s.SessaoId, s.Descricao, s.DataSessao, s.Status
  //   ORDER BY s.SessaoId DESC
  // `);
  // context.res = { status: 200, body: result.recordset };
  // return;

  const lista = mockDb.sessoes
    .filter(s => !orgaoId || String(s.orgaoId) === String(orgaoId))
    .map(s => {
      const frequencia = mockDb.listarFrequenciaPorSessao(s.sessaoId);
      return {
        sessaoId: s.sessaoId,
        descricao: s.descricao,
        dataSessao: s.dataSessao,
        status: s.status,
        totalPresentes: frequencia.filter(f => f.presente).length,
        totalFaltas: frequencia.filter(f => !f.presente).length,
        totalJustificadas: frequencia.filter(f => !f.presente && f.faltaJustificada).length
      };
    })
    .sort((a, b) => b.sessaoId - a.sessaoId);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: lista
  };
};
