// Testes do v6.9 (Trilhas de formação) — foco na lógica pura: validação do
// catálogo, pré-requisitos sem ciclo, progresso calculado (nunca digitado),
// validade/vencimento do certificado, e a avaliação dos REQUISITOS que
// trava (ou só avisa) os fluxos de consagração, liderança, batismo, escala...
const { criarPoolFalso } = require("./testUtils");
const t = require("../trilhas");

describe("validarNovaTrilha", () => {
  test("só o nome é obrigatório; o resto assume padrões (sem validade, aviso de 60 dias)", () => {
    const r = t.validarNovaTrilha({ nome: "  Professor de EBD  " });
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ nome: "Professor de EBD", descricao: null, papelAlvo: null, validadeMeses: null, avisoDias: 60 });
  });

  test("recusa nome curto e textos longos demais", () => {
    expect(t.validarNovaTrilha({ nome: "ab" }).valido).toBe(false);
    expect(t.validarNovaTrilha({ nome: "x".repeat(151) }).valido).toBe(false);
    expect(t.validarNovaTrilha({ nome: "Trilha", descricao: "x".repeat(501) }).valido).toBe(false);
    expect(t.validarNovaTrilha({ nome: "Trilha", papelAlvo: "x".repeat(61) }).valido).toBe(false);
  });

  test("validade de 1 a 120 meses (inteiro) ou em branco; aviso de 0 a 365 dias", () => {
    expect(t.validarNovaTrilha({ nome: "Trilha", validadeMeses: 24 }).dados.validadeMeses).toBe(24);
    expect(t.validarNovaTrilha({ nome: "Trilha", validadeMeses: "" }).dados.validadeMeses).toBeNull();
    for (const ruim of [0, 121, 1.5, "abc"]) expect(t.validarNovaTrilha({ nome: "Trilha", validadeMeses: ruim }).valido).toBe(false);
    expect(t.validarNovaTrilha({ nome: "Trilha", avisoDias: 0 }).dados.avisoDias).toBe(0);
    expect(t.validarNovaTrilha({ nome: "Trilha", avisoDias: 366 }).valido).toBe(false);
  });
});

describe("validarNovoModulo", () => {
  test("título obrigatório; ordem opcional (automática); carga com 1 casa; obrigatório por padrão", () => {
    const r = t.validarNovoModulo({ titulo: "Doutrina Básica", cargaHoraria: "4.26" });
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ titulo: "Doutrina Básica", ordem: null, cargaHoraria: 4.3, obrigatorio: true });
  });

  test("aceita módulo opcional e recusa ordem/carga inválidas", () => {
    expect(t.validarNovoModulo({ titulo: "Extra", obrigatorio: false }).dados.obrigatorio).toBe(false);
    expect(t.validarNovoModulo({ titulo: "x" }).valido).toBe(false);
    expect(t.validarNovoModulo({ titulo: "Módulo", ordem: 0 }).valido).toBe(false);
    expect(t.validarNovoModulo({ titulo: "Módulo", cargaHoraria: -1 }).valido).toBe(false);
    expect(t.validarNovoModulo({ titulo: "Módulo", cargaHoraria: 1000 }).valido).toBe(false);
  });
});

describe("pré-requisitos", () => {
  const a = { moduloId: 1, trilhaId: 10, ordem: 1 };
  const b = { moduloId: 2, trilhaId: 10, ordem: 2 };
  const outraTrilha = { moduloId: 3, trilhaId: 11, ordem: 1 };

  test("módulo: só da mesma trilha e de ordem menor (sem ciclo por construção)", () => {
    expect(t.validarPreRequisitoModulo(b, a).valido).toBe(true);
    expect(t.validarPreRequisitoModulo(a, b).mensagem).toMatch(/ANTES/);
    expect(t.validarPreRequisitoModulo(b, outraTrilha).mensagem).toMatch(/mesma trilha/);
    expect(t.validarPreRequisitoModulo(a, a).mensagem).toMatch(/dele mesmo/);
    expect(t.validarPreRequisitoModulo(a, null).valido).toBe(false);
  });

  test("trilha exigindo trilha: recusa ciclo direto, indireto e auto-referência", () => {
    // 2 exige 1; 3 exige 2
    const arestas = [{ trilhaId: 2, preRequisitoTrilhaId: 1 }, { trilhaId: 3, preRequisitoTrilhaId: 2 }];
    expect(t.criariaCicloTrilhas(arestas, 1, 1)).toBe(true);
    expect(t.criariaCicloTrilhas(arestas, 1, 2)).toBe(true); // 1 exigir 2 fecha 1→2→1
    expect(t.criariaCicloTrilhas(arestas, 1, 3)).toBe(true); // 1→3→2→1
    expect(t.criariaCicloTrilhas(arestas, 3, 1)).toBe(false); // redundante mas sem ciclo
    expect(t.criariaCicloTrilhas(arestas, 4, 3)).toBe(false);
    expect(t.criariaCicloTrilhas([], 1, 2)).toBe(false);
  });
});

