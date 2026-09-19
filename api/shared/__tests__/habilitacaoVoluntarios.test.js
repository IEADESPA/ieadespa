// Testes da esteira de habilitação de voluntários (v5.7) — a parte que os
// revisores mais vão escrutinar: a esteira é DE VERDADE sequencial (não dá
// pra carimbar "apto" pulando etapa), o status nunca é digitado (sempre
// calculado a partir das etapas/validade), e a Regra dos 6 meses vem da
// data de admissão/carta, nunca de um número solto.
const hv = require("../habilitacaoVoluntarios");

function habVazia() {
  return {
    etapaFichaInscricaoEm: null, etapaReferenciasEm: null, etapaEntrevistaEm: null,
    etapaAntecedentesEm: null, etapaTreinamentoEm: null, etapaTermoAssinadoEm: null,
    aptoValidoAte: null, inaptoEm: null
  };
}

function habComEtapas(qtdConcluidas) {
  const hab = habVazia();
  hv.ETAPAS.slice(0, qtdConcluidas).forEach(etapa => { hab[hv.CAMPO_ETAPA[etapa]] = "2026-01-01T00:00:00Z"; });
  return hab;
}

describe("podeConcluirEtapa (esteira sequencial — não dá pra pular)", () => {
  test("a primeira etapa (ficha de inscrição) sempre pode ser concluída do zero", () => {
    expect(hv.podeConcluirEtapa(habVazia(), "FICHA_INSCRICAO").permitido).toBe(true);
  });

  test("não permite pular direto pra entrevista sem ficha nem referências", () => {
    const resultado = hv.podeConcluirEtapa(habVazia(), "ENTREVISTA");
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensagem).toMatch(/Ficha de inscrição/);
  });

  test("não permite pular direto pro termo sem antecedentes/treinamento", () => {
    const hab = habComEtapas(3); // ficha, referências, entrevista concluídas
    const resultado = hv.podeConcluirEtapa(hab, "TERMO");
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensagem).toMatch(/Antecedentes/);
  });

  test("permite concluir a próxima etapa da fila quando as anteriores já estão OK", () => {
    const hab = habComEtapas(2); // ficha, referências
    expect(hv.podeConcluirEtapa(hab, "ENTREVISTA").permitido).toBe(true);
  });

  test("não permite recarimbar uma etapa já concluída", () => {
    const hab = habComEtapas(3);
    const resultado = hv.podeConcluirEtapa(hab, "REFERENCIAS");
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensagem).toMatch(/já foi concluída/);
  });

  test("etapa inválida (fora do catálogo) é recusada", () => {
    expect(hv.podeConcluirEtapa(habVazia(), "ETAPA_INEXISTENTE").permitido).toBe(false);
  });

  test("a esteira inteira, na ordem, sempre é permitida etapa a etapa", () => {
    let hab = habVazia();
    hv.ETAPAS.forEach(etapa => {
      const resultado = hv.podeConcluirEtapa(hab, etapa);
      expect(resultado.permitido).toBe(true);
      hab = { ...hab, [hv.CAMPO_ETAPA[etapa]]: "2026-01-01T00:00:00Z" };
    });
  });
});

describe("proximaEtapaPendente / etapasConcluidas / todasEtapasConcluidas", () => {
  test("esteira vazia: próxima etapa é a primeira, nenhuma concluída", () => {
    expect(hv.proximaEtapaPendente(habVazia())).toBe("FICHA_INSCRICAO");
    expect(hv.etapasConcluidas(habVazia())).toEqual([]);
    expect(hv.todasEtapasConcluidas(habVazia())).toBe(false);
  });

  test("esteira com 4 de 6 etapas: próxima é a 5ª (treinamento)", () => {
    const hab = habComEtapas(4);
    expect(hv.proximaEtapaPendente(hab)).toBe("TREINAMENTO");
    expect(hv.etapasConcluidas(hab)).toHaveLength(4);
  });

  test("todas as 6 etapas concluídas: próxima é null", () => {
    const hab = habComEtapas(6);
    expect(hv.proximaEtapaPendente(hab)).toBeNull();
    expect(hv.todasEtapasConcluidas(hab)).toBe(true);
  });
});

describe("calcularStatusHabilitacao (status é sempre calculado, nunca digitado)", () => {
  test("esteira vazia é PENDENTE", () => {
    expect(hv.calcularStatusHabilitacao(habVazia())).toBe("PENDENTE");
  });

  test("esteira parcial (só algumas etapas) é PENDENTE", () => {
    expect(hv.calcularStatusHabilitacao(habComEtapas(4))).toBe("PENDENTE");
  });

  test("todas as etapas concluídas e dentro da validade é APTO", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2099-01-01";
    expect(hv.calcularStatusHabilitacao(hab, new Date("2026-06-01"))).toBe("APTO");
  });

  test("todas as etapas concluídas mas validade vencida é VENCIDO", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2026-01-01";
    expect(hv.calcularStatusHabilitacao(hab, new Date("2026-06-01"))).toBe("VENCIDO");
  });

  test("inaptoEm marcado é INAPTO mesmo com todas as etapas concluídas", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2099-01-01";
    hab.inaptoEm = "2026-02-01T00:00:00Z";
    expect(hv.calcularStatusHabilitacao(hab, new Date("2026-06-01"))).toBe("INAPTO");
  });

  test("sem habilitação nenhuma (null) é tratado como PENDENTE", () => {
    expect(hv.calcularStatusHabilitacao(null)).toBe("PENDENTE");
  });
});

