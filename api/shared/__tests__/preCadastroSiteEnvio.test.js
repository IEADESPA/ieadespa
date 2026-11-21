// As pendências do "Quero me cadastrar" (revisão de 20/11/2026, corrigidas em 21/11/2026), na gravação (shared/preCadastroDb.js), com o banco simulado:
//  (b) a contagem dos limites e a gravação andam na MESMA transação, DEPOIS da trava do formulário (uma rajada não passa do limite);
//  (c) o mesmo envio (EnvioId) repetido devolve o pré-cadastro que já existe, sem contar nem gravar de novo (e o índice único é a última trava);
//  (a) o processamento do site espera a trava do CPF só até o teto que recebe (o que sobra do tempo fixo da resposta).
// Contra o SQL Server de verdade (rajadas em vários processos, o reenvio, os tempos medidos): tools/e2e-localdb/e2e-95-sobras-membros.js, parte 5.
let mockLog = [];
let mockResponder = () => [];
let mockFalhar = null;
jest.mock("../db", () => {
  const novaRequisicao = (tx) => {
    const inputs = {};
    const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
      mockLog.push({ tx: tx ? tx.id : null, sql: texto, inputs: { ...inputs } });
      if (mockFalhar && mockFalhar(texto)) throw mockFalhar.erro();
      return { recordset: mockResponder(texto, inputs) };
    } };
    return r;
  };
  let seq = 0;
  class Transaction { constructor() { this.id = ++seq; } async begin() { mockLog.push({ tx: this.id, sql: "BEGIN" }); } async commit() { mockLog.push({ tx: this.id, sql: "COMMIT" }); } async rollback() { mockLog.push({ tx: this.id, sql: "ROLLBACK" }); } }
  class Request { constructor(tx) { return novaRequisicao(tx); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: () => novaRequisicao(null) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const pdb = require("../preCadastroDb");
const regras = require("../preCadastro");
const pool = { request: () => new (require("../db").sql.Request)(null) };

const ENVIO = "0123456789abcdef0123456789abcdef";
const dados = { nome: "Maria Nova Teste", cpf: "52998224725", email: "maria@example.org", telefone: null, dataNascimento: "1990-05-10", sexo: "F", estadoCivil: "SOLTEIRO", congregacaoId: 2 };
const opcoes = (extra = {}) => ({ envioId: ENVIO, consentimento: regras.CONSENTIMENTO, origemHash: "abcdef0123456789", porVisitanteHora: 3, totalHora: 200, ...extra });
// o banco simulado: a trava concedida; o envio não existe; a contagem; a gravação devolve o id 501
const banco = ({ envio = null, total = 0, daOrigem = 0, trava = 0 } = {}) => (texto) => {
  if (/sp_getapplock/.test(texto)) return [{ rc: trava }];
  if (/WHERE EnvioId = @e/.test(texto)) return envio ? [envio] : [];
  if (/COUNT\(\*\) AS total/.test(texto)) return [{ total, daOrigem }];
  if (/INSERT INTO PreCadastros/.test(texto)) return [{ PreCadastroId: 501 }];
  return [];
};
const passos = () => mockLog.map((l) => (l.sql === "BEGIN" || l.sql === "COMMIT" || l.sql === "ROLLBACK" ? l.sql
  : /sp_getapplock/.test(l.sql) ? "TRAVA" : /WHERE EnvioId = @e/.test(l.sql) ? "ENVIO?" : /COUNT\(\*\) AS total/.test(l.sql) ? "CONTA" : /INSERT INTO PreCadastros/.test(l.sql) ? "GRAVA" : "OUTRO"));

beforeEach(() => { mockLog = []; mockResponder = banco(); mockFalhar = null; });

describe("(b) a contagem e a gravação na mesma transação, depois da trava do formulário", () => {
  test("a ordem: trava → o envio já existe? → conta → grava → confirma, tudo na MESMA transação", async () => {
    const r = await pdb.inserirDoSite(pool, dados, opcoes());
    expect(r).toEqual({ id: 501, repetido: false, avaliado: false });
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ENVIO?", "CONTA", "GRAVA", "COMMIT"]);
    expect(new Set(mockLog.map((l) => l.tx)).size).toBe(1);
    const trava = mockLog.find((l) => /sp_getapplock/.test(l.sql));
    expect(trava.inputs.r).toBe("precad-site:limites");
    expect(trava.sql).toMatch(/@LockMode = 'Exclusive', @LockOwner = 'Transaction'/);
    // a trava é só do formulário do site: nada de travar a tabela inteira
    expect(mockLog.map((l) => l.sql).join("\n")).not.toMatch(/TABLOCK|TABLOCKX|SERIALIZABLE/i);
    const grava = mockLog.find((l) => /INSERT INTO PreCadastros/.test(l.sql));
    expect(grava.inputs).toMatchObject({ e: ENVIO, h: "abcdef0123456789", cv: "2026-11", cb: "CONSENTIMENTO", cpf: "52998224725" });
    expect(grava.sql).toMatch(/VALUES \(N'SITE'/);
  });
  test("passou do limite (3 por visitante, 200 no total): nada é gravado", async () => {
    mockResponder = banco({ total: 10, daOrigem: 3 });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ limite: true });
    mockResponder = banco({ total: 200, daOrigem: 0 });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ limite: true });
    expect(passos().filter((p) => p === "GRAVA")).toHaveLength(0);
    // sem identificador de visitante, só o total conta
    mockResponder = banco({ total: 10, daOrigem: 9 });
    expect((await pdb.inserirDoSite(pool, dados, opcoes({ origemHash: null }))).id).toBe(501);
  });
  test("a trava não veio a tempo: erro (a rota responde 500 e nada foi gravado)", async () => {
    mockResponder = banco({ trava: -1 });
    await expect(pdb.inserirDoSite(pool, dados, opcoes())).rejects.toThrow(/trava/);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ROLLBACK"]);
  });
});

