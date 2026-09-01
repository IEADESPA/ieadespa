// RadarDisciplinar
// Lista membros ativos com 3+ faltas NÃO justificadas num órgão, sinalizando
// risco de perda de assento (regra do Estatuto). Aceita ?orgaoId= para focar
// num órgão específico ou retorna todos se omitido.
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const { orgaoId } = req.query || {};
  const pool = await getPool();
  const request = pool.request();
  request.input("orgaoId", sql.Int, orgaoId || null);

  const result = await request.query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
           COUNT(p.PresencaId) AS faltas
    FROM Presencas p
    JOIN Sessoes s ON s.SessaoId = p.SessaoId
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE p.Presente = 0 AND p.FaltaJustificada = 0
      AND (@orgaoId IS NULL OR s.OrgaoId = @orgaoId)
    GROUP BY m.MembroId, m.Nome, c.Nome
    HAVING COUNT(p.PresencaId) >= 3
    ORDER BY faltas DESC
  `);

  const membrosEmRisco = result.recordset.map((r) => ({
    ...r,
    alerta: "Elegível a perda automática de assento (Art. Estatuto — 3 faltas consecutivas)"
  }));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { orgaoId: orgaoId || "TODOS", membrosEmRisco }
  };
};
