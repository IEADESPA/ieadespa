// Testes da v6.10 (EBD — Sala de aula assistida e material) — lógica pura:
// lote da chamada offline (validação, deduplicação, relógio do aparelho),
// regra de conflito com o servidor, plano de aula (validação, link seguro,
// alcance e ordem) e a sequência de ausências que alimenta o alerta ao
// professor. O caminho "lição fechada" da sincronização roda com pool falso.
const s = require("../ebdSalaAula");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-09-27";
const AGORA = new Date("2026-09-27T13:00:00.000Z");
const opcoes = { hoje: HOJE, agora: AGORA };

describe("datas", () => {
  test("hojeBrasilia usa UTC-3 (as Functions rodam em UTC)", () => {
    expect(s.hojeBrasilia(new Date("2026-10-01T02:59:00.000Z"))).toBe("2026-09-30");
    expect(s.hojeBrasilia(new Date("2026-10-01T03:00:00.000Z"))).toBe("2026-10-01");
  });

  test("dataIsoValida recusa data inexistente e formato errado", () => {
    expect(s.dataIsoValida("2026-09-27")).toBe(true);
    expect(s.dataIsoValida("2026-02-30")).toBe(false);
    expect(s.dataIsoValida("27/09/2026")).toBe(false);
    expect(s.dataIsoValida(null)).toBe(false);
  });

  test("paraIsoData lê Date de coluna DATE (meia-noite UTC) e string", () => {
    expect(s.paraIsoData(new Date("2026-09-27T00:00:00.000Z"))).toBe("2026-09-27");
    expect(s.paraIsoData("2026-09-27T10:00:00Z")).toBe("2026-09-27");
    expect(s.paraIsoData("lixo")).toBeNull();
  });

  test("formatarDataBr", () => {
    expect(s.formatarDataBr("2026-09-27")).toBe("27/09/2026");
    expect(s.formatarDataBr(null)).toBe("");
  });
});

describe("validarLoteOffline", () => {
  const base = { turmaId: 7, data: "2026-09-27", registros: [{ alunoId: 1, status: "PRESENTE", marcadoEm: "2026-09-27T12:00:00.000Z" }] };

  test("lote válido normaliza turma e marcações", () => {
    const r = s.validarLoteOffline(base, opcoes);
    expect(r.valido).toBe(true);
    expect(r.turmaId).toBe(7);
    expect(r.registros).toHaveLength(1);
    expect(r.registros[0].marcadoEm).toBeInstanceOf(Date);
    expect(r.rejeitados).toEqual([]);
  });

  test("recusa turma, data inválida, futura ou velha demais", () => {
    expect(s.validarLoteOffline({ ...base, turmaId: 0 }, opcoes).valido).toBe(false);
    expect(s.validarLoteOffline({ ...base, data: "2026-02-30" }, opcoes).valido).toBe(false);
    expect(s.validarLoteOffline({ ...base, data: "2026-09-28" }, opcoes).mensagem).toMatch(/futuro/);
    expect(s.validarLoteOffline({ ...base, data: "2026-08-27" }, opcoes).valido).toBe(false); // 31 dias
    expect(s.validarLoteOffline({ ...base, data: "2026-08-28" }, opcoes).valido).toBe(true); // 30 dias
  });

  test("recusa lote vazio, formato errado e lote grande demais", () => {
    expect(s.validarLoteOffline({ turmaId: 7, data: HOJE }, opcoes).mensagem).toMatch(/Nada/);
    expect(s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: "x" }, opcoes).valido).toBe(false);
    const muitos = Array.from({ length: 301 }, (_, i) => ({ alunoId: i + 1, status: "PRESENTE", marcadoEm: AGORA.toISOString() }));
    expect(s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: muitos }, opcoes).valido).toBe(false);
  });

  test("marcação repetida do mesmo aluno: vale a mais recente", () => {
    const r = s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: [
      { alunoId: 1, status: "AUSENTE", marcadoEm: "2026-09-27T12:05:00.000Z" },
      { alunoId: 1, status: "PRESENTE", marcadoEm: "2026-09-27T12:00:00.000Z" }
    ] }, opcoes);
    expect(r.registros).toEqual([{ alunoId: 1, status: "AUSENTE", marcadoEm: new Date("2026-09-27T12:05:00.000Z") }]);
  });

  test("item ruim é recusado sozinho, sem derrubar o lote", () => {
    const r = s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: [
      { alunoId: 1, status: "PRESENTE", marcadoEm: AGORA.toISOString() },
      { alunoId: 2, status: "VISITANTE", marcadoEm: AGORA.toISOString() },
      { alunoId: "abc", status: "PRESENTE", marcadoEm: AGORA.toISOString() },
      { alunoId: 3, status: "AUSENTE", marcadoEm: "ontem" }
    ] }, opcoes);
    expect(r.valido).toBe(true);
    expect(r.registros.map(x => x.alunoId)).toEqual([1]);
    expect(r.rejeitados).toHaveLength(3);
  });

  test("relógio do aparelho adiantado é limitado a agora", () => {
    const r = s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: [{ alunoId: 1, status: "PRESENTE", marcadoEm: "2026-12-01T00:00:00.000Z" }] }, opcoes);
    expect(r.registros[0].marcadoEm.getTime()).toBe(AGORA.getTime());
  });

  test("visitante: chave obrigatória no formato certo, nome obrigatório, deduplica por chave", () => {
    const r = s.validarLoteOffline({ turmaId: 7, data: HOJE, visitantes: [
      { chaveCliente: "a1b2c3d4-0000-4000-8000-000000000001", nome: "  Ana  ", contato: "", marcadoEm: AGORA.toISOString() },
      { chaveCliente: "a1b2c3d4-0000-4000-8000-000000000001", nome: "Ana", marcadoEm: AGORA.toISOString() },
      { chaveCliente: "curta", nome: "Bia", marcadoEm: AGORA.toISOString() },
      { chaveCliente: "chave'; DROP TABLE x--", nome: "Caio", marcadoEm: AGORA.toISOString() },
      { chaveCliente: "a1b2c3d4-0000-4000-8000-000000000002", nome: "   ", marcadoEm: AGORA.toISOString() }
    ] }, opcoes);
    expect(r.visitantes).toHaveLength(1);
    expect(r.visitantes[0]).toMatchObject({ nome: "Ana", contato: null });
    expect(r.rejeitados).toHaveLength(3);
  });
});

