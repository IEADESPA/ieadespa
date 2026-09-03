// RadarAbandonoDigital
// Lista membros com ao menos 1 tentativa de contato registrada (Art. 12 §2º) e sem
// procedimento de Abandono Digital já em aberto, mostrando quantos canais distintos já
// foram tentados e há quantos dias — mesmo espírito do RadarAbandono (Material): só
// relatório, não abre nada sozinho. Exige a permissão "disciplina".
// GET /api/radar-abandono-digital
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const abandonoDigital = require("../shared/abandonoDigital");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const pool = await getPool();
  const candidatos = await pool.request().query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
    FROM TentativasContatoAbandono t
    JOIN MembroReferencia m ON m.MembroId = t.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE NOT EXISTS (
      SELECT 1 FROM ProcedimentosAbandono pa
      WHERE pa.MembroId = m.MembroId AND pa.Tipo = 'DIGITAL' AND pa.Status IN ('NOTIFICADO', 'HOMOLOGADO')
    )
  `);

  const membrosEmRisco = [];
  for (const m of candidatos.recordset) {
    const elegibilidade = await abandonoDigital.elegibilidadeAbandonoDigital(pool, sql, m.membroId);
    membrosEmRisco.push({ ...m, ...elegibilidade });
  }
  membrosEmRisco.sort((a, b) => (b.diasDesdePrimeira || 0) - (a.diasDesdePrimeira || 0));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: membrosEmRisco };
};
