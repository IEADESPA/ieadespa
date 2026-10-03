// Cancelar uma cessão de templo estorna a cobrança — frente "dinheiro", item (i) do plano da fase 7.
//  - ao AUTORIZAR nascem uma Conta a Receber e uma Receita Acessória; ao CANCELAR a cessão, as duas saem NA MESMA TRANSAÇÃO (conta PREVISTA vira CANCELADO com o motivo
//    "Cessão cancelada", quem e quando; a receita acessória é marcada cancelada, nunca apagada);
//  - conta já RECEBIDA (lançamento ativo na Tesouraria): o cancelamento é BLOQUEADO com a explicação do caminho e a cessão fica como está (ROLLBACK);
//  - cancelar duas vezes, ou cancelar com um recebimento simultâneo, não corrompe: a transição da cessão e a leitura da conta travam as linhas (UPDLOCK) e o recebimento
//    (GestaoContasReceber CONFIRMAR) trava a mesma conta;
//  - toda soma de ContasAReceber ignora as CANCELADAS (varredura do código + as consultas reais do balanço/DRP).
// O banco é simulado por TEXTO da consulta (como em escopoFinanceiro3.test.js): o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
const fs = require("fs");
const path = require("path");

let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  class Requisicao {
    constructor(tx) { this.tx = tx || null; this.inputs = {}; }
    input(nome, _tipo, valor) { this.inputs[nome] = valor; return this; }
    async query(texto) {
      mockConsultas.push({ sql: texto, inputs: { ...this.inputs }, emTransacao: !!this.tx });
      for (const [padrao, valor, afetadas] of mockRegras) {
        if (padrao.test(texto)) {
          const recordset = typeof valor === "function" ? valor(this.inputs, texto) : valor;
          return { recordset, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
        }
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }
  class Transacao {
    async begin() { mockConsultas.push({ sql: "<<BEGIN>>", inputs: {} }); }
    async commit() { mockConsultas.push({ sql: "<<COMMIT>>", inputs: {} }); }
    async rollback() { mockConsultas.push({ sql: "<<ROLLBACK>>", inputs: {} }); }
  }
  const sqlFalso = new Proxy({}, { get: (_alvo, prop) => (prop === "Transaction" ? Transacao : prop === "Request" ? Requisicao : () => undefined) });
  return { getPool: async () => ({ request: () => new Requisicao(null) }), sql: sqlFalso };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => (u ? `${u}?sas` : u), salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://blob/doc-1") }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const hCessoes = require("../../GestaoCessoesTemplo/index.js");
const hContas = require("../../GestaoContasReceber/index.js");
const hReceitas = require("../../GestaoReceitasAcessorias/index.js");
const demonstracoes = require("../demonstracoes");
const { criarPoolFalso, sqlFalso } = require("./testUtils");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const ESCRITA = /^\s*(INSERT INTO|UPDATE|DELETE FROM)\b/i;
const escritas = () => mockConsultas.filter(c => ESCRITA.test(c.sql));
const posicao = (padrao) => mockConsultas.findIndex(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: ["financeiro"], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
const geral = () => tokenDe(5, { nivel: "GLOBAL", escopoCongregacoes: "TODAS" });
const local = (nomes) => tokenDe(6, { nivel: "CONGREGACAO", escopoCongregacoes: nomes });

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  registrarAuditoria.mockClear();
});

// =============================================================================================================================================================
// 1. Cancelar a cessão
// =============================================================================================================================================================
describe("GestaoCessoesTemplo — CANCELAR estorna a cobrança na mesma transação", () => {
  const registro = (extra = {}) => ({ CessaoId: 7, CongregacaoId: 1, CongregacaoNome: "A", Status: "AUTORIZADA", ListaMusicalAprovada: 1, TermoResponsabilidadeUrl: "https://blob/termo", TaxaZeladoria: 100, IsencaoTaxa: 0, SolicitanteNome: "Maria", TipoEvento: "CASAMENTO", DataEvento: "2026-11-01", ContaReceberId: 31, ...extra });
  const CONTA_PREVISTA = { contaReceberId: 31, status: "PREVISTO", valor: 100, lancamentoId: null, lancamentoStatus: null, termoNumero: null };
  // `transicao`: o que o UPDATE da cessão devolve (OUTPUT) e quantas linhas pegou; `conta`: a conta lida com UPDLOCK (null = não achou).
  const regras = ({ cessao = {}, transicao = [{ ContaReceberId: 31 }], linhasTransicao = 1, conta = CONTA_PREVISTA, linhasConta = 1, linhasReceita = 1 } = {}) => {
    quando(/SELECT c\.\*, cg\.Nome AS CongregacaoNome/, [registro(cessao)]);
    quando(/UPDATE CessoesTemplo SET Status = @status/, transicao, linhasTransicao);
    quando(/FROM ContasAReceber cr WITH \(UPDLOCK, HOLDLOCK\)/, conta === null ? [] : [conta]);
    quando(/UPDATE ContasAReceber SET Status = 'CANCELADO'/, [], linhasConta);
    quando(/UPDATE ReceitasAcessorias SET CanceladaEm/, [], linhasReceita);
  };
  const cancelar = (token = geral(), corpo = {}) => chamar(hCessoes, { metodo: "PUT", token, ligado: { id: "7" }, corpo: { acao: "CANCELAR", motivo: "o solicitante desistiu", ...corpo } });

  test("conta ainda PREVISTA: BEGIN, transição da cessão (com o estado no WHERE), leitura travada da conta, conta CANCELADO, receita acessória cancelada, COMMIT — nessa ordem", async () => {
    regras();
    const r = await cancelar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Cessão cancelada. A cobrança (conta a receber) foi cancelada junto e saiu dos saldos a receber." });
    const ordem = [/<<BEGIN>>/, /UPDATE CessoesTemplo SET Status = @status/, /FROM ContasAReceber cr WITH \(UPDLOCK, HOLDLOCK\)/, /UPDATE ContasAReceber SET Status = 'CANCELADO'/, /UPDATE ReceitasAcessorias SET CanceladaEm/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[5]).every(c => c.emTransacao)).toBe(true);
    const transicao = rodou(/UPDATE CessoesTemplo SET Status = @status/)[0];
    expect(transicao.inputs.status).toBe("CANCELADA");
    expect(transicao.sql).toMatch(/OUTPUT INSERTED\.ContaReceberId WHERE CessaoId = @id AND Status IN \('SOLICITADA', 'AUTORIZADA'\)/);
  });
  test("a conta estornada guarda o motivo 'Cessão cancelada', quem e quando; a receita acessória guarda o mesmo e nada é apagado", async () => {
    regras();
    await cancelar(geral(), { motivo: "o solicitante desistiu" });
    const conta = rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)[0];
    expect(conta.inputs).toMatchObject({ id: 31, de: "PREVISTO", por: 5, motivo: "Cessão cancelada: o solicitante desistiu" });
    expect(conta.sql).toMatch(/CanceladoPor = @por, CanceladoEm = SYSUTCDATETIME\(\)/);
    expect(conta.sql).toMatch(/WHERE ContaReceberId = @id AND Status = @de/);
    const receita = rodou(/UPDATE ReceitasAcessorias SET CanceladaEm/)[0];
    expect(receita.inputs).toMatchObject({ cessaoId: 7, por: 5, motivo: "Cessão cancelada: o solicitante desistiu" });
    expect(receita.sql).toMatch(/WHERE CessaoTemploId = @cessaoId AND CanceladaEm IS NULL/);
    expect(mockConsultas.filter(c => /^\s*DELETE/i.test(c.sql))).toHaveLength(0);
  });
  test("sem motivo informado o texto é só 'Cessão cancelada'; motivo enorme é cortado nos 300 da coluna", async () => {
    regras();
    await cancelar(geral(), { motivo: undefined });
    expect(rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)[0].inputs.motivo).toBe("Cessão cancelada");
    mockConsultas = []; mockRegras = [];
    regras();
    await cancelar(geral(), { motivo: "x".repeat(500) });
    expect(rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)[0].inputs.motivo.length).toBeLessThanOrEqual(300);
  });
  test("a trilha de auditoria diz que a conta e a receita foram canceladas junto", async () => {
    regras();
    await cancelar();
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "CessoesTemplo", registroId: 7, acao: "Cancelou cessão de templo", dadosDepois: { contaReceberId: 31, contaCancelada: true, receitasAcessoriasCanceladas: 1 } });
  });
  test("conta já RECEBIDA (lançamento ativo): o cancelamento é BLOQUEADO — ROLLBACK, nada muda, e a mensagem descreve o caminho da devolução", async () => {
    regras({ conta: { contaReceberId: 31, status: "RECEBIDO", valor: 100, lancamentoId: 900, lancamentoStatus: "ATIVO", termoNumero: 12 } });
    const r = await cancelar();
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/NÃO pôde ser cancelada/);
    expect(r.body.mensagem).toMatch(/R\$ 100,00/);
    expect(r.body.mensagem).toMatch(/Termo nº 12/);
    expect(r.body.mensagem).toMatch(/ato financeiro à parte/);
    expect(r.body.mensagem).toMatch(/registre a saída com o comprovante/);
    expect(r.body.mensagem).toMatch(/cancele o lançamento do recebimento/);
    expect(r.body.mensagem).toMatch(/Enquanto isso a cessão fica como está/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/UPDATE ContasAReceber/)).toHaveLength(0);
    expect(rodou(/UPDATE ReceitasAcessorias/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("conta RECEBIDA cujo lançamento JÁ foi cancelado pela Tesouraria (a devolução foi feita): a conta também é cancelada, para a receita não ficar sem o dinheiro", async () => {
    regras({ conta: { contaReceberId: 31, status: "RECEBIDO", valor: 100, lancamentoId: 900, lancamentoStatus: "CANCELADO", termoNumero: 12 } });
    const r = await cancelar();
    expect(r.body.sucesso).toBe(true);
    const conta = rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)[0];
    expect(conta.inputs.de).toBe("RECEBIDO");
    expect(conta.inputs.motivo).toBe("Cessão cancelada: o solicitante desistiu (recebimento já estornado: lançamento nº 900 cancelado)");
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("conta que alguém já cancelou antes: nada a estornar, mas a cessão e a receita acessória seguem canceladas", async () => {
    regras({ conta: { contaReceberId: 31, status: "CANCELADO", valor: 100, lancamentoId: null, lancamentoStatus: null, termoNumero: null } });
    const r = await cancelar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Cessão cancelada." });
    expect(rodou(/UPDATE ContasAReceber/)).toHaveLength(0);
    expect(rodou(/UPDATE ReceitasAcessorias SET CanceladaEm/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("conta em situação desconhecida: falha fechada (bloqueia), como se estivesse recebida", async () => {
    regras({ conta: { contaReceberId: 31, status: "QUALQUER_OUTRA", valor: 100, lancamentoId: null, lancamentoStatus: null, termoNumero: null } });
    const r = await cancelar();
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/UPDATE ContasAReceber/)).toHaveLength(0);
  });
  test("conta que sumiu (não deveria existir): bloqueia e desfaz — nunca cancela a cessão deixando a cobrança sem destino", async () => {
    regras({ conta: null });
    const r = await cancelar();
    expect(r.status).toBe(200); // recusa explicada, não erro 500
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/conta a receber desta cessão não foi encontrada/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
  });
  test("a conta mudou entre a leitura travada e o UPDATE (0 linhas): ROLLBACK, nada fica pela metade", async () => {
    regras({ linhasConta: 0 });
    const r = await cancelar();
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("cancelar duas vezes (a segunda transição não acha a cessão SOLICITADA/AUTORIZADA): recusa, ROLLBACK, a conta nem é tocada", async () => {
    regras({ linhasTransicao: 0, transicao: [] });
    const r = await cancelar();
    expect(r.body).toEqual({ sucesso: false, mensagem: "Só é possível cancelar uma cessão solicitada ou autorizada." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/ContasAReceber/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("cessão já CANCELADA na leitura: recusa sem abrir transação", async () => {
    regras({ cessao: { Status: "CANCELADA" } });
    const r = await cancelar();
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  test("a autorização terminou NO MEIO (a leitura inicial não via conta, mas a transição travada devolve uma): a conta é estornada do mesmo jeito", async () => {
    regras({ cessao: { Status: "SOLICITADA", ContaReceberId: null } });
    const r = await cancelar();
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)).toHaveLength(1);
  });
  test("...e o local, que não pode cancelar cessão com cobrança, é recusado ali também (403), desfazendo a transição", async () => {
    regras({ cessao: { Status: "SOLICITADA", ContaReceberId: null } });
    const r = await cancelar(local(["A"]));
    expect(r.status).toBe(403);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/UPDATE ContasAReceber/)).toHaveLength(0);
  });
  test("cessão sem cobrança (taxa zero ou isenta): cancela só a cessão, sem tocar em conta nem receita", async () => {
    regras({ cessao: { ContaReceberId: null }, transicao: [{ ContaReceberId: null }] });
    const r = await cancelar(local(["A"]));
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Cessão cancelada." });
    expect(rodou(/ContasAReceber/)).toHaveLength(0);
    expect(rodou(/UPDATE ReceitasAcessorias/)).toHaveLength(0);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("falha no meio (erro do banco): ROLLBACK, 500 genérico sem vazar o erro interno, sem auditoria", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/UPDATE ReceitasAcessorias/.test(p.source));
    quando(/UPDATE ReceitasAcessorias SET CanceladaEm/, () => { throw new Error("deadlock victim segredo-interno"); });
    const r = await cancelar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a lista de cessões mostra a situação da cobrança (conta a receber) de cada uma", async () => {
    quando(/c\.CessaoId AS cessaoId/, [{ cessaoId: 7, congregacaoId: 1, congregacaoNome: "A", status: "CANCELADA", contaReceberId: 31, contaReceberStatus: "CANCELADO" }]);
    const r = await chamar(hCessoes, { token: geral() });
    expect(r.body[0].contaReceberStatus).toBe("CANCELADO");
    expect(rodou(/c\.CessaoId AS cessaoId/)[0].sql).toMatch(/LEFT JOIN ContasAReceber cr ON cr\.ContaReceberId = c\.ContaReceberId/);
  });
});

// =============================================================================================================================================================
// 2. Recebimento e cancelamento da conta a receber: a mesma linha travada
// =============================================================================================================================================================
describe("GestaoContasReceber — CONFIRMAR e CANCELAR travam a conta (UPDLOCK) e rodam em transação", () => {
  const CONTA = { ContaReceberId: 31, CongregacaoId: 1, congregacaoNome: "A", Status: "PREVISTO", Valor: 100, Tipo: "CESSAO_TEMPLO", Descricao: "Taxa", DizimistaId: null, NomeAvulso: "Maria", CampanhaId: null };
  const regras = ({ conta = {}, travada = "PREVISTO", linhasBaixa = 1 } = {}) => {
    quando(/SELECT cr\.\*, c\.Nome AS congregacaoNome/, [{ ...CONTA, ...conta }]);
    quando(/SELECT Status FROM ContasAReceber WITH \(UPDLOCK, HOLDLOCK\)/, travada === null ? [] : [{ Status: travada }]);
    quando(/MAX\(TermoNumero\)/, [{ proximo: 8 }]);
    quando(/INSERT INTO LancamentosTesouraria/, [{ LancamentoId: 900 }]);
    quando(/UPDATE ContasAReceber SET Status = 'RECEBIDO'/, [], linhasBaixa);
    quando(/UPDATE ContasAReceber SET Status = 'CANCELADO'/, [], 1);
    quando(/UPDATE ReceitasAcessorias SET CanceladaEm/, [], 1);
  };
  const confirmar = (corpo = {}) => chamar(hContas, { metodo: "PUT", token: geral(), ligado: { id: "31" }, corpo: { acao: "CONFIRMAR", formaPagamento: "DINHEIRO", mesReferencia: "2026-10", ...corpo } });
  const cancelar = (corpo = {}) => chamar(hContas, { metodo: "PUT", token: geral(), ligado: { id: "31" }, corpo: { acao: "CANCELAR", motivo: "acordo desfeito", ...corpo } });

  test("CONFIRMAR: BEGIN, conta travada, Termo nº, lançamento, baixa com o estado no WHERE, COMMIT — tudo na transação e nessa ordem", async () => {
    regras();
    const r = await confirmar();
    expect(r.body).toMatchObject({ sucesso: true, lancamentoId: 900, termoNumero: 8 });
    const ordem = [/<<BEGIN>>/, /SELECT Status FROM ContasAReceber WITH \(UPDLOCK, HOLDLOCK\)/, /MAX\(TermoNumero\)/, /INSERT INTO LancamentosTesouraria/, /UPDATE ContasAReceber SET Status = 'RECEBIDO'/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[5]).every(c => c.emTransacao)).toBe(true);
    expect(rodou(/UPDATE ContasAReceber SET Status = 'RECEBIDO'/)[0].sql).toMatch(/AND Status = 'PREVISTO'/);
  });
  test("CONFIRMAR com a conta já CANCELADA (a cessão foi cancelada no meio): recusa, ROLLBACK, NENHUM lançamento é criado", async () => {
    regras({ travada: "CANCELADO" });
    const r = await confirmar();
    expect(r.body).toEqual({ sucesso: false, mensagem: "Esta conta a receber já foi confirmada ou cancelada." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/INSERT INTO LancamentosTesouraria/)).toHaveLength(0);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
  });
  test("dois cliques em CONFIRMAR: o segundo vê a conta já RECEBIDA e não cria o segundo lançamento (receita em dobro)", async () => {
    regras({ travada: "RECEBIDO" });
    const r = await confirmar();
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/INSERT INTO LancamentosTesouraria/)).toHaveLength(0);
  });
  test("CONFIRMAR: falha no meio (erro do banco) desfaz o lançamento junto, 500 genérico", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/UPDATE ContasAReceber SET Status = 'RECEBIDO'/.test(p.source));
    quando(/UPDATE ContasAReceber SET Status = 'RECEBIDO'/, () => { throw new Error("deadlock victim segredo-interno"); });
    const r = await confirmar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("CANCELAR: conta travada, UPDATE com o estado no WHERE, e a receita acessória da cessão de origem cancelada junto (mesma transação)", async () => {
    regras();
    const r = await cancelar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "Conta a receber cancelada." });
    const ordem = [/<<BEGIN>>/, /SELECT Status FROM ContasAReceber WITH \(UPDLOCK, HOLDLOCK\)/, /UPDATE ContasAReceber SET Status = 'CANCELADO'/, /UPDATE ReceitasAcessorias SET CanceladaEm/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(rodou(/UPDATE ContasAReceber SET Status = 'CANCELADO'/)[0].sql).toMatch(/AND Status = 'PREVISTO'/);
    const receita = rodou(/UPDATE ReceitasAcessorias SET CanceladaEm/)[0];
    // READPAST: não espera a linha da cessão se o cancelamento dela estiver em andamento (evita o impasse conta × cessão); esse cancelamento já leva a receita junto
    expect(receita.sql).toMatch(/CessaoTemploId IN \(SELECT CessaoId FROM CessoesTemplo WITH \(READPAST\) WHERE ContaReceberId = @id\)/);
    expect(receita.inputs.motivo).toBe("Conta a receber cancelada: acordo desfeito");
  });
  test("CANCELAR com a conta já RECEBIDA por um recebimento simultâneo: recusa, ROLLBACK, nada cancelado", async () => {
    regras({ travada: "RECEBIDO" });
    const r = await cancelar();
    expect(r.body).toEqual({ sucesso: false, mensagem: "Esta conta a receber já foi confirmada ou cancelada." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/UPDATE ContasAReceber/)).toHaveLength(0);
    expect(rodou(/UPDATE ReceitasAcessorias/)).toHaveLength(0);
  });
  test("CANCELAR sem motivo, conta de outra congregação e conta já confirmada na leitura: as recusas de antes continuam, sem abrir transação", async () => {
    regras();
    expect((await cancelar({ motivo: "  " })).status).toBe(400);
    mockConsultas = []; mockRegras = [];
    regras({ conta: { Status: "RECEBIDO" } });
    expect((await cancelar()).body.sucesso).toBe(false);
    mockConsultas = []; mockRegras = [];
    regras({ conta: { congregacaoNome: "B" } });
    const fora = await chamar(hContas, { metodo: "PUT", token: local(["A"]), ligado: { id: "31" }, corpo: { acao: "CANCELAR", motivo: "x" } });
    expect(fora.status).toBe(403);
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 3. A receita acessória cancelada some dos totais; a conta cancelada some de toda soma
// =============================================================================================================================================================
describe("receita acessória de cessão cancelada", () => {
  test("o relatório origem x destino não soma as canceladas e a lista as marca", async () => {
    quando(/FROM ReceitasAcessorias r\s+LEFT JOIN BensPatrimoniais b ON b\.BemId = r\.BemId WHERE r\.CanceladaEm IS NULL/, [{ ReceitaAcessoriaId: 1, Valor: 100, EventoDescricao: "Casamento", SaidaId: null }]);
    const rel = await chamar(hReceitas, { token: geral(), ligado: { recurso: "relatorio-origem-destino" } });
    expect(rel.body).toEqual([{ origemDestino: "Casamento", totalArrecadado: 100, totalComprovado: 0, totalPendente: 100, lancamentos: 1 }]);
    expect(rodou(/CanceladaEm IS NULL/)).toHaveLength(1);
    mockConsultas = []; mockRegras = [];
    quando(/FROM ReceitasAcessorias r\s+LEFT JOIN BensPatrimoniais b ON b\.BemId = r\.BemId\s+LEFT JOIN Congregacoes/, [
      { ReceitaAcessoriaId: 1, CongregacaoId: 1, congregacaoNome: "A", Tipo: "CESSAO_SALAO", Valor: 100, CanceladaEm: "2026-10-03T10:00:00Z", MotivoCancelamento: "Cessão cancelada", SaidaId: null },
      { ReceitaAcessoriaId: 2, CongregacaoId: 1, congregacaoNome: "A", Tipo: "BAZAR", Valor: 50, CanceladaEm: null, MotivoCancelamento: null, SaidaId: null }
    ]);
    const lista = await chamar(hReceitas, { token: geral() });
    expect(lista.body.map(r => [r.receitaAcessoriaId, r.cancelada, r.motivoCancelamento])).toEqual([[1, true, "Cessão cancelada"], [2, false, null]]);
  });
  test("vincular comprovação a uma receita cancelada é recusado", async () => {
    quando(/SELECT \* FROM ReceitasAcessorias WHERE ReceitaAcessoriaId = @id/, [{ ReceitaAcessoriaId: 1, CanceladaEm: "2026-10-03T10:00:00Z" }]);
    const r = await chamar(hReceitas, { metodo: "PUT", token: geral(), corpo: { id: 1, saidaId: 9 } });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/foi cancelada/);
    expect(escritas()).toHaveLength(0);
  });
});

describe("contas a receber CANCELADAS não entram em nenhuma soma", () => {
  test("balanço e DRP: as consultas reais de ContasAReceber filtram Status <> CANCELADO", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ total: 0 }], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], []]);
    await demonstracoes.calcularBalancoPatrimonial(pool, sqlFalso, new Date("2026-06-30"));
    const doBalanco = chamadas.filter(c => /FROM ContasAReceber/.test(c.sql));
    expect(doBalanco).toHaveLength(1);
    expect(doBalanco[0].sql).toMatch(/Status != 'CANCELADO'/);
    const drp = criarPoolFalso([[], [], [{ total: 0 }], [], []]);
    await demonstracoes.calcularDRP(drp.pool, sqlFalso, new Date("2026-01-01"), new Date("2026-06-30"));
    const porConta = drp.chamadas.filter(c => /SUM\(cr\.Valor\)/.test(c.sql));
    expect(porConta).toHaveLength(1);
    expect(porConta[0].sql).toMatch(/cr\.Status != 'CANCELADO'/);
  });

  // Varredura do código-fonte: qualquer consulta que SOME ou CONTE ContasAReceber (receita a receber, inadimplência, saldo) precisa ignorar as canceladas. Uma consulta
  // nova que esqueça o filtro quebra este teste. (Listar linhas para exibir o status, ler uma conta pelo id e os UPDATEs não somam nada e ficam de fora.)
  test("toda consulta do código que soma ou conta ContasAReceber filtra as canceladas", () => {
    const raiz = path.join(__dirname, "..", "..");
    const arquivos = [];
    const percorrer = (pasta) => {
      for (const nome of fs.readdirSync(pasta, { withFileTypes: true })) {
        if (nome.name === "node_modules" || nome.name === "__tests__") continue;
        const caminho = path.join(pasta, nome.name);
        if (nome.isDirectory()) percorrer(caminho);
        else if (nome.name.endsWith(".js")) arquivos.push(caminho);
      }
    };
    percorrer(raiz);
    const consultasQueSomam = [];
    for (const arquivo of arquivos) {
      const texto = fs.readFileSync(arquivo, "utf-8");
      const vistos = new Set();
      for (const achado of texto.matchAll(/ContasAReceber/g)) {
        // A "consulta" em volta da menção: do crase anterior ao crase seguinte (o texto entre as crases do template).
        const ini = texto.lastIndexOf("`", achado.index);
        const fim = texto.indexOf("`", achado.index);
        if (ini < 0 || fim < 0 || vistos.has(ini)) continue;
        vistos.add(ini);
        // O NOT EXISTS que só confere se um lançamento nasceu de uma conta (para não contar a mesma entrada duas vezes) não soma conta nenhuma.
        const janela = texto.slice(ini + 1, fim).replace(/NOT EXISTS\s*\(\s*SELECT 1 FROM ContasAReceber[^)]*\)/g, "");
        if (/\b(FROM|JOIN)\s+ContasAReceber\b/.test(janela) && /\b(SUM|COUNT|AVG)\s*\(/i.test(janela)) consultasQueSomam.push({ arquivo: path.relative(raiz, arquivo), trecho: janela });
      }
    }
    // Pelo menos as três de shared/demonstracoes.js existem (se sumirem, a varredura deixou de enxergar o que deveria).
    expect(consultasQueSomam.filter(c => c.arquivo.replace(/\\/g, "/") === "shared/demonstracoes.js").length).toBeGreaterThanOrEqual(2);
    const semFiltro = consultasQueSomam.filter(c => !/(!=|<>)\s*'CANCELADO'/.test(c.trecho));
    expect(semFiltro.map(c => c.arquivo)).toEqual([]);
  });
});
