// Testes da Apresentação de Crianças (vB.12, Art. 82) — aptidão calculada:
// vedação de idade (>1 ano completo) e impedimento dos pais (união estável
// sem certidão, ou disciplina em curso) nunca podem passar quando bloqueiam.
const { criarPoolFalso } = require("./testUtils");
const apresentacao = require("../apresentacaoCriancas");

describe("modalidadeValida / geraCertificado (Art. 82 §2º, I e II 'b')", () => {
  test("SOLENE e RESERVADA são válidas", () => {
    expect(apresentacao.modalidadeValida("SOLENE")).toBe(true);
    expect(apresentacao.modalidadeValida("reservada")).toBe(true);
    expect(apresentacao.modalidadeValida("OUTRA")).toBe(false);
  });
  test("só SOLENE gera certificado — reservada nunca gera", () => {
    expect(apresentacao.geraCertificado("SOLENE")).toBe(true);
    expect(apresentacao.geraCertificado("RESERVADA")).toBe(false);
    expect(apresentacao.geraCertificado(null)).toBe(false);
  });
});

describe("calcularImpedimentoPais", () => {
  test("nenhum impedimento: sem disciplina, sem união estável", async () => {
    const { pool } = criarPoolFalso([[]]); // membrosSobDisciplina -> vazio
    const r = await apresentacao.calcularImpedimentoPais(pool, { membroId: 1, estadoCivil: "SOLTEIRO" }, { membroId: 2, estadoCivil: "CASADO" });
    expect(r.ok).toBe(true);
  });

  test("pai sob disciplina em curso é impedimento", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 1 }]]); // membrosSobDisciplina -> {1}
    const r = await apresentacao.calcularImpedimentoPais(pool, { membroId: 1, estadoCivil: "SOLTEIRO" }, null);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/disciplina em curso/);
  });

  test("mãe em união estável sem certidão é impedimento", async () => {
    const { pool } = criarPoolFalso([
      [], // membrosSobDisciplina -> vazio
      []  // possuiCasamentoCivilRegistrado(mae) -> nenhum
    ]);
    const r = await apresentacao.calcularImpedimentoPais(pool, null, { membroId: 2, estadoCivil: "UNIAO_ESTAVEL" });
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/união estável sem certidão/);
  });

  test("mãe em união estável COM certidão não é impedimento", async () => {
    const { pool } = criarPoolFalso([
      [], // membrosSobDisciplina -> vazio
      [{ x: 1 }] // possuiCasamentoCivilRegistrado(mae) -> encontrado
    ]);
    const r = await apresentacao.calcularImpedimentoPais(pool, null, { membroId: 2, estadoCivil: "UNIAO_ESTAVEL" });
    expect(r.ok).toBe(true);
  });

  test("nenhum pai/mãe informado (livre) não gera impedimento", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const r = await apresentacao.calcularImpedimentoPais(pool, null, null);
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(1); // só a query de disciplina, nenhuma de casamento
  });
});

describe("calcularAptidaoApresentacao (Art. 82 §3º)", () => {
  test("recém-nascida sem pais membros: apta, sem aviso de janela", async () => {
    const { pool } = criarPoolFalso([[]]);
    const hoje = "2026-01-10";
    const r = await apresentacao.calcularAptidaoApresentacao(pool, { dataNascimento: "2026-01-01", pai: null, mae: null }, hoje);
    expect(r.apto).toBe(true);
    expect(r.avisoForaJanelaPreferencial).toBeNull();
  });

  test("vedado acima de 1 ano completo de vida (Art. 82 §3º, II)", async () => {
    const { pool } = criarPoolFalso([[]]);
    const hoje = "2026-01-10";
    const r = await apresentacao.calcularAptidaoApresentacao(pool, { dataNascimento: "2024-01-01", pai: null, mae: null }, hoje);
    expect(r.apto).toBe(false);
    expect(r.itens.idadeVedada.ok).toBe(false);
  });

  test("fora da janela preferencial de 90 dias, mas ainda dentro de 1 ano: apta com aviso, não bloqueia", async () => {
    const { pool } = criarPoolFalso([[]]);
    const hoje = "2026-06-01";
    const r = await apresentacao.calcularAptidaoApresentacao(pool, { dataNascimento: "2026-01-01", pai: null, mae: null }, hoje);
    expect(r.apto).toBe(true);
    expect(r.avisoForaJanelaPreferencial).toMatch(/janela preferencial/);
  });

  test("impedimento de um dos pais reprova mesmo com idade ok", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 5 }]]); // pai sob disciplina
    const hoje = "2026-01-10";
    const r = await apresentacao.calcularAptidaoApresentacao(
      pool, { dataNascimento: "2026-01-01", pai: { membroId: 5, estadoCivil: "SOLTEIRO" }, mae: null }, hoje
    );
    expect(r.apto).toBe(false);
    expect(r.itens.impedimentoPais.ok).toBe(false);
  });
});
