// Testes da Tesouraria Central por Departamento (v5.4) — o rateio precisa
// bater com os 5 métodos reais das planilhas, e o bloqueio de balancete
// (Art. 133-C §2º) só deve travar quando havia mesmo o que fechar.
const { criarPoolFalso } = require("./testUtils");
const td = require("../tesourariaDepartamental");

describe("calcularRateio", () => {
  test("INTEGRAL_GERAL — 100% sobe pro geral", () => {
    expect(td.calcularRateio({ metodo: "INTEGRAL_GERAL" }, 500)).toEqual({ paraGeral: 500, paraLocal: 0 });
  });
  test("INTEGRAL_LOCAL — 100% fica local (EBD hoje)", () => {
    expect(td.calcularRateio({ metodo: "INTEGRAL_LOCAL" }, 500)).toEqual({ paraGeral: 0, paraLocal: 500 });
  });
  test("PERCENTUAL bruto_calculado — divide o valor bruto informado (Família, 40%)", () => {
    expect(td.calcularRateio({ metodo: "PERCENTUAL", percentualGeral: 40, modoEntrada: "BRUTO_CALCULADO" }, 1000))
      .toEqual({ paraGeral: 400, paraLocal: 600 });
  });
  test("PERCENTUAL líquido_manual — quem preenche já lançou só a parte que sobe, paraLocal não é rastreável", () => {
    const r = td.calcularRateio({ metodo: "PERCENTUAL", percentualGeral: 40, modoEntrada: "LIQUIDO_MANUAL" }, 400);
    expect(r.paraGeral).toBe(400);
    expect(r.paraLocal).toBeNull();
  });
  test("MENSALIDADE_FIXA usa o mesmo cálculo de PERCENTUAL (USADESPA)", () => {
    expect(td.calcularRateio({ metodo: "MENSALIDADE_FIXA", percentualGeral: 50, modoEntrada: "BRUTO_CALCULADO" }, 200))
      .toEqual({ paraGeral: 100, paraLocal: 100 });
  });
  test("VARIAVEL_MANUAL — usa o valor decidido lançamento a lançamento (UHADESPA)", () => {
    expect(td.calcularRateio({ metodo: "VARIAVEL_MANUAL" }, 1000, 300)).toEqual({ paraGeral: 300, paraLocal: 700 });
  });
  test("VARIAVEL_MANUAL sem valor informado assume zero pro geral (nunca inventa)", () => {
    expect(td.calcularRateio({ metodo: "VARIAVEL_MANUAL" }, 1000)).toEqual({ paraGeral: 0, paraLocal: 1000 });
  });
});

describe("precisaAutorizacao (Art. 49, I)", () => {
  test("acima do limite exige autorização", () => {
    expect(td.precisaAutorizacao(1500, 1000)).toBe(true);
  });
  test("exatamente no limite não exige (só ACIMA)", () => {
    expect(td.precisaAutorizacao(1000, 1000)).toBe(false);
  });
  test("abaixo do limite não exige", () => {
    expect(td.precisaAutorizacao(500, 1000)).toBe(false);
  });
});

describe("calcularSaldoMes", () => {
  test("soma transportado + movimentação, subtrai suporte e despesas", () => {
    const saldo = td.calcularSaldoMes({ saldoTransportado: 100, movimentacaoGeralMes: 500, suporteSecretariaGeral: 150, totalDespesas: 200 });
    expect(saldo).toBe(250);
  });
  test("saldo pode ficar negativo (não trava aqui, só informa)", () => {
    const saldo = td.calcularSaldoMes({ saldoTransportado: 0, movimentacaoGeralMes: 100, suporteSecretariaGeral: 0, totalDespesas: 300 });
    expect(saldo).toBe(-200);
  });
});

describe("mesAnteriorReferencia", () => {
  test("janeiro volta pra dezembro do ano anterior", () => {
    expect(td.mesAnteriorReferencia(1, 2026)).toEqual({ mes: 12, ano: 2025 });
  });
  test("mês normal só decrementa", () => {
    expect(td.mesAnteriorReferencia(6, 2026)).toEqual({ mes: 5, ano: 2026 });
  });
});

describe("balanceteBloqueado (Art. 133-C §2º)", () => {
  test("departamento sem nenhuma atividade anterior não bloqueia (nada pra fechar ainda)", async () => {
    const { pool } = criarPoolFalso([[{ chave: null }]]);
    expect(await td.balanceteBloqueado(pool, 1, 3, 2026)).toBe(false);
  });

  test("mês anterior é anterior à primeira atividade — não bloqueia", async () => {
    const { pool } = criarPoolFalso([[{ chave: 202603 }]]); // primeira atividade em 03/2026
    expect(await td.balanceteBloqueado(pool, 1, 3, 2026)).toBe(false); // mês anterior seria 02/2026, antes de existir
  });

  test("mês anterior teve atividade e NÃO foi fechado — bloqueia", async () => {
    const { pool } = criarPoolFalso([[{ chave: 202601 }], []]); // teve atividade desde janeiro, fevereiro sem fechamento
    expect(await td.balanceteBloqueado(pool, 1, 3, 2026)).toBe(true);
  });

  test("mês anterior teve atividade e FOI fechado — não bloqueia", async () => {
    const { pool } = criarPoolFalso([[{ chave: 202601 }], [{ existe: 1 }]]);
    expect(await td.balanceteBloqueado(pool, 1, 3, 2026)).toBe(false);
  });
});

describe("buscarPerfilRateio", () => {
  test("converte bits em booleano", async () => {
    const { pool } = criarPoolFalso([[{
      perfilRateioId: 1, schemaRelatorioId: 5, metodo: "PERCENTUAL", percentualGeral: 40,
      modoEntrada: "LIQUIDO_MANUAL", suporteSecretariaGeralHabilitado: 1, valorSuporteSecretariaGeral: null, confirmado: 1
    }]]);
    const perfil = await td.buscarPerfilRateio(pool, 8);
    expect(perfil.suporteSecretariaGeralHabilitado).toBe(true);
    expect(perfil.confirmado).toBe(true);
  });

  test("departamento sem perfil seedado devolve null", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await td.buscarPerfilRateio(pool, 999)).toBeNull();
  });
});

describe("buscarUltimoFechamento", () => {
  test("sem fechamento anterior, devolve null (saldo transportado começa em 0)", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await td.buscarUltimoFechamento(pool, 1, 3, 2026)).toBeNull();
  });
  test("com fechamento anterior, devolve o saldo dele", async () => {
    const { pool } = criarPoolFalso([[{ saldoMes: 350.5, mesReferencia: 2, anoReferencia: 2026 }]]);
    const r = await td.buscarUltimoFechamento(pool, 1, 3, 2026);
    expect(r.saldoMes).toBe(350.5);
  });
});
