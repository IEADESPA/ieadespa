// v8.1 — regra pura da AFM e das faltas da CLI (shared/afm.js).
const afm = require("../afm");

const h = (sessaoId, data, presente = false, justificada = false) => ({ sessaoId, data, presente, justificada });

describe("apurarSequencia — 3 faltas seguidas (Estatuto Art. 27 §1º; Regimento Art. 69 §2º)", () => {
  test("3 faltas sem justificativa seguidas: atinge na 3ª, com as 3 reuniões e a data da 3ª", () => {
    const r = afm.apurarSequencia([h(1, "2026-11-29"), h(2, "2026-12-27"), h(3, "2027-01-31")]);
    expect(r.atingiu).toBe(true);
    expect(r.gatilho).toEqual({ sessoes: [1, 2, 3], data: "2027-01-31" });
    expect(r.atual).toBe(3);
  });
  test("2 faltas: não atinge, mas a sequência atual é 2 (o aviso preventivo)", () => {
    const r = afm.apurarSequencia([h(1, "2026-11-29", true), h(2, "2026-12-27"), h(3, "2027-01-31")]);
    expect(r).toMatchObject({ atingiu: false, gatilho: null, atual: 2, sessoesAtuais: [2, 3] });
  });
  test("presença no meio interrompe a sequência", () => {
    const r = afm.apurarSequencia([h(1, "2026-09-27"), h(2, "2026-10-25"), h(3, "2026-11-29", true), h(4, "2026-12-27"), h(5, "2027-01-31")]);
    expect(r.atingiu).toBe(false);
    expect(r.atual).toBe(2);
  });
  test("falta JUSTIFICADA no meio também interrompe (sanção se lê de forma restrita)", () => {
    const r = afm.apurarSequencia([h(1, "2026-09-27"), h(2, "2026-10-25", false, true), h(3, "2026-11-29"), h(4, "2026-12-27")]);
    expect(r.atingiu).toBe(false);
    expect(r.atual).toBe(2);
  });
  test("ordena por data (e por id no mesmo dia), não pela ordem que chegou", () => {
    const r = afm.apurarSequencia([h(3, "2027-01-31"), h(1, "2026-11-29"), h(2, "2026-12-27")]);
    expect(r.gatilho.sessoes).toEqual([1, 2, 3]);
    const mesmoDia = afm.apurarSequencia([h(9, "2026-11-29"), h(7, "2026-11-29"), h(8, "2026-11-29")]);
    expect(mesmoDia.gatilho.sessoes).toEqual([7, 8, 9]);
  });
  test("o gatilho é a PRIMEIRA vez que chega a 3, mesmo que a sequência continue", () => {
    const r = afm.apurarSequencia([h(1, "2026-01-25"), h(2, "2026-02-22"), h(3, "2026-03-29"), h(4, "2026-04-26")]);
    expect(r.gatilho).toEqual({ sessoes: [1, 2, 3], data: "2026-03-29" });
    expect(r.atual).toBe(4);
  });
  test("histórico vazio ou lixo não quebra", () => {
    expect(afm.apurarSequencia([])).toMatchObject({ atingiu: false, atual: 0 });
    expect(afm.apurarSequencia(null)).toMatchObject({ atingiu: false, atual: 0 });
  });
});

describe("validarJustificativa — catálogo fechado (Regimento Art. 149 §2º)", () => {
  test("os 4 vedados são recusados com o artigo, inclusive em minúsculas", () => {
    for (const c of Object.keys(afm.MOTIVOS_VEDADOS)) {
      const r = afm.validarJustificativa({ codigo: c.toLowerCase(), detalhe: "qualquer coisa aqui" });
      expect(r.valido).toBe(false);
      expect(r.mensagem).toMatch(/Art\. 149 §2º, II/);
    }
  });
  test("motivo fora do catálogo, vazio ou não-texto é recusado", () => {
    for (const c of ["", "FERIAS", null, undefined, 3, ["SAUDE"], { c: "SAUDE" }, "__proto__", "toString"]) {
      expect(afm.validarJustificativa({ codigo: c }).valido).toBe(false);
    }
  });
  test("os aceitos passam; o detalhe é opcional (menos em 'outro fator externo') e vai limpo", () => {
    expect(afm.validarJustificativa({ codigo: "SAUDE" })).toEqual({ valido: true, codigo: "SAUDE", detalhe: null });
    expect(afm.validarJustificativa({ codigo: " luto ", detalhe: "  avó  " })).toEqual({ valido: true, codigo: "LUTO", detalhe: "avó" });
    expect(afm.validarJustificativa({ codigo: "OUTRO_EXTERNO", detalhe: "curto" }).valido).toBe(false);
    expect(afm.validarJustificativa({ codigo: "OUTRO_EXTERNO", detalhe: "Enchente bloqueou a estrada" }).valido).toBe(true);
  });
  test("detalhe longo demais ou de outro tipo é recusado", () => {
    expect(afm.validarJustificativa({ codigo: "SAUDE", detalhe: "x".repeat(301) }).valido).toBe(false);
    expect(afm.validarJustificativa({ codigo: "SAUDE", detalhe: 12 }).valido).toBe(false);
  });
  test("Sessão Magna: quem aprova confirma o documento (Art. 69 §2º, I); só true vale", () => {
    expect(afm.validarJustificativa({ codigo: "SAUDE", exigirComprovante: true }).valido).toBe(false);
    expect(afm.validarJustificativa({ codigo: "SAUDE", exigirComprovante: true, comprovanteConferido: "true" }).valido).toBe(false);
    expect(afm.validarJustificativa({ codigo: "SAUDE", exigirComprovante: true, comprovanteConferido: true }).valido).toBe(true);
  });
  test("o texto gravado junta o rótulo e o detalhe, no máximo 300", () => {
    expect(afm.textoDaJustificativa("LUTO", "avó")).toBe("Luto — avó");
    expect(afm.textoDaJustificativa("SAUDE", null)).toBe("Problema de saúde (próprio ou de dependente)");
    expect(afm.textoDaJustificativa("OUTRO_EXTERNO", "y".repeat(300)).length).toBe(300);
  });
});

