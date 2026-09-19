// Testes do v6.4 (Motor de conquistas e gamificação) — foco na lógica pura
// dos 5 tipos de regra (contagem_evento/sequencia/combinacao_exata/
// marco_unico/periodo_perfeito), na cadeia de pré-requisitos, na
// visibilidade "oculta até desbloquear" e na pontuação/ranking. Nenhum
// teste toca banco — mesmo padrão de ebdChamada.test.js/ebdAtividades.test.js.
const conquistas = require("../conquistas");

function evento(tipoEvento, ocorridoEm, payload = {}) {
  return { tipoEvento, ocorridoEm, payload };
}

describe("eventoCombinaFiltro / filtrarEventos", () => {
  test("sem filtro combina com qualquer evento", () => {
    expect(conquistas.eventoCombinaFiltro(evento("X", "2026-01-01"), null)).toBe(true);
  });

  test("filtro parcial só exige as chaves informadas", () => {
    const e = evento("X", "2026-01-01", { status: "PRESENTE", extra: 123 });
    expect(conquistas.eventoCombinaFiltro(e, { status: "PRESENTE" })).toBe(true);
    expect(conquistas.eventoCombinaFiltro(e, { status: "AUSENTE" })).toBe(false);
  });

  test("compara objetos/arrays por igualdade estrutural", () => {
    const e = evento("X", "2026-01-01", { combo: { a: 1, b: [1, 2] } });
    expect(conquistas.eventoCombinaFiltro(e, { combo: { a: 1, b: [1, 2] } })).toBe(true);
    expect(conquistas.eventoCombinaFiltro(e, { combo: { a: 1, b: [2, 1] } })).toBe(false);
  });
});

describe("contagem_evento", () => {
  const eventos = [
    evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" }),
    evento("EBD_PRESENCA", "2026-01-11", { status: "PRESENTE" }),
    evento("EBD_PRESENCA", "2026-01-18", { status: "AUSENTE" })
  ];

  test("conta só os eventos que combinam com o filtro", () => {
    expect(conquistas.avaliarContagemEvento(eventos, { filtro: { status: "PRESENTE" }, minimoOcorrencias: 2 })).toBe(true);
    expect(conquistas.avaliarContagemEvento(eventos, { filtro: { status: "PRESENTE" }, minimoOcorrencias: 3 })).toBe(false);
  });

  test("sem filtro conta todos os eventos do tipo", () => {
    expect(conquistas.avaliarContagemEvento(eventos, { minimoOcorrencias: 3 })).toBe(true);
  });
});

