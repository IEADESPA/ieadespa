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
    [/sp_getapplock/, { recordset: [{ resultado: 0 }] }],
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

  // Revisão de fora, 26/11/2026 (L3): duas suspensões ao mesmo tempo contra os dois últimos que administram. A leitura de antes da transação ainda vê o
  // outro; a de dentro, depois da trava única, já vê a outra suspensão confirmada: esta é recusada e nada fica gravado.
  const travouUltimo = () => mockConsultas.some((c) => /sp_getapplock/.test(c.texto) && c.entradas.recurso === "acesso_ultimo_admin");
  test("corrida: a conferência é refeita dentro da transação, depois da trava única, e recusa sem gravar", async () => {
    mockRegras[1] = [/AlvoAdministra/, () => ({ recordset: [{ TemCargoVigente: 1, AlvoAdministra: 1, Outros: travouUltimo() ? 0 : 1 }] })];
    const r = await aplicar(CORPO);
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/única com a permissão "permissoes"/);
    expect(rodou(/INSERT INTO MedidasCautelares|UPDATE Lideranca|UPDATE SessoesAtivas/)).toHaveLength(0);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    const trava = rodou(/sp_getapplock/);
    expect(trava).toHaveLength(1);
    expect(trava[0].transacao).toBe(mockTransacoes[0]);
    expect(auditoria.registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
  });

  test("a trava única só entra quando o alvo administra os acessos", async () => {
    const r = await aplicar(CORPO);
    expect(r.status).toBe(201);
    expect(rodou(/sp_getapplock/)).toHaveLength(0);
    expect(rodou(/AlvoAdministra/).some((c) => c.transacao === mockTransacoes[0])).toBe(true);
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

// Concluir o relatório (Art. 45 §2º) — revisão de fora, 25/11/2026 (E6 e L9): a data e a trilha numa transação só (sem trilha, nada fica fechado), e a gravação
// só vale para a medida ainda sem conclusão (dois cliques ao mesmo tempo: o segundo é recusado, sem trocar a data nem gravar a trilha duas vezes).
describe("concluir o relatório da medida", () => {
  async function concluir() {
    const context = { bindingData: { id: "9", acao: "concluir-relatorio" }, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
    await hMedidas(context, { method: "POST", query: {}, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": geral() } });
    return context.res;
  }
  beforeEach(() => { mockRegras.unshift([/SELECT \* FROM MedidasCautelares WHERE MedidaId = @id/, { recordset: [{ MedidaId: 9, DataConclusaoRelatorio: null }] }]); });

  test("a data e a trilha na mesma transação, e a gravação exige a medida ainda sem conclusão", async () => {
    const r = await concluir();
    expect(r.body.sucesso).toBe(true);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["confirmada"]);
    const upd = rodou(/UPDATE MedidasCautelares SET DataConclusaoRelatorio/);
    expect(upd).toHaveLength(1);
    expect(upd[0].texto).toMatch(/WHERE MedidaId = @id AND DataConclusaoRelatorio IS NULL/);
    expect(upd[0].transacao).toBe(mockTransacoes[0]);
    expect(auditoria.registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
    expect(auditoria.registrarAuditoriaNaTransacao.mock.calls[0][0]).toBe(mockTransacoes[0]);
    expect(auditoria.registrarAuditoriaNaTransacao.mock.calls[0][1]).toMatchObject({ tabela: "MedidasCautelares", registroId: 9, usuarioId: 1 });
    expect(auditoria.registrarAuditoria).not.toHaveBeenCalled();
  });

  test("dois cliques: o segundo encontra a medida já concluída na gravação (0 linhas) e é recusado, sem trilha", async () => {
    mockRegras.unshift([/UPDATE MedidasCautelares SET DataConclusaoRelatorio/, { recordset: [], rowsAffected: [0] }]);
    const r = await concluir();
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/já foi concluído/);
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
    expect(auditoria.registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
    expect(auditoria.registrarAuditoria).not.toHaveBeenCalled();
  });

  test("a trilha falha: a conclusão é desfeita (o prazo não fica fechado sem quem fechou) e o erro sobe", async () => {
    auditoria.registrarAuditoriaNaTransacao.mockImplementationOnce(async () => { throw new Error("falha simulada"); });
    await expect(concluir()).rejects.toThrow("falha simulada");
    expect(mockTransacoes.map((t) => t.estado)).toEqual(["desfeita"]);
  });
});

// L7 (revisão de fora, 25/11/2026): as três restrições são sim/não de verdade. O texto "false" (ou 1, ou null) não vale como "suspender": 400, antes do 428 e
// antes de qualquer gravação. Sem o campo, é "não", como sempre.
describe("as restrições da medida são sim/não", () => {
  const semFator = () => auth.reassinarSessao({ membroId: 1, via: "SENHA", fator: { via: "NENHUM", em: Date.now() }, nivel: "GLOBAL", permissoes: ["pessoas"],
    escopoCongregacoes: "TODAS", termosPendentes: [] });
  async function aplicarCom(corpo, token) {
    const context = { bindingData: {}, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
    await hMedidas(context, { method: "POST", query: {}, body: corpo, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
    return context.res;
  }
  test.each([
    ["suspenderAcessoSistema", "false"], ["suspenderAcessoSistema", 1], ["suspenderAcessoSistema", null], ["suspenderAcessoSistema", "true"],
    ["suspensaoContasBancarias", "false"], ["suspensaoChavesFisicas", 0]
  ])("%s = %p: 400 antes do 428, nada gravado", async (campo, valor) => {
    const r = await aplicarCom({ membroId: 20, motivo: "Apuração de contas", [campo]: valor }, semFator());
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/sim ou não/);
    expect(mockTransacoes).toHaveLength(0);
    expect(rodou(/INSERT|UPDATE/)).toHaveLength(0);
  });
  test("false de verdade, sem a confirmação recente: grava sem suspender (o 428 é só para quem suspende o acesso)", async () => {
    const r = await aplicarCom({ membroId: 20, motivo: "Chaves do templo", suspenderAcessoSistema: false, suspensaoChavesFisicas: true }, semFator());
    expect(r.status).toBe(201);
    expect(rodou(/UPDATE Lideranca/)).toHaveLength(0);
  });
  test("true de verdade sem a confirmação recente: 428, como sempre", async () => {
    const r = await aplicarCom(CORPO, semFator());
    expect(r.status).toBe(428);
  });
});
