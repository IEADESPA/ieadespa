// Testes de regra estatutária (vB.1) — shared/estatuto.js é o coração
// jurídico do sistema: um erro aqui invalida eleição, não só relatório.
const estatuto = require("../estatuto");

describe("calcularCapacidadeEleitoral (Art. 23)", () => {
  const HOJE = "2026-06-15";

  test("membro em comunhão, 18+, 90+ dias de admissão, sem disciplina -> capacidade ativa", () => {
    const membro = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "2000-01-01", dataAdmissao: "2020-01-01" };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.capacidadeAtiva).toBe(true);
    expect(r.emPeriodoIntegracao).toBe(false);
  });

  test("dentro do Período de Integração (< 90 dias de admissão) nunca tem capacidade ativa, mesmo maior de idade", () => {
    const membro = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "1990-01-01", dataAdmissao: "2026-05-20" };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.emPeriodoIntegracao).toBe(true);
    expect(r.capacidadeAtiva).toBe(false);
  });

  test("menor de 18 anos nunca tem capacidade ativa, mesmo com anos de admissão", () => {
    const membro = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "2015-01-01", dataAdmissao: "2018-01-01" };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.capacidadeAtiva).toBe(false);
  });

  test("sob disciplina ativa perde capacidade ativa mesmo cumprindo os demais requisitos", () => {
    const membro = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "2000-01-01", dataAdmissao: "2020-01-01", processoDisciplinarAtivo: true };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.capacidadeAtiva).toBe(false);
  });

  test("elegível a Diretoria/Conselho Fiscal exige 365+ dias de admissão E dizimista fiel, não só capacidade ativa", () => {
    const semDizimista = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "2000-01-01", dataAdmissao: "2025-12-01", dizimistaFiel: false };
    const r1 = estatuto.calcularCapacidadeEleitoral(semDizimista, HOJE);
    expect(r1.capacidadeAtiva).toBe(true);
    expect(r1.elegivelDiretoriaConselhoFiscal).toBe(false);

    const comDizimista = { situacaoMembro: "EM_COMUNHAO", dataNascimento: "2000-01-01", dataAdmissao: "2020-01-01", dizimistaFiel: true };
    const r2 = estatuto.calcularCapacidadeEleitoral(comDizimista, HOJE);
    expect(r2.elegivelDiretoriaConselhoFiscal).toBe(true);
  });

  test("dado incompleto (sem data de nascimento/admissão) NUNCA assume elegibilidade (Art. 23 §3º)", () => {
    const membro = { situacaoMembro: "EM_COMUNHAO" };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.capacidadeAtiva).toBe(false);
    expect(r.elegivelDiretoriaConselhoFiscal).toBe(false);
    expect(r.motivo).toMatch(/dados incompletos/);
  });

  test("congregado nunca tem capacidade eleitoral, mesmo com dados completos e maior de idade", () => {
    const membro = { situacaoMembro: "CONGREGADO", dataNascimento: "1990-01-01", dataAdmissao: "2010-01-01" };
    const r = estatuto.calcularCapacidadeEleitoral(membro, HOJE);
    expect(r.categoria).toBe("Congregado");
    expect(r.capacidadeAtiva).toBe(false);
  });
});

describe("avaliarQuorumInstalacao (quórum de 2 estágios)", () => {
  test("órgão sem quórum de 2 estágios (ex: sigla desconhecida) retorna null", () => {
    expect(estatuto.avaliarQuorumInstalacao("SIGLA_QUALQUER_NAO_MAPEADA", 5, 10)).toBeNull();
  });

  test("maioria absoluta atingida na 1ª convocação", () => {
    const r = estatuto.avaliarQuorumInstalacao("CLI", 6, 10);
    expect(r.maioriaAbsolutaNecessaria).toBe(6);
    expect(r.maioriaAbsolutaAtingida).toBe(true);
  });

  test("maioria absoluta NÃO atingida -> instala em 2ª convocação com qualquer número", () => {
    const r = estatuto.avaliarQuorumInstalacao("CLI", 4, 10);
    expect(r.maioriaAbsolutaAtingida).toBe(false);
    expect(r.mensagem).toMatch(/2ª convocação/);
  });

  test("maioria absoluta é floor(universo/2) + 1, nunca metade exata", () => {
    // universo par: metade exata (5 de 10) NÃO basta, precisa de +1 (6)
    const r = estatuto.avaliarQuorumInstalacao("CLI", 5, 10);
    expect(r.maioriaAbsolutaNecessaria).toBe(6);
    expect(r.maioriaAbsolutaAtingida).toBe(false);
  });
});

describe("elegivelAbandonoMaterial (Art. 11)", () => {
  test("só conta enquanto SEM_COMUNHAO e com dataAfastamento preenchida", () => {
    expect(estatuto.elegivelAbandonoMaterial({ situacaoMembro: "EM_COMUNHAO", dataAfastamento: "2026-01-01" }, "2026-06-15")).toBe(false);
    expect(estatuto.elegivelAbandonoMaterial({ situacaoMembro: "SEM_COMUNHAO" }, "2026-06-15")).toBe(false);
  });

  test("90+ dias sem comunhão -> elegível; menos de 90 -> não", () => {
    expect(estatuto.elegivelAbandonoMaterial({ situacaoMembro: "SEM_COMUNHAO", dataAfastamento: "2026-01-01" }, "2026-06-15")).toBe(true);
    expect(estatuto.elegivelAbandonoMaterial({ situacaoMembro: "SEM_COMUNHAO", dataAfastamento: "2026-06-01" }, "2026-06-15")).toBe(false);
  });
});

describe("idadeEm / diasDesde — funções de data puras (base de tudo acima)", () => {
  test("idadeEm calcula aniversário ainda não chegado corretamente", () => {
    expect(estatuto.idadeEm("2000-12-31", "2026-06-15")).toBe(25);
    expect(estatuto.idadeEm("2000-01-01", "2026-06-15")).toBe(26);
  });

  test("diasDesde conta dias corridos, com 'hoje' como Date em qualquer hora", () => {
    expect(estatuto.diasDesde("2026-06-01", new Date(2026, 5, 15, 12, 0, 0))).toBe(14);
  });

  test("diasDesde conta dias corridos, com 'hoje' como string 'YYYY-MM-DD'", () => {
    expect(estatuto.diasDesde("2026-06-01", "2026-06-15")).toBe(14);
  });

  // v5.3 — bug real: antes da correção, "hoje menos hoje" dava -1 sempre
  // que a função rodava antes do meio-dia local (comparava o horário exato
  // de "agora" contra a data-alvo ancorada ao meio-dia). Isso derrubou o CI
  // publicando a v5.3 (vB.13/credenciamento calculava período de integração
  // errado pra quem foi admitido "hoje"). diasDesde de uma data igual a
  // hoje precisa ser 0 em QUALQUER hora do dia, com ou sem 'hoje' explícito.
  test("diasDesde de uma data igual a hoje é sempre 0, em qualquer hora do dia (regressão)", () => {
    for (const hora of [0, 6, 11, 12, 13, 18, 23]) {
      const hoje = new Date();
      hoje.setHours(hora, 0, 0, 0);
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      expect(estatuto.diasDesde(hojeStr, hoje)).toBe(0);
    }
  });

  test("diasDesde sem 'hoje' explícito (produção real) também dá 0 pra data de hoje", () => {
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    expect(estatuto.diasDesde(hojeStr)).toBe(0);
  });
});
