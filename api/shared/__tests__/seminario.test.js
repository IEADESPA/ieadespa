// v8.7 — o Seminário como sistema acadêmico: a regra pura (shared/seminario.js), o nível do Art. 72 que vem do histórico (shared/afm.js) e o requisito de formação que
// exige uma disciplina (o resumo de shared/trilhas.js).
const s = require("../seminario");
const afm = require("../afm");
const escada = require("../escada");
const trilhas = require("../trilhas");

const HOJE = "2026-10-30";
const TURMA = { cargaHoraria: 20, notaMinima: 7, frequenciaMinimaPct: 75 };

describe("número com vírgula", () => {
  test("aceita vírgula e ponto, até as casas pedidas", () => {
    expect(s.numero("7,5", 1)).toBe(7.5);
    expect(s.numero("7.5", 1)).toBe(7.5);
    expect(s.numero("10", 1)).toBe(10);
    expect(s.numero(8, 1)).toBe(8);
  });
  test("recusa o que não é número assim", () => {
    for (const v of ["", " ", "7,55", "-1", "1e3", "abc", "7,", null, undefined, "12345"]) expect(s.numero(v, 1)).toBeNull();
  });
});

describe("currículo", () => {
  test("disciplina válida e os erros de cada campo", () => {
    const ok = s.validarDisciplina({ cursoId: 1, nome: "  Liturgia  ", area: "LITURGIA", cargaHoraria: "20,5", obrigatoria: true, preRequisitos: [3, 3, "4"] });
    expect(ok.valido).toBe(true);
    expect(ok.disciplina).toMatchObject({ nome: "Liturgia", cargaHoraria: 20.5, ativa: true, preRequisitos: [3, 4], disciplinaId: null });
    expect(s.validarDisciplina({ cursoId: 1, nome: "Li", area: "LITURGIA", cargaHoraria: 20, obrigatoria: true }).valido).toBe(false);
    expect(s.validarDisciplina({ cursoId: 1, nome: "Liturgia", area: "MAGIA", cargaHoraria: 20, obrigatoria: true }).valido).toBe(false);
    expect(s.validarDisciplina({ cursoId: 1, nome: "Liturgia", area: "LITURGIA", cargaHoraria: 0, obrigatoria: true }).valido).toBe(false);
    expect(s.validarDisciplina({ cursoId: 1, nome: "Liturgia", area: "LITURGIA", cargaHoraria: 20, obrigatoria: "sim" }).valido).toBe(false);
    expect(s.validarDisciplina({ disciplinaId: 5, cursoId: 1, nome: "Liturgia", area: "LITURGIA", cargaHoraria: 20, obrigatoria: true, preRequisitos: [5] }).mensagem).toMatch(/si mesma/);
    expect(s.validarDisciplina({ cursoId: 1, nome: "Liturgia", area: "LITURGIA", cargaHoraria: 20, obrigatoria: true, preRequisitos: [1e20] }).valido).toBe(false);
    expect(s.validarDisciplina({ disciplinaId: "1e3", cursoId: 1, nome: "Liturgia", area: "LITURGIA", cargaHoraria: 20, obrigatoria: true }).valido).toBe(false);
  });

  test("curso: nota de 0 a 10, frequência de 1 a 100", () => {
    expect(s.validarCurso({ cursoId: 1, nome: "Nível Básico em Teologia", notaMinima: "6,0", frequenciaMinimaPct: 70 }).curso).toMatchObject({ notaMinima: 6, frequenciaMinimaPct: 70 });
    expect(s.validarCurso({ cursoId: 1, nome: "Nível Básico", notaMinima: 11, frequenciaMinimaPct: 70 }).valido).toBe(false);
    expect(s.validarCurso({ cursoId: 1, nome: "Nível Básico", notaMinima: 7, frequenciaMinimaPct: 0 }).valido).toBe(false);
  });

  test("ciclo de pré-requisitos (direto e indireto); trocar os da própria disciplina não é ciclo", () => {
    const arestas = [{ disciplinaId: 2, preRequisitoId: 1 }, { disciplinaId: 3, preRequisitoId: 2 }];
    expect(s.criariaCiclo(arestas, 1, [3])).toBe(true);    // 1 exige 3, que exige 2, que exige 1
    expect(s.criariaCiclo(arestas, 1, [2])).toBe(true);
    expect(s.criariaCiclo(arestas, 3, [1])).toBe(false);   // 3 já exige 2 (que exige 1): exigir 1 direto não fecha ciclo
    expect(s.criariaCiclo(arestas, 2, [3])).toBe(true);
    expect(s.criariaCiclo(arestas, null, [1])).toBe(false);   // disciplina nova não tem quem a exija
  });

  test("Art. 70 §2º: avisa as áreas de governança que faltam entre as obrigatórias ativas", () => {
    expect(s.lacunasGovernanca([])).toEqual(["Liderança", "Administração Eclesiástica", "Compliance Estatutário (Regimento)"]);
    expect(s.lacunasGovernanca([{ area: "LIDERANCA", obrigatoria: true, ativa: true }, { area: "ADMINISTRACAO", obrigatoria: false, ativa: true }, { area: "COMPLIANCE", obrigatoria: true, ativa: false }]))
      .toEqual(["Administração Eclesiástica", "Compliance Estatutário (Regimento)"]);
  });
});

