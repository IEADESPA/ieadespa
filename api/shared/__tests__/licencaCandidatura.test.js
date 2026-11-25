// A licença por candidatura (GestaoLicencasCandidatura, POST): a pessoa sai do rol ativo e perde os mandatos (vacância). Duas regras:
// 1) de quem tem cargo de liderança, é ato da secretaria do nível do cargo ou de cima, com a confirmação recente (428) — a mesma regra de inativar ou desligar
//    (regra do responsável, 25/11/2026: shared/nivelDoCargo.js);
// 2) a licença, o status, a vacância e a trilha numa transação só: ou tudo vale, ou nada muda e o pedido pode ser repetido.
// O banco é simulado por TEXTO da consulta; cada consulta guarda em que transação rodou. O comportamento contra o SQL Server está no e2e-152 (seção 5d).
let mockRegras = [];
let mockConsultas = [];
let mockTransacoes = [];
jest.mock("../db", () => {
  const novoRequest = (transacao) => {
    const inputs = {};
    const r = {
      input: (n, _t, v) => { inputs[n] = v; return r; },
      query: async (texto) => {
        mockConsultas.push({ sql: texto, inputs: { ...inputs }, transacao: transacao ? transacao.id : null });
        for (const [padrao, valor, afetadas] of mockRegras) {
          if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
        }
        return { recordset: [], rowsAffected: [0] };
      }
    };
    return r;
  };
  class Transaction {
    constructor() { this.id = mockTransacoes.length + 1; this.estado = "nova"; mockTransacoes.push(this); }
    async begin() { this.estado = "aberta"; }
    async commit() { this.estado = "confirmada"; }
    async rollback() { this.estado = "desfeita"; }
  }
  return {
    getPool: async () => ({ request: () => novoRequest(null) }),
    sql: new Proxy({}, { get: (_alvo, chave) => (chave === "Transaction" ? Transaction : chave === "Request" ? function (t) { return novoRequest(t); } : () => undefined) })
  };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));

const auth = require("../auth");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../auditoria");
const vacancia = require("../vacancia");
const hLicencas = require("../../GestaoLicencasCandidatura/index.js");

const sessao = (membroId, extra = {}) => auth.reassinarSessao({ membroId, via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", permissoes: ["pessoas"],
  escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
const local = (extra = {}) => sessao(77, { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], ...extra });
const area = () => sessao(78, { nivel: "AREA", escopoCongregacoes: ["Central", "Vila Nova"] });
async function criar(token, membroId = 10) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hLicencas(context, { method: "POST", query: {}, body: { membroId, dataPleito: "2026-10-04" }, headers: { "x-auth-token": token, "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000" } });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const escritas = () => mockConsultas.filter((c) => /^\s*(SET XACT_ABORT ON;\s*)?(INSERT|UPDATE|DELETE)\b/i.test(c.sql));

let cargo = null;   // null = sem cargo de liderança
beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  mockTransacoes = [];
  cargo = null;
  registrarAuditoria.mockClear();
  registrarAuditoriaNaTransacao.mockClear();
  vacancia.encerrarVinculos.mockClear();
  quando(/AS CongregacaoNome/, (i) => (i.id === 10 ? [{ MembroId: 10, Nome: "Pessoa Dez", Status: "ATIVO", CongregacaoNome: "Central", ExtensaoNome: null }] : []));
  quando(/AlvoAdministra/, () => [{ TemCargoVigente: cargo ? 1 : 0, AlvoAdministra: 0, Outros: 1 }]);
  quando(/SELECT l\.EscopoTipo, l\.EscopoId FROM Lideranca l/, () => (cargo ? [cargo] : []));
  quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
  quando(/SELECT Nome FROM Congregacoes WHERE AreaId = @id/, [{ Nome: "Central" }, { Nome: "Vila Nova" }]);
  quando(/sp_getapplock/, [{ resultado: 0 }]);
  quando(/UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA'/, [], 1);
  quando(/INSERT INTO LicencasCandidatura/, [{ LicencaId: 5 }], 1);
});