describe("decidirAplicacaoOffline", () => {
  const marcadoEm = new Date("2026-09-27T12:00:00.000Z");

  test("sem linha no servidor cria; mesmo status não faz nada", () => {
    expect(s.decidirAplicacaoOffline(null, { status: "PRESENTE", marcadoEm })).toBe("CRIAR");
    expect(s.decidirAplicacaoOffline({ status: "PRESENTE", atualizadoEm: new Date("2026-09-28T00:00:00Z") }, { status: "PRESENTE", marcadoEm })).toBe("IGUAL");
  });

  test("correção no servidor DEPOIS da marcação do aparelho vence (conflito)", () => {
    expect(s.decidirAplicacaoOffline({ status: "AUSENTE", atualizadoEm: new Date("2026-09-27T12:30:00Z") }, { status: "PRESENTE", marcadoEm })).toBe("CONFLITO");
  });

  test("linha do servidor mais antiga que a marcação: atualiza", () => {
    expect(s.decidirAplicacaoOffline({ status: "AUSENTE", atualizadoEm: new Date("2026-09-27T11:00:00Z") }, { status: "PRESENTE", marcadoEm })).toBe("ATUALIZAR");
  });

  test("linha vinda de outro aparelho compara pela hora da marcação, não do envio", () => {
    // outro professor marcou às 11h, mas só sincronizou às 15h
    const existente = { status: "AUSENTE", marcadoOfflineEm: new Date("2026-09-27T11:00:00Z"), atualizadoEm: new Date("2026-09-27T15:00:00Z") };
    expect(s.decidirAplicacaoOffline(existente, { status: "PRESENTE", marcadoEm })).toBe("ATUALIZAR");
  });
});

test("ehViolacaoDeUnicidade reconhece 2627/2601 nos dois lugares em que o mssql expõe", () => {
  expect(s.ehViolacaoDeUnicidade({ number: 2627 })).toBe(true);
  expect(s.ehViolacaoDeUnicidade({ originalError: { info: { number: 2601 } } })).toBe(true);
  expect(s.ehViolacaoDeUnicidade({ number: 547 })).toBe(false);
  expect(s.ehViolacaoDeUnicidade(null)).toBeFalsy();
});

describe("plano de aula", () => {
  test("validarPlanoAula", () => {
    expect(s.validarPlanoAula({ data: "2026-10-04", titulo: "A graça" }).valido).toBe(true);
    expect(s.validarPlanoAula({ data: "04/10/2026", titulo: "A graça" }).valido).toBe(false);
    expect(s.validarPlanoAula({ data: "2026-10-04", titulo: "ab" }).valido).toBe(false);
    expect(s.validarPlanoAula({ data: "2026-10-04", titulo: "A graça", roteiro: "x".repeat(20001) }).valido).toBe(false);
  });

  test("validarMaterial só aceita https", () => {
    expect(s.validarMaterial({ titulo: "Slides", url: "https://exemplo.org/licao.pdf" }).valido).toBe(true);
    expect(s.validarMaterial({ titulo: "Slides", url: "http://exemplo.org" }).valido).toBe(false);
    expect(s.validarMaterial({ titulo: "Slides", url: "javascript:alert(1)" }).valido).toBe(false);
    expect(s.validarMaterial({ titulo: "Slides", url: "não é link" }).valido).toBe(false);
    expect(s.validarMaterial({ titulo: "", url: "https://exemplo.org" }).valido).toBe(false);
    expect(s.validarMaterial({ titulo: "Slides", url: `https://exemplo.org/${"a".repeat(500)}` }).valido).toBe(false);
  });

  test("planoSeAplicaATurma: congregação e faixa etária (sem acento/maiúscula)", () => {
    const turma = { congregacaoId: 5, faixaEtaria: "Jovens" };
    expect(s.planoSeAplicaATurma({ congregacaoId: null, faixaEtaria: null }, turma)).toBe(true);
    expect(s.planoSeAplicaATurma({ congregacaoId: 5, faixaEtaria: " jóvens " }, turma)).toBe(true);
    expect(s.planoSeAplicaATurma({ congregacaoId: 6, faixaEtaria: null }, turma)).toBe(false);
    expect(s.planoSeAplicaATurma({ congregacaoId: null, faixaEtaria: "Adultos" }, turma)).toBe(false);
  });

  test("ordenarPlanosPorEspecificidade: congregação+faixa > congregação > faixa > campo; empate pelo mais novo", () => {
    const ordem = s.ordenarPlanosPorEspecificidade([
      { planoId: 1, congregacaoId: null, faixaEtaria: null },
      { planoId: 2, congregacaoId: null, faixaEtaria: "Jovens" },
      { planoId: 3, congregacaoId: 5, faixaEtaria: null },
      { planoId: 4, congregacaoId: 5, faixaEtaria: "Jovens" },
      { planoId: 5, congregacaoId: null, faixaEtaria: null }
    ]).map(p => p.planoId);
    expect(ordem).toEqual([4, 3, 2, 5, 1]);
  });
});

