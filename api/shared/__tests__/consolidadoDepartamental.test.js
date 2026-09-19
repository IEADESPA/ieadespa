// Testes do Consolidado de Campo (v5.5.1) — o retrato eclesiástico precisa
// somar certo entre departamentos, nunca esconder quem não mandou
// relatório atrás de um zero silencioso, e o histórico só conta o que já
// foi de fato enviado.
const { criarPoolFalso } = require("./testUtils");
const cd = require("../consolidadoDepartamental");

describe("relatorioEstaPendente", () => {
  test("sem status (nenhum relatório existe) é pendente", () => {
    expect(cd.relatorioEstaPendente(undefined)).toBe(true);
    expect(cd.relatorioEstaPendente(null)).toBe(true);
  });
  test("RASCUNHO é pendente", () => {
    expect(cd.relatorioEstaPendente("RASCUNHO")).toBe(true);
  });
  test("ENVIADO e além não são pendentes", () => {
    expect(cd.relatorioEstaPendente("ENVIADO")).toBe(false);
    expect(cd.relatorioEstaPendente("APROVADO_AREA")).toBe(false);
    expect(cd.relatorioEstaPendente("APROVADO_GERAL")).toBe(false);
    expect(cd.relatorioEstaPendente("RETIFICADO")).toBe(false);
  });
});