describe("marco_unico", () => {
  test("basta 1 ocorrência que combine com o filtro", () => {
    expect(conquistas.avaliarMarcoUnico([evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" })], { filtro: { status: "PRESENTE" } })).toBe(true);
    expect(conquistas.avaliarMarcoUnico([], { filtro: { status: "PRESENTE" } })).toBe(false);
  });

  test("não conta evento que não combina com o filtro (ex: só faltas)", () => {
    expect(conquistas.avaliarMarcoUnico([evento("EBD_PRESENCA", "2026-01-04", { status: "AUSENTE" })], { filtro: { status: "PRESENTE" } })).toBe(false);
  });
});

describe("combinacao_exata", () => {
  test("exige um ÚNICO evento com todos os campos esperados batendo", () => {
    const eventos = [
      evento("EBD_ATIVIDADE_RESPOSTA", "2026-01-04", { percentual: 80 }),
      evento("EBD_ATIVIDADE_RESPOSTA", "2026-01-11", { percentual: 100 })
    ];
    expect(conquistas.avaliarCombinacaoExata(eventos, { camposEsperados: { percentual: 100 } })).toBe(true);
    expect(conquistas.avaliarCombinacaoExata(eventos, { camposEsperados: { percentual: 90 } })).toBe(false);
  });

  test("nunca soma campos de eventos diferentes (não é OR entre eventos parciais)", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" }),
      evento("EBD_PRESENCA", "2026-01-04", { trouxeBiblia: true })
    ];
    // Nenhum dos dois eventos, isolado, tem AMBOS os campos — não desbloqueia.
    expect(conquistas.avaliarCombinacaoExata(eventos, { camposEsperados: { status: "PRESENTE", trouxeBiblia: true } })).toBe(false);
  });

  test("sem camposEsperados nunca desbloqueia (regra malformada é segura por padrão)", () => {
    expect(conquistas.avaliarCombinacaoExata([evento("X", "2026-01-01", {})], { camposEsperados: {} })).toBe(false);
  });
});

describe("calcularMaiorSequencia / sequencia (N domingos seguidos)", () => {
  test("dias consecutivos a cada 7 formam sequência", () => {
    // 04/01, 11/01, 18/01, 25/01/2026 são domingos seguidos.
    const dias = [4, 11, 18, 25].map(d => conquistas.diaIndice(`2026-01-${String(d).padStart(2, "0")}`));
    expect(conquistas.calcularMaiorSequencia(dias.sort((a, b) => a - b), 7)).toBe(4);
  });

  test("um furo na sequência reinicia a contagem", () => {
    const dias = [4, 11, 25].map(d => conquistas.diaIndice(`2026-01-${String(d).padStart(2, "0")}`)).sort((a, b) => a - b);
    expect(conquistas.calcularMaiorSequencia(dias, 7)).toBe(2); // 04->11 é sequência de 2, 25 é isolado
  });

  test("avaliarSequencia integra filtro + cálculo de sequência", () => {
    const eventos = [4, 11, 18, 25].map(d => evento("EBD_PRESENCA", `2026-01-${String(d).padStart(2, "0")}`, { status: "PRESENTE" }));
    expect(conquistas.avaliarSequencia(eventos, { filtro: { status: "PRESENTE" }, minimoConsecutivas: 4 })).toBe(true);
    expect(conquistas.avaliarSequencia(eventos, { filtro: { status: "PRESENTE" }, minimoConsecutivas: 5 })).toBe(false);
  });

  test("presenças que não combinam com o filtro (ex: AUSENTE) não contam pra sequência", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" }),
      evento("EBD_PRESENCA", "2026-01-11", { status: "AUSENTE" }),
      evento("EBD_PRESENCA", "2026-01-18", { status: "PRESENTE" })
    ];
    expect(conquistas.avaliarSequencia(eventos, { filtro: { status: "PRESENTE" }, minimoConsecutivas: 2 })).toBe(false);
  });

  test("datas duplicadas no mesmo dia não inflam a sequência (Set de dias únicos)", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" }),
      evento("EBD_PRESENCA", "2026-01-04", { status: "PRESENTE" }),
      evento("EBD_PRESENCA", "2026-01-11", { status: "PRESENTE" })
    ];
    expect(conquistas.avaliarSequencia(eventos, { filtro: { status: "PRESENTE" }, minimoConsecutivas: 3 })).toBe(false);
    expect(conquistas.avaliarSequencia(eventos, { filtro: { status: "PRESENTE" }, minimoConsecutivas: 2 })).toBe(true);
  });
});

