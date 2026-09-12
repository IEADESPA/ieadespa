// RelatorioIndicadoresFinanceiros (v4.12 — item 11)
// Painel de Indicadores pro CLI/Diretoria/Conselho Fiscal, calculado na
// leitura (nunca digitado à mão):
//   - Meses de Reserva de Caixa (meta 3 meses — Art. 64)
//   - Índice de Aplicação em Atividades-Fim (meta 70-80% — ITG 2002)
//   - Índice de Liquidez
// GET /api/indicadores-financeiros
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const compliance = require("../shared/compliance");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "auditoria");
  if (!usuario) return;
  const pool = await getPool();
  const indicadores = await compliance.calcularIndicadoresFinanceiros(pool, sql);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: indicadores };
};
