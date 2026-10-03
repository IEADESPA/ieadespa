// RelatorioIndicadoresFinanceiros (v4.12 — item 11)
// Painel de Indicadores pro CLI/Diretoria/Conselho Fiscal, calculado na
// leitura (nunca digitado à mão):
//   - Meses de Reserva de Caixa (meta 3 meses — Art. 64)
//   - Índice de Aplicação em Atividades-Fim (meta 70-80% — ITG 2002)
//   - Índice de Liquidez
// GET /api/indicadores-financeiros
const { exigirGeral } = require("../shared/escopoRotas");
const { getPool, sql } = require("../shared/db");
const compliance = require("../shared/compliance");

module.exports = async function (context, req) {
  // Caixa, balanço e liquidez consolidados da igreja toda (conta única): só o nível GERAL (papel Global E escopo de todas as congregações) com a permissão de auditoria —
  // as demais demonstrações consolidadas já eram restritas a ele; esta só olhava a permissão.
  const usuario = exigirGeral(req, context, "auditoria");
  if (!usuario) return;
  const pool = await getPool();
  const indicadores = await compliance.calcularIndicadoresFinanceiros(pool, sql);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: indicadores };
};
