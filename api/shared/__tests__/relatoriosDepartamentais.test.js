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

describe("calcularValorTotalFinanceiro", () => {
  const campos = [
    { nomeCampo: "congregados", grupo: "CONTAGEM" },
    { nomeCampo: "mensalidades", grupo: "FINANCEIRO" },
    { nomeCampo: "ofertas", grupo: "FINANCEIRO" },
    { nomeCampo: "campanhas", grupo: "FINANCEIRO" },
    { nomeCampo: "outros", grupo: "FINANCEIRO" }
  ];
  test("soma todo campo do grupo FINANCEIRO — é a base do rateio local/geral (v5.4)", () => {
    const valores = { congregados: 999, mensalidades: 200, ofertas: 150, campanhas: 50, outros: 10 };
    expect(rd.calcularValorTotalFinanceiro(campos, valores)).toBe(410);
  });
  test("não soma campos de outro grupo (ex: contagem)", () => {
    const valores = { congregados: 999, mensalidades: 100, ofertas: 0, campanhas: 0, outros: 0 };
    expect(rd.calcularValorTotalFinanceiro(campos, valores)).toBe(100);
  });
  test("campo financeiro sem valor lançado conta como zero", () => {
    expect(rd.calcularValorTotalFinanceiro(campos, {})).toBe(0);
  });
  test("funciona igual para departamento com nomes de campo diferentes (ex: Ação da Fé)", () => {
    const camposAcaoDaFe = [{ nomeCampo: "contribuicoes", grupo: "FINANCEIRO" }, { nomeCampo: "ofertas", grupo: "FINANCEIRO" }, { nomeCampo: "campanha", grupo: "FINANCEIRO" }];
    const valores = { contribuicoes: 300, ofertas: 80, campanha: 20 };
    expect(rd.calcularValorTotalFinanceiro(camposAcaoDaFe, valores)).toBe(400);
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

describe("nivelAutorizadoParaAcao (v5.3)", () => {
  test("GLOBAL sempre autoriza qualquer ação (última palavra do Presidente/Secretário Geral)", () => {
    for (const acao of Object.keys(rd.NIVEIS_POR_ACAO)) {
      expect(rd.nivelAutorizadoParaAcao(acao, "GLOBAL")).toBe(true);
    }
  });
  test("CONGREGACAO só pode enviar", () => {
    expect(rd.nivelAutorizadoParaAcao("ENVIAR", "CONGREGACAO")).toBe(true);
    expect(rd.nivelAutorizadoParaAcao("APROVAR_AREA", "CONGREGACAO")).toBe(false);
    expect(rd.nivelAutorizadoParaAcao("RETIFICAR", "CONGREGACAO")).toBe(false);
  });
  test("AREA aprova e comenta, mas não corrige nem retifica", () => {
    expect(rd.nivelAutorizadoParaAcao("APROVAR_AREA", "AREA")).toBe(true);
    expect(rd.nivelAutorizadoParaAcao("COMENTAR", "AREA")).toBe(true);
    expect(rd.nivelAutorizadoParaAcao("CORRIGIR", "AREA")).toBe(false);
    expect(rd.nivelAutorizadoParaAcao("RETIFICAR", "AREA")).toBe(false);
  });
  test("DEPARTAMENTO (Líder Geral) corrige e aprova geral, mas não retifica", () => {
    expect(rd.nivelAutorizadoParaAcao("CORRIGIR", "DEPARTAMENTO")).toBe(true);
    expect(rd.nivelAutorizadoParaAcao("APROVAR_GERAL", "DEPARTAMENTO")).toBe(true);
    expect(rd.nivelAutorizadoParaAcao("RETIFICAR", "DEPARTAMENTO")).toBe(false);
  });
  test("Região/Quadrante/Distrito não autorizam nada hoje — Regimento não sustenta ação direta (representados por delegação, Art. 104-B)", () => {
    for (const acao of Object.keys(rd.NIVEIS_POR_ACAO)) {
      expect(rd.nivelAutorizadoParaAcao(acao, "REGIAO")).toBe(false);
      expect(rd.nivelAutorizadoParaAcao(acao, "QUADRANTE")).toBe(false);
      expect(rd.nivelAutorizadoParaAcao(acao, "DISTRITO")).toBe(false);
    }
  });
});

describe("resolverTransicao (máquina de estados, v5.3)", () => {
  test("fluxo feliz completo: rascunho -> enviado -> aprovado_area -> aprovado_geral -> retificado", () => {
    expect(rd.resolverTransicao("ENVIAR", "RASCUNHO")).toEqual({ ok: true, novoStatus: "ENVIADO" });
    expect(rd.resolverTransicao("APROVAR_AREA", "ENVIADO")).toEqual({ ok: true, novoStatus: "APROVADO_AREA" });
    expect(rd.resolverTransicao("APROVAR_GERAL", "APROVADO_AREA")).toEqual({ ok: true, novoStatus: "APROVADO_GERAL" });
    expect(rd.resolverTransicao("RETIFICAR", "APROVADO_GERAL")).toEqual({ ok: true, novoStatus: "RETIFICADO" });
  });
  test("Líder Geral pode aprovar direto de ENVIADO, pulando a aprovação de Área (superior, docs/06)", () => {
    expect(rd.resolverTransicao("APROVAR_GERAL", "ENVIADO")).toEqual({ ok: true, novoStatus: "APROVADO_GERAL" });
  });
  test("comentar e corrigir não fecham fase (status permanece o mesmo)", () => {
    expect(rd.resolverTransicao("COMENTAR", "APROVADO_AREA")).toEqual({ ok: true, novoStatus: "APROVADO_AREA" });
    expect(rd.resolverTransicao("CORRIGIR", "ENVIADO")).toEqual({ ok: true, novoStatus: "ENVIADO" });
  });
  test("não deixa enviar de novo um relatório já enviado", () => {
    const r = rd.resolverTransicao("ENVIAR", "ENVIADO");
    expect(r.ok).toBe(false);
  });
  test("não deixa aprovar_area um rascunho (precisa ter sido enviado primeiro)", () => {
    const r = rd.resolverTransicao("APROVAR_AREA", "RASCUNHO");
    expect(r.ok).toBe(false);
  });
  test("não deixa retificar antes de aprovado_geral", () => {
    const r = rd.resolverTransicao("RETIFICAR", "ENVIADO");
    expect(r.ok).toBe(false);
  });
  test("retificação pode ser repetida (retificado -> retificado de novo)", () => {
    expect(rd.resolverTransicao("RETIFICAR", "RETIFICADO")).toEqual({ ok: true, novoStatus: "RETIFICADO" });
  });
});

describe("calcularPrazoEnvio / relatorioEstaAtrasado (v5.3)", () => {
  test("prazo é o último dia do mês seguinte ao de referência", () => {
    expect(rd.calcularPrazoEnvio(3, 2026)).toBe("2026-04-30");
    expect(rd.calcularPrazoEnvio(1, 2026)).toBe("2026-02-28");
  });
  test("dezembro vira janeiro do ano seguinte", () => {
    expect(rd.calcularPrazoEnvio(12, 2026)).toBe("2027-01-31");
  });
  test("envio dentro do prazo não fica atrasado", () => {
    expect(rd.relatorioEstaAtrasado(3, 2026, "2026-04-15")).toBe(false);
    expect(rd.relatorioEstaAtrasado(3, 2026, "2026-04-30")).toBe(false);
  });
  test("envio depois do prazo fica atrasado — mas o envio em si é permitido (docs/06)", () => {
    expect(rd.relatorioEstaAtrasado(3, 2026, "2026-05-01")).toBe(true);
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
