// Testes do v6.7 (EBD — Financeiro) — foco na lógica pura: validação de
// oferta/lançamento manual, o cálculo do consolidado mensal (é EXATAMENTE
// esse número que vira sugestão inicial do campo `ofertas` do relatório
// departamental, v5.2) e a confirmação de que esse pré-preenchimento NÃO
// segue o mecanismo readonly/recalculado da v5.5 (CAMPOS_AUTOMATICOS_
// AFILIACAO) — continua editável por PUT normal depois de aberto o
// rascunho.
const { criarPoolFalso } = require("./testUtils");
const financeiro = require("../ebdFinanceiro");
const rd = require("../relatoriosDepartamentais");

describe("validarValorOferta", () => {
  test("recusa valor ausente, negativo ou não numérico", () => {
    expect(financeiro.validarValorOferta(null).valido).toBe(false);
    expect(financeiro.validarValorOferta(undefined).valido).toBe(false);
    expect(financeiro.validarValorOferta(-1).valido).toBe(false);
    expect(financeiro.validarValorOferta("abc").valido).toBe(false);
  });

  test("aceita zero (culto sem oferta contabilizada ainda) e valor positivo", () => {
    expect(financeiro.validarValorOferta(0).valido).toBe(true);
    expect(financeiro.validarValorOferta(150.5).valido).toBe(true);
  });
});

describe("validarLancamento", () => {
  const base = { data: "2026-03-08", tipo: "ENTRADA", descricao: "Doação extra", valor: 50 };

  test("aceita lançamento válido (ENTRADA e SAIDA)", () => {
    expect(financeiro.validarLancamento(base).valido).toBe(true);
    expect(financeiro.validarLancamento({ ...base, tipo: "SAIDA", descricao: "Compra de material" }).valido).toBe(true);
  });

  test("recusa data ausente ou inválida", () => {
    expect(financeiro.validarLancamento({ ...base, data: null }).valido).toBe(false);
    expect(financeiro.validarLancamento({ ...base, data: "não é data" }).valido).toBe(false);
  });

  test("recusa tipo fora de ENTRADA/SAIDA", () => {
    const r = financeiro.validarLancamento({ ...base, tipo: "TRANSFERENCIA" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/ENTRADA ou SAIDA/);
  });

  test("recusa descrição vazia", () => {
    expect(financeiro.validarLancamento({ ...base, descricao: "" }).valido).toBe(false);
    expect(financeiro.validarLancamento({ ...base, descricao: "   " }).valido).toBe(false);
  });

  test("recusa valor ausente, zero ou negativo (lançamento manual não pode ser zero, diferente da oferta)", () => {
    expect(financeiro.validarLancamento({ ...base, valor: 0 }).valido).toBe(false);
    expect(financeiro.validarLancamento({ ...base, valor: -5 }).valido).toBe(false);
    expect(financeiro.validarLancamento({ ...base, valor: null }).valido).toBe(false);
  });
});

describe("calcularTotalOfertas", () => {
  test("soma o valor de todas as ofertas do mês", () => {
    expect(financeiro.calcularTotalOfertas([{ valor: 100 }, { valor: 80.5 }, { valor: 20 }])).toBeCloseTo(200.5);
  });
  test("lista vazia ou ausente soma zero", () => {
    expect(financeiro.calcularTotalOfertas([])).toBe(0);
    expect(financeiro.calcularTotalOfertas(undefined)).toBe(0);
  });
});

describe("calcularTotalLancamentos", () => {
  test("ENTRADA soma, SAIDA subtrai do líquido", () => {
    const r = financeiro.calcularTotalLancamentos([
      { tipo: "ENTRADA", valor: 100 },
      { tipo: "SAIDA", valor: 30 },
      { tipo: "ENTRADA", valor: 20 }
    ]);
    expect(r.entradas).toBe(120);
    expect(r.saidas).toBe(30);
    expect(r.liquido).toBe(90);
  });
  test("sem lançamentos, tudo zero", () => {
    expect(financeiro.calcularTotalLancamentos([])).toEqual({ entradas: 0, saidas: 0, liquido: 0 });
  });
});

describe("calcularConsolidadoMensal (o número que vira sugestão do campo `ofertas`)", () => {
  test("soma ofertas do culto + líquido dos lançamentos manuais", () => {
    const r = financeiro.calcularConsolidadoMensal({
      ofertas: [{ valor: 100 }, { valor: 150 }],
      lancamentos: [{ tipo: "ENTRADA", valor: 50 }, { tipo: "SAIDA", valor: 40 }]
    });
    expect(r.totalOfertas).toBe(250);
    expect(r.totalEntradas).toBe(50);
    expect(r.totalSaidas).toBe(40);
    expect(r.consolidado).toBe(260); // 250 + 50 - 40
  });

  test("mês sem nenhum lançamento nem oferta consolida em zero, sem quebrar", () => {
    const r = financeiro.calcularConsolidadoMensal({ ofertas: [], lancamentos: [] });
    expect(r.consolidado).toBe(0);
  });

  test("arredonda pra 2 casas decimais", () => {
    const r = financeiro.calcularConsolidadoMensal({ ofertas: [{ valor: 10.005 }, { valor: 10.005 }], lancamentos: [] });
    expect(r.totalOfertas).toBeCloseTo(20.01, 2);
  });
});

describe("mapearOferta / mapearLancamento", () => {
  test("linha nula vira null", () => {
    expect(financeiro.mapearOferta(null)).toBeNull();
    expect(financeiro.mapearLancamento(null)).toBeNull();
  });
  test("mapeia colunas do banco pro formato camelCase da API", () => {
    const oferta = financeiro.mapearOferta({ OfertaId: 1, LicaoId: 5, Valor: "120.00", RegistradoPorMembroId: 9, RegistradoEm: "2026-03-08", AtualizadoEm: "2026-03-08" });
    expect(oferta).toEqual({ ofertaId: 1, licaoId: 5, valor: 120, registradoPorMembroId: 9, registradoEm: "2026-03-08", atualizadoEm: "2026-03-08" });

    const lancamento = financeiro.mapearLancamento({ LancamentoId: 2, CongregacaoId: 10, Data: "2026-03-10", Tipo: "SAIDA", Descricao: "Compra", Valor: "30.00", RegistradoPorMembroId: 9, RegistradoEm: "x", AtualizadoEm: "x" });
    expect(lancamento.tipo).toBe("SAIDA");
    expect(lancamento.valor).toBe(30);
  });
});

describe("buscarDepartamentoEbdId", () => {
  test("devolve o DepartamentoId da EBD", async () => {
    const { pool } = criarPoolFalso([[{ DepartamentoId: 7 }]]);
    expect(await financeiro.buscarDepartamentoEbdId(pool)).toBe(7);
  });
  test("devolve null se o depto EBD não estiver seedado", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await financeiro.buscarDepartamentoEbdId(pool)).toBeNull();
  });
});