describe("calcularProgresso", () => {
  const modulos = [
    { moduloId: 1, ordem: 1, titulo: "Doutrina", cargaHoraria: 4, obrigatorio: true, ativo: true },
    { moduloId: 2, ordem: 2, titulo: "Didática", cargaHoraria: 6, obrigatorio: true, ativo: true },
    { moduloId: 3, ordem: 3, titulo: "Estágio", cargaHoraria: 10, obrigatorio: true, ativo: true },
    { moduloId: 4, ordem: 4, titulo: "Extra", cargaHoraria: 2, obrigatorio: false, ativo: true }
  ];
  const pre = [{ moduloId: 2, preRequisitoModuloId: 1 }, { moduloId: 3, preRequisitoModuloId: 2 }];

  test("nada concluído: só o primeiro está disponível; os dependentes ficam bloqueados dizendo por quê", () => {
    const p = t.calcularProgresso({ modulos, preRequisitos: pre, conclusoes: [] });
    expect(p.modulos.map(m => m.status)).toEqual(["DISPONIVEL", "BLOQUEADO", "BLOQUEADO", "DISPONIVEL"]);
    expect(p.modulos[1].bloqueadoPor).toEqual(["Doutrina"]);
    expect(p.obrigatoriosTotal).toBe(3);
    expect(p.percentual).toBe(0);
    expect(p.completa).toBe(false);
    expect(p.proximoModulo.titulo).toBe("Doutrina");
    expect(p.cargaHorariaTotal).toBe(20); // só obrigatórios
  });

  test("concluir o pré-requisito libera o seguinte; percentual e carga horária acompanham", () => {
    const p = t.calcularProgresso({ modulos, preRequisitos: pre, conclusoes: [{ moduloId: 1, cargaHorariaRegistrada: 4 }] });
    expect(p.modulos[0].status).toBe("CONCLUIDO");
    expect(p.modulos[1].status).toBe("DISPONIVEL");
    expect(p.modulos[2].status).toBe("BLOQUEADO");
    expect(p.obrigatoriosConcluidos).toBe(1);
    expect(p.percentual).toBe(33.3);
    expect(p.cargaHorariaConcluida).toBe(4);
  });

  test("completa quando todos os OBRIGATÓRIOS estão concluídos (o opcional não é exigido)", () => {
    const concl = [1, 2, 3].map(id => ({ moduloId: id, cargaHorariaRegistrada: 1 }));
    const p = t.calcularProgresso({ modulos, preRequisitos: pre, conclusoes: concl });
    expect(p.completa).toBe(true);
    expect(p.percentual).toBe(100);
    expect(p.proximoModulo).toBeNull();
    expect(p.modulos[3].status).toBe("DISPONIVEL"); // o opcional segue disponível
  });

  test("módulo desativado sai do cálculo, e pré-requisito desativado não trava ninguém", () => {
    const mods = modulos.map(m => (m.moduloId === 1 ? { ...m, ativo: false } : m));
    const p = t.calcularProgresso({ modulos: mods, preRequisitos: pre, conclusoes: [] });
    expect(p.modulos.map(m => m.moduloId)).toEqual([2, 3, 4]);
    expect(p.modulos[0].status).toBe("DISPONIVEL"); // Didática exigia Doutrina, agora desativado
    expect(p.obrigatoriosTotal).toBe(2);
  });

  test("trilha sem nenhum módulo obrigatório nunca fica 'completa'", () => {
    const p = t.calcularProgresso({ modulos: [{ moduloId: 4, ordem: 1, titulo: "Extra", cargaHoraria: 2, obrigatorio: false, ativo: true }], preRequisitos: [], conclusoes: [] });
    expect(p.completa).toBe(false);
    expect(p.percentual).toBe(0);
  });
});

