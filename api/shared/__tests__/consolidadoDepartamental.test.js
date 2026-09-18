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