describe("buscarOfertaPorLicao / listarOfertasPorCongregacaoMes / listarLancamentosPorCongregacaoMes", () => {
  test("buscarOfertaPorLicao mapeia a linha encontrada", async () => {
    const { pool } = criarPoolFalso([[{ OfertaId: 1, LicaoId: 5, Valor: "80.00" }]]);
    const oferta = await financeiro.buscarOfertaPorLicao(pool, 5);
    expect(oferta.valor).toBe(80);
  });

  test("listarOfertasPorCongregacaoMes mapeia todas as linhas do mês", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ OfertaId: 1, LicaoId: 5, Valor: "80.00" }, { OfertaId: 2, LicaoId: 6, Valor: "100.00" }]]);
    const ofertas = await financeiro.listarOfertasPorCongregacaoMes(pool, { congregacaoId: 10, mes: 3, ano: 2026 });
    expect(ofertas).toHaveLength(2);
    expect(chamadas[0].inputs.congId).toBe(10);
    expect(chamadas[0].inputs.mes).toBe(3);
  });

  test("listarLancamentosPorCongregacaoMes mapeia todas as linhas do mês", async () => {
    const { pool } = criarPoolFalso([[{ LancamentoId: 1, CongregacaoId: 10, Tipo: "ENTRADA", Valor: "20.00" }]]);
    const lancamentos = await financeiro.listarLancamentosPorCongregacaoMes(pool, { congregacaoId: 10, mes: 3, ano: 2026 });
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].tipo).toBe("ENTRADA");
  });
});