describe("resolverCongregacoesDoNivel", () => {
  test("congregacao devolve só o próprio id, sem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "congregacao", 7);
    expect(ids).toEqual([7]);
    expect(chamadas).toHaveLength(0);
  });
  test("area consulta as congregações daquela área", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CongregacaoId: 1 }, { CongregacaoId: 2 }]]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "area", 5);
    expect(ids).toEqual([1, 2]);
    expect(chamadas[0].inputs.areaId).toBe(5);
  });
  test("campo consulta todas as congregações ativas", async () => {
    const { pool } = criarPoolFalso([[{ CongregacaoId: 1 }, { CongregacaoId: 2 }, { CongregacaoId: 3 }]]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "campo", null);
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe("agregarConsolidado", () => {
  test("soma Eventos/Integração/rateio só dos relatórios não pendentes, por departamento e no total", () => {
    const linhas = [
      { departamentoId: 1, sigla: "UCADESPA", nome: "União de Crianças", congregacaoId: 10, congregacaoNome: "Sede", status: "APROVADO_GERAL",
        eventosLocal: 2, eventosArea: 1, eventosGeral: 0, integracaoConversao: 3, integracaoReconciliacao: 0, integracaoDeOutraIgreja: 1,
        valorParaGeral: 100, valorParaLocal: 50 },
      { departamentoId: 1, sigla: "UCADESPA", nome: "União de Crianças", congregacaoId: 11, congregacaoNome: "Bairro Novo", status: "RASCUNHO",
        eventosLocal: 99, eventosArea: 99, eventosGeral: 99, integracaoConversao: 99, integracaoReconciliacao: 99, integracaoDeOutraIgreja: 99,
        valorParaGeral: 9999, valorParaLocal: 9999 } // não deve entrar em nada — ainda é rascunho
    ];
    const r = cd.agregarConsolidado(linhas);
    expect(r.porDepartamento).toHaveLength(1);
    const ucadespa = r.porDepartamento[0];
    expect(ucadespa.totalCongregacoes).toBe(2);
    expect(ucadespa.totalEnviados).toBe(1);
    expect(ucadespa.totalPendentes).toBe(1);
    expect(ucadespa.eventosLocal).toBe(2); // só o aprovado, não o rascunho (99)
    expect(ucadespa.valorParaGeral).toBe(100);
    expect(r.totais.eventosLocal).toBe(2);
    expect(r.totais.valorParaGeral).toBe(100);
    expect(r.pendencias).toEqual([{ departamentoId: 1, sigla: "UCADESPA", congregacaoId: 11, congregacaoNome: "Bairro Novo", status: "RASCUNHO" }]);
  });

  test("relatório inexistente (LEFT JOIN sem linha) também vira pendência, com status NAO_INICIADO", () => {
    const linhas = [
      { departamentoId: 2, sigla: "UMADESPA", nome: "União de Mocidade", congregacaoId: 10, congregacaoNome: "Sede", status: null,
        eventosLocal: null, eventosArea: null, eventosGeral: null, integracaoConversao: null, integracaoReconciliacao: null, integracaoDeOutraIgreja: null,
        valorParaGeral: null, valorParaLocal: null }
    ];
    const r = cd.agregarConsolidado(linhas);
    expect(r.pendencias[0].status).toBe("NAO_INICIADO");
    expect(r.porDepartamento[0].totalPendentes).toBe(1);
    expect(r.totais.eventosLocal).toBe(0);
  });

  test("soma Eventos/Integração ENTRE departamentos diferentes no total geral (retrato eclesiástico da congregação)", () => {
    const linhas = [
      { departamentoId: 1, sigla: "UCADESPA", nome: "UCADESPA", congregacaoId: 10, congregacaoNome: "Sede", status: "ENVIADO",
        eventosLocal: 2, eventosArea: 0, eventosGeral: 0, integracaoConversao: 1, integracaoReconciliacao: 0, integracaoDeOutraIgreja: 0, valorParaGeral: 0, valorParaLocal: 0 },
      { departamentoId: 7, sigla: "EBD", nome: "EBD", congregacaoId: 10, congregacaoNome: "Sede", status: "APROVADO_GERAL",
        eventosLocal: 3, eventosArea: 0, eventosGeral: 0, integracaoConversao: 2, integracaoReconciliacao: 0, integracaoDeOutraIgreja: 0, valorParaGeral: 0, valorParaLocal: 0 }
    ];
    const r = cd.agregarConsolidado(linhas);
    expect(r.totais.eventosLocal).toBe(5); // 2 (UCADESPA) + 3 (EBD)
    expect(r.totais.integracaoConversao).toBe(3); // 1 + 2
  });
});

describe("consolidarPorDepartamento", () => {
  test("sem congregações no escopo, devolve tudo vazio sem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await cd.consolidarPorDepartamento(pool, [], 3, 2026);
    expect(r.porDepartamento).toEqual([]);
    expect(r.pendencias).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });

  test("monta o IN(...) parametrizado com um placeholder por congregação", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await cd.consolidarPorDepartamento(pool, [10, 11, 12], 3, 2026);
    expect(chamadas[0].inputs.cong0).toBe(10);
    expect(chamadas[0].inputs.cong1).toBe(11);
    expect(chamadas[0].inputs.cong2).toBe(12);
    expect(chamadas[0].sql).toContain("@cong0,@cong1,@cong2");
  });
});

// v5.8 — Região/Quadrante/Distrito somam a mesma hierarquia de vínculo pai
// já usada em shared/escopo.js, só devolvendo id em vez de nome.
describe("resolverCongregacoesDoNivel (v5.8 — Região/Quadrante/Distrito)", () => {
  test("regiao consulta congregações via Areas.RegiaoId", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CongregacaoId: 21 }, { CongregacaoId: 22 }]]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "regiao", 9);
    expect(ids).toEqual([21, 22]);
    expect(chamadas[0].inputs.regiaoId).toBe(9);
  });
  test("quadrante desce Areas -> Regioes -> Quadrantes", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CongregacaoId: 30 }]]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "quadrante", 4);
    expect(ids).toEqual([30]);
    expect(chamadas[0].inputs.quadranteId).toBe(4);
  });
  test("distrito desce a cadeia inteira até Quadrantes.DistritoId", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CongregacaoId: 40 }, { CongregacaoId: 41 }]]);
    const ids = await cd.resolverCongregacoesDoNivel(pool, "distrito", 2);
    expect(ids).toEqual([40, 41]);
    expect(chamadas[0].inputs.distritoId).toBe(2);
  });
});