describe("turma e lançamento", () => {
  test("a turma: datas em ordem e dentro do intervalo", () => {
    expect(s.validarTurma({ disciplinaId: 1, docenteMembroId: 2, dataInicio: "2027-03-01", dataFim: "2027-06-30", local: " Sede " }, HOJE).turma).toMatchObject({ local: "Sede" });
    expect(s.validarTurma({ disciplinaId: 1, docenteMembroId: 2, dataInicio: "2027-03-01", dataFim: "2027-02-01" }, HOJE).valido).toBe(false);
    expect(s.validarTurma({ disciplinaId: 1, docenteMembroId: 2, dataInicio: "2027-02-30", dataFim: "2027-06-01" }, HOJE).valido).toBe(false);
    expect(s.validarTurma({ disciplinaId: 1, docenteMembroId: 2, dataInicio: "2027-03-01", dataFim: "2030-01-01" }, HOJE).valido).toBe(false);
    expect(s.validarTurma({ disciplinaId: 1, dataInicio: "2027-03-01", dataFim: "2027-06-01" }, HOJE).mensagem).toMatch(/docente/);
  });

  test("o resultado sai da regra da turma: a frequência pesa antes da nota", () => {
    expect(s.horasMinimas(TURMA)).toBe(15);
    expect(s.validarLancamento({ nota: "7,0", horasPresentes: "15" }, TURMA).lancamento.resultado).toBe("APROVADO");
    expect(s.validarLancamento({ nota: "6,9", horasPresentes: 20 }, TURMA).lancamento.resultado).toBe("REPROVADO_NOTA");
    expect(s.validarLancamento({ nota: 10, horasPresentes: "14,5" }, TURMA).lancamento.resultado).toBe("REPROVADO_FREQ");
    expect(s.validarLancamento({ nota: 2, horasPresentes: 3 }, TURMA).lancamento.resultado).toBe("REPROVADO_FREQ");
  });

  test("nota fora de 0 a 10, horas acima da carga e campos vazios são recusados", () => {
    expect(s.validarLancamento({ nota: "10,5", horasPresentes: 20 }, TURMA).valido).toBe(false);
    expect(s.validarLancamento({ nota: 8, horasPresentes: 21 }, TURMA).valido).toBe(false);
    expect(s.validarLancamento({ nota: "", horasPresentes: 20 }, TURMA).valido).toBe(false);
    expect(s.validarLancamento({ nota: 8 }, TURMA).valido).toBe(false);
    expect(s.validarLancamento(null, TURMA).valido).toBe(false);
  });
});

describe("aproveitamento", () => {
  const base = { membroId: 10, disciplinaId: 3, instituicao: "Seminário Teológico X", disciplinaOrigem: "Liturgia Cristã", cargaHorariaOrigem: "30", anoOrigem: 2019,
    decisao: "DEFERIDO", parecer: "Conteúdo e carga equivalentes à disciplina de Liturgia da AFM.", pareceristaMembroId: 2, dataParecer: "2026-10-20", documentoConferido: true };
  test("o deferido completo passa", () => {
    expect(s.validarAproveitamento(base, HOJE).aproveitamento).toMatchObject({ cargaHorariaOrigem: 30, decisao: "DEFERIDO", notaOrigem: null });
  });
  test("o parecer é escrito, de outra pessoa, com data até hoje; o deferido exige o documento conferido", () => {
    expect(s.validarAproveitamento({ ...base, parecer: "ok" }, HOJE).mensagem).toMatch(/parecer/);
    expect(s.validarAproveitamento({ ...base, pareceristaMembroId: 10 }, HOJE).mensagem).toMatch(/próprio/);
    expect(s.validarAproveitamento({ ...base, dataParecer: "2026-11-01" }, HOJE).valido).toBe(false);
    expect(s.validarAproveitamento({ ...base, documentoConferido: false }, HOJE).mensagem).toMatch(/documento/);
    expect(s.validarAproveitamento({ ...base, decisao: "INDEFERIDO", documentoConferido: false }, HOJE).valido).toBe(true);
    expect(s.validarAproveitamento({ ...base, anoOrigem: 2027 }, HOJE).valido).toBe(false);
    expect(s.validarAproveitamento({ ...base, decisao: "TALVEZ" }, HOJE).valido).toBe(false);
  });
  test("o motivo tem de 10 a 300 caracteres", () => {
    expect(s.textoMotivo("curto")).toBeNull();
    expect(s.textoMotivo("  lançado na turma errada  ")).toBe("lançado na turma errada");
    expect(s.textoMotivo("x".repeat(301))).toBeNull();
  });
});

