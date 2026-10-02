// Escopo territorial das rotas de finanças e patrimônio (grupo "parte 1"): cada teste prende UMA conferência de escopo (ou de estado) para ela não voltar a sumir.
//  - rotas INSTITUCIONAIS (alienações, atos de designação, auxílios, casa pastoral, cash pooling, conciliação, documentos de bens, dados bancários da instituição, confirmação de dados
//    bancários de fornecedor, escrita de campanhas): só o GERAL (papel Global E escopo TODAS) — o papel local com a permissão "financeiro" leva 403 antes de tocar no banco;
//  - fornecedores: o tesoureiro local lê só o mínimo, nunca vê prebendado e não altera dado bancário; o cadastro com dado bancário nasce pendente de confirmação;
//  - campanhas: a leitura filtra metas e arrecadação pelo escopo; criar/editar é transação única;
//  - cessões de templo: por congregação (lista, criação, alteração), com máquina de estados e cobrança numa transação.
// O banco é simulado por TEXTO da consulta (como em revisaoV75.test.js): o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
let mockTx = [];
let mockFalhar = null;
function mockExecutar(texto, inputs) {
  mockConsultas.push({ sql: texto, inputs: { ...inputs } });
  if (mockFalhar && mockFalhar.test(texto)) throw new Error("falha simulada com detalhe interno");
  for (const [padrao, valor, afetadas] of mockRegras) {
    if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
  }
  return { recordset: [], rowsAffected: [/^\s*(UPDATE|DELETE|INSERT|MERGE)/i.test(texto) ? 1 : 0] };
}
jest.mock("../db", () => {
  const criarRequest = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => mockExecutar(texto, inputs) }; return r; };
  class Transaction { async begin() { mockTx.push("begin"); } async commit() { mockTx.push("commit"); } async rollback() { mockTx.push("rollback"); } }
  class Request { constructor() { return criarRequest(); } }
  const sqlFalso = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : () => undefined) });
  return { getPool: async () => ({ request: criarRequest }), sql: sqlFalso };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://blob/doc-1") }));
jest.mock("../demonstracoes", () => ({ calcularBalancoPatrimonial: jest.fn(async () => ({ patrimonioLiquido: 1000000 })) }));
jest.mock("../tesouraria", () => ({ saldoCentroCusto: jest.fn(async () => 1000) }));
jest.mock("../investimentos", () => ({ calcularPortfolio: jest.fn(async () => ({ saldoAplicado: 500, rentabilidadeAcumulada: 10 })), round2: (n) => n }));

const auth = require("../auth");
const util = require("../financeiro1Util");
const { MSG_GERAL } = require("../escopoRotas");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const hConfirmar = require("../../ConfirmarDadosBancariosFornecedor/index.js");
const hAlienacoes = require("../../GestaoAlienacoesBens/index.js");
const hAtos = require("../../GestaoAtosDesignacao/index.js");
const hAuxilios = require("../../GestaoAuxiliosCusto/index.js");
const hCampanhas = require("../../GestaoCampanhas/index.js");
const hCasa = require("../../GestaoCasaPastoral/index.js");
const hCash = require("../../GestaoCashPooling/index.js");
const hCessoes = require("../../GestaoCessoesTemplo/index.js");
const hConciliacao = require("../../GestaoConciliacaoBancaria/index.js");
const hDadosBancarios = require("../../GestaoDadosBancariosInstituicao/index.js");
const hDocumentos = require("../../GestaoDocumentosBens/index.js");
const hFornecedores = require("../../GestaoFornecedores/index.js");

async function chamar(handler, { metodo = "GET", corpo, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter(c => /^\s*(INSERT|UPDATE|DELETE|MERGE)/i.test(c.sql));
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const auditoria = () => registrarAuditoria.mock.calls.map(c => c[0]);

const tokenDe = (extra = {}) => auth.reassinarSessao({ membroId: 5, via: "SENHA", termosPendentes: [], nivel: "CONGREGACAO", escopoCongregacoes: ["A"], permissoes: ["financeiro"], ...extra });
const GERAL = (extra = {}) => tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", ...extra });
const LOCAL = (nomes = ["A"], extra = {}) => tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: nomes, ...extra });
const GLOBAL_COM_LISTA = () => tokenDe({ nivel: "GLOBAL", escopoCongregacoes: ["A"] });
const LOCAL_COM_TODAS = () => tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" });
const PIN = () => tokenDe({ via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [] });
const GERAL_SEM_PERMISSAO = () => tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] });

const base64De = (texto) => Buffer.from(texto).toString("base64");
const GRANDE_DEMAIS = "A".repeat(22 * 1024 * 1024); // base64 de bem mais de 15 MB

