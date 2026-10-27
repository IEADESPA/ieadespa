// (revisão de 23/10/2026) Pedaços da camada de banco da Identidade Visual com o banco SIMULADO por texto da consulta. O comportamento contra o SQL Server está nos roteiros
// ponta a ponta (tools/e2e-localdb, e2e-31, e2e-32 e e2e-39).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const novoRequest = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) { const v = typeof valor === "function" ? valor(inputs) : valor; if (v instanceof Error) throw v; return v.recordset ? v : { recordset: v, rowsAffected: [1] }; }
    return { recordset: [], rowsAffected: [0] };
  } }; return r; };
  return { getPool: async () => ({ request: novoRequest }), sql: new Proxy({}, { get: () => () => undefined }) };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const db = require("../identidadeVisualDb");
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
beforeEach(() => { mockRegras = []; mockConsultas = []; db.usarRelogio(() => new Date("2027-11-17T12:00:00Z")); });
afterAll(() => db.usarRelogio(null));

async function poolSimulado() { return require("../db").getPool(); }

describe("as cores: só o erro do gatilho das cores vira a mensagem das cores", () => {
  const monta = () => {
    quando(/FROM IdentidadeCiclos c\s+LEFT JOIN IdentidadeResultados r/, [{ CicloId: 1, AnoAlvo: 2028, ResultadoId: null }]);
    quando(/SELECT COUNT\(\*\) AS n FROM IdentidadeArtes/, [{ n: 0 }]);
    quando(/SELECT COUNT\(\*\) AS n FROM IdentidadeCores/, [{ n: 0 }]);
  };
  test("o erro do gatilho das cores: a recusa explicada", async () => {
    monta();
    quando(/IF EXISTS \(SELECT 1 FROM IdentidadeCores/, new Error("As cores não mudam depois que chegou a primeira arte (ou depois do resultado)."));
    const r = await db.salvarCor(await poolSimulado(), { ver: { membroId: 1 }, cicloId: 1, dados: { ordem: 1, nome: "Azul", hex: "#112233" } });
    expect(r).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/As cores não mudam/) });
  });
  test("QUALQUER outro erro (outro gatilho, número 50000, tempo esgotado) segue como erro — não é mascarado de 'as cores não mudam'", async () => {
    for (const e of [Object.assign(new Error("O ciclo da identidade visual só anda para a frente"), { number: 50000 }), Object.assign(new Error("Timeout: Request failed to complete"), { number: -2 })]) {
      mockRegras = []; monta();
      quando(/IF EXISTS \(SELECT 1 FROM IdentidadeCores/, e);
      await expect(db.salvarCor(await poolSimulado(), { ver: { membroId: 1 }, cicloId: 1, dados: { ordem: 1, nome: "Azul", hex: "#112233" } })).rejects.toThrow(e.message);
    }
  });
});

describe("a auditoria dos atos do PRÓPRIO membro não guarda a pessoa nem o número da sugestão/arte", () => {
  test("retirar a sugestão: a trilha leva só o ciclo, sem usuário", async () => {
    const { registrarAuditoria } = require("../auditoria");
    registrarAuditoria.mockClear();
    db.usarRelogio(() => new Date("2027-11-05T12:00:00Z"));
    quando(/SELECT s\.SugestaoId, s\.Status, s\.CicloId, c\.AnoAlvo/, [{ SugestaoId: 77, Status: "ENVIADA", CicloId: 3, AnoAlvo: 2028, ResultadoId: null }]);
    quando(/UPDATE IdentidadeSugestoes SET Status = 'RETIRADA'/, { recordset: [], rowsAffected: [1] });
    const r = await db.retirarSugestao(await poolSimulado(), { membroId: 31, sugestaoId: 77 });
    expect(r.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const a = registrarAuditoria.mock.calls[0][0];
    expect(a).toMatchObject({ tabela: "IdentidadeCiclos", registroId: 3, acao: "IDENTIDADE_SUGESTAO_RETIRADA", usuarioId: null });
    expect(JSON.stringify(a)).not.toMatch(/77|31/);
  });
});
