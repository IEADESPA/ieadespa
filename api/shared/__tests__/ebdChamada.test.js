// Testes do v6.2 (EBD — Chamada e presença) — foco na lógica pura: lição
// fechada bloqueia lançamento, visitante nunca usa alunoId (nem aluno usa
// dados de visitante), presença é upsert (um registro por aluno por
// lição) e os percentuais são sempre derivados, nunca digitados.
const chamada = require("../ebdChamada");

describe("podeLancarChamada (item 1 — lição aberta/fechada por congregação)", () => {
  test("recusa quando não há lição nenhuma", () => {
    const r = chamada.podeLancarChamada(null);
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/Nenhuma lição/);
  });

  test("recusa quando a lição está fechada", () => {
    const r = chamada.podeLancarChamada({ status: "FECHADA" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/fechada/);
  });

  test("permite quando a lição está aberta", () => {
    expect(chamada.podeLancarChamada({ status: "ABERTA" }).permitido).toBe(true);
  });
});

describe("podeFecharLicao / podeReabrirLicao", () => {
  test("não fecha lição inexistente", () => {
    expect(chamada.podeFecharLicao(null).permitido).toBe(false);
  });

  test("não fecha lição já fechada", () => {
    const r = chamada.podeFecharLicao({ status: "FECHADA" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já está fechada/);
  });

  test("fecha lição aberta", () => {
    expect(chamada.podeFecharLicao({ status: "ABERTA" }).permitido).toBe(true);
  });

  test("não reabre lição já aberta", () => {
    const r = chamada.podeReabrirLicao({ status: "ABERTA" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já está aberta/);
  });

  test("reabre lição fechada", () => {
    expect(chamada.podeReabrirLicao({ status: "FECHADA" }).permitido).toBe(true);
  });
});

describe("validarLancamentoPresenca (visitante nunca é aluno, aluno nunca é visitante)", () => {
  test("recusa status inválido", () => {
    expect(chamada.validarLancamentoPresenca({ alunoId: 1, status: "QUALQUER" }).valido).toBe(false);
  });

  test("PRESENTE exige alunoId", () => {
    const r = chamada.validarLancamentoPresenca({ status: "PRESENTE" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/alunoId/);
  });

  test("AUSENTE exige alunoId e não aceita visitanteNome junto", () => {
    const r = chamada.validarLancamentoPresenca({ alunoId: 1, status: "AUSENTE", visitanteNome: "Fulano" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/visitante/);
  });

  test("aceita PRESENTE/AUSENTE com alunoId, sem dados de visitante", () => {
    expect(chamada.validarLancamentoPresenca({ alunoId: 1, status: "PRESENTE" }).valido).toBe(true);
    expect(chamada.validarLancamentoPresenca({ alunoId: 1, status: "AUSENTE" }).valido).toBe(true);
  });

  test("VISITANTE exige nome e recusa alunoId", () => {
    expect(chamada.validarLancamentoPresenca({ status: "VISITANTE" }).valido).toBe(false);
    expect(chamada.validarLancamentoPresenca({ status: "VISITANTE", alunoId: 1, visitanteNome: "Maria" }).valido).toBe(false);
  });

  test("aceita VISITANTE com nome e sem alunoId", () => {
    expect(chamada.validarLancamentoPresenca({ status: "VISITANTE", visitanteNome: "Maria" }).valido).toBe(true);
  });
});

describe("decidirAcaoRegistroPresenca (um registro por aluno por lição — upsert)", () => {
  test("CRIAR quando não existe registro ainda", () => {
    expect(chamada.decidirAcaoRegistroPresenca(null)).toBe("CRIAR");
  });

  test("ATUALIZAR quando já existe registro desse aluno nesta lição (correção de chamada)", () => {
    expect(chamada.decidirAcaoRegistroPresenca({ chamadaId: 1, status: "AUSENTE" })).toBe("ATUALIZAR");
  });
});

describe("calcularPercentuais (item 3 — sempre calculado, nunca digitado)", () => {
  test("turma sem nenhum lançamento devolve zero, sem dividir por zero", () => {
    expect(chamada.calcularPercentuais({})).toEqual({
      totalAlunos: 0, presentes: 0, ausentes: 0, visitantes: 0, percentualPresenca: 0, percentualAusencia: 0
    });
  });

  test("calcula percentual de presença e ausência sobre o total de alunos (visitante fica de fora do denominador)", () => {
    const r = chamada.calcularPercentuais({ presentes: 8, ausentes: 2, visitantes: 3 });
    expect(r.totalAlunos).toBe(10);
    expect(r.percentualPresenca).toBe(80);
    expect(r.percentualAusencia).toBe(20);
    expect(r.visitantes).toBe(3);
  });

  test("arredonda com uma casa decimal quando a divisão não é exata", () => {
    const r = chamada.calcularPercentuais({ presentes: 1, ausentes: 2, visitantes: 0 });
    expect(r.percentualPresenca).toBeCloseTo(33.3, 1);
    expect(r.percentualAusencia).toBeCloseTo(66.7, 1);
  });
});

describe("resumirChamada (agrega uma lista de registros de chamada e devolve os percentuais)", () => {
  test("conta presentes/ausentes/visitantes e calcula os percentuais", () => {
    const registros = [
      { status: "PRESENTE" }, { status: "PRESENTE" }, { status: "AUSENTE" },
      { status: "VISITANTE" }, { status: "VISITANTE" }
    ];
    const r = chamada.resumirChamada(registros);
    expect(r).toEqual({ totalAlunos: 3, presentes: 2, ausentes: 1, visitantes: 2, percentualPresenca: 66.7, percentualAusencia: 33.3 });
  });

  test("lista vazia não quebra e devolve zeros", () => {
    expect(chamada.resumirChamada([])).toEqual({ totalAlunos: 0, presentes: 0, ausentes: 0, visitantes: 0, percentualPresenca: 0, percentualAusencia: 0 });
    expect(chamada.resumirChamada(undefined)).toEqual({ totalAlunos: 0, presentes: 0, ausentes: 0, visitantes: 0, percentualPresenca: 0, percentualAusencia: 0 });
  });
});