describe("buscarConsolidadoMensal", () => {
  test("junta ofertas + lançamentos do mês e devolve os totais calculados", async () => {
    const { pool } = criarPoolFalso([
      [{ OfertaId: 1, LicaoId: 5, Valor: "100.00" }],
      [{ LancamentoId: 1, CongregacaoId: 10, Tipo: "SAIDA", Valor: "10.00" }]
    ]);
    const r = await financeiro.buscarConsolidadoMensal(pool, { congregacaoId: 10, mes: 3, ano: 2026 });
    expect(r.totalOfertas).toBe(100);
    expect(r.totalSaidas).toBe(10);
    expect(r.consolidado).toBe(90);
    expect(r.ofertas).toHaveLength(1);
    expect(r.lancamentos).toHaveLength(1);
  });
});

// Item 1 do v6.7 (hook de pré-preenchimento) — só se aplica quando o
// departamento do rascunho é de fato a EBD; qualquer outro departamento
// mantém o comportamento padrão (campo FLUXO nasce zerado, v5.2).
describe("buscarValorPrePreenchimentoOfertas", () => {
  test("departamento diferente da EBD nunca recebe pré-preenchimento (devolve null)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ DepartamentoId: 7 }]]);
    const valor = await financeiro.buscarValorPrePreenchimentoOfertas(pool, { departamentoId: 3, congregacaoId: 10, mes: 3, ano: 2026 });
    expect(valor).toBeNull();
    expect(chamadas).toHaveLength(1); // só consultou o id da EBD, nunca foi buscar ledger de outro depto
  });

  test("departamento EBD recebe o consolidado do mês como valor de partida", async () => {
    const { pool } = criarPoolFalso([
      [{ DepartamentoId: 7 }],
      [{ OfertaId: 1, LicaoId: 5, Valor: "200.00" }],
      [{ LancamentoId: 1, CongregacaoId: 10, Tipo: "ENTRADA", Valor: "30.00" }]
    ]);
    const valor = await financeiro.buscarValorPrePreenchimentoOfertas(pool, { departamentoId: 7, congregacaoId: 10, mes: 3, ano: 2026 });
    expect(valor).toBe(230);
  });

  test("sem depto EBD seedado ainda, devolve null (não quebra a criação do rascunho)", async () => {
    const { pool } = criarPoolFalso([[]]);
    const valor = await financeiro.buscarValorPrePreenchimentoOfertas(pool, { departamentoId: 7, congregacaoId: 10, mes: 3, ano: 2026 });
    expect(valor).toBeNull();
  });
});

// Diferença deliberada em relação ao mecanismo readonly da v5.5
// (CAMPOS_AUTOMATICOS_AFILIACAO/aplicarContagemAutomatica): aqueles 3
// campos (congregados/membrosEmComunhao/membrosSemComunhao) são ESTADO e
// GestaoRelatoriosDepartamentais::gravarValores recusa persistir qualquer
// valor enviado pra eles (defesa em profundidade). `ofertas` da EBD é
// FLUXO e PRECISA continuar gravável — o texto da própria v5.5 já dizia
// que o Superintendente Local "só confirma ou ajusta" o valor sugerido,
// nunca fica travado. Este teste prova, a partir do exportado
// CAMPOS_AUTOMATICOS_AFILIACAO (o único mapa que o guard de gravarValores
// consulta), que "ofertas" nunca cai nesse bloqueio, em nenhum
// departamento.
describe("pré-preenchimento do v6.7 fica editável — não usa o bloqueio da v5.5", () => {
  test("'ofertas' nunca está em CAMPOS_AUTOMATICOS_AFILIACAO (o mapa que gravarValores usa pra recusar persistência)", () => {
    expect(Object.prototype.hasOwnProperty.call(rd.CAMPOS_AUTOMATICOS_AFILIACAO, "ofertas")).toBe(false);
  });

  test("CAMPOS_AUTOMATICOS_AFILIACAO continua sendo só os 3 campos de afiliação da v5.5 — v6.7 não adicionou nada nele", () => {
    expect(Object.keys(rd.CAMPOS_AUTOMATICOS_AFILIACAO).sort()).toEqual(["congregados", "membrosEmComunhao", "membrosSemComunhao"]);
  });
});