describe("podeConcluirModulo / validarDataConclusaoModulo", () => {
  const modulos = [
    { moduloId: 1, ordem: 1, titulo: "Doutrina", cargaHoraria: 4, obrigatorio: true, ativo: true },
    { moduloId: 2, ordem: 2, titulo: "Didática", cargaHoraria: 6, obrigatorio: true, ativo: true }
  ];
  const progresso = t.calcularProgresso({ modulos, preRequisitos: [{ moduloId: 2, preRequisitoModuloId: 1 }], conclusoes: [] });
  const andamento = { status: "EM_ANDAMENTO" };

  test("permite módulo disponível numa matrícula em andamento", () => {
    expect(t.podeConcluirModulo({ matricula: andamento, progresso, moduloId: 1 }).permitido).toBe(true);
  });

  test("recusa módulo bloqueado, dizendo qual concluir antes", () => {
    const r = t.podeConcluirModulo({ matricula: andamento, progresso, moduloId: 2 });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/Conclua antes: Doutrina/);
  });

  test("recusa matrícula não em andamento, módulo de outra trilha e módulo já concluído", () => {
    expect(t.podeConcluirModulo({ matricula: { status: "CONCLUIDA" }, progresso, moduloId: 1 }).mensagem).toMatch(/não está em andamento/);
    expect(t.podeConcluirModulo({ matricula: andamento, progresso, moduloId: 99 }).mensagem).toMatch(/não pertence/);
    const feito = t.calcularProgresso({ modulos, preRequisitos: [], conclusoes: [{ moduloId: 1, cargaHorariaRegistrada: 4 }] });
    expect(t.podeConcluirModulo({ matricula: andamento, progresso: feito, moduloId: 1 }).mensagem).toMatch(/já foi concluído/);
    expect(t.podeConcluirModulo({ matricula: null, progresso, moduloId: 1 }).permitido).toBe(false);
  });

  test("data da conclusão: padrão é hoje; futura e inválida são recusadas", () => {
    expect(t.validarDataConclusaoModulo(undefined, "2026-09-30")).toEqual({ valido: true, data: "2026-09-30" });
    expect(t.validarDataConclusaoModulo("2026-09-01", "2026-09-30").data).toBe("2026-09-01");
    expect(t.validarDataConclusaoModulo("2026-10-01", "2026-09-30").mensagem).toMatch(/futura/);
    expect(t.validarDataConclusaoModulo("31/09/2026", "2026-09-30").valido).toBe(false);
    expect(t.validarDataConclusaoModulo("2026-02-30", "2026-09-30").valido).toBe(false);
  });
});

describe("calcularValidade", () => {
  test("soma meses respeitando o fim do mês (31/jan + 1 mês = 28/fev, não 3/mar)", () => {
    expect(t.calcularValidade("2026-01-31", 1)).toBe("2026-02-28");
    expect(t.calcularValidade("2024-01-31", 1)).toBe("2024-02-29"); // bissexto
    expect(t.calcularValidade("2026-09-30", 24)).toBe("2028-09-30");
    expect(t.calcularValidade("2026-11-15", 3)).toBe("2027-02-15"); // vira o ano
    expect(t.calcularValidade("2026-03-31", 12)).toBe("2027-03-31");
  });

  test("sem validade (trilha que não vence) ou data inválida: null", () => {
    expect(t.calcularValidade("2026-09-30", null)).toBeNull();
    expect(t.calcularValidade("lixo", 12)).toBeNull();
  });
});