describe("calcularValidadeApto", () => {
  test("validade é 24 meses após a conclusão (AptoDesde)", () => {
    const validade = hv.calcularValidadeApto("2026-01-15T00:00:00Z");
    expect(validade.getUTCFullYear()).toBe(2028);
    expect(validade.getUTCMonth()).toBe(0); // janeiro
  });
});

describe("Regra dos 6 meses (calculada a partir da data de admissão, nunca digitada)", () => {
  test("menos de 6 meses de admissão não atende", () => {
    expect(hv.atendeRegraSeisMeses("2026-01-01", new Date("2026-03-01"))).toBe(false);
  });

  test("exatamente 6 meses corridos atende (limite inclusive)", () => {
    expect(hv.atendeRegraSeisMeses("2026-01-01", new Date("2026-07-01"))).toBe(true);
  });

  test("mais de 6 meses atende com folga", () => {
    expect(hv.atendeRegraSeisMeses("2025-01-01", new Date("2026-06-01"))).toBe(true);
  });

  test("sem data de admissão nenhuma nunca atende (nada é assumido)", () => {
    expect(hv.atendeRegraSeisMeses(null, new Date("2030-01-01"))).toBe(false);
  });

  test("dataElegibilidadeSeisMeses soma exatamente 6 meses à admissão", () => {
    const data = hv.dataElegibilidadeSeisMeses("2026-01-10");
    expect(data.getUTCFullYear()).toBe(2026);
    expect(data.getUTCMonth()).toBe(6); // julho (mês 6, zero-based)
    expect(data.getUTCDate()).toBe(10);
  });
});

describe("podeServirComMenores (hook de leitura pra v7.7 — apto + 6 meses, só quando a equipe é 'contato com menores')", () => {
  test("equipe sem a marcação contato-com-menores: elegível mesmo sem esteira nenhuma", () => {
    const resultado = hv.podeServirComMenores({ habilitacao: null, dataAdmissao: null, contatoComMenores: false });
    expect(resultado.elegivel).toBe(true);
  });

  test("equipe marcada, mas voluntário ainda PENDENTE: não elegível", () => {
    const resultado = hv.podeServirComMenores({ habilitacao: habComEtapas(3), dataAdmissao: "2020-01-01", contatoComMenores: true }, new Date("2026-01-01"));
    expect(resultado.elegivel).toBe(false);
    expect(resultado.motivo).toMatch(/PENDENTE/);
  });

  test("equipe marcada, voluntário APTO mas sem 6 meses de admissão: não elegível", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2099-01-01";
    const resultado = hv.podeServirComMenores({ habilitacao: hab, dataAdmissao: "2026-05-01", contatoComMenores: true }, new Date("2026-06-01"));
    expect(resultado.elegivel).toBe(false);
    expect(resultado.motivo).toMatch(/6 meses/);
  });

  test("equipe marcada, voluntário APTO e com mais de 6 meses de admissão: elegível", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2099-01-01";
    const resultado = hv.podeServirComMenores({ habilitacao: hab, dataAdmissao: "2020-01-01", contatoComMenores: true }, new Date("2026-06-01"));
    expect(resultado.elegivel).toBe(true);
    expect(resultado.motivo).toBeNull();
  });

  test("equipe marcada, voluntário VENCIDO: não elegível mesmo com 6 meses de sobra", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2026-01-01";
    const resultado = hv.podeServirComMenores({ habilitacao: hab, dataAdmissao: "2010-01-01", contatoComMenores: true }, new Date("2026-06-01"));
    expect(resultado.elegivel).toBe(false);
    expect(resultado.motivo).toMatch(/VENCIDO/);
  });

  test("equipe marcada, voluntário INAPTO: não elegível", () => {
    const hab = habComEtapas(6);
    hab.aptoValidoAte = "2099-01-01";
    hab.inaptoEm = "2026-02-01";
    const resultado = hv.podeServirComMenores({ habilitacao: hab, dataAdmissao: "2010-01-01", contatoComMenores: true }, new Date("2026-06-01"));
    expect(resultado.elegivel).toBe(false);
    expect(resultado.motivo).toMatch(/INAPTO/);
  });
});

describe("validarDesligamento (registro de RH — nunca sanção disciplinar)", () => {
  test("exige motivo", () => {
    expect(hv.validarDesligamento({ motivo: "" }).valido).toBe(false);
    expect(hv.validarDesligamento({ motivo: "   " }).valido).toBe(false);
  });

  test("aceita qualquer tipo dentro da lista fechada, incluindo perda de confiança", () => {
    expect(hv.validarDesligamento({ motivo: "Não inspira mais confiança na função.", tipoMotivo: "PERDA_CONFIANCA" }).valido).toBe(true);
  });

  test("recusa tipo fora do catálogo", () => {
    const resultado = hv.validarDesligamento({ motivo: "Motivo qualquer", tipoMotivo: "SANCAO_DISCIPLINAR" });
    expect(resultado.valido).toBe(false);
    expect(resultado.mensagem).toMatch(/Tipo de motivo inválido/);
  });

  test("tipoMotivo é opcional (backend assume OUTRO)", () => {
    expect(hv.validarDesligamento({ motivo: "Mudou de cidade." }).valido).toBe(true);
  });
});
