// Testes do cálculo de status de retenção (vB.6) — nunca roda expurgo
// automático, só classifica VIGENTE/VENCIDO/INDETERMINADO na leitura.
const { calcularStatusRetencao } = require("../retencao");

describe("calcularStatusRetencao", () => {
  test("sem DiasRetencao (política indeterminada) nunca vence", () => {
    const r = calcularStatusRetencao({ diasRetencao: null, criadoEm: "2000-01-01" });
    expect(r).toEqual({ status: "INDETERMINADO", diasRestantes: null, vencimentoEm: null });
  });

  test("dentro do prazo é VIGENTE", () => {
    const hoje = new Date("2026-01-10T00:00:00Z");
    const r = calcularStatusRetencao({ diasRetencao: 30, criadoEm: "2026-01-01" }, hoje);
    expect(r.status).toBe("VIGENTE");
    expect(r.diasRestantes).toBeGreaterThan(0);
  });

  test("passou do prazo é VENCIDO", () => {
    const hoje = new Date("2026-03-01T00:00:00Z");
    const r = calcularStatusRetencao({ diasRetencao: 30, criadoEm: "2026-01-01" }, hoje);
    expect(r.status).toBe("VENCIDO");
    expect(r.diasRestantes).toBeLessThan(0);
  });
});
