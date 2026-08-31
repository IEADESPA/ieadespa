// RadarDisciplinar
// Equivalente ao "abrirPainelRisco()" do sistema atual: lista membros ativos com
// 3+ faltas NÃO justificadas em um órgão, sinalizando risco de perda de assento
// (regra do Estatuto: 3 faltas consecutivas => perda automática de assento).
//
// Aceita ?orgaoId= para focar num órgão específico (CLI, NIF, AFM...) ou retorna
// todos se omitido.

const MOCK_MEMBROS = [
  { membroId: 3, nome: "João Alves Martins", congregacao: "Templo Central" },
  { membroId: 7, nome: "Elesbão Silva Marques", congregacao: "Águas Vivas" }
];

const MOCK_FALTAS_POR_MEMBRO = {
  3: 3, // 3 faltas seguidas não justificadas -> ENTRA no radar
  7: 4
};

const LIMITE_FALTAS = 3;

module.exports = async function (context, req) {
  const { orgaoId } = req.query || {};

  // ---- Versão real com Azure SQL ----
  // A lógica principal: contar, POR MEMBRO E POR ÓRGÃO, as faltas consecutivas
  // mais recentes (não justificadas) e comparar com o limite do órgão.
  //
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request()
  //   .input("orgaoId", sql.Int, orgaoId || null)
  //   .query(`
  //     SELECT m.MembroId, m.Nome,
  //            COUNT(p.PresencaId) AS FaltasNaoJustificadas
  //     FROM Presencas p
  //     JOIN Sessoes s ON s.SessaoId = p.SessaoId
  //     JOIN MembroReferencia m ON m.MembroId = p.MembroId
  //     WHERE p.Presente = 0 AND p.FaltaJustificada = 0
  //       AND (@orgaoId IS NULL OR s.OrgaoId = @orgaoId)
  //     GROUP BY m.MembroId, m.Nome
  //     HAVING COUNT(p.PresencaId) >= 3
  //     ORDER BY FaltasNaoJustificadas DESC
  //   `);
  // context.res = { status: 200, body: result.recordset };
  // return;

  const emRisco = MOCK_MEMBROS
    .filter(m => (MOCK_FALTAS_POR_MEMBRO[m.membroId] || 0) >= LIMITE_FALTAS)
    .map(m => ({
      ...m,
      faltas: MOCK_FALTAS_POR_MEMBRO[m.membroId],
      alerta: MOCK_FALTAS_POR_MEMBRO[m.membroId] >= LIMITE_FALTAS
        ? "Elegível a perda automática de assento (Art. Estatuto — 3 faltas consecutivas)"
        : null
    }));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { orgaoId: orgaoId || "TODOS", membrosEmRisco: emRisco }
  };
};
