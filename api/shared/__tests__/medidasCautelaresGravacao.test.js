// A gravação da medida cautelar com a suspensão do acesso (GestaoMedidasCautelares): só os cargos vigentes recebem o fim, o fim anterior fica na trilha,
// a conferência de quem administra os acessos conta só quem entra, e tudo vale junto ou nada vale. O banco é simulado por TEXTO da consulta, guardando os
// parâmetros; o comportamento contra o SQL Server está em tools/e2e-localdb/e2e-152-acesso.js.
let mockRegras = [];
let mockConsultas = [];
let mockTransacoes = [];
jest.mock("../db", () => {
  const executar = async (texto, entradas, transacao) => {
    mockConsultas.push({ texto, entradas, transacao });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(entradas, texto) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [/^\s*(SET XACT_ABORT ON;\s*)?(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequest = (transacao = null) => {
    const entradas = {};
    const r = { input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; }, query: (texto) => executar(texto, entradas, transacao) };
    return r;
  };
  class Transaction {
    constructor() { this.estado = "nova"; mockTransacoes.push(this); }
    async begin() { this.estado = "aberta"; }
    async commit() { this.estado = "confirmada"; }
    async rollback() { this.estado = "desfeita"; }
  }
  class Request { constructor(t) { return novaRequest(t || null); } }
  const sql = new Proxy({}, { get: (_alvo, nome) => (nome === "Transaction" ? Transaction : nome === "Request" ? Request : () => undefined) });
  return { getPool: async () => ({ request: () => novaRequest(null) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const auditoria = require("../auditoria");
const hMedidas = require("../../GestaoMedidasCautelares/index.js");

const geral = (extra = {}) => auth.reassinarSessao({ membroId: 1, via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", permissoes: ["pessoas"],
  escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
async function aplicar(corpo) {
  const context = { bindingData: {}, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await hMedidas(context, { method: "POST", query: {}, body: corpo, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": geral() } });
  return context.res;
}
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.texto));
const situacao = (alvoAdministra, outros) => [/AlvoAdministra/, { recordset: [{ TemCargoVigente: 1, AlvoAdministra: alvoAdministra, Outros: outros }] }];
const CORPO = { membroId: 20, motivo: "Conferência do caixa", suspenderAcessoSistema: true };

beforeEach(() => {
  mockConsultas = [];
  mockTransacoes = [];
  auditoria.registrarAuditoria.mockClear();
  auditoria.registrarAuditoriaNaTransacao.mockClear();
  mockRegras = [
    [/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, { recordset: [{ MembroId: 20 }] }],
    situacao(0, 1),
    [/INSERT INTO MedidasCautelares/, { recordset: [{ MedidaId: 7 }], rowsAffected: [1] }],
    [/OUTPUT DELETED\.LiderancaId/, { recordset: [{ LiderancaId: 31, AtivoAteAnterior: "2027-12-31" }, { LiderancaId: 32, AtivoAteAnterior: null }], rowsAffected: [2] }],
    [/FROM MedidasCautelares mc/, { recordset: [{ medidaId: 7 }] }]
  ];
});

describe("os cargos que recebem o fim", () => {
  test("só os cargos vigentes: o fim de um cargo já encerrado fica como estava", async () => {
    const r = await aplicar(CORPO);
    expect(r.status).toBe(201);
    const fim = rodou(/UPDATE Lideranca SET AtivoAte/);
    expect(fim).toHaveLength(1);
    expect(fim[0].texto).toMatch(/AND \(AtivoAte IS NULL OR AtivoAte >= @h\)/);
  });

  test("a trilha guarda o fim anterior de cada cargo encerrado pela medida", async () => {
    await aplicar(CORPO);
    expect(auditoria.registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
    const registro = auditoria.registrarAuditoriaNaTransacao.mock.calls[0][1];
    expect(registro.dadosAntes).toEqual({ cargos: [{ liderancaId: 31, ativoAteAnterior: "2027-12-31" }, { liderancaId: 32, ativoAteAnterior: null }] });
  });
});

describe("quem administra os acessos", () => {
  test("a última pessoa que administra os acessos não é suspensa", async () => {
    mockRegras[1] = situacao(1, 0);
    const r = await aplicar(CORPO);
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/INSERT INTO MedidasCautelares|UPDATE Lideranca/)).toHaveLength(0);
  });

  test("havendo outra pessoa que administra (e entra), a suspensão vale", async () => {
    mockRegras[1] = situacao(1, 1);
    const r = await aplicar(CORPO);
    expect(r.status).toBe(201);
  });
});

describe("tudo junto ou nada", () => {
  test("a medida, o fim dos cargos, as sessões, as delegações e a trilha vão numa transação só", async () => {
    const r = await aplicar(CORPO);
    expect(r.status).toBe(201);
    expect(mockTransacoes).toHaveLength(1);
    expect(mockTransacoes[0].estado).toBe("confirmada");
    for (const padrao of [/INSERT INTO MedidasCautelares/, /UPDATE Lideranca SET AtivoAte/, /UPDATE SessoesAtivas/, /UPDATE DelegacoesAcesso/]) {
      const c = rodou(padrao);
      expect(c.length).toBeGreaterThan(0);
      expect(c.every((x) => x.transacao === mockTransacoes[0])).toBe(true);
      expect(c.every((x) => /^SET XACT_ABORT ON;/.test(x.texto))).toBe(true);
    }
    expect(auditoria.registrarAuditoria).not.toHaveBeenCalled();
  });

  test("uma falha no meio desfaz a medida inteira (nada fica pela metade)", async () => {
    mockRegras.unshift([/UPDATE SessoesAtivas/, () => { throw new Error("falha passageira do banco"); }]);
    await expect(aplicar(CORPO)).rejects.toThrow(/falha passageira/);
    expect(mockTransacoes).toHaveLength(1);
    expect(mockTransacoes[0].estado).toBe("desfeita");
    expect(auditoria.registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
  });

  test("a medida sem suspensão do acesso também grava com a trilha na mesma transação", async () => {
    const r = await aplicar({ membroId: 20, motivo: "Chaves do templo", suspensaoChavesFisicas: true });
    expect(r.status).toBe(201);
    expect(rodou(/UPDATE Lideranca/)).toHaveLength(0);
    expect(mockTransacoes[0].estado).toBe("confirmada");
    expect(auditoria.registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
  });
});
