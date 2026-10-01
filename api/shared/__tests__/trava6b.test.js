// Testes da Trava de Revisão 6-B — as correções com lógica própria:
// "hoje" de Brasília, limite de taxa da verificação pública, LGPD da EBD
// (anonimização de quem não tem cadastro de membro), comparação do alvo do
// requisito de formação e o escopo de quem gere certificado de terceiro.
const { hojeBrasilia } = require("../dataBrasilia");
const { criarLimitador, chaveDeOrigem } = require("../limiteTaxa");
const lgpd = require("../ebdLgpd");
const trilhas = require("../trilhas");
const certificados = require("../certificados");
const { criarPoolFalso } = require("./testUtils");

describe("hojeBrasilia", () => {
  test("das 21h à meia-noite de Brasília ainda é o mesmo dia (o servidor, em UTC, já virou)", () => {
    expect(hojeBrasilia(new Date("2026-09-30T23:30:00.000Z"))).toBe("2026-09-30"); // 20h30 em Brasília
    expect(hojeBrasilia(new Date("2026-10-01T02:59:59.000Z"))).toBe("2026-09-30"); // 23h59
    expect(hojeBrasilia(new Date("2026-10-01T03:00:00.000Z"))).toBe("2026-10-01"); // meia-noite
  });
});

describe("limite de taxa", () => {
  test("bloqueia acima do máximo dentro da janela e libera na janela seguinte", () => {
    const l = criarLimitador({ janelaMs: 60000, maximo: 3 });
    expect([1, 2, 3].map(() => l.registrar("a", 1000).permitido)).toEqual([true, true, true]);
    const bloqueado = l.registrar("a", 1000);
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.retryAposSegundos).toBe(60);
    expect(l.registrar("b", 1000).permitido).toBe(true); // outra origem não é afetada
    expect(l.registrar("a", 61000).permitido).toBe(true); // janela nova
  });

  test("a tabela se limpa quando cresce demais", () => {
    const l = criarLimitador({ janelaMs: 1000, maximo: 5, maxChaves: 10 });
    for (let i = 0; i < 20; i++) l.registrar(`k${i}`, 0);
    l.registrar("nova", 5000);
    expect(l._tamanho()).toBe(1);
  });

  test("a origem vira hash do IP (nunca o IP em claro), sem a porta", () => {
    const k1 = chaveDeOrigem({ headers: { "x-forwarded-for": "200.1.2.3:5555, 10.0.0.1" } });
    const k2 = chaveDeOrigem({ headers: { "x-azure-clientip": "200.1.2.3" } });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{16}$/);
    expect(k1).not.toContain("200");
    expect(chaveDeOrigem({ headers: {} })).toBe(chaveDeOrigem({}));
  });
});

describe("LGPD da EBD", () => {
  test("marcadores de anonimização e validação da busca", () => {
    expect(lgpd.nomeAnonimizadoAluno(42)).toBe("Aluno anonimizado #42");
    expect(lgpd.termoBuscaValido("an")).toBe(false);
    expect(lgpd.termoBuscaValido("Ana")).toBe(true);
    expect(lgpd.escaparLike("50%_[x]\\")).toBe("50\\%\\_\\[x]\\\\");
  });

  test("aluno que é membro não é anonimizado por aqui (o nome mora no cadastro de membro)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ AlunoId: 1, MembroId: 7, NomeNaoMembro: null }]]);
    const r = await lgpd.anonimizarAlunoNaoMembro(pool, { alunoId: 1, membroId: 3 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/é membro/);
    expect(chamadas).toHaveLength(1); // nada é gravado
  });

  test("anonimizar de novo é recusado; registro que não é visitante também", async () => {
    let p = criarPoolFalso([[{ AlunoId: 5, MembroId: null, NomeNaoMembro: "Aluno anonimizado #5" }]]);
    expect((await lgpd.anonimizarAlunoNaoMembro(p.pool, { alunoId: 5, membroId: 3 })).mensagem).toMatch(/já foi anonimizado/);
    p = criarPoolFalso([[{ ChamadaId: 9, Status: "PRESENTE", VisitanteNome: null }]]);
    expect((await lgpd.anonimizarVisitante(p.pool, { chamadaId: 9, membroId: 3 })).sucesso).toBe(false);
    p = criarPoolFalso([[{ ChamadaId: 9, Status: "VISITANTE", VisitanteNome: lgpd.NOME_VISITANTE_ANONIMIZADO }]]);
    expect((await lgpd.anonimizarVisitante(p.pool, { chamadaId: 9, membroId: 3 })).mensagem).toMatch(/já foi anonimizado/);
  });

  test("busca exige pelo menos 3 letras (não consulta o banco)", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await lgpd.buscarTitularesEbd(pool, "ab")).sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});

describe("alvo do requisito de formação", () => {
  test("ignora maiúscula, acento e espaços repetidos", () => {
    expect(trilhas.alvoCorresponde("Consagração a  Diácono ", " consagracao a diácono")).toBe(true);
    expect(trilhas.alvoCorresponde("12", "12")).toBe(true);
    expect(trilhas.alvoCorresponde("", null)).toBe(true); // contexto sem alvo
    expect(trilhas.alvoCorresponde("Diácono", "Presbítero")).toBe(false);
  });
});

describe("gestor que alcança o titular do certificado", () => {
  test("sem permissão de gestão: nem consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect(await certificados.gestorAlcancaMembro(pool, { permissoes: [], escopoCongregacoes: "TODAS" }, 5)).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  test("gestor local só alcança membro da própria congregação; global alcança todos", async () => {
    const local = { permissoes: ["ebd_gestao"], escopoCongregacoes: ["Sede"] };
    expect(await certificados.gestorAlcancaMembro(criarPoolFalso([[{ CongregacaoNome: "Sede" }]]).pool, local, 5)).toBe(true);
    expect(await certificados.gestorAlcancaMembro(criarPoolFalso([[{ CongregacaoNome: "Bairro Novo" }]]).pool, local, 5)).toBe(false);
    expect(await certificados.gestorAlcancaMembro(criarPoolFalso([[{ CongregacaoNome: null }]]).pool, local, 5)).toBe(false);
    const global = { permissoes: ["trilhas_gestao"], escopoCongregacoes: "TODAS" };
    expect(await certificados.gestorAlcancaMembro(criarPoolFalso([[{ CongregacaoNome: "Bairro Novo" }]]).pool, global, 5)).toBe(true);
    expect(await certificados.gestorAlcancaMembro(criarPoolFalso([[]]).pool, global, 999)).toBe(false); // membro inexistente
  });
});

describe("vacância e a EBD", () => {
  const { encerrarVinculos } = require("../vacancia");
  const { sqlFalso } = require("./testUtils");
  test("disciplina e licença de candidatura tiram o professor, mas mantêm a matrícula de aluno", async () => {
    for (const motivo of ["DISCIPLINA", "LICENCA_CANDIDATURA"]) {
      const { pool, chamadas } = criarPoolFalso([[], [], [], []]);
      await encerrarVinculos(pool, sqlFalso, 42, motivo);
      const tudo = chamadas.map(c => c.sql).join("\n");
      expect(tudo).toMatch(/EbdTurmaProfessores/);
      expect(tudo).not.toMatch(/EbdAlunos/);
    }
  });
});
