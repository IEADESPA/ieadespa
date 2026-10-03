// shared/retencao.js (vB.6 — Arquivo institucional com tabela de temporalidade)
// "Calculado na leitura", mesmo princípio do resto do sistema: nunca roda
// expurgo automático (decisão da v0.1 continua de pé), só informa o status
// de quem está consultando. DiasRetencao = NULL (política sem prazo, "Base
// Legal" explica por quê) sempre vira INDETERMINADO, nunca "vencido".
function calcularStatusRetencao({ diasRetencao, criadoEm }, hoje = new Date()) {
  if (diasRetencao == null) return { status: "INDETERMINADO", diasRestantes: null, vencimentoEm: null };
  const criado = new Date(criadoEm);
  const vencimento = new Date(criado.getTime() + diasRetencao * 86400000);
  const diasRestantes = Math.ceil((vencimento.getTime() - hoje.getTime()) / 86400000);
  return { status: diasRestantes < 0 ? "VENCIDO" : "VIGENTE", diasRestantes, vencimentoEm: vencimento.toISOString().slice(0, 10) };
}

module.exports = { calcularStatusRetencao };