describe("providenciasDaExclusao (Estatuto Art. 27 §2º; Regimento Art. 310)", () => {
  const tipos = (l) => l.map((p) => p.tipo);
  test("cargo eletivo da Diretoria ou do Conselho Fiscal: comunicar a CLI e AGE em 30 dias, com o prazo", () => {
    const l = afm.providenciasDaExclusao([{ via: "ASSENTO", orgaoSigla: "CONSELHO_FISCAL", cargo: "Conselheiro" }], "2027-01-31");
    expect(tipos(l)).toEqual(["COMUNICAR_CLI", "AGE_DESTITUICAO", "REINGRESSO"]);
    expect(l[1].prazo).toBe("2027-03-02");
    expect(l[1].texto).toMatch(/Conselheiro/);
  });
  test("liderança (livre nomeação): comunicar e substituição pelo Pastor Presidente", () => {
    expect(tipos(afm.providenciasDaExclusao([{ via: "LIDERANCA", cargo: "Dirigente de Congregação" }], "2027-01-31"))).toEqual(["COMUNICAR_CLI", "SUBSTITUICAO", "REINGRESSO"]);
  });
  test("só por Ordenação: sai da CLI e mantém o cargo; CEI ou cadeira direta na CLI não pede AGE", () => {
    expect(tipos(afm.providenciasDaExclusao([{ via: "ORDENACAO", cargo: "Pastor" }], "2027-01-31"))).toEqual(["MANTEM_CARGO", "REINGRESSO"]);
    expect(tipos(afm.providenciasDaExclusao([{ via: "ASSENTO", orgaoSigla: "CEI" }], "2027-01-31"))).toEqual(["REINGRESSO"]);
  });
  test("vários caminhos somam as providências", () => {
    const l = afm.providenciasDaExclusao([{ via: "ORDENACAO" }, { via: "ASSENTO", orgaoSigla: "DIRETORIA_EXECUTIVA", cargo: "1º Tesoureiro" }, { via: "LIDERANCA", cargo: "Líder Geral" }], "2027-01-31");
    expect(tipos(l)).toEqual(["COMUNICAR_CLI", "AGE_DESTITUICAO", "SUBSTITUICAO", "MANTEM_CARGO", "REINGRESSO"]);
  });
  test("lixo nos caminhos não quebra", () => {
    expect(tipos(afm.providenciasDaExclusao(null, null))).toEqual(["REINGRESSO"]);
  });
});

describe("Reitor (Regimento Art. 68 §1º)", () => {
  test("mandato até 31/12 do ano da nomeação (exercício fiscal = ano civil)", () => {
    expect(afm.fimDoMandatoReitor("2026-10-27")).toBe("2026-12-31");
    expect(afm.fimDoMandatoReitor("lixo")).toBe(null);
  });
  test("situação: vaga, aguardando homologação, vencido, em exercício, encerrado", () => {
    expect(afm.situacaoReitor(null, "2026-10-27")).toBe("VAGA");
    expect(afm.situacaoReitor({ mandatoAte: "2026-12-31" }, "2026-10-27")).toBe("AGUARDANDO_HOMOLOGACAO");
    expect(afm.situacaoReitor({ mandatoAte: "2026-12-31", homologadoCLIEm: "2026-10-25" }, "2026-10-27")).toBe("EM_EXERCICIO");
    expect(afm.situacaoReitor({ mandatoAte: "2026-12-31", homologadoCLIEm: "2026-10-25" }, "2027-01-01")).toBe("MANDATO_VENCIDO");
    expect(afm.situacaoReitor({ mandatoAte: "2026-12-31", dataFim: "2026-11-01" }, "2026-10-27")).toBe("ENCERRADO");
  });
});

