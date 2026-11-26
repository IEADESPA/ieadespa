// O início da licença por candidatura (Reg. Art. 157 §2º: o obreiro entra em licença 90 dias antes do pleito). Revisão de fora, 26/11/2026: a licença valia no
// dia do registro, qualquer que fosse o pleito (um pleito daqui a dois anos tirava os cargos hoje; um pleito que já passou era aceito).
// Regra (decisão provisória até a resposta sobre o agendamento): pleito passado é recusado; antes dos 90 dias, recusado com a data em que a licença começa;
// dentro dos 90 dias, a licença começa no dia do registro (o início gravado é o de verdade, não um dia que já passou).
const { inicioDaLicenca, DIAS_ANTECEDENCIA } = require("../licencaCandidatura");

describe("inicioDaLicenca", () => {
  test("90 dias antes do pleito, contados no calendário (sem fuso)", () => {
    expect(DIAS_ANTECEDENCIA).toBe(90);
    expect(inicioDaLicenca("2028-10-01", "2028-07-03")).toEqual({ ok: true, inicio: "2028-07-03", peloPleito: "2028-07-03" });
    expect(inicioDaLicenca("2026-03-01", "2025-12-01").peloPleito).toBe("2025-12-01");   // atravessa o ano
    expect(inicioDaLicenca("2028-03-01", "2027-12-02").peloPleito).toBe("2027-12-02");   // ano bissexto (29/02/2028)
  });

  test("dentro dos 90 dias: começa no dia do registro", () => {
    expect(inicioDaLicenca("2026-12-20", "2026-11-26")).toEqual({ ok: true, inicio: "2026-11-26", peloPleito: "2026-09-21" });
    expect(inicioDaLicenca("2026-11-26", "2026-11-26")).toEqual({ ok: true, inicio: "2026-11-26", peloPleito: "2026-08-28" });   // o próprio dia do pleito
  });

  test("antes dos 90 dias: recusado, com o dia em que a licença começa", () => {
    expect(inicioDaLicenca("2028-10-01", "2026-11-26")).toEqual({ ok: false, motivo: "ANTES_DO_INICIO", peloPleito: "2028-07-03" });
    expect(inicioDaLicenca("2028-10-01", "2028-07-02")).toEqual({ ok: false, motivo: "ANTES_DO_INICIO", peloPleito: "2028-07-03" });
  });

  test("pleito que já passou: recusado", () => {
    expect(inicioDaLicenca("2026-10-04", "2026-11-26")).toEqual({ ok: false, motivo: "PLEITO_PASSADO", peloPleito: "2026-07-06" });
    expect(inicioDaLicenca("2022-10-02", "2026-11-26").motivo).toBe("PLEITO_PASSADO");
    expect(inicioDaLicenca("2026-11-25", "2026-11-26").motivo).toBe("PLEITO_PASSADO");
  });

  test("a mensagem de cada recusa, com a data em dd/mm/aaaa", () => {
    const { mensagemDoInicio } = require("../licencaCandidatura");
    expect(mensagemDoInicio(inicioDaLicenca("2028-10-01", "2026-11-26"), "2028-10-01")).toBe(
      "A licença por candidatura começa 90 dias antes do pleito, em 03/07/2028: registre a partir desse dia. Até lá a pessoa continua nos cargos.");
    expect(mensagemDoInicio(inicioDaLicenca("2026-10-04", "2026-11-26"), "2026-10-04")).toBe("A data do pleito (04/10/2026) já passou: confira a data.");
    expect(mensagemDoInicio(inicioDaLicenca("2026-12-20", "2026-11-26"), "2026-12-20")).toBeNull();
  });
});
