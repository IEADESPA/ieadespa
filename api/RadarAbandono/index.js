// RadarAbandono
// Lista membros "Sem Comunhão" com uma Data de Afastamento lançada (Reg. Art. 11 —
// Abandono Eclesiástico Material) e ainda sem procedimento em aberto, sinalizando quem
// já cruzou os 90 dias e está apto a abrir o procedimento sumário de constatação.
// Só relatório — não abre nada sozinho (mesmo espírito do RadarDisciplinar).
// GET /api/radar-abandono
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
           CONVERT(varchar(10), m.DataAfastamento, 120) AS dataAfastamento,
           m.SituacaoMembro AS situacaoMembro
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.SituacaoMembro = 'SEM_COMUNHAO' AND m.DataAfastamento IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ProcedimentosAbandono pa
        WHERE pa.MembroId = m.MembroId AND pa.Tipo = 'MATERIAL' AND pa.Status IN ('NOTIFICADO', 'HOMOLOGADO')
      )
  `);

  const hoje = new Date().toISOString().slice(0, 10);
  const membrosEmRisco = result.recordset
    .map(m => ({
      ...m,
      diasAfastado: estatuto.diasEmAfastamento(m, hoje),
      elegivel: estatuto.elegivelAbandonoMaterial(m, hoje)
    }))
    .sort((a, b) => (b.diasAfastado || 0) - (a.diasAfastado || 0));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: membrosEmRisco };
};
