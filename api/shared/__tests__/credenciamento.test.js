// Testes do Credenciamento de Assembleia (vB.13, Art. 142-143) — o motivo do
// impedimento precisa vir certo (carta de mudança > disciplina > capacidade
// eleitoral), e o relatório precisa congelar na 1ª geração, nunca recalcular.
const { criarPoolFalso } = require("./testUtils");
const credenciamento = require("../credenciamento");

const MEMBRO_BASE = { membroId: 1, situacaoMembro: "EM_COMUNHAO", status: "ATIVO", dataNascimento: "1990-01-01", dataAdmissao: "2000-01-01", dizimistaFiel: true };

describe("avaliarCredenciamento (Art. 142-143)", () => {
  test("membro em plena capacidade eleitoral é credenciado", async () => {
    const { pool } = criarPoolFalso([[], []]); // sem disciplina, sem carta de mudança
    const r = await credenciamento.avaliarCredenciamento(pool, MEMBRO_BASE);
    expect(r.credenciado).toBe(true);
    expect(r.artigo).toBeNull();
  });

  test("carta de mudança emitida tem prioridade sobre qualquer outro motivo", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 1 }], [{ membroId: 1 }]]); // disciplina TAMBÉM ativo, mas carta de mudança vence
    const r = await credenciamento.avaliarCredenciamento(pool, MEMBRO_BASE);
    expect(r.credenciado).toBe(false);
    expect(r.artigo).toBe("Art. 142, III");
  });

  test("disciplina em curso (sem carta de mudança) é recusado no Art. 142, II", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 1 }], []]);
    const r = await credenciamento.avaliarCredenciamento(pool, MEMBRO_BASE);
    expect(r.credenciado).toBe(false);
    expect(r.artigo).toBe("Art. 142, II");
  });

  test("sem capacidade eleitoral (período de integração) é recusado no Art. 142, I", async () => {
    const { pool } = criarPoolFalso([[], []]);
    const membro = { ...MEMBRO_BASE, dataAdmissao: new Date().toISOString().slice(0, 10) };
    const r = await credenciamento.avaliarCredenciamento(pool, membro);
    expect(r.credenciado).toBe(false);
    expect(r.artigo).toBe("Art. 142, I");
    expect(r.detalhe).toMatch(/período de integração/);
  });
});

describe("listarImpedidosAssembleia", () => {
  test("só lista quem tem impedimento, com o motivo certo", async () => {
    const ativos = [
      { membroId: 1, nome: "Apto", situacaoMembro: "EM_COMUNHAO", status: "ATIVO", dataNascimento: "1990-01-01", dataAdmissao: "2000-01-01", dizimistaFiel: true },
      { membroId: 2, nome: "Sob Disciplina", situacaoMembro: "EM_COMUNHAO", status: "ATIVO", dataNascimento: "1990-01-01", dataAdmissao: "2000-01-01", dizimistaFiel: true }
    ];
    const { pool } = criarPoolFalso([ativos, [{ MembroId: 2 }], []]);
    const impedidos = await credenciamento.listarImpedidosAssembleia(pool);
    expect(impedidos).toHaveLength(1);
    expect(impedidos[0].membroId).toBe(2);
    expect(impedidos[0].motivoArtigo).toBe("Art. 142, II");
  });
});

describe("gerarOuObterRelatorioCredenciamento", () => {
  test("gera e congela na 1ª chamada", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [], // sem relatório existente
      [{ total: 40 }], // totalCredenciados
      [{ total: 3 }],  // totalImpedidos
      [{ RelatorioId: 7, GeradoEm: "2026-01-10 10:00:00" }] // insert
    ]);
    const r = await credenciamento.gerarOuObterRelatorioCredenciamento(pool, 1, 99);
    expect(r.novo).toBe(true);
    expect(r.totalCredenciados).toBe(40);
    expect(r.totalImpedidos).toBe(3);
    expect(chamadas).toHaveLength(4);
  });

  test("2ª chamada devolve o mesmo congelado, sem recalcular", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ relatorioId: 7, totalCredenciados: 40, totalImpedidos: 3, geradoEm: "2026-01-10 10:00:00" }]
    ]);
    const r = await credenciamento.gerarOuObterRelatorioCredenciamento(pool, 1, 99);
    expect(r.novo).toBe(false);
    expect(r.totalCredenciados).toBe(40);
    expect(chamadas).toHaveLength(1);
  });
});