beforeEach(() => {
  mockRegras = []; mockConsultas = []; mockTx = []; mockFalhar = null;
  registrarAuditoria.mockClear(); storage.salvarDocumento.mockClear(); storage.salvarDocumento.mockImplementation(async () => "https://blob/doc-1");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("porta das rotas institucionais: só o geral (papel Global E escopo TODAS)", () => {
  const ROTAS = [
    ["ConfirmarDadosBancariosFornecedor", hConfirmar, { metodo: "POST", ligado: { id: "7" } }],
    ["GestaoAlienacoesBens", hAlienacoes, { metodo: "GET" }],
    ["GestaoAtosDesignacao", hAtos, { metodo: "GET" }],
    ["GestaoAuxiliosCusto", hAuxilios, { metodo: "GET" }],
    ["GestaoCasaPastoral", hCasa, { metodo: "GET" }],
    ["GestaoCashPooling", hCash, { metodo: "GET" }],
    ["GestaoConciliacaoBancaria", hConciliacao, { metodo: "GET", ligado: { recurso: "fontes" } }],
    ["GestaoDocumentosBens", hDocumentos, { metodo: "GET" }],
    ["GestaoDadosBancariosInstituicao GET", hDadosBancarios, { metodo: "GET" }],
    ["GestaoDadosBancariosInstituicao PUT", hDadosBancarios, { metodo: "PUT", corpo: { agencia: "1234" } }],
    ["GestaoCampanhas POST", hCampanhas, { metodo: "POST", corpo: {} }],
    ["GestaoCampanhas PUT", hCampanhas, { metodo: "PUT", ligado: { id: "3" }, corpo: {} }]
  ];
  describe.each(ROTAS)("%s", (_nome, handler, args) => {
    test("sem sessão: 401, sem tocar no banco", async () => {
      const r = await chamar(handler, args);
      expect(r.status).toBe(401);
      expect(mockConsultas).toHaveLength(0);
    });
    test("sessão de PIN (permissoes: []): recusada, sem tocar no banco", async () => {
      const r = await chamar(handler, { ...args, token: PIN() });
      expect(r.status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
    test("papel LOCAL com a permissão financeiro (Tesoureiro Local): 403 da administração geral, ANTES de tocar no banco", async () => {
      const r = await chamar(handler, { ...args, token: LOCAL(["A"]) });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("papel Global com escopo de LISTA de congregações: 403", async () => {
      const r = await chamar(handler, { ...args, token: GLOBAL_COM_LISTA() });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("papel local com escopo \"TODAS\" (concedido por esquecimento): 403", async () => {
      const r = await chamar(handler, { ...args, token: LOCAL_COM_TODAS() });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("geral SEM a permissão financeiro: 403 (a permissão continua valendo), sem tocar no banco", async () => {
      const r = await chamar(handler, { ...args, token: GERAL_SEM_PERMISSAO() });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).not.toBe(MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("geral: passa pela porta (nem 401 nem 403)", async () => {
      const r = await chamar(handler, { ...args, token: GERAL() });
      expect([401, 403]).not.toContain(r.status);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoAlienacoesBens", () => {
  const registro = (extra = {}) => ({ AlienacaoId: 11, BemId: 9, ValorProposto: 100, Status: "PROPOSTA", PropostoPor: 5, AprovacaoNecessaria: "CLI", ...extra });
  const quandoAlienacao = (extra) => { quando(/SELECT \* FROM AlienacoesBens WHERE AlienacaoId/, [registro(extra)]); quando(/FROM ParametrosParecerViabilidade/, [{ ValorLimite: 1000000 }]); };

  test("id malformado: a mesma resposta de \"não encontrada\", sem consultar o banco", async () => {
    for (const metodo of ["GET", "PUT"]) {
      const r = await chamar(hAlienacoes, { metodo, token: GERAL(), ligado: { id: "0x10" }, corpo: { acao: "CONCLUIR" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Alienação não encontrada." });
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST: valor inválido (texto, NaN, zero, negativo, enorme, true) e bem malformado são recusados sem gravar", async () => {
    for (const valorProposto of ["abc", 0, -5, 1e12, true, [5], "0x10", "   "]) {
      const r = await chamar(hAlienacoes, { metodo: "POST", token: GERAL(), corpo: { bemId: 9, valorProposto } });
      expect(r.status).toBe(400);
    }
    for (const bemId of ["0x10", "abc", 0, -1, null]) {
      const r = await chamar(hAlienacoes, { metodo: "POST", token: GERAL(), corpo: { bemId, valorProposto: 100 } });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST válido grava com o valor numérico", async () => {
    quando(/SELECT \* FROM BensPatrimoniais WHERE BemId/, [{ BemId: 9, Status: "ATIVO", Tipo: "EQUIPAMENTO", EhTemploSede: 0 }]);
    quando(/INSERT INTO AlienacoesBens/, [{ AlienacaoId: 11 }]);
    const r = await chamar(hAlienacoes, { metodo: "POST", token: GERAL(), corpo: { bemId: "9", valorProposto: "1500.5" } });
    expect(r.status).toBe(201);
    const insert = rodou(/INSERT INTO AlienacoesBens/)[0];
    expect(insert.inputs.bemId).toBe(9);
    expect(insert.inputs.valorProposto).toBe(1500.5);
    expect(insert.inputs.propostoPor).toBe(5);
  });
  test("AUTORIZAR: quem propôs NÃO autoriza (segregação) — nada é gravado", async () => {
    quandoAlienacao({ PropostoPor: 5 });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL({ membroId: 5 }), ligado: { id: "11" }, corpo: { acao: "AUTORIZAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Quem propôs/);
    expect(escritas()).toHaveLength(0);
  });
  test("AUTORIZAR por OUTRA pessoa do geral: grava com o estado no WHERE e deixa trilha", async () => {
    quandoAlienacao({ PropostoPor: 5 });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL({ membroId: 6 }), ligado: { id: "11" }, corpo: { acao: "AUTORIZAR" } });
    expect(r.body.sucesso).toBe(true);
    const upd = escritas();
    expect(upd).toHaveLength(1);
    expect(upd[0].sql).toMatch(/AND Status = 'PROPOSTA'/);
    expect(upd[0].inputs.aprovadoPor).toBe(6);
    expect(auditoria().map(a => a.acao)).toContain("Autorizou alienação de bem");
  });
  test("AUTORIZAR perdeu a corrida (estado mudou entre a leitura e a gravação): recusa e sem trilha de sucesso", async () => {
    quandoAlienacao({ PropostoPor: 5 });
    quando(/UPDATE AlienacoesBens SET Status = @status/, [], 0);
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL({ membroId: 6 }), ligado: { id: "11" }, corpo: { acao: "AUTORIZAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
  test("AUTORIZAR com ata de Assembleia maior que 15 MB: recusada antes de salvar o arquivo", async () => {
    quandoAlienacao({ PropostoPor: 5, AprovacaoNecessaria: "ASSEMBLEIA" });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL({ membroId: 6 }), ligado: { id: "11" }, corpo: { acao: "AUTORIZAR", ataBase64: GRANDE_DEMAIS, mimeType: "application/pdf" } });
    expect(r.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("AUTORIZAR com ata pequena e falha do armazenamento: 500 sem vazar a mensagem interna", async () => {
    quandoAlienacao({ PropostoPor: 5, AprovacaoNecessaria: "ASSEMBLEIA" });
    storage.salvarDocumento.mockImplementation(async () => { throw new Error("chave-secreta-do-storage"); });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL({ membroId: 6 }), ligado: { id: "11" }, corpo: { acao: "AUTORIZAR", ataBase64: base64De("ata"), mimeType: "application/pdf" } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/chave-secreta/);
    expect(escritas()).toHaveLength(0);
  });
  test.each(["CONCLUIDA", "REJEITADA"])("REJEITAR de alienação %s: recusada, nada é gravado", async (Status) => {
    quandoAlienacao({ Status });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "REJEITAR", motivo: "desistência" } });
    expect(r.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
  });
  test.each(["PROPOSTA", "AUTORIZADA_CLI", "AUTORIZADA_ASSEMBLEIA"])("REJEITAR de alienação %s: grava com o estado no WHERE", async (Status) => {
    quandoAlienacao({ Status });
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "REJEITAR", motivo: "desistência" } });
    expect(r.body.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/Status IN \('PROPOSTA', 'AUTORIZADA_CLI', 'AUTORIZADA_ASSEMBLEIA'\)/);
  });
  test("REJEITAR que perdeu a corrida (já concluída entre a leitura e a gravação): recusada e sem trilha", async () => {
    quandoAlienacao({ Status: "AUTORIZADA_CLI" });
    quando(/UPDATE AlienacoesBens SET Status = 'REJEITADA'/, [], 0);
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "REJEITAR", motivo: "desistência" } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
  test("REJEITAR sem motivo em texto: 400", async () => {
    quandoAlienacao();
    const r = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "REJEITAR", motivo: { x: 1 } } });
    expect(r.status).toBe(400);
  });
  test("CONCLUIR: só de alienação autorizada, com o estado no WHERE; o bem só vira ALIENADO se a alienação foi concluída", async () => {
    quandoAlienacao({ Status: "AUTORIZADA_CLI" });
    const ok = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "CONCLUIR" } });
    expect(ok.body.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/Status IN \('AUTORIZADA_CLI', 'AUTORIZADA_ASSEMBLEIA'\)/);
    expect(rodou(/UPDATE BensPatrimoniais SET Status = 'ALIENADO'/)).toHaveLength(1);

    mockConsultas = []; mockRegras = [];
    quandoAlienacao({ Status: "AUTORIZADA_CLI" });
    quando(/UPDATE AlienacoesBens SET Status = 'CONCLUIDA'/, [], 0);
    const corrida = await chamar(hAlienacoes, { metodo: "PUT", token: GERAL(), ligado: { id: "11" }, corpo: { acao: "CONCLUIR" } });
    expect(corrida.body.sucesso).toBe(false);
    expect(rodou(/UPDATE BensPatrimoniais/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoAtosDesignacao", () => {
  const corpo = (extra = {}) => ({ numeroAto: "12/2026", orgaoColegiado: "CLI", dataDeliberacao: "2026-09-01", valorMensal: 5000, membroId: 40, ataBase64: base64De("ata"), mimeType: "application/pdf", ...extra });
  test("id malformado: mesma resposta de \"não encontrado\", sem consultar o banco", async () => {
    const r = await chamar(hAtos, { token: GERAL(), ligado: { id: "1e1" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Ato de designação não encontrado." });
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST: valor inválido, membro malformado e campos de texto em formato errado são recusados sem gravar", async () => {
    for (const extra of [{ valorMensal: "abc" }, { valorMensal: 0 }, { valorMensal: 1e12 }, { valorMensal: true }, { membroId: "0x10" }, { membroId: "abc" }, { numeroAto: 123 }, { orgaoColegiado: { x: 1 } }]) {
      const r = await chamar(hAtos, { metodo: "POST", token: GERAL(), corpo: corpo(extra) });
      expect(r.status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("POST com ata maior que 15 MB: 400, o arquivo não é salvo e nada é gravado", async () => {
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId/, [{ Nome: "Pr. João" }]);
    const r = await chamar(hAtos, { metodo: "POST", token: GERAL(), corpo: corpo({ ataBase64: GRANDE_DEMAIS }) });
    expect(r.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("POST com falha do armazenamento: 500 sem vazar a mensagem interna e sem gravar o ato", async () => {
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId/, [{ Nome: "Pr. João" }]);
    storage.salvarDocumento.mockImplementation(async () => { throw new Error("chave-secreta-do-storage"); });
    const r = await chamar(hAtos, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/chave-secreta/);
    expect(escritas()).toHaveLength(0);
  });
  test("POST válido: grava o ato com o membro e o valor numéricos e deixa trilha", async () => {
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId/, [{ Nome: "Pr. João" }]);
    quando(/INSERT INTO AtosDesignacao/, [{ AtoDesignacaoId: 3 }]);
    const r = await chamar(hAtos, { metodo: "POST", token: GERAL(), corpo: corpo({ membroId: "40", valorMensal: "5000.5" }) });
    expect(r.status).toBe(201);
    const insert = escritas()[0];
    expect(insert.inputs.membroId).toBe(40);
    expect(insert.inputs.valorMensal).toBe(5000.5);
    expect(auditoria()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoAuxiliosCusto", () => {
  const registro = (extra = {}) => ({ AuxilioId: 4, Tipo: "MORADIA", NaturezaFiscal: "ISENTA", ValorMensal: 500, Status: "ATIVO", Observacao: null, ...extra });
  test("id malformado: mesma resposta de \"não encontrado\", sem consultar o banco", async () => {
    const r = await chamar(hAuxilios, { token: GERAL(), ligado: { id: "05" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Auxílio não encontrado." });
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST: prebendado malformado e valor inválido são recusados sem gravar", async () => {
    for (const extra of [{ prebendadoId: "abc" }, { prebendadoId: "0x10" }, { valorMensal: "abc" }, { valorMensal: 0 }, { valorMensal: 1e12 }]) {
      const r = await chamar(hAuxilios, { metodo: "POST", token: GERAL(), corpo: { prebendadoId: 2, tipo: "MORADIA", naturezaFiscal: "ISENTA", valorMensal: 500, ...extra } });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST válido grava com o prebendado numérico", async () => {
    quando(/SELECT PrebendadoId FROM Prebendados WHERE PrebendadoId/, [{ PrebendadoId: 2 }]);
    quando(/INSERT INTO AuxiliosAjudaCusto/, [{ AuxilioId: 4 }]);
    const r = await chamar(hAuxilios, { metodo: "POST", token: GERAL(), corpo: { prebendadoId: "2", tipo: "MORADIA", naturezaFiscal: "ISENTA", valorMensal: "500" } });
    expect(r.status).toBe(201);
    expect(escritas()[0].inputs.prebendadoId).toBe(2);
    expect(escritas()[0].inputs.valor).toBe(500);
  });
  test("PUT de auxílio ENCERRADO: recusado, nada é gravado (não reabre nem edita)", async () => {
    quando(/SELECT \* FROM AuxiliosAjudaCusto WHERE AuxilioId/, [registro({ Status: "ENCERRADO" })]);
    const r = await chamar(hAuxilios, { metodo: "PUT", token: GERAL(), ligado: { id: "4" }, corpo: { valorMensal: 900 } });
    expect(r.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
  });
  test("PUT de auxílio ATIVO: grava com o estado no WHERE; ENCERRAR muda o status", async () => {
    quando(/SELECT \* FROM AuxiliosAjudaCusto WHERE AuxilioId/, [registro()]);
    const r = await chamar(hAuxilios, { metodo: "PUT", token: GERAL(), ligado: { id: "4" }, corpo: { acao: "ENCERRAR" } });
    expect(r.body.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/AND Status = 'ATIVO'/);
    expect(escritas()[0].inputs.status).toBe("ENCERRADO");
  });
  test("PUT que perdeu a corrida (já encerrado entre a leitura e a gravação): recusado e sem trilha", async () => {
    quando(/SELECT \* FROM AuxiliosAjudaCusto WHERE AuxilioId/, [registro()]);
    quando(/UPDATE AuxiliosAjudaCusto/, [], 0);
    const r = await chamar(hAuxilios, { metodo: "PUT", token: GERAL(), ligado: { id: "4" }, corpo: { valorMensal: 700 } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
  test("PUT com valor inválido: 400", async () => {
    quando(/SELECT \* FROM AuxiliosAjudaCusto WHERE AuxilioId/, [registro()]);
    for (const valorMensal of ["abc", 0, -1, 1e12]) {
      const r = await chamar(hAuxilios, { metodo: "PUT", token: GERAL(), ligado: { id: "4" }, corpo: { valorMensal } });
      expect(r.status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCasaPastoral", () => {
  const quandoPostValido = (bemCongregacaoId = 1) => {
    quando(/SELECT Tipo, Status, CongregacaoId FROM BensPatrimoniais/, [{ Tipo: "CASA_PASTORAL", Status: "ATIVO", CongregacaoId: bemCongregacaoId }]);
    quando(/SELECT CongregacaoId FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 1 }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId/, [{ MembroId: 30 }]);
    quando(/INSERT INTO CasaPastoralOcupacoes/, [{ OcupacaoId: 8 }]);
  };
  const corpo = (extra = {}) => ({ bemId: 9, congregacaoId: 1, ocupanteMembroId: 30, dataInicio: "2026-10-01", ...extra });
  test("id malformado: mesma resposta de \"não encontrada\"", async () => {
    const r = await chamar(hCasa, { token: GERAL(), ligado: { id: "abc" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Ocupação não encontrada." });
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST com ids malformados: 400 sem consultar o banco", async () => {
    for (const extra of [{ bemId: "0x10" }, { congregacaoId: "abc" }, { ocupanteMembroId: "1e1" }]) {
      const r = await chamar(hCasa, { metodo: "POST", token: GERAL(), corpo: corpo(extra) });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST válido grava na congregação da casa", async () => {
    quandoPostValido(1);
    const r = await chamar(hCasa, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(r.status).toBe(201);
    expect(escritas()[0].inputs.cong).toBe(1);
    expect(escritas()[0].inputs.ocupante).toBe(30);
  });
  test("POST com a casa de OUTRA congregação: recusado e nada é gravado", async () => {
    quandoPostValido(2);
    const r = await chamar(hCasa, { metodo: "POST", token: GERAL(), corpo: corpo({ congregacaoId: 1 }) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/outra congregação/);
    expect(escritas()).toHaveLength(0);
  });
  test("POST com congregação ou ocupante inexistentes: recusado sem gravar (antes era 500 de chave estrangeira)", async () => {
    quandoPostValido(1);
    mockRegras = mockRegras.filter(([p]) => !/FROM Congregacoes/.test(p.source));
    let r = await chamar(hCasa, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Congregação não encontrada." });
    mockRegras = []; mockConsultas = [];
    quandoPostValido(1);
    mockRegras = mockRegras.filter(([p]) => !/FROM MembroReferencia/.test(p.source));
    r = await chamar(hCasa, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Ocupante não encontrado/);
    expect(escritas()).toHaveLength(0);
  });
  test.each(["ENCERRADA", "DESTITUIDA"])("PUT de ocupação %s: recusado, nada é gravado (não reescreve data de fim nem motivo)", async (Status) => {
    quando(/SELECT \* FROM CasaPastoralOcupacoes WHERE OcupacaoId/, [{ OcupacaoId: 8, Status }]);
    const r = await chamar(hCasa, { metodo: "PUT", token: GERAL(), ligado: { id: "8" }, corpo: { acao: "DESTITUIR", motivo: "gato de luz" } });
    expect(r.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
  });
  test("PUT de ocupação ATIVA: grava com o estado no WHERE; DESTITUIR exige motivo em texto", async () => {
    quando(/SELECT \* FROM CasaPastoralOcupacoes WHERE OcupacaoId/, [{ OcupacaoId: 8, Status: "ATIVA" }]);
    const semMotivo = await chamar(hCasa, { metodo: "PUT", token: GERAL(), ligado: { id: "8" }, corpo: { acao: "DESTITUIR", motivo: { x: 1 } } });
    expect(semMotivo.status).toBe(400);
    expect(escritas()).toHaveLength(0);
    const r = await chamar(hCasa, { metodo: "PUT", token: GERAL(), ligado: { id: "8" }, corpo: { acao: "DESTITUIR", motivo: "gato de luz" } });
    expect(r.body.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/AND Status = 'ATIVA'/);
    expect(escritas()[0].inputs.status).toBe("DESTITUIDA");
  });
  test("PUT que perdeu a corrida: recusado e sem trilha", async () => {
    quando(/SELECT \* FROM CasaPastoralOcupacoes WHERE OcupacaoId/, [{ OcupacaoId: 8, Status: "ATIVA" }]);
    quando(/UPDATE CasaPastoralOcupacoes/, [], 0);
    const r = await chamar(hCasa, { metodo: "PUT", token: GERAL(), ligado: { id: "8" }, corpo: { acao: "ENCERRAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCashPooling", () => {
  test("PUT centralizadora: uma fonte inexistente ou inativa não troca nada nem deixa trilha", async () => {
    quando(/UPDATE FontesCaixa SET Centralizadora = CASE/, [], 0);
    const r = await chamar(hCash, { metodo: "PUT", token: GERAL(), ligado: { recurso: "centralizadora" }, corpo: { fonteId: 99 } });
    expect(r.status).toBe(400);
    expect(auditoria()).toHaveLength(0);
  });
  test("PUT centralizadora: a troca é UM comando só (ou muda tudo ou nada) e deixa trilha", async () => {
    quando(/UPDATE FontesCaixa SET Centralizadora = CASE/, [], 2);
    const r = await chamar(hCash, { metodo: "PUT", token: GERAL(), ligado: { recurso: "centralizadora" }, corpo: { fonteId: "2" } });
    expect(r.status).toBe(200);
    expect(escritas()).toHaveLength(1);
    expect(escritas()[0].sql).toMatch(/Ativa = 1/);
    expect(escritas()[0].sql).toMatch(/Centralizadora = CASE WHEN FonteId = @id THEN 1 ELSE 0 END/);
    expect(escritas()[0].inputs.id).toBe(2);
    expect(auditoria()).toHaveLength(1);
  });
  test("PUT centralizadora com id malformado: 400 sem consultar o banco", async () => {
    const r = await chamar(hCash, { metodo: "PUT", token: GERAL(), ligado: { recurso: "centralizadora" }, corpo: { fonteId: "0x2" } });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST movimento: fonte inexistente ou inativa (a consulta acha só uma das duas) é recusada sem gravar", async () => {
    quando(/FROM FontesCaixa WHERE FonteId IN/, [{ FonteId: 1 }]);
    const r = await chamar(hCash, { metodo: "POST", token: GERAL(), ligado: { recurso: "movimentos" }, corpo: { fonteOrigemId: 1, fonteDestinoId: 2, valor: 100, tipo: "CONCENTRACAO" } });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/não encontrada ou inativa/);
    expect(escritas()).toHaveLength(0);
  });
  test("POST movimento: mesma fonte, valor inválido, ids malformados e tipo inválido são recusados MESMO com as duas fontes existindo — e sem gravar", async () => {
    quando(/FROM FontesCaixa WHERE FonteId IN/, [{ FonteId: 1 }, { FonteId: 2 }]);
    quando(/INSERT INTO CashPoolingMovimentos/, [{ MovimentoId: 5 }]);
    const base = { fonteOrigemId: 1, fonteDestinoId: 2, valor: 100, tipo: "CONCENTRACAO" };
    for (const extra of [{ fonteDestinoId: 1 }, { valor: "abc" }, { valor: "0x10" }, { valor: 1e12 }, { valor: -5 }, { fonteOrigemId: "0x1" }, { fonteOrigemId: "01" }, { fonteDestinoId: "abc" }, { tipo: "OUTRO" }]) {
      const r = await chamar(hCash, { metodo: "POST", token: GERAL(), ligado: { recurso: "movimentos" }, corpo: { ...base, ...extra } });
      expect(r.status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("POST movimento válido grava com valor e fontes numéricos", async () => {
    quando(/FROM FontesCaixa WHERE FonteId IN/, [{ FonteId: 1 }, { FonteId: 2 }]);
    quando(/INSERT INTO CashPoolingMovimentos/, [{ MovimentoId: 5 }]);
    const r = await chamar(hCash, { metodo: "POST", token: GERAL(), ligado: { recurso: "movimentos" }, corpo: { fonteOrigemId: "1", fonteDestinoId: 2, valor: "250.75", tipo: "CONCENTRACAO" } });
    expect(r.status).toBe(201);
    expect(escritas()[0].inputs).toMatchObject({ origem: 1, destino: 2, valor: 250.75 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoConciliacaoBancaria", () => {
  test("PUT divergencias: id inexistente ou já resolvida não vira \"Resolveu\" na trilha", async () => {
    quando(/UPDATE ConciliacaoDivergencias SET Status = 'RESOLVIDA'/, [], 0);
    const r = await chamar(hConciliacao, { metodo: "PUT", token: GERAL(), ligado: { recurso: "divergencias" }, corpo: { divergenciaId: 77, acao: "RESOLVER" } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
  test("PUT divergencias: resolve só o que está PENDENTE e deixa trilha", async () => {
    const r = await chamar(hConciliacao, { metodo: "PUT", token: GERAL(), ligado: { recurso: "divergencias" }, corpo: { divergenciaId: "77", acao: "RESOLVER" } });
    expect(r.body.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/AND Status = 'PENDENTE'/);
    expect(escritas()[0].inputs.id).toBe(77);
    expect(auditoria()).toHaveLength(1);
  });
  test("PUT divergencias com id malformado: 400 sem consultar o banco", async () => {
    const r = await chamar(hConciliacao, { metodo: "PUT", token: GERAL(), ligado: { recurso: "divergencias" }, corpo: { divergenciaId: "0x10", acao: "RESOLVER" } });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST extrato: mês fora do formato AAAA-MM e fonte malformada são recusados sem consultar o banco", async () => {
    for (const mesReferencia of ["2026-13", "2026-00", "26-10", "2026/10", "abc", { x: 1 }]) {
      const r = await chamar(hConciliacao, { metodo: "POST", token: GERAL(), ligado: { recurso: "extratos" }, corpo: { fonteId: 1, mesReferencia, arquivoBase64: base64De("a,b") } });
      expect(r.status).toBe(400);
    }
    const r = await chamar(hConciliacao, { metodo: "POST", token: GERAL(), ligado: { recurso: "extratos" }, corpo: { fonteId: "0x1", mesReferencia: "2026-10", arquivoBase64: base64De("a,b") } });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST extrato maior que 15 MB (mesmo sendo um CSV válido): 400, o arquivo não é salvo e nada é gravado", async () => {
    quando(/SELECT Tipo FROM FontesCaixa WHERE FonteId/, [{ Tipo: "CONTA_BANCARIA" }]);
    quando(/INSERT INTO ExtratosBancarios/, [{ ExtratoId: 1 }]);
    const csvValidoEGrande = Buffer.from("Data;Valor;Historico\n2026-10-01;100,00;Dizimo\n" + " ".repeat(16 * 1024 * 1024)).toString("base64");
    const r = await chamar(hConciliacao, { metodo: "POST", token: GERAL(), ligado: { recurso: "extratos" }, corpo: { fonteId: 1, mesReferencia: "2026-10", arquivoBase64: csvValidoEGrande, mimeType: "text/csv" } });
    expect(r.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("POST extrato com texto que não é base64 de arquivo (objeto, vazio): 400", async () => {
    quando(/SELECT Tipo FROM FontesCaixa WHERE FonteId/, [{ Tipo: "CONTA_BANCARIA" }]);
    for (const arquivoBase64 of [{ x: 1 }, "", 123]) {
      const r = await chamar(hConciliacao, { metodo: "POST", token: GERAL(), ligado: { recurso: "extratos" }, corpo: { fonteId: 1, mesReferencia: "2026-10", arquivoBase64 } });
      expect(r.status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("POST extrato válido: o arquivo é guardado sempre como text/plain, mesmo que o cliente declare text/html", async () => {
    quando(/SELECT Tipo FROM FontesCaixa WHERE FonteId/, [{ Tipo: "CONTA_BANCARIA" }]);
    quando(/INSERT INTO ExtratosBancarios/, [{ ExtratoId: 1 }]);
    quando(/SELECT ConciliacaoId FROM ConciliacoesBancarias/, []);
    quando(/INSERT INTO ConciliacoesBancarias/, [{ ConciliacaoId: 1 }]);
    const csv = "Data;Valor;Historico\n2026-10-01;100,00;Dizimo\n";
    await chamar(hConciliacao, { metodo: "POST", token: GERAL(), ligado: { recurso: "extratos" }, corpo: { fonteId: 1, mesReferencia: "2026-10", arquivoBase64: base64De(csv), mimeType: "text/html" } });
    expect(storage.salvarDocumento).toHaveBeenCalled();
    expect(storage.salvarDocumento.mock.calls[0][1]).toBe("text/plain");
  });
  test("GET com filtros malformados e recurso numérico fora da forma canônica: 400 sem consultar o banco", async () => {
    for (const query of [{ mesReferencia: "2026-13" }, { fonteId: "abc" }, { fonteId: "0x1" }]) {
      const r = await chamar(hConciliacao, { token: GERAL(), query });
      expect(r.status).toBe(400);
    }
    for (const recurso of ["1e1", "05", "0x10", "abc"]) {
      const r = await chamar(hConciliacao, { token: GERAL(), ligado: { recurso } });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoDocumentosBens", () => {
  const corpo = (extra = {}) => ({ tipoDocumento: "ESCRITURA", descricao: "Escritura do templo", responsavelCargo: "SECRETARIO_2", documentoBase64: base64De("doc"), mimeType: "application/pdf", ...extra });
  test("POST com bem inexistente ou malformado: recusado sem gravar (antes era 500 de chave estrangeira)", async () => {
    let r = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo({ bemId: 99 }) });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Bem não encontrado." });
    // Mesmo que o banco "achasse" qualquer bem, um id fora da forma canônica nem chega a ser consultado.
    quando(/SELECT BemId FROM BensPatrimoniais WHERE BemId/, [{ BemId: 16 }]);
    quando(/INSERT INTO BensDocumentos/, [{ DocumentoBemId: 6 }]);
    for (const bemId of ["0x10", "05", "abc", -1, true]) {
      r = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo({ bemId }) });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Bem não encontrado." });
    }
    expect(escritas()).toHaveLength(0);
  });
  test("POST com documento maior que 15 MB: 400, o arquivo não é salvo", async () => {
    const r = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo({ documentoBase64: GRANDE_DEMAIS }) });
    expect(r.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("POST com falha do armazenamento: 500 sem vazar a mensagem interna e sem gravar", async () => {
    storage.salvarDocumento.mockImplementation(async () => { throw new Error("chave-secreta-do-storage"); });
    const r = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/chave-secreta/);
    expect(escritas()).toHaveLength(0);
  });
  test("POST válido (com e sem bem): grava e deixa trilha", async () => {
    quando(/SELECT BemId FROM BensPatrimoniais WHERE BemId/, [{ BemId: 9 }]);
    quando(/INSERT INTO BensDocumentos/, [{ DocumentoBemId: 6 }]);
    const comBem = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo({ bemId: "9" }) });
    expect(comBem.status).toBe(201);
    expect(escritas()[0].inputs.bemId).toBe(9);
    mockConsultas = [];
    const semBem = await chamar(hDocumentos, { metodo: "POST", token: GERAL(), corpo: corpo() });
    expect(semBem.status).toBe(201);
    expect(escritas()[0].inputs.bemId).toBeNull();
    expect(auditoria()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoDadosBancariosInstituicao", () => {
  const linha = { InstituicaoId: 1, RazaoSocial: "IEADESPA", Cnpj: "12.345.678/0001-90", CodigoBanco: "001", NomeBanco: "Banco do Brasil", Agencia: "1234", DigitoAgencia: "5", Conta: "987654321", DigitoConta: "0", CodigoConvenio: "CONV998877" };
  test("GET do geral devolve os dados completos", async () => {
    quando(/SELECT \* FROM DadosBancariosInstituicao/, [linha]);
    const r = await chamar(hDadosBancarios, { token: GERAL() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ agencia: "1234", conta: "987654321", codigoConvenio: "CONV998877" });
  });
  test("o tesoureiro local NÃO lê agência, conta nem convênio da instituição", async () => {
    quando(/SELECT \* FROM DadosBancariosInstituicao/, [linha]);
    const r = await chamar(hDadosBancarios, { token: LOCAL() });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toMatch(/987654321|CONV998877|1234/);
  });
  test("PUT do geral: a trilha guarda agência, conta e convênio MASCARADOS (antes e depois), sem o valor aberto", async () => {
    quando(/SELECT \* FROM DadosBancariosInstituicao/, [linha]);
    const r = await chamar(hDadosBancarios, { metodo: "PUT", token: GERAL(), corpo: { razaoSocial: "IEADESPA", cnpj: "12.345.678/0001-90", codigoBanco: "001", agencia: "4321", conta: "111222333", codigoConvenio: "NOVO445566" } });
    expect(r.body.sucesso).toBe(true);
    const a = auditoria()[0];
    expect(a.dadosAntes.Conta).toBe("***21");
    expect(a.dadosAntes.Agencia).toBe("***34");
    expect(a.dadosAntes.CodigoConvenio).toBe("***77");
    expect(a.dadosDepois.conta).toBe("***33");
    expect(a.dadosDepois.agencia).toBe("***21");
    const texto = JSON.stringify(a);
    expect(texto).not.toMatch(/987654321|111222333|CONV998877|NOVO445566/);
    expect(texto).toMatch(/12\.345\.678\/0001-90/); // o CNPJ da instituição é público e segue legível
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoFornecedores", () => {
  const COMPLETO = { FornecedorId: 1, Nome: "Gráfica Alfa", CpfCnpj: "12.345.678/0001-90", Tipo: "PJ", Telefone: "9999-0000", Email: "a@b.com", Banco: "Banco X", Agencia: "0001", Conta: "98765-4", TipoConta: "CORRENTE", ChavePix: "chave-pix-secreta", DadosBancariosConfirmados: true, DadosBancariosAlteradoPor: null, DadosBancariosAlteradoEm: null, Ativo: true };
  const MINIMO = { fornecedorId: 1, nome: "Gráfica Alfa", tipo: "PJ", ativo: true, dadosBancariosConfirmados: true };
  const LISTA_LOCAL = /FROM Fornecedores f WHERE NOT EXISTS \(SELECT 1 FROM Prebendados pb WHERE pb\.FornecedorId = f\.FornecedorId\)/;
  const DETALHE_LOCAL = /f\.FornecedorId = @id AND NOT EXISTS \(SELECT 1 FROM Prebendados pb/;
  const PUT_LOCAL = /SELECT f\.\* FROM Fornecedores f WHERE f\.FornecedorId = @id AND NOT EXISTS/;
  const DETALHE_GERAL = /SELECT \* FROM Fornecedores WHERE FornecedorId = @id/;

  describe("leitura", () => {
    test("o tesoureiro local recebe SÓ id, nome, tipo, ativo e confirmação — sem CPF/CNPJ, telefone, e-mail nem dado bancário — e a consulta exclui os prebendados", async () => {
      quando(LISTA_LOCAL, [COMPLETO]);
      const r = await chamar(hFornecedores, { token: LOCAL() });
      expect(r.status).toBe(200);
      expect(r.body).toEqual([MINIMO]);
      expect(JSON.stringify(r.body)).not.toMatch(/chave-pix|98765|12\.345|9999|a@b/);
      expect(mockConsultas[0].sql).not.toMatch(/ChavePix|Conta|CpfCnpj/);
    });
    test("o geral recebe o cadastro completo, incluindo os prebendados (consulta sem exclusão)", async () => {
      quando(/SELECT \* FROM Fornecedores ORDER BY Nome/, [COMPLETO]);
      const r = await chamar(hFornecedores, { token: GERAL() });
      expect(r.body[0]).toMatchObject({ fornecedorId: 1, cpfCnpj: "12.345.678/0001-90", banco: "Banco X", chavePix: "chave-pix-secreta" });
      expect(mockConsultas[0].sql).not.toMatch(/Prebendados/);
    });
    test("detalhe: o local recebe o mínimo; um prebendado (fora da consulta) responde \"não encontrado\"", async () => {
      quando(DETALHE_LOCAL, [COMPLETO]);
      let r = await chamar(hFornecedores, { token: LOCAL(), ligado: { id: "1" } });
      expect(r.body).toEqual(MINIMO);
      mockRegras = [];
      r = await chamar(hFornecedores, { token: LOCAL(), ligado: { id: "2" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Fornecedor não encontrado." });
    });
    test("detalhe do geral é completo", async () => {
      quando(DETALHE_GERAL, [COMPLETO]);
      const r = await chamar(hFornecedores, { token: GERAL(), ligado: { id: "1" } });
      expect(r.body.chavePix).toBe("chave-pix-secreta");
    });
    test("id malformado: a mesma resposta de \"não encontrado\", sem consultar o banco", async () => {
      for (const metodo of ["GET", "PUT"]) {
        const r = await chamar(hFornecedores, { metodo, token: GERAL(), ligado: { id: "0x10" }, corpo: {} });
        expect(r.body).toEqual({ sucesso: false, mensagem: "Fornecedor não encontrado." });
      }
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("cadastro (POST)", () => {
    const corpo = (extra = {}) => ({ nome: "Gráfica Beta", cpfCnpj: "98.765.432/0001-10", tipo: "PJ", ...extra });
    const quandoInsere = () => quando(/INSERT INTO Fornecedores/, [{ FornecedorId: 55 }]);
    test.each([["local", () => LOCAL()], ["geral", () => GERAL()]])("%s: cadastro SEM dado bancário nasce confirmado", async (_n, token) => {
      quandoInsere();
      const r = await chamar(hFornecedores, { metodo: "POST", token: token(), corpo: corpo() });
      expect(r.status).toBe(201);
      const insert = rodou(/INSERT INTO Fornecedores/)[0];
      expect(insert.inputs.confirmados).toBe(1);
      expect(insert.inputs.alteradoPor).toBeNull();
    });
    test.each([["local", () => LOCAL()], ["geral", () => GERAL()]])("%s: cadastro com QUALQUER dado bancário nasce PENDENTE, com quem cadastrou como autor da alteração", async (_n, token) => {
      for (const campo of ["banco", "agencia", "conta", "tipoConta", "chavePix"]) {
        mockConsultas = []; mockRegras = []; quandoInsere();
        const r = await chamar(hFornecedores, { metodo: "POST", token: token(), corpo: corpo({ [campo]: "x" }) });
        expect(r.status).toBe(201);
        const insert = rodou(/INSERT INTO Fornecedores/)[0];
        expect(insert.inputs.confirmados).toBe(0);
        expect(insert.inputs.alteradoPor).toBe(5);
        expect(insert.inputs.alteradoEm).toBeInstanceOf(Date);
      }
    });
    test("a trilha do cadastro guarda o CPF/CNPJ mascarado", async () => {
      quandoInsere();
      await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo({ chavePix: "chave-pix-secreta" }) });
      const a = auditoria()[0];
      expect(a.dadosDepois.cpfCnpj).toBe("***10");
      expect(JSON.stringify(a)).not.toMatch(/98\.765\.432|chave-pix/);
    });
    test("o aviso de nome parecido NÃO revela o nome de um prebendado ao local (consulta exclui prebendados); o geral vê todos", async () => {
      quandoInsere();
      await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo() });
      expect(rodou(/f\.Nome LIKE/)[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM Prebendados/);
      mockConsultas = [];
      await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo() });
      expect(rodou(/f\.Nome LIKE/)[0].sql).not.toMatch(/Prebendados/);
    });
    test("PJ com CPF de prebendado: o geral recebe a vedação à pejotização; o local recebe uma recusa que NÃO diz que é prebendado", async () => {
      // (a consulta compara só os dígitos do CPF e não pede mais a coluna Nome, que não existe em Prebendados — shared/prebenda.js)
      quando(/FROM Prebendados WHERE REPLACE\(REPLACE\(REPLACE\(Cpf/, [{ prebendadoId: 3 }]);
      const geral = await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo({ cpfCnpj: "123.456.789-00" }) });
      expect(geral.body.mensagem).toMatch(/pejotização/);
      const local = await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo({ cpfCnpj: "123.456.789-00" }) });
      expect(local.body.sucesso).toBe(false);
      expect(local.body.mensagem).not.toMatch(/prebend|ministro|pejotiza/i);
      expect(escritas()).toHaveLength(0);
    });
    test("campos de texto em formato errado: 400 sem gravar", async () => {
      for (const extra of [{ nome: 123 }, { nome: { x: 1 } }, { cpfCnpj: 12345 }, { nome: "  " }]) {
        const r = await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo(extra) });
        expect(r.status).toBe(400);
      }
      expect(escritas()).toHaveLength(0);
    });
  });

  describe("alteração (PUT): dado bancário é só do geral", () => {
    test("o local pode alterar dado NÃO bancário (telefone) de um fornecedor que enxerga", async () => {
      quando(PUT_LOCAL, [COMPLETO]);
      const r = await chamar(hFornecedores, { metodo: "PUT", token: LOCAL(), ligado: { id: "1" }, corpo: { telefone: "1111-2222" } });
      expect(r.body.sucesso).toBe(true);
      expect(escritas()).toHaveLength(1);
      expect(escritas()[0].inputs.dadosBancariosConfirmados).toBe(true);
    });
    test.each(["banco", "agencia", "conta", "tipoConta", "chavePix"])("o local NÃO altera %s: 403 da administração geral e nada é gravado", async (campo) => {
      quando(PUT_LOCAL, [COMPLETO]);
      const r = await chamar(hFornecedores, { metodo: "PUT", token: LOCAL(), ligado: { id: "1" }, corpo: { [campo]: "valor-novo" } });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(MSG_GERAL);
      expect(escritas()).toHaveLength(0);
      expect(auditoria()).toHaveLength(0);
    });
    test("o local não alcança o prebendado nem para mexer em nome: \"não encontrado\"", async () => {
      const r = await chamar(hFornecedores, { metodo: "PUT", token: LOCAL(), ligado: { id: "2" }, corpo: { nome: "Outro" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Fornecedor não encontrado." });
      expect(escritas()).toHaveLength(0);
    });
    test("o geral altera o PIX: desconfirma, registra quem alterou, limpa a confirmação — e a trilha guarda tudo MASCARADO com a lista dos campos que mudaram", async () => {
      quando(DETALHE_GERAL, [COMPLETO]);
      const r = await chamar(hFornecedores, { metodo: "PUT", token: GERAL({ membroId: 8 }), ligado: { id: "1" }, corpo: { chavePix: "nova-chave-secreta" } });
      expect(r.body.sucesso).toBe(true);
      const upd = escritas()[0];
      expect(upd.sql).toMatch(/ConfirmadoPor = NULL, ConfirmadoEm = NULL/);
      expect(upd.inputs.dadosBancariosConfirmados).toBe(0);
      expect(upd.inputs.dadosBancariosAlteradoPor).toBe(8);
      const a = auditoria()[0];
      expect(a.dadosDepois.camposBancariosAlterados).toEqual(["chavePix"]);
      expect(a.dadosAntes.ChavePix).toBe("***ta");
      expect(a.dadosAntes.CpfCnpj).toBe("***90");
      expect(JSON.stringify(a)).not.toMatch(/chave-pix-secreta|nova-chave|98765|12\.345/);
    });
    test("nome inválido: 400 sem gravar", async () => {
      quando(DETALHE_GERAL, [COMPLETO]);
      for (const nome of [123, "  ", { x: 1 }]) {
        const r = await chamar(hFornecedores, { metodo: "PUT", token: GERAL(), ligado: { id: "1" }, corpo: { nome } });
        expect(r.status).toBe(400);
      }
      expect(escritas()).toHaveLength(0);
    });
  });
});

describe("ConfirmarDadosBancariosFornecedor", () => {
  const PENDENTE = { FornecedorId: 7, Nome: "Gráfica", CpfCnpj: "12.345.678/0001-90", Banco: "Banco X", Agencia: "0001", Conta: "98765-4", ChavePix: "chave-pix-secreta", DadosBancariosConfirmados: false, DadosBancariosAlteradoPor: 8 };
  const quandoPendente = (extra = {}) => quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ ...PENDENTE, ...extra }]);
  test("quem ALTEROU os dados bancários não confirma a própria alteração (segregação continua)", async () => {
    quandoPendente({ DadosBancariosAlteradoPor: 8 });
    const r = await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 8 }), ligado: { id: "7" } });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/não pode confirmar/);
    expect(escritas()).toHaveLength(0);
  });
  test("OUTRA pessoa do geral confirma: grava com o estado no WHERE e a trilha guarda o fornecedor mascarado", async () => {
    quandoPendente();
    const r = await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 9 }), ligado: { id: "7" } });
    expect(r.body.sucesso).toBe(true);
    expect(escritas()).toHaveLength(1);
    expect(escritas()[0].sql).toMatch(/AND DadosBancariosConfirmados = 0/);
    expect(escritas()[0].inputs.confirmadoPor).toBe(9);
    const a = auditoria()[0];
    expect(a.dadosAntes.ChavePix).toBe("***ta");
    expect(JSON.stringify(a)).not.toMatch(/chave-pix-secreta|98765|12\.345/);
  });
  test("já confirmado, inexistente e id malformado: recusados sem gravar", async () => {
    quandoPendente({ DadosBancariosConfirmados: true });
    expect((await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 9 }), ligado: { id: "7" } })).body.sucesso).toBe(false);
    mockRegras = [];
    expect((await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 9 }), ligado: { id: "8" } })).body).toEqual({ sucesso: false, mensagem: "Fornecedor não encontrado." });
    mockConsultas = [];
    expect((await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 9 }), ligado: { id: "0x10" } })).body).toEqual({ sucesso: false, mensagem: "Fornecedor não encontrado." });
    expect(mockConsultas).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  test("perdeu a corrida (outra confirmação gravou antes): recusado e sem trilha", async () => {
    quandoPendente();
    quando(/UPDATE Fornecedores SET DadosBancariosConfirmados = 1/, [], 0);
    const r = await chamar(hConfirmar, { metodo: "POST", token: GERAL({ membroId: 9 }), ligado: { id: "7" } });
    expect(r.body.sucesso).toBe(false);
    expect(auditoria()).toHaveLength(0);
  });
  test("sem id na rota: 400", async () => {
    const r = await chamar(hConfirmar, { metodo: "POST", token: GERAL(), ligado: {} });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCampanhas", () => {
  const CAMPANHAS = [{ campanhaId: 1, nome: "Reforma", descricao: null, dataInicio: "2026-01-01", dataFim: null, status: "ATIVA", totalSorteios: 0 }];
  const METAS_LISTA = [{ campanhaId: 1, congregacaoNome: "A", metaValor: 100 }, { campanhaId: 1, congregacaoNome: "B", metaValor: 900 }];
  const ARRECADADO = [{ campanhaId: 1, congregacaoNome: "A", total: 30.5 }, { campanhaId: 1, congregacaoNome: "B", total: 500 }];
  const quandoListaDoEscopo = () => {
    quando(/GROUP BY l\.CampanhaId/, ARRECADADO);
    quando(/SELECT cm\.CampanhaId AS campanhaId/, METAS_LISTA);
    quando(/FROM Campanhas c\s+ORDER BY c\.Status/, CAMPANHAS);
  };

  describe("leitura", () => {
    test("lista: o local vê todas as campanhas, mas meta e arrecadação somam SÓ as congregações do seu escopo", async () => {
      quandoListaDoEscopo();
      const r = await chamar(hCampanhas, { token: LOCAL(["A"]) });
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ campanhaId: 1, nome: "Reforma", metaTotal: 100, totalArrecadado: 30.5, agregadoDoEscopo: true });
    });
    test("lista: escopo de duas congregações soma as duas; escopo sem nenhuma delas soma zero", async () => {
      quandoListaDoEscopo();
      expect((await chamar(hCampanhas, { token: LOCAL(["A", "B"]) })).body[0]).toMatchObject({ metaTotal: 1000, totalArrecadado: 530.5 });
      expect((await chamar(hCampanhas, { token: LOCAL(["C"]) })).body[0]).toMatchObject({ metaTotal: 0, totalArrecadado: 0 });
      expect((await chamar(hCampanhas, { token: LOCAL([]) })).body[0]).toMatchObject({ metaTotal: 0, totalArrecadado: 0 });
    });
    test("lista do geral: a consulta completa de sempre, sem o marcador de escopo parcial", async () => {
      quando(/SELECT SUM\(MetaValor\) FROM CampanhaMetas/, [{ ...CAMPANHAS[0], metaTotal: 1000, totalArrecadado: 530.5 }]);
      const r = await chamar(hCampanhas, { token: GERAL() });
      expect(r.body[0]).toMatchObject({ metaTotal: 1000, totalArrecadado: 530.5 });
      expect(r.body[0].agregadoDoEscopo).toBeUndefined();
    });
    test("detalhe: o local vê só as metas das congregações do seu escopo; o geral vê todas", async () => {
      quando(/FROM Campanhas WHERE CampanhaId = @id/, [{ campanhaId: 1, nome: "Reforma", status: "ATIVA" }]);
      quando(/FROM CampanhaMetas cm JOIN Congregacoes co/, [
        { congregacaoId: 1, congregacaoNome: "A", metaValor: 100, totalArrecadado: 30.5 },
        { congregacaoId: 2, congregacaoNome: "B", metaValor: 900, totalArrecadado: 500 }
      ]);
      quando(/FROM Sorteios WHERE CampanhaId = @id/, [{ sorteioId: 1, nome: "Rifa" }]);
      const local = await chamar(hCampanhas, { token: LOCAL(["A"]), ligado: { id: "1" } });
      expect(local.body.metas.map(m => m.congregacaoNome)).toEqual(["A"]);
      expect(local.body.sorteios).toHaveLength(1);
      expect(local.body.agregadoDoEscopo).toBe(true);
      expect(JSON.stringify(local.body)).not.toMatch(/\b900\b|\b500\b/);
      const geral = await chamar(hCampanhas, { token: GERAL(), ligado: { id: "1" } });
      expect(geral.body.metas.map(m => m.congregacaoNome)).toEqual(["A", "B"]);
      expect(geral.body.agregadoDoEscopo).toBeUndefined();
    });
    test("id malformado: a mesma resposta de \"não encontrada\", sem consultar o banco", async () => {
      const r = await chamar(hCampanhas, { token: LOCAL(), ligado: { id: "0x10" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Campanha não encontrada." });
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("criação (POST): campanha e metas numa transação só", () => {
    const corpo = (extra = {}) => ({ nome: "Reforma", dataInicio: "2026-10-01", metas: [{ congregacaoId: 1, metaValor: 100 }, { congregacaoId: "2", metaValor: "200.5" }], ...extra });
    const quandoCria = () => { quando(/FROM Congregacoes WHERE CongregacaoId IN/, [{ CongregacaoId: 1 }, { CongregacaoId: 2 }]); quando(/INSERT INTO Campanhas/, [{ CampanhaId: 40 }]); };
    test("sucesso: begin, campanha, uma linha por meta, commit — e trilha", async () => {
      quandoCria();
      const r = await chamar(hCampanhas, { metodo: "POST", token: GERAL(), corpo: corpo() });
      expect(r.status).toBe(201);
      expect(mockTx).toEqual(["begin", "commit"]);
      expect(rodou(/INSERT INTO CampanhaMetas/)).toHaveLength(2);
      expect(rodou(/INSERT INTO CampanhaMetas/)[1].inputs).toMatchObject({ campanhaId: 40, congregacaoId: 2, metaValor: 200.5 });
      expect(auditoria()).toHaveLength(1);
    });
    test("congregação da meta inexistente: 400 ANTES de qualquer gravação (sem transação, sem campanha órfã)", async () => {
      quando(/FROM Congregacoes WHERE CongregacaoId IN/, [{ CongregacaoId: 1 }]);
      const r = await chamar(hCampanhas, { metodo: "POST", token: GERAL(), corpo: corpo() });
      expect(r.status).toBe(400);
      expect(mockTx).toEqual([]);
      expect(escritas()).toHaveLength(0);
    });
    test("falha na gravação de uma meta: rollback, 500 sem vazar o erro interno, nenhuma trilha de sucesso", async () => {
      quandoCria();
      mockFalhar = /INSERT INTO CampanhaMetas/;
      const r = await chamar(hCampanhas, { metodo: "POST", token: GERAL(), corpo: corpo() });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
      expect(mockTx).toEqual(["begin", "rollback"]);
      expect(auditoria()).toHaveLength(0);
    });
    test("metas e nome inválidos: 400 sem transação", async () => {
      for (const extra of [{ metas: [{ congregacaoId: "abc", metaValor: 100 }] }, { metas: [{ congregacaoId: "0x10", metaValor: 100 }] }, { metas: [{ congregacaoId: "01", metaValor: 100 }] }, { metas: [{ congregacaoId: 1, metaValor: "abc" }] }, { metas: [{ congregacaoId: 1, metaValor: 0 }] }, { metas: [{ congregacaoId: 1, metaValor: 1e12 }] }, { metas: [null] }, { metas: [{ congregacaoId: 1, metaValor: 5 }, { congregacaoId: "1", metaValor: 6 }] }, { nome: 123 }, { nome: "  " }, { metas: [] }]) {
        const r = await chamar(hCampanhas, { metodo: "POST", token: GERAL(), corpo: corpo(extra) });
        expect(r.status).toBe(400);
      }
      expect(mockTx).toEqual([]);
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("alteração (PUT)", () => {
    const quandoExiste = (extra = {}) => quando(/SELECT \* FROM Campanhas WHERE CampanhaId = @id/, [{ CampanhaId: 40, Nome: "Reforma", Descricao: null, DataFim: null, Status: "ATIVA", ...extra }]);
    test("sucesso: begin, UPDATE, MERGE por meta válida (a inválida é ignorada), commit", async () => {
      quandoExiste();
      quando(/FROM Congregacoes WHERE CongregacaoId IN/, [{ CongregacaoId: 1 }]);
      const r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { nome: "Novo nome", metas: [{ congregacaoId: 1, metaValor: 300 }, { metaValor: 5 }, { congregacaoId: 1, metaValor: 0 }] } });
      expect(r.body.sucesso).toBe(true);
      expect(mockTx).toEqual(["begin", "commit"]);
      expect(rodou(/MERGE CampanhaMetas/)).toHaveLength(1);
      expect(rodou(/UPDATE Campanhas SET/)[0].inputs.nome).toBe("Novo nome");
    });
    test("meta de congregação inexistente: 400 ANTES de gravar qualquer coisa", async () => {
      quandoExiste();
      const r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { metas: [{ congregacaoId: 99, metaValor: 300 }] } });
      expect(r.status).toBe(400);
      expect(mockTx).toEqual([]);
      expect(escritas()).toHaveLength(0);
    });
    test("falha no MERGE: rollback (a campanha não fica meio atualizada), 500 sem vazar o erro interno e sem trilha", async () => {
      quandoExiste();
      quando(/FROM Congregacoes WHERE CongregacaoId IN/, [{ CongregacaoId: 1 }]);
      mockFalhar = /MERGE CampanhaMetas/;
      const r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { metas: [{ congregacaoId: 1, metaValor: 300 }] } });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
      expect(mockTx).toEqual(["begin", "rollback"]);
      expect(auditoria()).toHaveLength(0);
    });
    test("campanha encerrada: só o status muda, não os dados; status inválido e nome em formato errado: 400; inexistente/malformada: \"não encontrada\"", async () => {
      quandoExiste({ Status: "ENCERRADA" });
      let r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { nome: "Outro" } });
      expect(r.body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
      r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { status: "XPTO" } });
      expect(r.status).toBe(400);
      r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "40" }, corpo: { nome: 123 } });
      expect(r.status).toBe(400);
      mockRegras = [];
      r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "41" }, corpo: { nome: "x" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Campanha não encontrada." });
      r = await chamar(hCampanhas, { metodo: "PUT", token: GERAL(), ligado: { id: "0x10" }, corpo: { nome: "x" } });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Campanha não encontrada." });
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCessoesTemplo", () => {
  const CONGREGACOES = { 1: "A", 2: "B" };
  const quandoCongregacoes = () => quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (CONGREGACOES[i.id] ? [{ Nome: CONGREGACOES[i.id] }] : []));
  const LISTA = [
    { cessaoId: 1, congregacaoId: 1, congregacaoNome: "A", solicitanteNome: "Maria", status: "SOLICITADA" },
    { cessaoId: 2, congregacaoId: 2, congregacaoNome: "B", solicitanteNome: "João", status: "SOLICITADA" }
  ];
  const registro = (extra = {}) => ({ CessaoId: 7, CongregacaoId: 1, CongregacaoNome: "A", Status: "SOLICITADA", ListaMusicalAprovada: 1, TermoResponsabilidadeUrl: "https://blob/termo", TaxaZeladoria: 100, IsencaoTaxa: 0, SolicitanteNome: "Maria", TipoEvento: "CASAMENTO", DataEvento: "2026-11-01", ContaReceberId: null, ...extra });
  const quandoCessao = (extra) => quando(/SELECT c\.\*, cg\.Nome AS CongregacaoNome/, [registro(extra)]);
  const put = (acao, token, corpo = {}) => chamar(hCessoes, { metodo: "PUT", token, ligado: { id: "7" }, corpo: { acao, ...corpo } });

  describe("lista", () => {
    test("o local vê SÓ as cessões das congregações do seu escopo; o geral vê todas", async () => {
      quando(/c\.CessaoId AS cessaoId/, LISTA);
      expect((await chamar(hCessoes, { token: LOCAL(["A"]) })).body.map(c => c.cessaoId)).toEqual([1]);
      expect((await chamar(hCessoes, { token: LOCAL(["A", "B"]) })).body.map(c => c.cessaoId)).toEqual([1, 2]);
      expect((await chamar(hCessoes, { token: LOCAL(["C"]) })).body).toEqual([]);
      expect((await chamar(hCessoes, { token: LOCAL([]) })).body).toEqual([]);
      expect((await chamar(hCessoes, { token: GERAL() })).body.map(c => c.cessaoId)).toEqual([1, 2]);
    });
  });

  describe("criação (POST)", () => {
    const corpo = (extra = {}) => ({ congregacaoId: 1, solicitanteNome: "Maria", tipoEvento: "CASAMENTO", dataEvento: "2026-11-01", taxaZeladoria: 100, ...extra });
    const quandoInsere = () => quando(/INSERT INTO CessoesTemplo/, [{ CessaoId: 21 }]);
    test("congregação do escopo: grava na congregação informada", async () => {
      quandoCongregacoes(); quandoInsere();
      const r = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo({ congregacaoId: "1" }) });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO CessoesTemplo/)[0].inputs.cong).toBe(1);
    });
    test("congregação de FORA do escopo e congregação inexistente: a MESMA resposta e nada é gravado", async () => {
      quandoCongregacoes(); quandoInsere();
      const fora = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo({ congregacaoId: 2 }) });
      const inexistente = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo({ congregacaoId: 99 }) });
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Congregação não encontrada." });
      expect(inexistente.body).toEqual(fora.body);
      expect(fora.status).toBe(inexistente.status);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral registra em qualquer congregação existente", async () => {
      quandoCongregacoes(); quandoInsere();
      const r = await chamar(hCessoes, { metodo: "POST", token: GERAL(), corpo: corpo({ congregacaoId: 2 }) });
      expect(r.status).toBe(201);
    });
    test("campos malformados: 400 e nada é gravado", async () => {
      quandoCongregacoes(); quandoInsere();
      for (const extra of [{ congregacaoId: "0x1" }, { congregacaoId: "abc" }, { solicitanteNome: 123 }, { solicitanteNome: "  " }, { tipoEvento: "NADA" }, { taxaZeladoria: "abc" }, { taxaZeladoria: -1 }, { taxaZeladoria: 1e12 }, { taxaZeladoria: true }]) {
        const r = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo(extra) });
        expect(r.status).toBe(400);
      }
      expect(escritas()).toHaveLength(0);
    });
    test("família da assistência social: só se for da MESMA congregação da cessão", async () => {
      quandoCongregacoes(); quandoInsere();
      quando(/FROM AssistenciaSocialFamilias WHERE FamiliaId/, (i) => ({ 5: [{ CongregacaoId: 1 }], 6: [{ CongregacaoId: 2 }] }[i.id] || []));
      const outra = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A", "B"]), corpo: corpo({ assistenciaSocialFamiliaId: 6 }) });
      const inexistente = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A", "B"]), corpo: corpo({ assistenciaSocialFamiliaId: 77 }) });
      const malformada = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A", "B"]), corpo: corpo({ assistenciaSocialFamiliaId: "0x5" }) });
      expect(outra.body.sucesso).toBe(false);
      expect(inexistente.body).toEqual(outra.body);
      expect(malformada.body).toEqual(outra.body);
      expect(escritas()).toHaveLength(0);
      const boa = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A", "B"]), corpo: corpo({ assistenciaSocialFamiliaId: 5 }) });
      expect(boa.status).toBe(201);
      expect(rodou(/INSERT INTO CessoesTemplo/)[0].inputs.familiaId).toBe(5);
    });
    test("termo de responsabilidade: acima de 15 MB é recusado antes de salvar; falha do armazenamento não vaza a mensagem interna", async () => {
      quandoCongregacoes(); quandoInsere();
      const grande = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo({ termoResponsabilidadeBase64: GRANDE_DEMAIS, mimeType: "application/pdf" }) });
      expect(grande.status).toBe(400);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      storage.salvarDocumento.mockImplementation(async () => { throw new Error("chave-secreta-do-storage"); });
      const falha = await chamar(hCessoes, { metodo: "POST", token: LOCAL(["A"]), corpo: corpo({ termoResponsabilidadeBase64: base64De("termo"), mimeType: "application/pdf" }) });
      expect(falha.status).toBe(500);
      expect(JSON.stringify(falha.body)).not.toMatch(/chave-secreta/);
      expect(escritas()).toHaveLength(0);
    });
  });

  describe("alteração (PUT): escopo", () => {
    test("cessão de FORA do escopo, inexistente e id malformado: a MESMA resposta, e nada é gravado", async () => {
      quandoCessao({ CongregacaoNome: "B" });
      const fora = await put("CANCELAR", LOCAL(["A"]));
      mockRegras = [];
      const inexistente = await put("CANCELAR", LOCAL(["A"]));
      const malformado = await chamar(hCessoes, { metodo: "PUT", token: LOCAL(["A"]), ligado: { id: "0x7" }, corpo: { acao: "CANCELAR" } });
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Cessão não encontrada." });
      expect(inexistente.body).toEqual(fora.body);
      expect(malformado.body).toEqual(fora.body);
      expect(fora.status).toBe(inexistente.status);
      expect(escritas()).toHaveLength(0);
    });
    test.each(["REJEITAR", "CONCLUIR", "CANCELAR", "AUTORIZAR"])("%s numa cessão de outra congregação: recusado igual a \"não encontrada\", nada gravado", async (acao) => {
      quandoCessao({ CongregacaoNome: "B", Status: acao === "CONCLUIR" ? "AUTORIZADA" : "SOLICITADA" });
      const r = await put(acao, LOCAL(["A"]), { motivo: "x" });
      expect(r.body).toEqual({ sucesso: false, mensagem: "Cessão não encontrada." });
      expect(escritas()).toHaveLength(0);
      expect(mockTx).toEqual([]);
    });
    test("a consulta da cessão traz o nome da congregação (JOIN) para conferir o escopo", async () => {
      quandoCessao();
      await put("CANCELAR", LOCAL(["A"]));
      expect(mockConsultas[0].sql).toMatch(/JOIN Congregacoes cg ON cg\.CongregacaoId = c\.CongregacaoId/);
    });
  });

  describe("alteração (PUT): máquina de estados", () => {
    test("CONCLUIR não pula a aprovação: de SOLICITADA, REJEITADA, CANCELADA e CONCLUIDA é recusado sem gravar", async () => {
      for (const Status of ["SOLICITADA", "REJEITADA", "CANCELADA", "CONCLUIDA"]) {
        mockRegras = []; mockConsultas = [];
        quandoCessao({ Status });
        const r = await put("CONCLUIR", LOCAL(["A"]));
        expect(r.body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      }
    });
    test("CONCLUIR de AUTORIZADA: o local da congregação conclui, com o estado no WHERE, e deixa trilha", async () => {
      quandoCessao({ Status: "AUTORIZADA" });
      const r = await put("CONCLUIR", LOCAL(["A"]));
      expect(r.body.sucesso).toBe(true);
      expect(escritas()).toHaveLength(1);
      expect(escritas()[0].sql).toMatch(/Status IN \('AUTORIZADA'\)/);
      expect(escritas()[0].inputs.status).toBe("CONCLUIDA");
      expect(auditoria()).toHaveLength(1);
    });
    test("REJEITAR só de SOLICITADA (com motivo em texto)", async () => {
      for (const Status of ["AUTORIZADA", "CONCLUIDA", "CANCELADA", "REJEITADA"]) {
        mockRegras = []; mockConsultas = [];
        quandoCessao({ Status });
        expect((await put("REJEITAR", LOCAL(["A"]), { motivo: "x" })).body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      }
      mockRegras = []; mockConsultas = [];
      quandoCessao({ Status: "SOLICITADA" });
      expect((await put("REJEITAR", LOCAL(["A"]), { motivo: { x: 1 } })).status).toBe(400);
      const ok = await put("REJEITAR", LOCAL(["A"]), { motivo: "lista musical reprovada" });
      expect(ok.body.sucesso).toBe(true);
      expect(escritas()[0].sql).toMatch(/AND Status = 'SOLICITADA'/);
    });
    test("CANCELAR só de SOLICITADA ou AUTORIZADA", async () => {
      for (const Status of ["REJEITADA", "CANCELADA", "CONCLUIDA"]) {
        mockRegras = []; mockConsultas = [];
        quandoCessao({ Status });
        expect((await put("CANCELAR", LOCAL(["A"]))).body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      }
      for (const Status of ["SOLICITADA", "AUTORIZADA"]) {
        mockRegras = []; mockConsultas = [];
        quandoCessao({ Status });
        expect((await put("CANCELAR", LOCAL(["A"]))).body.sucesso).toBe(true);
        expect(escritas()[0].inputs.status).toBe("CANCELADA");
      }
    });
    test("CANCELAR uma cessão que JÁ GEROU cobrança (conta a receber): o local leva 403; o geral cancela", async () => {
      quandoCessao({ Status: "AUTORIZADA", ContaReceberId: 31 });
      const local = await put("CANCELAR", LOCAL(["A"]));
      expect(local.status).toBe(403);
      expect(escritas()).toHaveLength(0);
      const geral = await put("CANCELAR", GERAL());
      expect(geral.body.sucesso).toBe(true);
      expect(escritas()).toHaveLength(1);
    });
    test("CONCLUIR/CANCELAR/REJEITAR que perdem a corrida (estado mudou entre a leitura e a gravação): recusados e sem trilha", async () => {
      quandoCessao({ Status: "AUTORIZADA" });
      quando(/UPDATE CessoesTemplo SET Status = @status/, [], 0);
      expect((await put("CONCLUIR", LOCAL(["A"]))).body.sucesso).toBe(false);
      mockRegras = []; mockConsultas = [];
      quandoCessao({ Status: "SOLICITADA" });
      quando(/UPDATE CessoesTemplo SET Status = 'REJEITADA'/, [], 0);
      expect((await put("REJEITAR", LOCAL(["A"]), { motivo: "x" })).body.sucesso).toBe(false);
      expect(auditoria()).toHaveLength(0);
    });
    test("ação inválida: 400", async () => {
      quandoCessao();
      expect((await put("APAGAR", LOCAL(["A"]))).status).toBe(400);
    });
  });

  describe("alteração (PUT): AUTORIZAR é da Diretoria (geral) e a cobrança sai numa transação", () => {
    test("o local da própria congregação NÃO autoriza: 403, nada gravado", async () => {
      quandoCessao();
      const r = await put("AUTORIZAR", LOCAL(["A"]));
      expect(r.status).toBe(403);
      expect(escritas()).toHaveLength(0);
      expect(mockTx).toEqual([]);
    });
    test("o papel Global com escopo de lista também não autoriza; o local com escopo TODAS também não", async () => {
      quandoCessao();
      expect((await put("AUTORIZAR", GLOBAL_COM_LISTA())).status).toBe(403);
      expect((await put("AUTORIZAR", LOCAL_COM_TODAS())).status).toBe(403);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral autoriza: begin, transição com o estado no WHERE, conta a receber, receita acessória, vínculo, commit", async () => {
      quandoCessao();
      quando(/INSERT INTO ContasAReceber/, [{ ContaReceberId: 31 }]);
      const r = await put("AUTORIZAR", GERAL());
      expect(r.body.sucesso).toBe(true);
      expect(mockTx).toEqual(["begin", "commit"]);
      const ordem = escritas().map(c => c.sql.match(/(UPDATE CessoesTemplo SET [A-Za-z]+|INSERT INTO [A-Za-z]+)/)[1]);
      expect(ordem).toEqual(["UPDATE CessoesTemplo SET Status", "INSERT INTO ContasAReceber", "INSERT INTO ReceitasAcessorias", "UPDATE CessoesTemplo SET ContaReceberId"]);
      expect(escritas()[0].sql).toMatch(/AND Status = 'SOLICITADA'/);
      expect(escritas()[3].inputs.conta).toBe(31);
      expect(auditoria()).toHaveLength(1);
    });
    test("sem taxa (ou isenta): autoriza sem gerar cobrança", async () => {
      quandoCessao({ TaxaZeladoria: 0 });
      const r = await put("AUTORIZAR", GERAL());
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/INSERT INTO ContasAReceber/)).toHaveLength(0);
      expect(mockTx).toEqual(["begin", "commit"]);
    });
    test("dois cliques ao mesmo tempo: a segunda transição não acha a cessão SOLICITADA, desfaz tudo e NÃO gera segunda cobrança", async () => {
      quandoCessao();
      quando(/UPDATE CessoesTemplo SET Status = 'AUTORIZADA'/, [], 0);
      const r = await put("AUTORIZAR", GERAL());
      expect(r.body.sucesso).toBe(false);
      expect(mockTx).toEqual(["begin", "rollback"]);
      expect(rodou(/INSERT INTO ContasAReceber/)).toHaveLength(0);
      expect(auditoria()).toHaveLength(0);
    });
    test("falha ao gravar a receita acessória: rollback (nada de conta a receber sem receita), 500 sem vazar o erro interno, sem trilha", async () => {
      quandoCessao();
      quando(/INSERT INTO ContasAReceber/, [{ ContaReceberId: 31 }]);
      mockFalhar = /INSERT INTO ReceitasAcessorias/;
      const r = await put("AUTORIZAR", GERAL());
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
      expect(mockTx).toEqual(["begin", "rollback"]);
      expect(auditoria()).toHaveLength(0);
    });
    test("exigências da autorização continuam: precisa estar SOLICITADA, com lista musical e termo", async () => {
      for (const extra of [{ Status: "AUTORIZADA" }, { ListaMusicalAprovada: 0 }, { TermoResponsabilidadeUrl: null }]) {
        mockRegras = []; mockConsultas = [];
        quandoCessao(extra);
        const r = await put("AUTORIZAR", GERAL());
        expect(r.body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
        expect(mockTx).toEqual([]);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe("shared/financeiro1Util", () => {
  test("mascararValor guarda só o fim; vazio e nulo passam; curto vira ***", () => {
    expect(util.mascararValor("123456789")).toBe("***89");
    expect(util.mascararValor(98765)).toBe("***65");
    expect(util.mascararValor("ab")).toBe("***");
    expect(util.mascararValor("")).toBe("");
    expect(util.mascararValor(null)).toBeNull();
    expect(util.mascararValor(undefined)).toBeUndefined();
  });
  test("mascararCampos não muda o objeto original, ignora maiúscula/minúscula e deixa os outros campos", () => {
    const original = { CpfCnpj: "12345678901", nome: "Ana", ChavePix: "abc@x.com" };
    const m = util.mascararCampos(original, ["cpfCnpj", "chavePix"]);
    expect(m).toEqual({ CpfCnpj: "***01", nome: "Ana", ChavePix: "***om" });
    expect(original.CpfCnpj).toBe("12345678901");
    expect(util.mascararCampos(null, ["x"])).toBeNull();
  });
  test("idOpcional: sem id → tem=false; canônico → número; malformado → tem=true com id nulo", () => {
    expect(util.idOpcional(undefined)).toEqual({ tem: false, id: null });
    expect(util.idOpcional("")).toEqual({ tem: false, id: null });
    expect(util.idOpcional("7")).toEqual({ tem: true, id: 7 });
    expect(util.idOpcional(7)).toEqual({ tem: true, id: 7 });
    for (const ruim of ["0x10", "1e1", "05", "-1", " 5", "abc", 0, true, [5]]) expect(util.idOpcional(ruim)).toEqual({ tem: true, id: null });
  });
  test("numeroPositivo: só número/texto numérico, > 0 e até o máximo", () => {
    expect(util.numeroPositivo("10.5", 100)).toBe(10.5);
    expect(util.numeroPositivo(100, 100)).toBe(100);
    for (const ruim of [0, -1, "abc", "", "  ", true, [5], null, undefined, NaN, Infinity, 101]) expect(util.numeroPositivo(ruim, 100)).toBeNull();
  });
  test("decodificarArquivo: vazio, não-texto e acima do limite viram null (o grande nem é decodificado)", () => {
    expect(util.decodificarArquivo(base64De("abc")).toString()).toBe("abc");
    expect(util.decodificarArquivo("")).toBeNull();
    expect(util.decodificarArquivo(null)).toBeNull();
    expect(util.decodificarArquivo({ x: 1 })).toBeNull();
    expect(util.decodificarArquivo(GRANDE_DEMAIS)).toBeNull();
    expect(util.decodificarArquivo(base64De("abcdef"), 3)).toBeNull();
  });
});
