// Testes das Demonstrações Contábeis (v4.9, ITG 2002) — inclui a correção
// da Trava de Revisão 4-C: Doações (v4.22) e Receitas Acessórias avulsas
// (v4.21) agora entram no Caixa/DRP/Fluxo, sem contar duas vezes o que já
// vem pela trilha ContasAReceber -> LancamentosTesouraria (cessão onerosa).
//
// Limite honesto destes testes: o mock de pool não interpreta o texto do
// SQL (não valida de verdade a cláusula `WHERE CessaoTemploId IS NULL`) —
// eles verificam que a composição em JS dos números retornados pelo banco
// está correta, não a query em si. A garantia de que a query real filtra
// certo é responsabilidade da revisão de código / de um teste de
// integração contra um banco de homologação (vB.1, item pendente).
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const demonstracoes = require("../demonstracoes");

describe("caixaConsolidadoAteData", () => {
  test("soma Lançamentos confirmados + Doações + Receitas Acessórias avulsas, menos Saídas pagas", async () => {
    const { pool } = criarPoolFalso([
      [{ total: 1000 }], // LancamentosTesouraria confirmados
      [{ total: 200 }],  // Doacoes
      [{ total: 100 }],  // ReceitasAcessorias (avulsas)
      [{ total: 300 }]   // SaidasTesouraria pagas
    ]);
    const caixa = await demonstracoes.caixaConsolidadoAteData(pool, sqlFalso, new Date("2026-06-30"));
    expect(caixa).toBe(1000);
  });
});

describe("calcularBalancoPatrimonial — Ativo Total - Passivo Total = Patrimônio Líquido", () => {
  test("PL é sempre o residual, nunca um número gravado à parte", async () => {
    const { pool } = criarPoolFalso([
      [{ total: 1000 }], // caixa: Lancamentos
      [{ total: 200 }],  // caixa: Doacoes
      [{ total: 100 }],  // caixa: ReceitasAcessorias
      [{ total: 300 }],  // caixa: Saidas pagas   -> caixa = 1000
      [{ total: 150 }],  // ContasAReceber ativo
      [{ total: 80 }],   // SaidasTesouraria passivo (aprovada, não paga)
      []                 // BensPatrimoniais (imobilizado = 0, sem bens no mock)
    ]);
    const balanco = await demonstracoes.calcularBalancoPatrimonial(pool, sqlFalso, new Date("2026-06-30"));
    expect(balanco.ativo.caixaEEquivalentes).toBe(1000);
    expect(balanco.ativo.contasAReceber).toBe(150);
    expect(balanco.ativo.imobilizadoLiquido).toBe(0);
    expect(balanco.ativo.total).toBe(1150);
    expect(balanco.passivo.total).toBe(80);
    expect(balanco.patrimonioLiquido).toBe(balanco.ativo.total - balanco.passivo.total);
    expect(balanco.patrimonioLiquido).toBe(1070);
  });
});

describe("calcularDRP — Doações e Receitas Acessórias entram como receita do período", () => {
  test("soma receitas de todas as fontes (Lançamentos + ContasAReceber + Doações + Receitas Acessórias) menos despesas", async () => {
    const { pool } = criarPoolFalso([
      [{ categoriaCodigo: "DIZIMO", categoriaNome: "Dízimo", total: 500 }],           // receitasDiretas
      [{ categoriaCodigo: "CESSAO_TEMPLO", categoriaNome: "Cessão", total: 200 }],    // receitasPorContaReceber
      [{ total: 150 }],                                                              // receitasDoacoes
      [{ categoriaCodigo: "BAZAR", total: 80 }],                                     // receitasAcessoriasPorTipo
      [{ categoriaCodigo: "ADMINISTRATIVA", categoriaNome: "Administrativa", classificacaoFuncional: "ADMINISTRATIVA", total: 400 }] // despesas
    ]);
    const drp = await demonstracoes.calcularDRP(pool, sqlFalso, new Date("2026-01-01"), new Date("2026-06-30"));
    expect(drp.totalReceitas).toBe(930); // 500 + 200 + 150 + 80
    expect(drp.totalDespesas).toBe(400);
    expect(drp.resultadoDoPeriodo).toBe(530);
    const doacao = drp.receitas.find(r => r.categoriaCodigo === "DOACAO");
    expect(doacao.total).toBe(150);
    const acessoria = drp.receitas.find(r => r.categoriaCodigo === "RECEITA_ACESSORIA_BAZAR");
    expect(acessoria.total).toBe(80);
  });

  test("sem doações/receitas acessórias no período, não aparecem linhas fantasmas de valor 0", async () => {
    const { pool } = criarPoolFalso([
      [{ categoriaCodigo: "DIZIMO", categoriaNome: "Dízimo", total: 500 }],
      [],
      [{ total: 0 }],
      [],
      []
    ]);
    const drp = await demonstracoes.calcularDRP(pool, sqlFalso, new Date("2026-01-01"), new Date("2026-06-30"));
    expect(drp.totalReceitas).toBe(500);
    expect(drp.receitas.find(r => r.categoriaCodigo === "DOACAO")).toBeUndefined();
  });
});

describe("calcularFluxoCaixa — entradas operacionais incluem Doações/Receitas Acessórias", () => {
  test("variação líquida e saldo final consideram as novas fontes de entrada", async () => {
    const { pool } = criarPoolFalso([
      [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], // saldoInicial (caixaConsolidadoAteData no dia anterior): 0
      [{ total: 1000 }], // entradas: LancamentosTesouraria do período
      [{ total: 200 }],  // outrasEntradas: Doacoes
      [{ total: 100 }],  // outrasEntradas: ReceitasAcessorias
      [{ total: 300 }]   // saidas pagas do período
    ]);
    const fluxo = await demonstracoes.calcularFluxoCaixa(pool, sqlFalso, new Date("2026-06-01"), new Date("2026-06-30"));
    expect(fluxo.entradasOperacionais).toBe(1300); // 1000 + 200 + 100
    expect(fluxo.saidasOperacionais).toBe(300);
    expect(fluxo.variacaoLiquida).toBe(1000);
    expect(fluxo.saldoFinal).toBe(1000); // saldoInicial 0 + variação 1000
  });
});
