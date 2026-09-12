// Testes das regras de dinheiro (vB.1) — as que, se quebrarem, perdem
// dinheiro de verdade: rateio 40/60, saldo de centro de custo, saldo
// restante de campanha e fluxo de caixa projetado.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const tesouraria = require("../tesouraria");

describe("calcularFechamento (Art. 118 — retenção 40% / repasse 60%)", () => {
  test("retenção padrão 40%: retido + repasse somam o total final", () => {
    const r = tesouraria.calcularFechamento({ totalRecebido: 1000, valorAluguel: 0, valorLote: 0, percentualRetencao: 40 });
    expect(r.totalFinal).toBe(1000);
    expect(r.valorRetidoLocal).toBe(400);
    expect(r.valorRepasseGeral).toBe(600);
    expect(r.valorRetidoLocal + r.valorRepasseGeral).toBe(r.totalFinal);
  });

  test("deduções fixas (aluguel/lote) saem ANTES do rateio, não depois", () => {
    const r = tesouraria.calcularFechamento({ totalRecebido: 1000, valorAluguel: 100, valorLote: 50, percentualRetencao: 40 });
    expect(r.totalFinal).toBe(850);
    expect(r.valorRetidoLocal).toBe(340);
    expect(r.valorRepasseGeral).toBe(510);
  });

  test("percentual de retenção configurável (não travado em 40 no código)", () => {
    const r = tesouraria.calcularFechamento({ totalRecebido: 1000, valorAluguel: 0, valorLote: 0, percentualRetencao: 25 });
    expect(r.valorRetidoLocal).toBe(250);
    expect(r.valorRepasseGeral).toBe(750);
  });

  test("nunca perde nem inventa centavo por arredondamento em valores quebrados", () => {
    const r = tesouraria.calcularFechamento({ totalRecebido: 333.33, valorAluguel: 0, valorLote: 0, percentualRetencao: 40 });
    expect(round2ManualCheck(r.valorRetidoLocal + r.valorRepasseGeral)).toBe(round2ManualCheck(r.totalFinal));
  });
});

function round2ManualCheck(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

describe("saldoCentroCusto (LOCAL / GERAL / destinos do Rateio Geral)", () => {
  test("LOCAL: soma o que foi repassado à congregação menos o que já foi pago, e filtra por congregacaoId", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ total: 1000 }], [{ total: 300 }]]);
    const saldo = await tesouraria.saldoCentroCusto(pool, sqlFalso, "LOCAL", 42);
    expect(saldo).toBe(700);
    expect(chamadas[0].inputs.congregacaoId).toBe(42);
    expect(chamadas[1].inputs.congregacaoId).toBe(42);
  });

  test("GERAL: soma RateiosGerais.ValorTesouroGeral (não o repasse bruto) menos o pago, sem gate de congregação", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ total: 5000 }], [{ total: 1200 }]]);
    const saldo = await tesouraria.saldoCentroCusto(pool, sqlFalso, "GERAL", null);
    expect(saldo).toBe(3800);
    expect(chamadas[1].inputs.congregacaoId).toBeUndefined();
  });

  test("destino do Rateio Geral (ex: PDQ) soma RateioGeralValores por DestinoCodigo", async () => {
    const { pool } = criarPoolFalso([[{ total: 2000 }], [{ total: 500 }]]);
    const saldo = await tesouraria.saldoCentroCusto(pool, sqlFalso, "PDQ", null);
    expect(saldo).toBe(1500);
  });

  test("nunca fica negativo indevidamente por não achar linhas — SUM de conjunto vazio é 0, não erro", async () => {
    const { pool } = criarPoolFalso([[{ total: 0 }], [{ total: 0 }]]);
    const saldo = await tesouraria.saldoCentroCusto(pool, sqlFalso, "LOCAL", 1);
    expect(saldo).toBe(0);
  });
});

describe("saldoRestanteCampanha (v4.2/v4.4 — nunca gasta além do arrecadado)", () => {
  test("arrecadado confirmado menos comprometido (aprovado + pago)", async () => {
    const { pool } = criarPoolFalso([[{ total: 800 }], [{ total: 300 }]]);
    const saldo = await tesouraria.saldoRestanteCampanha(pool, sqlFalso, 7);
    expect(saldo).toBe(500);
  });

  test("campanha sem nenhum lançamento confirmado tem saldo 0, não erro/undefined", async () => {
    const { pool } = criarPoolFalso([[{ total: 0 }], [{ total: 0 }]]);
    const saldo = await tesouraria.saldoRestanteCampanha(pool, sqlFalso, 999);
    expect(saldo).toBe(0);
  });
});

describe("projetarFluxoCaixa (v4.8 — rolling forecast, recalculado a cada leitura)", () => {
  test("acumula saldo mês a mês com entrada/saída médias, empenho só pesa no 1º mês projetado", async () => {
    const { pool } = criarPoolFalso([
      [{ total: 1000 }], // saldoCentroCusto: liberado
      [{ total: 200 }],  // saldoCentroCusto: pago            -> saldoAtual = 800
      [{ MesReferencia: "2026-05", total: 300 }, { MesReferencia: "2026-04", total: 300 }, { MesReferencia: "2026-03", total: 300 }], // entradas (média 300)
      [{ mes: "2026-05", total: 150 }, { mes: "2026-04", total: 150 }, { mes: "2026-03", total: 150 }], // saídas (média 150)
      [{ total: 100 }] // empenhado em aberto
    ]);
    const r = await tesouraria.projetarFluxoCaixa(pool, sqlFalso, "LOCAL", 1, 2);
    expect(r.saldoAtual).toBe(800);
    expect(r.entradaMediaMensal).toBe(300);
    expect(r.saidaMediaMensal).toBe(150);
    expect(r.totalEmpenhadoAberto).toBe(100);
    expect(r.projecao).toHaveLength(2);
    expect(r.projecao[0].empenhoAberto).toBe(100);
    expect(r.projecao[0].saldoProjetado).toBe(850); // 800 + 300 - 150 - 100
    expect(r.projecao[1].empenhoAberto).toBe(0); // só o mês 1 carrega o empenho já em aberto
    expect(r.projecao[1].saldoProjetado).toBe(1000); // 850 + 300 - 150 - 0
  });

  test("sem histórico de entradas/saídas, projeta com médias 0 (nunca quebra por divisão por lista vazia)", async () => {
    const { pool } = criarPoolFalso([
      [{ total: 0 }], [{ total: 0 }], // saldoCentroCusto
      [], // entradas vazio
      [], // saidas vazio
      [{ total: 0 }] // empenhos
    ]);
    const r = await tesouraria.projetarFluxoCaixa(pool, sqlFalso, "LOCAL", 1, 1);
    expect(r.entradaMediaMensal).toBe(0);
    expect(r.saidaMediaMensal).toBe(0);
    expect(r.projecao[0].saldoProjetado).toBe(0);
  });
});
