// As pendências do "Quero me cadastrar" (revisão de 20/11/2026, corrigidas em 21/11/2026), na gravação (shared/preCadastroDb.js), com o banco simulado:
//  (b) a contagem dos limites e a gravação andam na MESMA transação, DEPOIS da trava do formulário (uma rajada não passa do limite);
//  (c) o mesmo envio (EnvioId) repetido devolve o pré-cadastro que já existe, sem contar nem gravar de novo (e o índice único é a última trava);
//  (a) o processamento e a gravação do site têm PRAZO (o fim do tempo fixo da resposta menos a folga): o que não couber é desfeito (banco lento,
//      decisão do responsável de 22/11/2026: "a secretaria aceita depois").
// Contra o SQL Server de verdade (rajadas em vários processos, o reenvio, os tempos medidos): tools/e2e-localdb/e2e-95-sobras-membros.js, parte 5.
let mockLog = [];
let mockResponder = () => [];
let mockFalhar = null;
let mockDemora = () => 0;
jest.mock("../db", () => {
  // limite: o requestTimeout do pedido (o prazo do "Quero me cadastrar"); mockDemora(texto) atrasa a resposta do banco simulado (o banco lento)
  const novaRequisicao = (tx, overrides) => {
    const inputs = {};
    const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
      mockLog.push({ tx: tx ? tx.id : null, sql: texto, inputs: { ...inputs }, limite: overrides && overrides.requestTimeout });
      const atraso = mockDemora(texto);
      if (atraso) await new Promise((ok) => setTimeout(ok, atraso));
      if (mockFalhar && mockFalhar(texto)) throw mockFalhar.erro();
      return { recordset: mockResponder(texto, inputs) };
    } };
    return r;
  };
  let seq = 0;
  class Transaction { constructor() { this.id = ++seq; } async begin() { mockLog.push({ tx: this.id, sql: "BEGIN" }); } async commit() { mockLog.push({ tx: this.id, sql: "COMMIT" }); } async rollback() { mockLog.push({ tx: this.id, sql: "ROLLBACK" }); } }
  class Request { constructor(tx, overrides) { return novaRequisicao(tx, overrides); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: (o) => novaRequisicao(null, o) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const pdb = require("../preCadastroDb");
const regras = require("../preCadastro");
const pool = { request: (o) => new (require("../db").sql.Request)(null, o) };

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

beforeEach(() => { mockLog = []; mockResponder = banco(); mockFalhar = null; mockDemora = () => 0; });

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

describe("(a) o processamento do site com PRAZO (banco lento, decisão de 22/11/2026: o que não couber é desfeito e fica na fila)", () => {
  const processado = (texto) => {
    if (/SELECT Cpf FROM PreCadastros/.test(texto)) return [{ Cpf: "52998224725" }];
    if (/sp_getapplock/.test(texto)) return [{ rc: 0 }];
    if (/SELECT p\.\*/.test(texto)) return [{ Cpf: "52998224725", Situacao: "ACEITO", MembroIdResultado: 700001, VersaoTexto: "1" }];
    return [];
  };
  const { PrazoEsgotado } = pdb;
  test("o prazo vira o tempo de espera da trava (menos a margem; nunca mais que 20 s) e o limite de CADA pedido ao banco", async () => {
    mockResponder = processado;
    const t0 = Date.now();
    await pdb.processar(pool, 501, { ate: t0 + 1200 });
    const trava = mockLog.find((l) => /sp_getapplock/.test(l.sql));
    expect(trava.inputs.r).toBe("precad-cpf:52998224725");
    expect(trava.inputs.ms).toBeLessThanOrEqual(1150);
    expect(trava.inputs.ms).toBeGreaterThan(1000);
    const pedidos = mockLog.filter((l) => !["BEGIN", "COMMIT", "ROLLBACK"].includes(l.sql));
    expect(pedidos.length).toBeGreaterThanOrEqual(3);
    for (const p of pedidos) { expect(p.limite).toBeGreaterThan(0); expect(p.limite).toBeLessThanOrEqual(1200); }
    // sem prazo (a secretaria, o líder): a trava espera até 20 s e o pedido fica com o limite padrão do driver
    mockLog = [];
    await pdb.processar(pool, 501);
    expect(mockLog.find((l) => /sp_getapplock/.test(l.sql)).inputs.ms).toBeGreaterThan(19000);
    expect(mockLog.every((l) => l.limite === undefined)).toBe(true);
  });
  test("o prazo que já passou: nem começa (nada no banco) e sai PrazoEsgotado", async () => {
    mockResponder = processado;
    await expect(pdb.processar(pool, 501, { ate: Date.now() - 1 })).rejects.toBeInstanceOf(PrazoEsgotado);
    expect(mockLog).toHaveLength(0);
  });
  test("sem a trava do CPF dentro do prazo: desfaz tudo e sai PrazoEsgotado (o pré-cadastro fica na fila sem avaliar)", async () => {
    mockResponder = (texto) => (/sp_getapplock/.test(texto) ? [{ rc: -1 }] : processado(texto));
    const e = await pdb.processar(pool, 501, { ate: Date.now() + 300 }).catch((x) => x);
    expect(pdb.ehPrazoEsgotado(e)).toBe(true);
    expect(passos().slice(-1)).toEqual(["ROLLBACK"]);
    expect(passos()).not.toContain("COMMIT");
    // sem prazo, a trava que não vem continua um erro comum
    mockLog = [];
    await expect(pdb.processar(pool, 501)).rejects.toThrow(/trava do pré-cadastro não obtida a tempo/);
  });
  test("o pedido cortado pelo driver no fim do prazo (ETIMEOUT): desfaz e sai PrazoEsgotado, com a causa guardada", async () => {
    mockResponder = processado;
    mockFalhar = Object.assign((t) => /SELECT p\.\*/.test(t), { erro: () => Object.assign(new Error("Timeout: Request failed to complete in 900ms"), { code: "ETIMEOUT" }) });
    const e = await pdb.processar(pool, 501, { ate: Date.now() + 900 }).catch((x) => x);
    expect(e).toBeInstanceOf(PrazoEsgotado);
    expect(e.causa.code).toBe("ETIMEOUT");
    expect(passos().slice(-1)).toEqual(["ROLLBACK"]);
    expect(passos()).not.toContain("COMMIT");
    // sem prazo, o ETIMEOUT é o erro do driver mesmo (não vira "não coube")
    mockLog = [];
    const e2 = await pdb.processar(pool, 501).catch((x) => x);
    expect(pdb.ehPrazoEsgotado(e2)).toBe(false);
    expect(e2.code).toBe("ETIMEOUT");
  });
  test("o trabalho que termina FORA do prazo (banco lento sem corte): NÃO confirma — desfaz e sai PrazoEsgotado", async () => {
    mockResponder = processado;
    mockDemora = (t) => (/SELECT p\.\*/.test(t) ? 250 : 0);
    const e = await pdb.processar(pool, 501, { ate: Date.now() + 150 }).catch((x) => x);
    expect(pdb.ehPrazoEsgotado(e)).toBe(true);
    expect(passos()).not.toContain("COMMIT");
    expect(passos().slice(-1)).toEqual(["ROLLBACK"]);
  });
  test("o pedido seguinte, depois de o prazo passar, nem sai (o resto do aceite não roda)", async () => {
    mockResponder = processado;
    mockDemora = (t) => (/sp_getapplock/.test(t) ? 200 : 0);
    const e = await pdb.processar(pool, 501, { ate: Date.now() + 120 }).catch((x) => x);
    expect(pdb.ehPrazoEsgotado(e)).toBe(true);
    expect(mockLog.some((l) => /SELECT p\.\*/.test(l.sql))).toBe(false);
    expect(passos().slice(-1)).toEqual(["ROLLBACK"]);
  });
});

describe("a GRAVAÇÃO do site com PRAZO (banco lento): o que não couber é desfeito, nada gravado", () => {
  const { PrazoEsgotado } = pdb;
  test("dentro do prazo: grava, e cada pedido leva o que sobra do prazo como limite; a trava espera no máximo o prazo", async () => {
    const t0 = Date.now();
    const r = await pdb.inserirDoSite(pool, dados, opcoes({ ate: t0 + 2000 }));
    expect(r).toEqual({ id: 501, repetido: false, avaliado: false });
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ENVIO?", "CONTA", "GRAVA", "COMMIT"]);
    for (const l of mockLog.filter((x) => x.inputs)) { expect(l.limite).toBeGreaterThan(0); expect(l.limite).toBeLessThanOrEqual(2000); }
    expect(mockLog.find((l) => /sp_getapplock/.test(l.sql)).inputs.ms).toBeLessThanOrEqual(1950);
  });
  test("o prazo que já passou: nada no banco, PrazoEsgotado", async () => {
    await expect(pdb.inserirDoSite(pool, dados, opcoes({ ate: Date.now() - 5 }))).rejects.toBeInstanceOf(PrazoEsgotado);
    expect(mockLog).toHaveLength(0);
  });
  test("a gravação cortada pelo driver (ETIMEOUT) ou terminada fora do prazo: desfeita (sem COMMIT), PrazoEsgotado", async () => {
    mockFalhar = Object.assign((t) => /INSERT INTO PreCadastros/.test(t), { erro: () => Object.assign(new Error("Timeout: Request failed"), { code: "ETIMEOUT" }) });
    await expect(pdb.inserirDoSite(pool, dados, opcoes({ ate: Date.now() + 500 }))).rejects.toBeInstanceOf(PrazoEsgotado);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ENVIO?", "CONTA", "GRAVA", "ROLLBACK"]);
    mockLog = []; mockFalhar = null;
    mockDemora = (t) => (/INSERT INTO PreCadastros/.test(t) ? 200 : 0);
    await expect(pdb.inserirDoSite(pool, dados, opcoes({ ate: Date.now() + 120 }))).rejects.toBeInstanceOf(PrazoEsgotado);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ENVIO?", "CONTA", "GRAVA", "ROLLBACK"]);
  });
  test("a trava do formulário que não vem dentro do prazo: PrazoEsgotado; sem prazo, o erro comum de antes", async () => {
    mockResponder = banco({ trava: -1 });
    await expect(pdb.inserirDoSite(pool, dados, opcoes({ ate: Date.now() + 400 }))).rejects.toBeInstanceOf(PrazoEsgotado);
    mockLog = [];
    const e = await pdb.inserirDoSite(pool, dados, opcoes()).catch((x) => x);
    expect(pdb.ehPrazoEsgotado(e)).toBe(false);
    expect(e.message).toMatch(/trava/);
  });
});