describe("nível de escolaridade (Regimento Art. 72)", () => {
  test("cada cargo com o mínimo dele", () => {
    expect(afm.avaliarNivel("AUXILIAR", "BASICO", false).atende).toBe(true);
    expect(afm.avaliarNivel("MISSIONARIO", "BASICO", true).atende).toBe(false);
    expect(afm.avaliarNivel("DIACONO", "MEDIO", false).atende).toBe(true);
    expect(afm.avaliarNivel("PRESBITERO", "MEDIO", true).atende).toBe(false);
    expect(afm.avaliarNivel("PRESBITERO", "BACHAREL", false).atende).toBe(true);
  });
  test("Evangelista e Pastor: o curso precisa estar CONCLUÍDO (V, b)", () => {
    expect(afm.avaliarNivel("PASTOR", "AVANCADO", false).atende).toBe(false);
    expect(afm.avaliarNivel("PASTOR", "AVANCADO", true).atende).toBe(true);
    expect(afm.avaliarNivel("EVANGELISTA", "BACHAREL", true).exigido).toMatch(/concluído/);
  });
  test("sem nível informado: null (a informar); cargo que não é de oficial: sem exigência", () => {
    expect(afm.avaliarNivel("DIACONO", null, false)).toMatchObject({ atende: null });
    expect(afm.avaliarNivel(null, "BASICO", false)).toEqual({ atende: null, exigido: null });
  });
});

describe("licença para oficiar (Regimento Art. 66 §2º; Art. 69 §3º)", () => {
  test("oficial com matrícula ativa pode; inativo ou quem não é oficial não pode", () => {
    expect(afm.licencaLiturgica({ cargo: "PRESBITERO", statusMatricula: "ATIVA" }).podeOficiar).toBe(true);
    const inativo = afm.licencaLiturgica({ cargo: "PASTOR", statusMatricula: "INATIVA" });
    expect(inativo.podeOficiar).toBe(false);
    expect(inativo.motivo).toMatch(/mantém o título/);
    expect(afm.licencaLiturgica({ cargo: null, statusMatricula: "ATIVA" }).podeOficiar).toBe(false);
  });
});

describe("datas e textos dos atos", () => {
  test("rematrícula: a aprovação na reciclagem é obrigatória, real, não futura e depois da desmatrícula", () => {
    const ctx = { hojeIso: "2026-10-27", desmatriculaEm: "2026-09-27" };
    expect(afm.validarRematricula({}, ctx).valido).toBe(false);
    expect(afm.validarRematricula({ reciclagemAprovadaEm: "2026-02-30" }, ctx).valido).toBe(false);
    expect(afm.validarRematricula({ reciclagemAprovadaEm: "2026-10-28" }, ctx).valido).toBe(false);
    expect(afm.validarRematricula({ reciclagemAprovadaEm: "2026-09-01" }, ctx).valido).toBe(false);
    expect(afm.validarRematricula({ reciclagemAprovadaEm: "2026-10-20", observacao: " turma de outubro " }, ctx)).toEqual({ valido: true, data: "2026-10-20", observacao: "turma de outubro" });
    expect(afm.validarRematricula({ reciclagemAprovadaEm: "2026-10-20", observacao: 5 }, ctx).valido).toBe(false);
  });
  test("data do ato: formato, real, não futura, não antiga demais", () => {
    expect(afm.dataDoAto("2026-10-27", "2026-10-27", "a data").valido).toBe(true);
    for (const v of ["27/10/2026", "2026-13-01", "2026-10-28", "1999-12-31", null, 20261027]) expect(afm.dataDoAto(v, "2026-10-27", "a data").valido).toBe(false);
  });
  test("texto obrigatório: mínimo, máximo e tipo", () => {
    expect(afm.textoObrigatorio("  ata 12/2026 ", { minimo: 5, maximo: 300, rotulo: "O ato" })).toEqual({ valido: true, texto: "ata 12/2026" });
    expect(afm.textoObrigatorio("ata", { minimo: 5, maximo: 300, rotulo: "O ato" }).valido).toBe(false);
    expect(afm.textoObrigatorio({}, { minimo: 5, maximo: 300, rotulo: "O ato" }).valido).toBe(false);
  });
});

describe("tipos da reunião da CLI", () => {
  test("Ordinária e Sessão Magna contam falta; Extraordinária não (Estatuto Art. 27: 'reuniões mensais')", () => {
    expect(afm.TIPOS_SESSAO_CLI.ORDINARIA.contaFaltas).toBe(true);
    expect(afm.TIPOS_SESSAO_CLI.MAGNA_AFM).toMatchObject({ contaFaltas: true, magna: true });
    expect(afm.TIPOS_SESSAO_CLI.EXTRAORDINARIA.contaFaltas).toBe(false);
  });
});