describe("situacaoFormacao — calculada, nunca digitada", () => {
  const HOJE = "2026-09-30";
  const concluida = (validoAte, extra) => ({ status: "CONCLUIDA", validoAte, avisoDias: 60, ...extra });

  test("trilha sem validade fica vigente para sempre", () => {
    expect(t.situacaoFormacao(concluida(null), HOJE)).toEqual({ situacao: "VIGENTE", diasParaVencer: null });
  });

  test("fronteiras da janela de aviso: 61 dias = vigente, 60 = vencendo", () => {
    expect(t.situacaoFormacao(concluida("2026-11-30"), HOJE)).toEqual({ situacao: "VIGENTE", diasParaVencer: 61 });
    expect(t.situacaoFormacao(concluida("2026-11-29"), HOJE)).toEqual({ situacao: "VENCENDO", diasParaVencer: 60 });
  });

  test("no próprio dia da validade ainda vale (vencendo); no dia seguinte, vencida", () => {
    expect(t.situacaoFormacao(concluida("2026-09-30"), HOJE)).toEqual({ situacao: "VENCENDO", diasParaVencer: 0 });
    expect(t.situacaoFormacao(concluida("2026-09-29"), HOJE)).toEqual({ situacao: "VENCIDA", diasParaVencer: -1 });
  });

  test("revogada prevalece sobre a validade; cancelada e em andamento não têm validade", () => {
    expect(t.situacaoFormacao(concluida("2030-01-01", { revogada: true }), HOJE).situacao).toBe("REVOGADA");
    expect(t.situacaoFormacao({ status: "CANCELADA" }, HOJE).situacao).toBe("CANCELADA");
    expect(t.situacaoFormacao({ status: "EM_ANDAMENTO" }, HOJE).situacao).toBe("EM_ANDAMENTO");
  });

  test("aviso de 0 dias: só 'vencendo' no último dia", () => {
    expect(t.situacaoFormacao({ status: "CONCLUIDA", validoAte: "2026-10-01", avisoDias: 0 }, HOJE).situacao).toBe("VIGENTE");
    expect(t.situacaoFormacao({ status: "CONCLUIDA", validoAte: "2026-09-30", avisoDias: 0 }, HOJE).situacao).toBe("VENCENDO");
  });
});

describe("escolherMelhor (renovações da mesma trilha)", () => {
  test("vigente vence vencida; em andamento de renovação não apaga uma vigente", () => {
    const lista = [
      { matriculaId: 1, situacao: "VENCIDA" }, { matriculaId: 2, situacao: "VIGENTE" }, { matriculaId: 3, situacao: "EM_ANDAMENTO" }
    ];
    expect(t.escolherMelhor(lista).matriculaId).toBe(2);
  });

  test("vencida com renovação em andamento: a em andamento vale mais (mostra o progresso)", () => {
    expect(t.escolherMelhor([{ matriculaId: 1, situacao: "VENCIDA" }, { matriculaId: 2, situacao: "EM_ANDAMENTO" }]).matriculaId).toBe(2);
  });

  test("empate: a mais recente; sem nada: null", () => {
    expect(t.escolherMelhor([{ matriculaId: 4, situacao: "VIGENTE" }, { matriculaId: 9, situacao: "VIGENTE" }]).matriculaId).toBe(9);
    expect(t.escolherMelhor([])).toBeNull();
  });
});

describe("validarRequisito", () => {
  test("contextos com alvo exigem alvo; LIDERANCA e ESCALA_EQUIPE exigem Id numérico", () => {
    expect(t.validarRequisito({ contexto: "CONSAGRACAO", alvoChave: "Diácono", trilhaId: 1 }).dados.alvoChave).toBe("Diácono");
    expect(t.validarRequisito({ contexto: "CONSAGRACAO", alvoChave: "", trilhaId: 1 }).valido).toBe(false);
    expect(t.validarRequisito({ contexto: "LIDERANCA", alvoChave: "3", trilhaId: 1 }).valido).toBe(true);
    expect(t.validarRequisito({ contexto: "LIDERANCA", alvoChave: "tesoureiro", trilhaId: 1 }).mensagem).toMatch(/numérico/);
    expect(t.validarRequisito({ contexto: "ESCALA_EQUIPE", alvoChave: "12", trilhaId: 1 }).valido).toBe(true);
  });

  test("contextos globais recusam alvo; modo padrão é BLOQUEIA", () => {
    const r = t.validarRequisito({ contexto: "BATISMO_DISCIPULADO", trilhaId: 4 });
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ contexto: "BATISMO_DISCIPULADO", alvoChave: "", trilhaId: 4, modo: "BLOQUEIA" });
    expect(t.validarRequisito({ contexto: "EBD_PROFESSOR", alvoChave: "x", trilhaId: 4 }).mensagem).toMatch(/fluxo inteiro/);
    expect(t.validarRequisito({ contexto: "HABILITACAO_TREINAMENTO", trilhaId: 4, modo: "alerta" }).dados.modo).toBe("ALERTA");
  });

  test("recusa contexto desconhecido, trilha ausente e modo inválido", () => {
    expect(t.validarRequisito({ contexto: "OUTRO", trilhaId: 1 }).valido).toBe(false);
    expect(t.validarRequisito({ contexto: "EBD_PROFESSOR" }).valido).toBe(false);
    expect(t.validarRequisito({ contexto: "EBD_PROFESSOR", trilhaId: 1, modo: "TALVEZ" }).valido).toBe(false);
  });
});

