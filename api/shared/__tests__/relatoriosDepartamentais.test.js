// Testes do formulário dinâmico de Relatórios Departamentais (v5.2) — o
// bloco Integração precisa somar certo, a EBD precisa somar as semanas em
// vez de aceitar um total digitado à parte, e o pré-preenchimento só pode
// trazer campos ESTADO (nunca FLUXO, que é sempre zerado no mês novo).
const { criarPoolFalso } = require("./testUtils");
const rd = require("../relatoriosDepartamentais");

describe("calcularTotalIntegracao", () => {
  test("soma os 3 campos do bloco Integração", () => {
    expect(rd.calcularTotalIntegracao({ conversao: 5, reconciliacao: 2, deOutraIgreja: 1 })).toBe(8);
  });
  test("trata ausência de valor como zero", () => {
    expect(rd.calcularTotalIntegracao({ conversao: 3 })).toBe(3);
  });
});

describe("somarValoresSemanais (EBD)", () => {
  test("soma as 5 semanas lançadas", () => {
    expect(rd.somarValoresSemanais({ 1: 10, 2: 8, 3: 12, 4: 9, 5: 11 })).toBe(50);
  });
  test("semana não lançada conta como zero, nunca quebra a soma", () => {
    expect(rd.somarValoresSemanais({ 1: 10, 3: 12 })).toBe(22);
  });
  test("mês sem nenhuma semana lançada soma zero", () => {
    expect(rd.somarValoresSemanais({})).toBe(0);
  });
});

describe("calcularIndicadoresEbd", () => {
  test("total de presença e percentuais sobre matriculados", () => {
    const r = rd.calcularIndicadoresEbd({ alunosPresentes: 40, alunosAusentes: 10, alunosMatriculados: 50, visitantes: 5 });
    expect(r.totalPresenca).toBe(45);
    expect(r.percentualPresenca).toBe(80);
    expect(r.percentualAusencia).toBe(20);
  });
  test("sem matriculados, percentuais vêm nulos (não divide por zero)", () => {
    const r = rd.calcularIndicadoresEbd({ alunosPresentes: 0, alunosAusentes: 0, alunosMatriculados: 0, visitantes: 0 });
    expect(r.percentualPresenca).toBeNull();
    expect(r.percentualAusencia).toBeNull();
  });
});

describe("camposParaPrePreencher", () => {
  test("só devolve campos de comportamento ESTADO", () => {
    const campos = [
      { nomeCampo: "membrosEmComunhao", comportamento: "ESTADO" },
      { nomeCampo: "casasVisitadas", comportamento: "FLUXO" },
      { nomeCampo: "congregados", comportamento: "ESTADO" }
    ];
    const r = rd.camposParaPrePreencher(campos);
    expect(r.map(c => c.nomeCampo)).toEqual(["membrosEmComunhao", "congregados"]);
  });
});

describe("buscarSchemaVigente", () => {
  test("permiteSemanal do schema é calculado a partir dos campos, não digitado à parte", async () => {
    const { pool } = criarPoolFalso([
      [{ schemaRelatorioId: 1, departamentoId: 7, rotuloPapelLocal: "Superintendente Local" }],
      [
        { campoFormularioId: 1, nomeCampo: "alunosMatriculados", rotulo: "Alunos Matriculados", grupo: "CONTAGEM", comportamento: "ESTADO", tipoDado: "INTEIRO", permiteSemanal: false, ordem: 1 },
        { campoFormularioId: 2, nomeCampo: "alunosPresentes", rotulo: "Alunos Presentes", grupo: "CONTAGEM", comportamento: "FLUXO", tipoDado: "INTEIRO", permiteSemanal: true, ordem: 2 }
      ]
    ]);
    const schema = await rd.buscarSchemaVigente(pool, 7);
    expect(schema.permiteSemanal).toBe(true); // pelo menos 1 campo semanal
    expect(schema.campos).toHaveLength(2);
    expect(schema.campos[0].permiteSemanal).toBe(false);
    expect(schema.campos[1].permiteSemanal).toBe(true);
    expect(schema.camposEventos).toBe(rd.CAMPOS_EVENTOS);
    expect(schema.camposIntegracao).toBe(rd.CAMPOS_INTEGRACAO);
  });

  test("schema sem nenhum campo semanal calcula permiteSemanal=false", async () => {
    const { pool } = criarPoolFalso([
      [{ schemaRelatorioId: 2, departamentoId: 1, rotuloPapelLocal: "Líder Local" }],
      [{ campoFormularioId: 3, nomeCampo: "congregados", rotulo: "Congregados", grupo: "CONTAGEM", comportamento: "ESTADO", tipoDado: "INTEIRO", permiteSemanal: false, ordem: 1 }]
    ]);
    const schema = await rd.buscarSchemaVigente(pool, 1);
    expect(schema.permiteSemanal).toBe(false);
  });

  test("departamento sem schema seedado devolve null", async () => {
    const { pool } = criarPoolFalso([[]]);
    const schema = await rd.buscarSchemaVigente(pool, 999);
    expect(schema).toBeNull();
  });
});

describe("buscarValoresParaPrePreencher", () => {
  test("sem relatório anterior, devolve mapa vazio", async () => {
    const { pool } = criarPoolFalso([[]]);
    const mapa = await rd.buscarValoresParaPrePreencher(pool, { congregacaoId: 1, departamentoId: 2, antesDeMes: 3, antesDeAno: 2026 });
    expect(mapa).toEqual({});
  });

  test("com relatório anterior, devolve só os valores ESTADO dele", async () => {
    const { pool } = criarPoolFalso([
      [{ relatorioDepartamentalId: 55 }],
      [{ nomeCampo: "congregados", valor: 120 }, { nomeCampo: "membrosEmComunhao", valor: 80 }]
    ]);
    const mapa = await rd.buscarValoresParaPrePreencher(pool, { congregacaoId: 1, departamentoId: 2, antesDeMes: 3, antesDeAno: 2026 });
    expect(mapa).toEqual({ congregados: 120, membrosEmComunhao: 80 });
  });
});