describe("a licença numa transação só", () => {
  test("a licença, o status, a vacância e a trilha na mesma transação, confirmada; o status só muda de quem não saiu do rol", async () => {
    const r = await criar(local());
    expect(r.status).toBe(201);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["confirmada"]);
    for (const c of escritas()) expect(c.transacao).toBe(1);
    expect(rodou(/UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA'/)[0].sql).toMatch(/Status NOT IN \('DESLIGADO', 'FALECIDO'\)/);
    expect(rodou(/INSERT INTO LicencasCandidatura/)).toHaveLength(1);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("escada_10");
    expect(vacancia.encerrarVinculos).toHaveBeenCalledTimes(1);
    await vacancia.encerrarVinculos.mock.calls[0][0].request().query("UPDATE Assentos SET DataFim = 1");
    expect(rodou(/UPDATE Assentos/)[0].transacao).toBe(1);
    expect(registrarAuditoriaNaTransacao.mock.calls[0][0]).toBe(mockTransacoes[0]);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a falha no meio da vacância desfaz tudo (nem licença, nem status)", async () => {
    vacancia.encerrarVinculos.mockImplementationOnce(async () => { throw new Error("falha simulada"); });
    await expect(criar(local())).rejects.toThrow("falha simulada");
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    for (const c of escritas()) expect(c.transacao).toBe(1);
  });
  test("a pessoa saiu do rol no meio do caminho: recusa, nada gravado", async () => {
    mockRegras = mockRegras.filter(([p]) => !p.test("UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA'"));
    quando(/UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA'/, [], 0);
    const r = await criar(local());
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/saiu do rol/);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    expect(rodou(/INSERT INTO LicencasCandidatura/)).toHaveLength(0);
    expect(vacancia.encerrarVinculos).not.toHaveBeenCalled();
  });
});

describe("a licença de quem tem cargo de liderança: o nível do cargo e a confirmação recente", () => {
  test("cargo de área: a secretaria local é barrada (403, nada gravado); a da área registra", async () => {
    cargo = { EscopoTipo: "AREA", EscopoId: 3 };
    const barrada = await criar(local());
    expect(barrada.status).toBe(403);
    expect(barrada.body.mensagem).toMatch(/nível do cargo/);
    expect(escritas()).toHaveLength(0);
    expect(mockTransacoes).toHaveLength(0);
    expect((await criar(area())).status).toBe(201);
  });
  test("cargo local: a secretaria local sem a confirmação recente recebe 428; com ela, registra", async () => {
    cargo = { EscopoTipo: "CONGREGACAO", EscopoId: 1 };
    const semFator = await criar(local({ fator: { via: "NENHUM", em: Date.now() } }));
    expect(semFator.status).toBe(428);
    expect(escritas()).toHaveLength(0);
    expect((await criar(local())).status).toBe(201);
  });
  test("sem cargo: a confirmação recente não é pedida", async () => {
    expect((await criar(local({ fator: { via: "NENHUM", em: Date.now() } }))).status).toBe(201);
  });
});

// O retorno é decisão da Diretoria (só o nível geral). Quem não volta sai da licença para INATIVO no rol (resposta do responsável, 25/11/2026); a licença, a
// situação no rol e a trilha numa transação só.
describe("o retorno da licença numa transação só", () => {
  async function decidir(retornou, token = sessao(1)) {
    const context = { bindingData: { id: "5" }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await hLicencas(context, { method: "POST", query: {}, body: { retornou }, headers: { "x-auth-token": token, "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000" } });
    return context.res;
  }
  beforeEach(() => {
    quando(/SELECT MembroId, Status FROM LicencasCandidatura WHERE LicencaId = @id/, [{ MembroId: 10, Status: "EM_LICENCA" }]);
    quando(/UPDATE LicencasCandidatura SET Status = @status/, [], 1);
    quando(/UPDATE MembroReferencia SET Status = '(ATIVO|INATIVO)'/, [], 1);
  });

  test("não retornou: a licença fecha e a pessoa fica INATIVO no rol, com a trilha, tudo na mesma transação", async () => {
    const r = await decidir(false);
    expect(r.body.sucesso).toBe(true);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["confirmada"]);
    for (const c of escritas()) expect(c.transacao).toBe(1);
    expect(rodou(/UPDATE LicencasCandidatura SET Status = @status/)[0].inputs.status).toBe("NAO_RETORNOU");
    expect(rodou(/UPDATE LicencasCandidatura SET Status = @status/)[0].sql).toMatch(/Status = 'EM_LICENCA'/);
    const status = rodou(/UPDATE MembroReferencia SET Status = 'INATIVO'/);
    expect(status).toHaveLength(1);
    expect(status[0].sql).toMatch(/Status = 'LICENCA_CANDIDATURA'/);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("escada_10");
    expect(registrarAuditoriaNaTransacao.mock.calls[0][0]).toBe(mockTransacoes[0]);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("retornou: a pessoa volta a ATIVO na mesma transação", async () => {
    const r = await decidir(true);
    expect(r.body.sucesso).toBe(true);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["confirmada"]);
    for (const c of escritas()) expect(c.transacao).toBe(1);
    expect(rodou(/UPDATE MembroReferencia SET Status = 'ATIVO'/)).toHaveLength(1);
    expect(rodou(/UPDATE MembroReferencia SET Status = 'INATIVO'/)).toHaveLength(0);
  });

  test("a falha na trilha desfaz tudo: a licença continua aberta e a decisão pode ser repetida", async () => {
    registrarAuditoriaNaTransacao.mockImplementationOnce(async () => { throw new Error("falha simulada"); });
    await expect(decidir(false)).rejects.toThrow("falha simulada");
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    for (const c of escritas()) expect(c.transacao).toBe(1);
  });

  test("outra decisão já registrada no meio: recusa, nada muda", async () => {
    mockRegras = mockRegras.filter(([p]) => !p.test("UPDATE LicencasCandidatura SET Status = @status"));
    quando(/UPDATE LicencasCandidatura SET Status = @status/, [], 0);
    const r = await decidir(false);
    expect(r.body.sucesso).toBe(false);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    expect(rodou(/UPDATE MembroReferencia SET Status/)).toHaveLength(0);
  });
});