describe("avaliarRequisito e resumirRequisitos", () => {
  const req = (extra) => ({ requisitoId: 1, trilhaId: 5, trilhaNome: "Diaconato", modo: "BLOQUEIA", ...extra });
  const melhor = (extra) => ({ situacao: "VIGENTE", validoAte: "2027-01-01", diasParaVencer: 93, obrigatoriosConcluidos: 3, obrigatoriosTotal: 3, ...extra });

  test("nunca iniciada, em andamento, vencida, revogada e cancelada NÃO cumprem", () => {
    expect(t.avaliarRequisito({ requisito: req(), melhor: null })).toMatchObject({ ok: false, situacao: "NAO_INICIADA", detalhe: "ainda não iniciada" });
    expect(t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "EM_ANDAMENTO", obrigatoriosConcluidos: 2, obrigatoriosTotal: 5 }) }).detalhe).toBe("em andamento (2/5 módulos obrigatórios)");
    expect(t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "VENCIDA", validoAte: "2026-06-30", diasParaVencer: -92 }) }).detalhe).toBe("vencida em 30/06/2026");
    expect(t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "REVOGADA" }) }).detalhe).toBe("certificado revogado");
    expect(t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "CANCELADA" }) }).ok).toBe(false);
  });

  test("vigente cumpre; vencendo cumpre mas avisa o prazo", () => {
    expect(t.avaliarRequisito({ requisito: req(), melhor: melhor() })).toMatchObject({ ok: true, detalhe: "vigente até 01/01/2027" });
    const vencendo = t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "VENCENDO", diasParaVencer: 10, validoAte: "2026-10-10" }) });
    expect(vencendo.ok).toBe(true);
    expect(vencendo.detalhe).toMatch(/vence em 10 dia\(s\) \(10\/10\/2026\)/);
  });

  test("sem requisito nenhum, o fluxo não muda (temRequisitos false, nada bloqueia)", () => {
    expect(t.resumirRequisitos([])).toMatchObject({ temRequisitos: false, bloqueado: false, pendencias: [], alertas: [], mensagemBloqueio: null });
  });

  test("BLOQUEIA não cumprido bloqueia e diz qual trilha e por quê", () => {
    const r = t.resumirRequisitos([t.avaliarRequisito({ requisito: req(), melhor: null })]);
    expect(r.bloqueado).toBe(true);
    expect(r.mensagemBloqueio).toBe('Requisito de formação não cumprido — trilha "Diaconato": ainda não iniciada.');
  });

  test("ALERTA não cumprido NÃO bloqueia, só aparece como alerta (não bloqueia culto)", () => {
    const r = t.resumirRequisitos([t.avaliarRequisito({ requisito: req({ modo: "ALERTA" }), melhor: null })]);
    expect(r.bloqueado).toBe(false);
    expect(r.mensagemBloqueio).toBeNull();
    expect(r.alertas).toEqual(['trilha "Diaconato": ainda não iniciada']);
  });

  test("cumprido mas vencendo gera alerta sem bloquear; vários requisitos: um bloqueante basta", () => {
    const vencendo = t.avaliarRequisito({ requisito: req(), melhor: melhor({ situacao: "VENCENDO", diasParaVencer: 5, validoAte: "2026-10-05" }) });
    const r1 = t.resumirRequisitos([vencendo]);
    expect(r1.bloqueado).toBe(false);
    expect(r1.alertas).toHaveLength(1);

    const ok = t.avaliarRequisito({ requisito: req({ requisitoId: 2, trilhaNome: "Liderança" }), melhor: melhor() });
    const falha = t.avaliarRequisito({ requisito: req({ requisitoId: 3, trilhaNome: "Finanças" }), melhor: null });
    const r2 = t.resumirRequisitos([ok, falha]);
    expect(r2.bloqueado).toBe(true);
    expect(r2.pendencias).toEqual(['trilha "Finanças": ainda não iniciada']);
    expect(r2.mensagemBloqueio).toMatch(/Finanças/);
    expect(r2.mensagemBloqueio).not.toMatch(/Liderança/);
  });
});