describe("periodo_perfeito (trimestre sem falta)", () => {
  const agora = "2026-03-31";

  test("exige um mínimo de ocorrências no período (sem dado não é 'perfeito')", () => {
    const eventos = [evento("EBD_PRESENCA", "2026-03-01", { status: "PRESENTE" })];
    expect(conquistas.avaliarPeriodoPerfeito(eventos, { filtroFalha: { status: "AUSENTE" }, minimoOcorrenciasNoPeriodo: 5, diasPeriodo: 90 }, agora)).toBe(false);
  });

  test("desbloqueia com N presenças e zero faltas no período", () => {
    const eventos = Array.from({ length: 10 }, (_, i) => evento("EBD_PRESENCA", `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4) * 2}`, { status: "PRESENTE" }));
    expect(conquistas.avaliarPeriodoPerfeito(eventos, { filtroFalha: { status: "AUSENTE" }, minimoOcorrenciasNoPeriodo: 10, diasPeriodo: 90 }, agora)).toBe(true);
  });

  test("uma falta dentro do período quebra o 'perfeito'", () => {
    const eventos = [
      ...Array.from({ length: 9 }, (_, i) => evento("EBD_PRESENCA", `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4) * 2}`, { status: "PRESENTE" })),
      evento("EBD_PRESENCA", "2026-03-15", { status: "AUSENTE" })
    ];
    expect(conquistas.avaliarPeriodoPerfeito(eventos, { filtroFalha: { status: "AUSENTE" }, minimoOcorrenciasNoPeriodo: 10, diasPeriodo: 90 }, agora)).toBe(false);
  });

  test("evento fora da janela de diasPeriodo não conta nem pra evidência nem pra falha", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2025-01-01", { status: "AUSENTE" }), // bem fora da janela
      ...Array.from({ length: 10 }, (_, i) => evento("EBD_PRESENCA", `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4) * 2}`, { status: "PRESENTE" }))
    ];
    expect(conquistas.avaliarPeriodoPerfeito(eventos, { filtroFalha: { status: "AUSENTE" }, minimoOcorrenciasNoPeriodo: 10, diasPeriodo: 90 }, agora)).toBe(true);
  });
});

describe("avaliarRegra (dispatcher)", () => {
  test("despacha pro avaliador certo por tipoRegra", () => {
    const eventos = [evento("X", "2026-01-01", { ok: true })];
    expect(conquistas.avaliarRegra({ tipoRegra: "marco_unico", config: { filtro: { ok: true } } }, eventos)).toBe(true);
    expect(conquistas.avaliarRegra({ tipoRegra: "contagem_evento", config: { minimoOcorrencias: 2 } }, eventos)).toBe(false);
  });

  test("tipo de regra desconhecido nunca desbloqueia (fail-safe)", () => {
    expect(conquistas.avaliarRegra({ tipoRegra: "algo_inventado", config: {} }, [])).toBe(false);
  });
});

describe("elegivelPorPreRequisito (progressão em cadeia)", () => {
  test("sem pré-requisito, sempre elegível", () => {
    expect(conquistas.elegivelPorPreRequisito({ preRequisitoConquistaId: null }, new Set())).toBe(true);
  });

  test("com pré-requisito, só elegível se ele já estiver desbloqueado", () => {
    const conquista = { conquistaId: 2, preRequisitoConquistaId: 1 };
    expect(conquistas.elegivelPorPreRequisito(conquista, new Set())).toBe(false);
    expect(conquistas.elegivelPorPreRequisito(conquista, new Set([1]))).toBe(true);
  });
});

describe("visivelNoCatalogo (oculta até desbloquear)", () => {
  test("conquista não-oculta sempre visível", () => {
    expect(conquistas.visivelNoCatalogo({ oculta: false }, false)).toBe(true);
  });

  test("conquista oculta some enquanto não desbloqueada, aparece depois", () => {
    expect(conquistas.visivelNoCatalogo({ oculta: true }, false)).toBe(false);
    expect(conquistas.visivelNoCatalogo({ oculta: true }, true)).toBe(true);
  });
});

