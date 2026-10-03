// Testes do v6.1 (EBD — Hierarquia e cadastros) — foco na lógica pura: a
// matrícula do Aluno é atribuída UMA VEZ por Membro (nunca duplicada), o
// vínculo de professor não pode ser designado duas vezes enquanto ativo, e
// o agrupamento/busca da visão Área -> Congregação funciona sem banco.
const ebd = require("../ebdTurmas");

describe("validarNovaTurma", () => {
  test("recusa sem congregacaoId", () => {
    const r = ebd.validarNovaTurma({ congregacaoId: null, nome: "Adultos" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/congregação/);
  });

  test("recusa nome vazio ou curto demais", () => {
    expect(ebd.validarNovaTurma({ congregacaoId: 1, nome: "" }).valido).toBe(false);
    expect(ebd.validarNovaTurma({ congregacaoId: 1, nome: "A" }).valido).toBe(false);
  });

  test("aceita nome e congregação válidos", () => {
    expect(ebd.validarNovaTurma({ congregacaoId: 1, nome: "Adultos" }).valido).toBe(true);
  });
});

describe("podeDesignarProfessor (uma turma pode ter mais de um professor, mas não o mesmo duas vezes ativo)", () => {
  test("permite designar quando não há vínculo nenhum", () => {
    expect(ebd.podeDesignarProfessor(null).permitido).toBe(true);
  });

  test("permite reativar um vínculo encerrado (mesmo professor, mesma turma, depois de sair e voltar)", () => {
    expect(ebd.podeDesignarProfessor({ ativo: false }).permitido).toBe(true);
  });

  test("recusa designar de novo quando já está ativo na turma", () => {
    const r = ebd.podeDesignarProfessor({ ativo: true });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já está ativo/);
  });
});

describe("podeMatricularAluno (matrícula única por Membro — item 2 do v6.1)", () => {
  test("permite matricular quando o membro ainda não tem vínculo de aluno", () => {
    expect(ebd.podeMatricularAluno(null).permitido).toBe(true);
  });

  test("recusa nova matrícula quando o membro já tem uma (mesmo em outra turma) — orienta a usar transferência", () => {
    const r = ebd.podeMatricularAluno({ matricula: "EBD-2026-000001" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/EBD-2026-000001/);
    expect(r.mensagem).toMatch(/transferência/);
  });
});

describe("formatarMatricula", () => {
  test("monta EBD-ANO-NNNNNN com zero-padding de 6 dígitos", () => {
    expect(ebd.formatarMatricula(2026, 1)).toBe("EBD-2026-000001");
    expect(ebd.formatarMatricula(2026, 123456)).toBe("EBD-2026-123456");
  });
});

describe("agruparPorAreaCongregacao", () => {
  const turmasPlanas = [
    { turmaId: 1, nome: "Adultos", faixaEtaria: null, ativa: true, congregacaoId: 10, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", totalProfessores: 2, totalAlunos: 15 },
    { turmaId: 2, nome: "Juvenis", faixaEtaria: "12-17", ativa: true, congregacaoId: 10, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", totalProfessores: 1, totalAlunos: 8 },
    { turmaId: 3, nome: "Adultos", faixaEtaria: null, ativa: true, congregacaoId: 20, congregacaoNome: "Bairro Novo", areaId: 2, areaNome: "Área 2", totalProfessores: 1, totalAlunos: 5 },
    { turmaId: 4, nome: "Crianças", faixaEtaria: "4-8", ativa: true, congregacaoId: 30, congregacaoNome: "Sem Área", areaId: null, areaNome: null, totalProfessores: 1, totalAlunos: 6 }
  ];

  test("agrupa por área, depois por congregação, mantendo as turmas de cada uma", () => {
    const agrupado = ebd.agruparPorAreaCongregacao(turmasPlanas);
    expect(agrupado.map(a => a.areaNome)).toEqual(["Área 1", "Área 2", "Sem Área definida"]);
    const area1 = agrupado.find(a => a.areaNome === "Área 1");
    expect(area1.congregacoes).toHaveLength(1);
    expect(area1.congregacoes[0].turmas).toHaveLength(2);
  });

  test("congregação sem área definida cai no grupo 'Sem Área definida', sem quebrar", () => {
    const agrupado = ebd.agruparPorAreaCongregacao(turmasPlanas);
    const semArea = agrupado.find(a => a.areaNome === "Sem Área definida");
    expect(semArea).toBeDefined();
    expect(semArea.congregacoes[0].congregacaoNome).toBe("Sem Área");
  });

  test("lista vazia não quebra e devolve array vazio", () => {
    expect(ebd.agruparPorAreaCongregacao([])).toEqual([]);
    expect(ebd.agruparPorAreaCongregacao(undefined)).toEqual([]);
  });
});

describe("filtrarBuscaAgrupada", () => {
  const agrupado = ebd.agruparPorAreaCongregacao([
    { turmaId: 1, nome: "Adultos", ativa: true, congregacaoId: 10, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", totalProfessores: 0, totalAlunos: 0 },
    { turmaId: 2, nome: "Juvenis", ativa: true, congregacaoId: 10, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", totalProfessores: 0, totalAlunos: 0 },
    { turmaId: 3, nome: "Crianças", ativa: true, congregacaoId: 20, congregacaoNome: "Bairro Novo", areaId: 2, areaNome: "Área 2", totalProfessores: 0, totalAlunos: 0 }
  ]);

  test("sem termo de busca devolve tudo sem alterar", () => {
    expect(ebd.filtrarBuscaAgrupada(agrupado, "")).toEqual(agrupado);
    expect(ebd.filtrarBuscaAgrupada(agrupado, null)).toEqual(agrupado);
  });

  test("busca por nome de turma filtra só as turmas que batem, mantendo a congregação", () => {
    const resultado = ebd.filtrarBuscaAgrupada(agrupado, "juvenis");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].congregacoes[0].turmas.map(t => t.nome)).toEqual(["Juvenis"]);
  });

  test("busca por nome de congregação devolve TODAS as turmas daquela congregação", () => {
    const resultado = ebd.filtrarBuscaAgrupada(agrupado, "sede");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].congregacoes[0].turmas.map(t => t.nome).sort()).toEqual(["Adultos", "Juvenis"]);
  });

  test("busca sem nenhuma correspondência devolve lista vazia (não quebra)", () => {
    expect(ebd.filtrarBuscaAgrupada(agrupado, "não existe")).toEqual([]);
  });

  test("busca é case-insensitive", () => {
    expect(ebd.filtrarBuscaAgrupada(agrupado, "CRIANÇAS")).toHaveLength(1);
  });
});
