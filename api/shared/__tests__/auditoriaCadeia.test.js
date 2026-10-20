// Trava 7-B (20/10/2026): a cadeia de hash da trilha geral (AuditLog) não bifurca com gravações simultâneas. registrarAuditoria passa a ler o topo da cadeia sob
// UPDLOCK, HOLDLOCK dentro de uma transação curta (como registrarAuditoriaNaTransacao): as gravações da mesma tabela fazem fila. A falha continua não derrubando a operação.
// O efeito contra o SQL Server de verdade (duas gravações ao mesmo tempo) é provado no e2e (tools/e2e-localdb).
let mockLog = [];
let mockFalhar = null;
jest.mock("../db", () => {
  const novaRequisicao = (tx) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockLog.push({ tx: tx ? tx.id : null, sql: texto, inputs: { ...inputs } });
    if (mockFalhar && mockFalhar(texto)) { const e = mockFalhar.erro(); throw e; }
    return { recordset: /SELECT TOP 1 HashRegistro/.test(texto) ? [{ HashRegistro: "a".repeat(64) }] : [] };
  } }; return r; };
  let seq = 0;
  class Transaction { constructor() { this.id = ++seq; } async begin() { mockLog.push({ tx: this.id, sql: "BEGIN" }); } async commit() { mockLog.push({ tx: this.id, sql: "COMMIT" }); } async rollback() { mockLog.push({ tx: this.id, sql: "ROLLBACK" }); } }
  class Request { constructor(tx) { return novaRequisicao(tx); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: () => novaRequisicao(null) }), sql };
});
const { registrarAuditoria, sha256 } = require("../auditoria");

beforeEach(() => { mockLog = []; mockFalhar = null; });
const REG = { tabela: "Membros", registroId: 7, acao: "EDITAR", usuarioId: 3, dadosDepois: { campo: "x" } };

test("o topo da cadeia é lido COM trava (UPDLOCK, HOLDLOCK) e gravado na MESMA transação, que confirma no fim", async () => {
  expect(await registrarAuditoria(REG)).toBe(true);
  const [b, le, grava, c] = mockLog;
  expect(b.sql).toBe("BEGIN");
  expect(le.sql).toMatch(/SELECT TOP 1 HashRegistro FROM AuditLog WITH \(UPDLOCK, HOLDLOCK\) WHERE Tabela = @tabela ORDER BY AuditId DESC/);
  expect(grava.sql).toMatch(/INSERT INTO AuditLog/);
  expect(c.sql).toBe("COMMIT");
  expect(new Set([b.tx, le.tx, grava.tx, c.tx]).size).toBe(1);
  // o hash continua o mesmo de sempre (a verificação da cadeia não muda): payload + hash anterior
  const payload = JSON.stringify({ tabela: "Membros", registroId: 7, acao: "EDITAR", usuarioId: 3, dadosAntes: null, dadosDepois: JSON.stringify({ campo: "x" }) });
  expect(grava.inputs.hashRegistro).toBe(sha256(payload + "a".repeat(64)));
});

test("impasse (1205): uma tentativa a mais, numa transação nova; outro erro: desfaz, registra no log e NÃO derruba quem chamou", async () => {
  let vezes = 0;
  mockFalhar = Object.assign((t) => /INSERT INTO AuditLog/.test(t) && vezes++ === 0, { erro: () => Object.assign(new Error("deadlock"), { number: 1205 }) });
  expect(await registrarAuditoria(REG)).toBe(true);
  expect(mockLog.filter((l) => l.sql === "ROLLBACK")).toHaveLength(1);
  expect(mockLog.filter((l) => l.sql === "COMMIT")).toHaveLength(1);
  mockLog = [];
  mockFalhar = Object.assign((t) => /INSERT INTO AuditLog/.test(t), { erro: () => new Error("banco fora") });
  const erro = jest.spyOn(console, "error").mockImplementation(() => {});
  expect(await registrarAuditoria(REG)).toBe(true);
  expect(mockLog.filter((l) => l.sql === "ROLLBACK")).toHaveLength(1);
  expect(mockLog.filter((l) => l.sql === "BEGIN")).toHaveLength(1);
  expect(erro).toHaveBeenCalled();
  erro.mockRestore();
});