describe("avaliarRequisitos / filtrarMembrosQueAtendem (com pool falso)", () => {
  test("sem requisito configurado: uma única consulta e nada bloqueia", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const r = await t.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: "Diácono", membroId: 1 });
    expect(r.temRequisitos).toBe(false);
    expect(r.bloqueado).toBe(false);
    expect(chamadas).toHaveLength(1);
  });

  test("requisito de OUTRO alvo no mesmo contexto não se aplica a este alvo", async () => {
    const outro = { RequisitoId: 1, Contexto: "CONSAGRACAO", AlvoChave: "Pastor", TrilhaId: 5, Modo: "BLOQUEIA", Ativo: true, TrilhaNome: "Pastoreio", TrilhaAtiva: true };
    const { pool, chamadas } = criarPoolFalso([[outro]]);
    const r = await t.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: "Diácono", membroId: 1 });
    expect(r.temRequisitos).toBe(false);
    expect(chamadas).toHaveLength(1);
  });

  test("escala: só quem não cumpre requisito BLOQUEIA sai; sem requisito, toda a equipe fica", async () => {
    const semRequisito = criarPoolFalso([[]]);
    const livre = await t.filtrarMembrosQueAtendem(semRequisito.pool, { contexto: "ESCALA_EQUIPE", alvoChave: "9", membroIds: [1, 2, 3] });
    expect(livre.temRequisitos).toBe(false);
    expect([...livre.atendem]).toEqual([1, 2, 3]);

    const requisito = { RequisitoId: 1, Contexto: "ESCALA_EQUIPE", AlvoChave: "9", TrilhaId: 5, Modo: "BLOQUEIA", Ativo: true, TrilhaNome: "Ministério Infantil", TrilhaAtiva: true };
    const vigente = { MatriculaId: 10, TrilhaId: 5, MembroId: 1, Status: "CONCLUIDA", IniciadaEm: "2026-01-01", ConcluidaEm: "2026-02-01", ValidoAte: "2030-01-01", TrilhaNome: "Ministério Infantil", PapelAlvo: null, AvisoDias: 60, CertificadoId: 3, CodigoVerificacao: "ABCDEFGHJKLMNPQR", Protocolo: "CERT-1", RevogadoEm: null, ObrigConcluidos: 2, ObrigTotal: 2 };
    const vencida = { ...vigente, MatriculaId: 11, MembroId: 2, ValidoAte: "2025-01-01" };
    const { pool } = criarPoolFalso([[requisito], [vigente, vencida]]);
    const r = await t.filtrarMembrosQueAtendem(pool, { contexto: "ESCALA_EQUIPE", alvoChave: "9", membroIds: [1, 2, 3], hojeIso: "2026-09-30" });
    expect(r.temRequisitos).toBe(true);
    expect([...r.atendem]).toEqual([1]);
    expect([...r.bloqueados.keys()].sort()).toEqual([2, 3]);
    expect(r.bloqueados.get(2)).toMatch(/vencida em 01\/01\/2025/);
    expect(r.bloqueados.get(3)).toMatch(/ainda não iniciada/);
  });

  test("escala: requisito em modo ALERTA não tira ninguém da escala", async () => {
    const requisito = { RequisitoId: 1, Contexto: "ESCALA_EQUIPE", AlvoChave: "9", TrilhaId: 5, Modo: "ALERTA", Ativo: true, TrilhaNome: "Recepção", TrilhaAtiva: true };
    const { pool } = criarPoolFalso([[requisito], []]);
    const r = await t.filtrarMembrosQueAtendem(pool, { contexto: "ESCALA_EQUIPE", alvoChave: "9", membroIds: [1, 2] });
    expect([...r.atendem]).toEqual([1, 2]);
    expect(r.bloqueados.size).toBe(0);
  });
});
