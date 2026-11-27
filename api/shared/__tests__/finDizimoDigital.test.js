// FASE 10, Financeiro, incremento 4 (27/11/2026): a regra pura do DÍZIMO DIGITAL (shared/finDizimoDigital.js), tela r22-dizimo-digital op. 1.
// Dados de mentira: o Pix de R$ 350,00 de uma dizimista fictícia, ligado à folha 70.097 do bloco 1.401 (o exemplo do próprio desenho).
const r = require("../finDizimoDigital");

const HOJE = "2026-11-20";

describe("o que o membro informa: o valor e o dia e a hora do Pix", () => {
  test("o valor e a hora valem; a hora vai para o banco com os segundos", () => {
    expect(r.validarInforme({ valor: "350,00", pixEm: "2026-11-18T21:12" }, HOJE)).toEqual({ ok: true, valor: 35000, pixEm: "2026-11-18T21:12:00", dia: "2026-11-18" });
    expect(r.validarInforme({ valor: 220, pixEm: "2026-11-19 07:50" }, HOJE)).toEqual({ ok: true, valor: 22000, pixEm: "2026-11-19T07:50:00", dia: "2026-11-19" });
  });
  test("o mês anterior vale (desde o dia 1); hoje vale", () => {
    expect(r.validarInforme({ valor: "10,00", pixEm: "2026-10-01T00:00" }, HOJE).ok).toBe(true);
    expect(r.validarInforme({ valor: "10,00", pixEm: "2026-11-20T23:59" }, HOJE).ok).toBe(true);
  });
  test.each([
    [{ valor: "0,00", pixEm: "2026-11-18T21:12" }, "Informe o valor do Pix."],
    [{ valor: "abc", pixEm: "2026-11-18T21:12" }, "Informe o valor do Pix."],
    [{ valor: "350,00" }, "Informe o dia e a hora do Pix."],
    [{ valor: "350,00", pixEm: "18/11/2026 21:12" }, "Informe o dia e a hora do Pix."],
    [{ valor: "350,00", pixEm: "2026-02-30T10:00" }, "Informe o dia e a hora do Pix."],
    [{ valor: "350,00", pixEm: "2026-11-18T24:00" }, "Informe o dia e a hora do Pix."],
    [{ valor: "350,00", pixEm: "2026-11-18T21:60" }, "Informe o dia e a hora do Pix."],
    [{ valor: "350,00", pixEm: "2026-11-21T08:00" }, "O dia do Pix é depois de hoje: confira a data."],
    [{ valor: "350,00", pixEm: "2026-09-30T23:59" }, "Só se informa o Pix deste mês ou do anterior (outubro)."],
    [{ valor: "350,00", pixEm: ["2026-11-18T21:12"] }, "Informe o dia e a hora do Pix."]
  ])("%p → %p", (d, mensagem) => expect(r.validarInforme(d, HOJE)).toEqual({ ok: false, mensagem }));
  test("o corpo que não é objeto", () => {
    for (const d of [null, undefined, "x", 5, []]) expect(r.validarInforme(d, HOJE)).toEqual({ ok: false, mensagem: "Informe o valor do Pix." });
  });
});

describe("a folha digitada para ligar", () => {
  test.each([[70097, 70097], [1, 1]])("%p vale", (f, n) => expect(r.folhaParaLigar(f)).toBe(n));
  test.each([[0], [-1], [1.5], ["70097"], [null], [undefined], [{}], [1e10], [NaN]])("%p não vale", (f) => expect(r.folhaParaLigar(f)).toBeNull());
});

describe("a exclusão pede o motivo", () => {
  test("o motivo limpo", () => {
    expect(r.validarExclusao({ motivo: "  ela entregou   o dízimo em espécie no mesmo dia " })).toEqual({ ok: true, motivo: "ela entregou o dízimo em espécie no mesmo dia" });
  });
  test.each([[{}], [{ motivo: "   " }], [{ motivo: 5 }], [null], [{ motivo: "x".repeat(301) }]])("%p não vale", (d) => {
    expect(r.validarExclusao(d).ok).toBe(false);
  });
  test("a mensagem do motivo comprido diz o limite", () => {
    expect(r.validarExclusao({ motivo: "x".repeat(301) }).mensagem).toBe("O motivo tem no máximo 300 letras.");
  });
});

describe("a folha ligada a um Pix, na planilha: o nome e o valor vêm do Pix", () => {
  const pix = { membroId: 7900002, valor: 35000 };
  test("este mês: o dízimo por Pix, com o valor e o membro do Pix", () => {
    expect(r.linhaDaFolhaLigada({ folha: 70097, referente: "ESTE_MES" }, pix)).toEqual({ ok: true, linha: {
      folha: 70097, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor: 35000, voluntaria: null, membroId: 7900002, nome: null } });
  });
  test("mês posterior: só a linha, sem nome e sem valor (eles vêm do Pix no mês seguinte)", () => {
    expect(r.linhaDaFolhaLigada({ folha: 70097, referente: "MES_POSTERIOR" }, pix)).toEqual({ ok: true, linha: {
      folha: 70097, referente: "MES_POSTERIOR", tipo: null, forma: null, valor: null, voluntaria: null, membroId: null, nome: null } });
  });
  test("a folha que veio marcada do mês anterior: preenche com o Pix", () => {
    expect(r.linhaDaFolhaLigada({ folha: 70162 }, pix, { preencher: true })).toEqual({ ok: true, linha: {
      folha: 70162, referente: "MES_POSTERIOR", tipo: "DIZIMO", forma: "PIX", valor: 35000, voluntaria: null, membroId: 7900002, nome: null } });
  });
  test.each([
    [{ folha: 70097, referente: "ESTE_MES", valor: "350,00" }],
    [{ folha: 70097, referente: "ESTE_MES", tipo: "DIZIMO" }],
    [{ folha: 70097, referente: "ESTE_MES", forma: "PIX" }],
    [{ folha: 70097, referente: "ESTE_MES", voluntaria: "10,00" }],
    [{ folha: 70097, referente: "ESTE_MES", pessoa: { nome: "Outra" } }]
  ])("o corpo não escreve o que vem do Pix: %p", (l) => {
    expect(r.linhaDaFolhaLigada(l, pix)).toEqual({ ok: false, mensagem: "Folha 70.097: a folha está ligada a um dízimo por Pix; o nome e o valor vêm do Pix." });
  });
  test("sem o \"Referente a\" na folha nova", () => {
    expect(r.linhaDaFolhaLigada({ folha: 70097 }, pix)).toEqual({ ok: false, mensagem: "Folha 70.097: escolha “Este mês” ou “Mês posterior”." });
    expect(r.linhaDaFolhaLigada({ folha: 70097, referente: "constructor" }, pix).ok).toBe(false);
  });
});

describe("os passos de cada Pix", () => {
  test("informado é o 1º; ligado ao recibo de papel, o 2º (o 3º, conferido no extrato, vem com o extrato)", () => {
    expect(r.passoDe("INFORMADO")).toBe(1);
    expect(r.passoDe("LIGADO")).toBe(2);
    expect(r.passoDe("EXCLUIDO")).toBe(0);
    expect(r.passoDe("__proto__")).toBe(0);
  });
});