describe("classificarPorte (v5.8)", () => {
  test("abaixo do limiar de PEQUENA fica PEQUENA", () => {
    expect(cd.classificarPorte(0)).toBe("PEQUENA");
    expect(cd.classificarPorte(99)).toBe("PEQUENA");
  });
  test("entre os limiares fica MEDIA", () => {
    expect(cd.classificarPorte(100)).toBe("MEDIA");
    expect(cd.classificarPorte(299)).toBe("MEDIA");
  });
  test("no limiar de cima ou acima fica GRANDE", () => {
    expect(cd.classificarPorte(300)).toBe("GRANDE");
    expect(cd.classificarPorte(5000)).toBe("GRANDE");
  });
  test("valor ausente/inválido não quebra, conta como 0 (PEQUENA)", () => {
    expect(cd.classificarPorte(null)).toBe("PEQUENA");
    expect(cd.classificarPorte(undefined)).toBe("PEQUENA");
  });
});

describe("agruparPorPorte (v5.8)", () => {
  test("agrupa por porte e calcula média de cada campo dentro do grupo", () => {
    const linhas = [
      { congregacaoId: 1, porte: "PEQUENA", totalMembrosAtivos: 50, totalEventos: 10, totalIntegracao: 2, valorParaGeral: 100, valorParaLocal: 50 },
      { congregacaoId: 2, porte: "PEQUENA", totalMembrosAtivos: 80, totalEventos: 20, totalIntegracao: 4, valorParaGeral: 200, valorParaLocal: 100 },
      { congregacaoId: 3, porte: "GRANDE", totalMembrosAtivos: 500, totalEventos: 100, totalIntegracao: 20, valorParaGeral: 1000, valorParaLocal: 500 }
    ];
    const grupos = cd.agruparPorPorte(linhas);
    expect(grupos).toHaveLength(2);
    const pequena = grupos.find(g => g.porte === "PEQUENA");
    expect(pequena.totalCongregacoes).toBe(2);
    expect(pequena.medias.totalEventos).toBe(15); // (10+20)/2
    expect(pequena.medias.valorParaGeral).toBe(150);
    const grande = grupos.find(g => g.porte === "GRANDE");
    expect(grande.totalCongregacoes).toBe(1);
    expect(grande.medias.totalEventos).toBe(100);
  });
  test("lista vazia devolve nenhum grupo", () => {
    expect(cd.agruparPorPorte([])).toEqual([]);
  });
});