describe("o que a pessoa cumpriu e a conclusão", () => {
  test("só a turma ENCERRADA vale; a aberta é 'cursando'; a cancelada não conta; o aproveitamento anulado não vale", () => {
    const est = s.estadoDasDisciplinas([
      { disciplinaId: 1, turmaSituacao: "ENCERRADA", situacao: "INSCRITO", resultado: "APROVADO", encerradaEm: "2026-06-30" },
      { disciplinaId: 2, turmaSituacao: "ABERTA", situacao: "INSCRITO", resultado: "APROVADO", encerradaEm: null },
      { disciplinaId: 3, turmaSituacao: "ENCERRADA", situacao: "INSCRITO", resultado: "REPROVADO_NOTA", encerradaEm: "2026-06-30" },
      { disciplinaId: 4, turmaSituacao: "ABERTA", situacao: "CANCELADO", resultado: null, encerradaEm: null }
    ], [
      { disciplinaId: 5, decisao: "DEFERIDO", anuladoEm: null, dataParecer: "2026-05-01" },
      { disciplinaId: 6, decisao: "DEFERIDO", anuladoEm: "2026-07-01", dataParecer: "2026-05-01" },
      { disciplinaId: 7, decisao: "INDEFERIDO", anuladoEm: null, dataParecer: "2026-05-01" }
    ]);
    expect(est.get(1)).toMatchObject({ cumprida: true, fonte: "TURMA", data: "2026-06-30" });
    expect(est.get(2)).toMatchObject({ cumprida: false, cursando: true });
    expect(est.get(3)).toMatchObject({ cumprida: false, cursando: false });
    expect(est.get(4)).toBeUndefined();
    expect(est.get(5)).toMatchObject({ cumprida: true, fonte: "APROVEITAMENTO" });
    expect((est.get(6) || {}).cumprida).toBeFalsy();
    expect((est.get(7) || {}).cumprida).toBeFalsy();
  });

  test("conclui com todas as obrigatórias ATIVAS cumpridas; a carga soma as cumpridas do curso", () => {
    const disc = [
      { disciplinaId: 1, nome: "Bibliologia", cargaHoraria: 20, obrigatoria: true, ativa: true },
      { disciplinaId: 2, nome: "Liturgia", cargaHoraria: 10, obrigatoria: true, ativa: true },
      { disciplinaId: 3, nome: "Antiga", cargaHoraria: 8, obrigatoria: true, ativa: false },
      { disciplinaId: 4, nome: "Optativa", cargaHoraria: 4.5, obrigatoria: false, ativa: true }
    ];
    const parcial = s.avaliarConclusao(disc, new Map([[1, { cumprida: true }], [4, { cumprida: true }]]));
    expect(parcial).toMatchObject({ completo: false, faltam: ["Liturgia"], cargaObrigatoria: 30, cargaCumprida: 24.5 });
    const total = s.avaliarConclusao(disc, new Map([[1, { cumprida: true }], [2, { cumprida: true }]]));
    expect(total).toMatchObject({ completo: true, faltam: [], cargaCumprida: 30 });
    expect(s.avaliarConclusao([], new Map())).toMatchObject({ completo: false, semObrigatorias: true });
  });
});