describe("(c) o mesmo envio repetido não grava de novo", () => {
  test("o envio já gravado e avaliado: devolve o mesmo pré-cadastro, sem contar nem gravar", async () => {
    mockResponder = banco({ envio: { PreCadastroId: 77, Situacao: "ACEITO", Pendencias: null }, total: 999, daOrigem: 999 });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ id: 77, repetido: true, avaliado: true });
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ENVIO?", "COMMIT"]);
  });
  test("o envio já gravado mas SEM avaliar (PENDENTE sem pendência): avisa, para o reenvio avaliar", async () => {
    mockResponder = banco({ envio: { PreCadastroId: 78, Situacao: "PENDENTE", Pendencias: null } });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ id: 78, repetido: true, avaliado: false });
    mockResponder = banco({ envio: { PreCadastroId: 79, Situacao: "PENDENTE", Pendencias: "MENOR_DE_IDADE" } });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ id: 79, repetido: true, avaliado: true });
  });
  test("o índice único recusou (o mesmo envio no mesmo instante): é o mesmo envio, devolve o que ficou gravado", async () => {
    let gravou = false;
    mockResponder = (texto) => {
      if (/sp_getapplock/.test(texto)) return [{ rc: 0 }];
      if (/WHERE EnvioId = @e/.test(texto)) return gravou ? [{ PreCadastroId: 90, Situacao: "ACEITO", Pendencias: null }] : [];
      if (/COUNT\(\*\) AS total/.test(texto)) return [{ total: 0, daOrigem: 0 }];
      return [];
    };
    mockFalhar = Object.assign((t) => /INSERT INTO PreCadastros/.test(t) && (gravou = true), {
      erro: () => Object.assign(new Error("Cannot insert duplicate key row in object 'dbo.PreCadastros' with unique index 'UX_PreCadastros_Envio'."), { number: 2601 }) });
    expect(await pdb.inserirDoSite(pool, dados, opcoes())).toEqual({ id: 90, repetido: true, avaliado: true });
    expect(passos()).toContain("ROLLBACK");
  });
  test("outro índice único (não o do envio) não é engolido", async () => {
    mockFalhar = Object.assign((t) => /INSERT INTO PreCadastros/.test(t), { erro: () => Object.assign(new Error("unique index 'UX_Outro'"), { number: 2601 }) });
    await expect(pdb.inserirDoSite(pool, dados, opcoes())).rejects.toThrow(/UX_Outro/);
  });
  test("identificador fora do formato: nem começa", async () => {
    for (const e of [undefined, "", "ABC", "0123456789ABCDEF0123456789ABCDEF", "0123456789abcdef0123456789abcde", `${ENVIO}0`, "'; DROP TABLE PreCadastros; --".padEnd(32, "x")]) {
      await expect(pdb.inserirDoSite(pool, dados, opcoes({ envioId: e }))).rejects.toThrow(/envioId/);
    }
    expect(mockLog).toHaveLength(0);
  });
});

describe("(a) o processamento do site espera a trava do CPF só até o teto", () => {
  const processado = (texto) => {
    if (/SELECT Cpf FROM PreCadastros/.test(texto)) return [{ Cpf: "52998224725" }];
    if (/sp_getapplock/.test(texto)) return [{ rc: 0 }];
    if (/SELECT p\.\*/.test(texto)) return [{ Cpf: "52998224725", Situacao: "ACEITO", MembroIdResultado: 700001, VersaoTexto: "1" }];
    return [];
  };
  test("o teto que recebe vira o tempo de espera da trava (nunca mais que 20 s)", async () => {
    mockResponder = processado;
    await pdb.processar(pool, 501, { esperaMaxMs: 1200 });
    const trava = mockLog.find((l) => /sp_getapplock/.test(l.sql));
    expect(trava.inputs.r).toBe("precad-cpf:52998224725");
    expect(trava.inputs.ms).toBeLessThanOrEqual(1200);
    expect(trava.inputs.ms).toBeGreaterThan(1000);
    mockLog = [];
    await pdb.processar(pool, 501);
    expect(mockLog.find((l) => /sp_getapplock/.test(l.sql)).inputs.ms).toBeGreaterThan(19000);
    mockLog = [];
    await pdb.processar(pool, 501, { esperaMaxMs: 0 });
    expect(mockLog.find((l) => /sp_getapplock/.test(l.sql)).inputs.ms).toBe(0);
  });
  test("sem a trava a tempo: desfaz tudo e avisa com erro (o pré-cadastro fica na fila sem avaliar)", async () => {
    mockResponder = (texto) => (/sp_getapplock/.test(texto) ? [{ rc: -1 }] : processado(texto));
    await expect(pdb.processar(pool, 501, { esperaMaxMs: 300 })).rejects.toThrow(/trava/);
    expect(passos().slice(-1)).toEqual(["ROLLBACK"]);
  });
});