describe("calcularScoreMembro (item 3 — pontuação unificada)", () => {
  test("soma peso por tipo de evento + bônus de conquistas desbloqueadas", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2026-01-04", {}),
      evento("EBD_PRESENCA", "2026-01-11", {}),
      evento("EBD_ATIVIDADE_RESPOSTA", "2026-01-11", {})
    ];
    const pesos = { EBD_PRESENCA: 1, EBD_ATIVIDADE_RESPOSTA: 0.5 };
    expect(conquistas.calcularScoreMembro(eventos, pesos, 10)).toBe(12.5); // 1+1+0.5+10
  });

  test("evento marcado contaParaScore:false não soma (ex: falta registrada só pra periodo_perfeito)", () => {
    const eventos = [
      evento("EBD_PRESENCA", "2026-01-04", {}),
      evento("EBD_PRESENCA", "2026-01-11", { contaParaScore: false })
    ];
    expect(conquistas.calcularScoreMembro(eventos, { EBD_PRESENCA: 1 }, 0)).toBe(1);
  });

  test("tipo de evento sem peso configurado não quebra o cálculo (soma 0 por ele)", () => {
    expect(conquistas.calcularScoreMembro([evento("TIPO_SEM_PESO", "2026-01-01", {})], {}, 5)).toBe(5);
  });
});

describe("ordenarRanking (empates)", () => {
  test("ordena por score decrescente", () => {
    const linhas = [{ membroId: 1, score: 5 }, { membroId: 2, score: 10 }];
    expect(conquistas.ordenarRanking(linhas).map(l => l.membroId)).toEqual([2, 1]);
  });

  test("empate de score desempata por total de conquistas", () => {
    const linhas = [
      { membroId: 1, score: 10, totalConquistas: 1 },
      { membroId: 2, score: 10, totalConquistas: 3 }
    ];
    expect(conquistas.ordenarRanking(linhas).map(l => l.membroId)).toEqual([2, 1]);
  });

  test("empate total desempata por quem chegou primeiro (primeiraConquistaEm mais antiga)", () => {
    const linhas = [
      { membroId: 1, score: 10, totalConquistas: 2, primeiraConquistaEm: "2026-02-01" },
      { membroId: 2, score: 10, totalConquistas: 2, primeiraConquistaEm: "2026-01-01" }
    ];
    expect(conquistas.ordenarRanking(linhas).map(l => l.membroId)).toEqual([2, 1]);
  });

  test("empate absoluto desempata por MembroId crescente (determinístico)", () => {
    const linhas = [{ membroId: 5, score: 1, totalConquistas: 0 }, { membroId: 2, score: 1, totalConquistas: 0 }];
    expect(conquistas.ordenarRanking(linhas).map(l => l.membroId)).toEqual([2, 5]);
  });
});

describe("validarRegraConfig", () => {
  test("recusa tipoRegra desconhecido", () => {
    expect(conquistas.validarRegraConfig({ tipoRegra: "invalido", tipoEvento: "X", config: {} }).valido).toBe(false);
  });

  test("recusa contagem_evento sem minimoOcorrencias", () => {
    expect(conquistas.validarRegraConfig({ tipoRegra: "contagem_evento", tipoEvento: "X", config: {} }).valido).toBe(false);
  });

  test("recusa combinacao_exata sem camposEsperados", () => {
    expect(conquistas.validarRegraConfig({ tipoRegra: "combinacao_exata", tipoEvento: "X", config: {} }).valido).toBe(false);
  });

  test("aceita configs válidas dos 5 tipos", () => {
    expect(conquistas.validarRegraConfig({ tipoRegra: "contagem_evento", tipoEvento: "X", config: { minimoOcorrencias: 1 } }).valido).toBe(true);
    expect(conquistas.validarRegraConfig({ tipoRegra: "sequencia", tipoEvento: "X", config: { minimoConsecutivas: 2 } }).valido).toBe(true);
    expect(conquistas.validarRegraConfig({ tipoRegra: "combinacao_exata", tipoEvento: "X", config: { camposEsperados: { a: 1 } } }).valido).toBe(true);
    expect(conquistas.validarRegraConfig({ tipoRegra: "marco_unico", tipoEvento: "X", config: {} }).valido).toBe(true);
    expect(conquistas.validarRegraConfig({ tipoRegra: "periodo_perfeito", tipoEvento: "X", config: { diasPeriodo: 90 } }).valido).toBe(true);
  });
});