describe("o nível do Art. 72 que vem do histórico (a escada, a Academia, o CEI)", () => {
  test("pares: cursando e concluído; a matrícula cancelada não conta", () => {
    expect(s.paresDeNivel([{ nivel: "MEDIO", situacao: "CONCLUIDO" }, { nivel: "AVANCADO", situacao: "CURSANDO" }, { nivel: "BACHAREL", situacao: "CANCELADA" }]))
      .toEqual([{ nivel: "MEDIO", concluido: true }, { nivel: "AVANCADO", concluido: false }]);
  });
  test("quem concluiu o Avançado e cursa o Bacharel atende o Pastor (vale o par que atende, não o mais alto)", () => {
    const pares = [{ nivel: "AVANCADO", concluido: true }, { nivel: "BACHAREL", concluido: false }];
    const r = afm.avaliarNivel("PASTOR", null, false, pares);
    expect(r.atende).toBe(true);
    expect(afm.rotuloDoPar(r.melhor)).toBe("Avançado (concluído)");
  });
  test("o registrado à mão continua valendo, somado ao histórico", () => {
    expect(afm.avaliarNivel("PRESBITERO", "AVANCADO", false, []).atende).toBe(true);
    expect(afm.avaliarNivel("PRESBITERO", "MEDIO", true, [{ nivel: "AVANCADO", concluido: false }]).atende).toBe(true);
    expect(afm.avaliarNivel("EVANGELISTA", "BACHAREL", false, [{ nivel: "MEDIO", concluido: true }]).atende).toBe(false);
    expect(afm.avaliarNivel("DIACONO", null, false, []).atende).toBeNull();
  });
  test("a escada mostra o nível do histórico e o nivelamento o considera", () => {
    expect(escada.emNivelamento("PASTOR", "NOMEACAO_PRESIDENCIAL", null, false, [{ nivel: "BACHAREL", concluido: true }])).toBe(false);
    expect(escada.emNivelamento("PASTOR", "NOMEACAO_PRESIDENCIAL", null, false, [])).toBe(true);
  });
});

describe("o requisito de formação que exige uma disciplina da AFM", () => {
  const req = { requisitoId: 9, disciplinaId: 3, disciplinaNome: "Liturgia (Médio)", modo: "BLOQUEIA" };
  test("aprovada ou aproveitada atende; cursando e não cursada não", () => {
    expect(s.avaliarRequisitoDisciplina({ requisito: req, estado: { cumprida: true, fonte: "TURMA" } })).toMatchObject({ ok: true, detalhe: "aprovada", tipo: "DISCIPLINA" });
    expect(s.avaliarRequisitoDisciplina({ requisito: req, estado: { cumprida: true, fonte: "APROVEITAMENTO" } }).detalhe).toMatch(/aproveitamento/);
    expect(s.avaliarRequisitoDisciplina({ requisito: req, estado: { cursando: true } })).toMatchObject({ ok: false, situacao: "EM_ANDAMENTO" });
    expect(s.avaliarRequisitoDisciplina({ requisito: req, estado: undefined })).toMatchObject({ ok: false, situacao: "NAO_INICIADA" });
  });
  test("o resumo dos fluxos (consagração, escala...) junta trilha e disciplina", () => {
    const r = trilhas.resumirRequisitos([
      s.avaliarRequisitoDisciplina({ requisito: req, estado: undefined }),
      s.avaliarRequisitoDisciplina({ requisito: { ...req, requisitoId: 10, disciplinaNome: "Homilética (Médio)", modo: "ALERTA" }, estado: { cursando: true } })
    ]);
    expect(r.bloqueado).toBe(true);
    expect(r.mensagemBloqueio).toBe('Requisito de formação não cumprido — disciplina "Liturgia (Médio)" da AFM: ainda não cursada.');
    expect(r.alertas).toEqual(['disciplina "Homilética (Médio)" da AFM: cursando (a turma ainda não foi encerrada)']);
  });
});

describe("os textos dos documentos", () => {
  test("diploma, declaração (vale 30 dias) e histórico", () => {
    expect(s.descricaoDiploma({ curso: "Nível Médio em Teologia", dataConclusao: "2026-10-30", cargaCumprida: 120.5, disciplinas: 6 }))
      .toBe("concluiu o Nível Médio em Teologia da Academia de Formação Ministerial (AFM) em 30/10/2026, com carga horária de 120,5 horas em 6 disciplina(s), e recebe este diploma (Regimento Interno, Art. 72).");
    expect(s.descricaoDeclaracao({ curso: "Nível Básico em Teologia", dataInicio: "2026-03-01", hojeIso: HOJE, turmas: ["Liturgia"] })).toMatch(/desde 01\/03\/2026.*Liturgia.*30 dias/);
    expect(s.somarDias(HOJE, s.DIAS_DECLARACAO)).toBe("2026-11-29");
    expect(s.descricaoHistorico({ hojeIso: HOJE, cursos: Array(40).fill("Nível Básico em Teologia (cursando)"), disciplinasCumpridas: 3, cargaCumprida: 60 }).length).toBeLessThanOrEqual(600);
  });
});