describe("calcularSequenciasAusencia", () => {
  const licoes = [
    { licaoId: 10, data: "2026-09-06" },
    { licaoId: 11, data: new Date("2026-09-13T00:00:00.000Z") },
    { licaoId: 12, data: "2026-09-20" },
    { licaoId: 13, data: "2026-09-27" }
  ];

  test("conta do domingo mais recente para trás até a última presença", () => {
    const r = s.calcularSequenciasAusencia({
      alunos: [{ alunoId: 1, nome: "Ana", desde: "2026-01-01" }, { alunoId: 2, nome: "Bia", desde: "2026-01-01" }],
      licoes, presentes: new Set(["10:1", "13:2"]), minimo: 3
    });
    expect(r).toEqual([{ alunoId: 1, nome: "Ana", domingos: 3, licaoInicioId: 11, faltaDesde: "2026-09-13", ultimaLicaoId: 13, ultimaPresenca: "2026-09-06" }]);
  });

  test("abaixo do mínimo não alerta; sem presença nenhuma no período, ultimaPresenca é null", () => {
    const alunos = [{ alunoId: 1, nome: "Ana", desde: null }];
    expect(s.calcularSequenciasAusencia({ alunos, licoes, presentes: new Set(["12:1"]), minimo: 3 })).toEqual([]);
    const r = s.calcularSequenciasAusencia({ alunos, licoes, presentes: new Set(), minimo: 4 });
    expect(r[0]).toMatchObject({ domingos: 4, licaoInicioId: 10, ultimaPresenca: null });
  });

  test("domingos antes da entrada do aluno na turma não contam", () => {
    const r = s.calcularSequenciasAusencia({
      alunos: [{ alunoId: 1, nome: "Ana", desde: "2026-09-15" }], licoes, presentes: new Set(), minimo: 3
    });
    expect(r).toEqual([]); // só 20/09 e 27/09 contam
  });

  test("ordena pelo maior número de domingos", () => {
    const r = s.calcularSequenciasAusencia({
      alunos: [{ alunoId: 1, nome: "Ana", desde: null }, { alunoId: 2, nome: "Bia", desde: null }],
      licoes, presentes: new Set(["10:1"]), minimo: 3
    });
    expect(r.map(x => x.alunoId)).toEqual([2, 1]);
  });

  test("textoAlertaAusencia", () => {
    expect(s.textoAlertaAusencia({ nome: "Ana", domingos: 3, ultimaPresenca: "2026-09-06", turmaNome: "Jovens", congregacaoNome: "Sede" }))
      .toBe("Ana (turma Jovens, Sede) não vem à EBD há 3 domingo(s) seguido(s) — última presença em 06/09/2026.");
    expect(s.textoAlertaAusencia({ nome: "Bia", domingos: 4, ultimaPresenca: null })).toMatch(/sem presença registrada/);
  });
});

describe("sincronizarChamadaOffline", () => {
  test("lição FECHADA devolve o lote inteiro (o aparelho guarda e tenta depois)", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ LicaoId: 99, CongregacaoId: 5, Data: new Date("2026-09-27T00:00:00Z"), Status: "FECHADA" }]
    ]);
    const lote = s.validarLoteOffline({ turmaId: 7, data: HOJE, registros: [{ alunoId: 1, status: "PRESENTE", marcadoEm: AGORA.toISOString() }] }, opcoes);
    const r = await s.sincronizarChamadaOffline(pool, { lote, turma: { turmaId: 7, congregacaoId: 5 }, membroId: 3 });
    expect(r).toMatchObject({ sucesso: false, codigo: "LICAO_FECHADA" });
    expect(chamadas).toHaveLength(1); // nada é gravado
  });
});