describe("compararPorPorte (v5.8)", () => {
  test("sem congregações no escopo, devolve lista vazia sem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await cd.compararPorPorte(pool, [], 3, 2026);
    expect(r).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  test("cruza totais + contagem de membros ativos e classifica por porte", async () => {
    const { pool } = criarPoolFalso([
      [
        { congregacaoId: 10, congregacaoNome: "Sede", totalEventos: 5, totalIntegracao: 1, valorParaGeral: 100, valorParaLocal: 50 },
        { congregacaoId: 11, congregacaoNome: "Bairro Novo", totalEventos: 2, totalIntegracao: 0, valorParaGeral: 20, valorParaLocal: 10 }
      ],
      [
        { congregacaoId: 10, totalMembrosAtivos: 350 },
        { congregacaoId: 11, totalMembrosAtivos: 40 }
      ]
    ]);
    const grupos = await cd.compararPorPorte(pool, [10, 11], 3, 2026);
    const sede = grupos.find(g => g.porte === "GRANDE").congregacoes.find(c => c.congregacaoId === 10);
    expect(sede.totalMembrosAtivos).toBe(350);
    const bairro = grupos.find(g => g.porte === "PEQUENA").congregacoes.find(c => c.congregacaoId === 11);
    expect(bairro.totalMembrosAtivos).toBe(40);
  });
  test("congregação sem nenhum membro ativo cadastrado conta como 0 (PEQUENA), não quebra", async () => {
    const { pool } = criarPoolFalso([
      [{ congregacaoId: 12, congregacaoNome: "Nova", totalEventos: 0, totalIntegracao: 0, valorParaGeral: 0, valorParaLocal: 0 }],
      [] // nenhuma linha de contagem de membros pra essa congregação
    ]);
    const grupos = await cd.compararPorPorte(pool, [12], 3, 2026);
    expect(grupos[0].porte).toBe("PEQUENA");
    expect(grupos[0].congregacoes[0].totalMembrosAtivos).toBe(0);
  });
});

describe("serieHistoricaCampo (v5.8)", () => {
  test("sem congregações, departamento ou campo, devolve vazio sem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect(await cd.serieHistoricaCampo(pool, [], 1, "ofertas", 12)).toEqual([]);
    expect(await cd.serieHistoricaCampo(pool, [10], null, "ofertas", 12)).toEqual([]);
    expect(await cd.serieHistoricaCampo(pool, [10], 1, null, 12)).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  test("devolve em ordem cronológica (mais antigo primeiro), filtrando por departamento e nome do campo", async () => {
    const { pool, chamadas } = criarPoolFalso([[
      { anoReferencia: 2026, mesReferencia: 3, total: 300, totalRelatorios: 3 },
      { anoReferencia: 2026, mesReferencia: 2, total: 200, totalRelatorios: 2 },
      { anoReferencia: 2026, mesReferencia: 1, total: 100, totalRelatorios: 1 }
    ]]);
    const serie = await cd.serieHistoricaCampo(pool, [10], 5, "ofertas", 12);
    expect(serie.map(p => p.mesReferencia)).toEqual([1, 2, 3]);
    expect(chamadas[0].inputs.depId).toBe(5);
    expect(chamadas[0].inputs.nomeCampo).toBe("ofertas");
  });
});

describe("filtrarMesmoMesCalendario (v5.8)", () => {
  test("recorta só o mês pedido, através dos anos, em ordem crescente", () => {
    const serie = [
      { anoReferencia: 2024, mesReferencia: 3, total: 100 },
      { anoReferencia: 2024, mesReferencia: 4, total: 999 }, // outro mês, deve ficar de fora
      { anoReferencia: 2026, mesReferencia: 3, total: 300 },
      { anoReferencia: 2025, mesReferencia: 3, total: 200 }
    ];
    const marco = cd.filtrarMesmoMesCalendario(serie, 3);
    expect(marco.map(p => p.anoReferencia)).toEqual([2024, 2025, 2026]);
    expect(marco.every(p => p.mesReferencia === 3)).toBe(true);
  });
  test("mês sem nenhuma ocorrência devolve lista vazia", () => {
    expect(cd.filtrarMesmoMesCalendario([{ anoReferencia: 2026, mesReferencia: 5, total: 1 }], 12)).toEqual([]);
  });
});

describe("historicoConsolidado", () => {
  test("sem congregações no escopo, devolve lista vazia sem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await cd.historicoConsolidado(pool, [], 12);
    expect(r).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });

  test("devolve em ordem cronológica (mais antigo primeiro)", async () => {
    const { pool } = criarPoolFalso([[
      { mesReferencia: 3, anoReferencia: 2026, totalRelatorios: 5, totalEventos: 10, totalIntegracao: 2, totalParaGeral: 100, totalParaLocal: 50 },
      { mesReferencia: 2, anoReferencia: 2026, totalRelatorios: 4, totalEventos: 8, totalIntegracao: 1, totalParaGeral: 80, totalParaLocal: 40 }
    ]]);
    const r = await cd.historicoConsolidado(pool, [10], 12);
    expect(r.map(p => p.mesReferencia)).toEqual([2, 3]); // invertido — cronológico
  });
});
