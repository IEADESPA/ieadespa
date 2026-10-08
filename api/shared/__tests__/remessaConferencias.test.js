// A remessa bancária e o retorno do banco repetem as conferências do pagamento comum (shared/conferenciaPagamento.js) — frente "dinheiro", item (h) do plano da fase 7.
//  - pagamento comum (GestaoSaidas, PAGAR): mesmos textos e mesma ordem de antes, agora numa transação sob a trava "PagamentoSaida", com a linha da Saída travada;
//  - geração da remessa: Saída que não passa FICA DE FORA do arquivo e a resposta lista cada uma com TODOS os motivos (nunca em silêncio, nunca derrubando o lote); o saldo
//    desconta o que outras remessas já reservaram e o que a própria geração já separou;
//  - retorno do banco "00": se a Saída deixou de passar, o item vira DIVERGENTE (o banco já pagou: o fato não se apaga) e NADA é lançado como pago; item que o arquivo não
//    menciona também vira DIVERGENTE; tudo numa transação;
//  - tratar a divergência (PUT): reconhecer o pagamento (Saída vira PAGA) ou encerrar o item, sempre com justificativa.
// O banco é simulado por TEXTO da consulta (como em escopoFinanceiro3.test.js): o comportamento contra o SQL Server de verdade está nos roteiros ponta a ponta.
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
const storage = require("../storage");
const conferencia = require("../conferenciaPagamento");
const hSaidas = require("../../GestaoSaidas/index.js");
const hRemessas = require("../../GestaoRemessasBancarias/index.js");
const hRetorno = require("../../ProcessarRetornoRemessa/index.js");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const ESCRITA = /\b(INSERT INTO|UPDATE|DELETE FROM)\b/i;
const escritas = () => mockConsultas.filter(c => ESCRITA.test(c.sql));
const posicao = (padrao) => mockConsultas.findIndex(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, ...extra });
const geral = () => tokenDe(5, { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
const local = (nomes) => tokenDe(6, { nivel: "CONGREGACAO", escopoCongregacoes: nomes, permissoes: ["financeiro"] });

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  registrarAuditoria.mockClear();
  storage.salvarDocumento.mockClear();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// O mundo simulado: saldo por centro de custo, tutela, suspensão do PDQ, campanhas e o que as remessas pendentes já reservaram.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
function mundo({ saldoLocal = 100000, saldoGeral = 100000, saldoPdq = 100000, tuteladas = [], pdqSuspenso = false, reservado = 0, campanhas = {} } = {}) {
  quando(/SUM\(ValorRetidoLocal\)/, [{ total: saldoLocal }]);
  quando(/SUM\(ValorTesouroGeral\)/, [{ total: saldoGeral }]);
  quando(/FROM RateioGeralValores/, (i) => [{ total: i.codigo === "PDQ" ? saldoPdq : 0 }]);
  quando(/s\.Status = 'PAGA' AND cs\.CentroCusto/, [{ total: 0 }]);
  quando(/FROM Congregacoes WHERE CongregacaoId = @id/, (i) => [{ CongregacaoId: i.id, Nome: `C${i.id}`, Categoria: tuteladas.includes(i.id) ? "EXTENSAO_TENDA" : "CONGREGACAO" }]);
  quando(/FROM PdqFundoSuspensoes/, pdqSuspenso ? [{ SuspensaoId: 1, SuspensoEm: new Date("2026-09-01T12:00:00Z"), MotivoSuspensao: "revisão" }] : []);
  quando(/FROM RemessaItens ri\s+JOIN SaidasTesouraria sr/, [{ total: reservado }]);
  quando(/FROM Campanhas WHERE CampanhaId = @id/, (i) => (campanhas[i.id] ? [{ Status: campanhas[i.id] }] : []));
}

const MSG = {
  fornecedor: "Os dados bancários deste fornecedor mudaram e ainda não foram confirmados — não é possível pagar agora.",
  campanha: "A campanha de origem deste gasto foi cancelada — não é possível pagar.",
  tutela: "Esta unidade foi reclassificada como Extensão da Tenda (PSC, Regimento Art. 129 §3º): o caixa local está recolhido e é gerido pela Tesouraria da Sede ou pela Congregação-Mãe."
};
const MSG_PDQ = `O Fundo de Execução Estratégica (PDQ) está suspenso pelo Pastor Presidente desde ${new Date("2026-09-01T12:00:00Z").toLocaleDateString("pt-BR")} — não é possível pagar agora.`;

// =============================================================================================================================================================
// 1. Pagamento comum (GestaoSaidas PAGAR): o mesmo comportamento de antes, agora travado e atômico
// =============================================================================================================================================================
describe("GestaoSaidas — PAGAR repete as conferências pelo código compartilhado, com os mesmos textos e a mesma ordem", () => {
  const REGISTRO = { SaidaId: 10, CongregacaoId: 1, congregacaoNome: "A", centroCusto: "LOCAL", Status: "APROVADA", Valor: 100, FornecedorId: 5, CampanhaId: null, SolicitadoPor: 6, Tipo: "MANUTENCAO" };
  const TRAVADA = { saidaId: 10, congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
  const COMPROVANTE = { acao: "PAGAR", comprovanteBase64: Buffer.from("recibo").toString("base64"), mimeType: "application/pdf" };
  const regras = ({ registro = {}, travada = {}, trava = 0, afetadas = 1, mundoExtra = {} } = {}) => {
    quando(/SELECT s\.\*, c\.Nome AS congregacaoNome/, [{ ...REGISTRO, ...registro }]);
    quando(/sp_getapplock/, [{ resultado: trava }]);
    quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, travada === null ? [] : [{ ...TRAVADA, ...travada }]);
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], afetadas);
    mundo(mundoExtra);
  };
  const pagar = (corpo = COMPROVANTE) => chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo });

  test("passa: BEGIN, trava PagamentoSaida, linha travada, conferências, upload, UPDATE com o estado no WHERE, COMMIT — tudo na transação e nessa ordem", async () => {
    regras();
    const r = await pagar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Pagamento registrado." });
    const ordem = [/<<BEGIN>>/, /sp_getapplock/, /FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, /SUM\(ValorRetidoLocal\)/, /UPDATE SaidasTesouraria SET Status = 'PAGA'/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[5]).every(c => c.emTransacao)).toBe(true);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("PagamentoSaida");
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/)[0].sql).toMatch(/WHERE SaidaId = @id AND Status = 'APROVADA'/);
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("fornecedor com dado bancário não confirmado: o mesmo texto de sempre, e nada é gravado", async () => {
    regras({ travada: { dadosBancariosConfirmados: false } });
    const r = await pagar();
    expect(r.body).toMatchObject({ sucesso: false, mensagem: MSG.fornecedor });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("fornecedor que não existe mais: o mesmo texto do dado bancário não confirmado", async () => {
    regras({ travada: { fornecedorId: null, dadosBancariosConfirmados: null } });
    expect((await pagar()).body.mensagem).toBe(MSG.fornecedor);
  });
  test("Fundo PDQ suspenso (centro PDQ): o mesmo texto de sempre", async () => {
    regras({ registro: { centroCusto: "PDQ" }, travada: { centroCusto: "PDQ" }, mundoExtra: { pdqSuspenso: true } });
    expect((await pagar()).body).toMatchObject({ sucesso: false, mensagem: MSG_PDQ });
  });
  test("congregação sob tutela (centro LOCAL e DEPTO_*): o texto da tutela, igual ao de sempre", async () => {
    regras({ mundoExtra: { tuteladas: [1] } });
    expect((await pagar()).body).toMatchObject({ sucesso: false, mensagem: MSG.tutela });
    mockConsultas = []; mockRegras = [];
    regras({ registro: { centroCusto: "DEPTO_EBD" }, travada: { centroCusto: "DEPTO_EBD" }, mundoExtra: { tuteladas: [1] } });
    quando(/FROM RelatoriosDepartamentais r/, [{ total: 100000 }]);
    expect((await pagar()).body).toMatchObject({ sucesso: false, mensagem: MSG.tutela });
  });
  test("tutela NÃO vale para os centros da igreja inteira (GERAL, PDQ...) mesmo com a congregação rebaixada", async () => {
    regras({ registro: { centroCusto: "GERAL" }, travada: { centroCusto: "GERAL" }, mundoExtra: { tuteladas: [1] } });
    expect((await pagar()).body.sucesso).toBe(true);
  });
  test("saldo insuficiente: o texto exato de sempre, com o nome do centro", async () => {
    regras({ mundoExtra: { saldoLocal: 50 } });
    expect((await pagar()).body).toMatchObject({ sucesso: false, mensagem: "Saldo insuficiente no Centro de Custo Local (disponível: R$ 50.00)." });
    mockConsultas = []; mockRegras = [];
    regras({ registro: { centroCusto: "GERAL" }, travada: { centroCusto: "GERAL" }, mundoExtra: { saldoGeral: 10 } });
    expect((await pagar()).body.mensagem).toBe("Saldo insuficiente no Centro de Custo Geral (disponível: R$ 10.00).");
    mockConsultas = []; mockRegras = [];
    regras({ registro: { centroCusto: "PDQ" }, travada: { centroCusto: "PDQ" }, mundoExtra: { saldoPdq: 0 } });
    expect((await pagar()).body.mensagem).toBe("Saldo insuficiente no Centro de Custo PDQ (disponível: R$ 0.00).");
  });
  test("saldo exatamente igual ao valor passa (não é 'maior que')", async () => {
    regras({ mundoExtra: { saldoLocal: 100 } });
    expect((await pagar()).body.sucesso).toBe(true);
  });
  test("campanha de origem cancelada (ou inexistente): o texto de sempre", async () => {
    regras({ travada: { campanhaId: 9 }, mundoExtra: { campanhas: { 9: "CANCELADA" } } });
    expect((await pagar()).body).toMatchObject({ sucesso: false, mensagem: MSG.campanha });
    mockConsultas = []; mockRegras = [];
    regras({ travada: { campanhaId: 9 }, mundoExtra: { campanhas: { 9: "ATIVA" } } });
    expect((await pagar()).body.sucesso).toBe(true);
  });
  test("campanha de origem que não existe mais conta como cancelada (falha fechada)", async () => {
    regras({ travada: { campanhaId: 77 } });
    const r = await pagar();
    expect(r.body).toMatchObject({ sucesso: false, mensagem: MSG.campanha });
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
  });
  test("vários motivos ao mesmo tempo: a mensagem é o PRIMEIRO na ordem do pagamento comum (fornecedor, PDQ, tutela, saldo, campanha) e a lista traz todos", async () => {
    regras({ registro: { centroCusto: "LOCAL" }, travada: { dadosBancariosConfirmados: false, campanhaId: 9 }, mundoExtra: { tuteladas: [1], saldoLocal: 1, campanhas: { 9: "CANCELADA" } } });
    const r = await pagar();
    expect(r.body.mensagem).toBe(MSG.fornecedor);
    expect(r.body.motivos.map(m => m.codigo)).toEqual(["FORNECEDOR_NAO_CONFIRMADO", "SOB_TUTELA", "SALDO_INSUFICIENTE", "CAMPANHA_CANCELADA"]);
  });
  test("o saldo desconta o que está reservado em remessas ainda sem retorno", async () => {
    regras({ mundoExtra: { saldoLocal: 1000, reservado: 950 } });
    const r = await pagar();
    expect(r.body.mensagem).toBe("Saldo insuficiente no Centro de Custo Local (disponível: R$ 50.00, já descontados R$ 950.00 reservados para pagamentos em remessa bancária).");
    expect(rodou(/FROM RemessaItens ri\s+JOIN SaidasTesouraria sr/)[0].sql).toMatch(/ri\.Status = 'PENDENTE' AND sr\.Status = 'APROVADA'/);
  });
  test("a própria Saída numa remessa aguardando retorno NÃO pode ser paga na mão (o banco pagaria e a Tesouraria pagaria de novo)", async () => {
    regras();
    quando(/SELECT TOP 1 ri\.RemessaItemId/, [{ remessaItemId: 3 }]);
    const r = await pagar();
    expect(r.body).toMatchObject({ sucesso: false });
    expect(r.body.motivos.map(m => m.codigo)).toEqual(["EM_REMESSA_PENDENTE"]);
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
  });
  test("trava não obtida: 409, ROLLBACK, nada gravado e nenhum arquivo enviado", async () => {
    regras({ trava: -1 });
    const r = await pagar();
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("a Saída já foi paga/cancelada por outra pessoa entre a leitura e a trava: recusa com o texto de sempre, sem gravar", async () => {
    regras({ travada: { status: "PAGA" } });
    const r = await pagar();
    expect(r.body).toEqual({ sucesso: false, mensagem: "Só é possível pagar uma solicitação já aprovada." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
    mockConsultas = []; mockRegras = [];
    regras({ travada: null });
    expect((await pagar()).body.sucesso).toBe(false);
  });
  test("o UPDATE não pega a linha (corrida): ROLLBACK, sem auditoria", async () => {
    regras({ afetadas: 0 });
    const r = await pagar();
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("comprovante com formato inválido: 400 e NADA é pago (antes a Saída era marcada PAGA sem comprovante)", async () => {
    regras();
    const r = await pagar({ acao: "PAGAR", comprovanteBase64: Buffer.from("x").toString("base64"), mimeType: "text/html" });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/Formato inválido/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/)).toHaveLength(0);
  });
  test("falha no meio (erro do banco): ROLLBACK, 500 genérico sem vazar o erro interno", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/UPDATE SaidasTesouraria SET Status = 'PAGA'/.test(p.source));
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, () => { throw new Error("deadlock victim segredo-interno"); });
    const r = await pagar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
  });
  test("sem comprovante ou Saída ainda não aprovada: as recusas de antes continuam, sem abrir transação", async () => {
    regras();
    expect((await pagar({ acao: "PAGAR" })).status).toBe(400);
    mockConsultas = []; mockRegras = [];
    regras({ registro: { Status: "PENDENTE" } });
    expect((await pagar()).body.mensagem).toBe("Só é possível pagar uma solicitação já aprovada.");
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
  });
  test("o tesoureiro local continua sem pagar o centro da igreja inteira (escopo na rota, antes de tudo)", async () => {
    regras({ registro: { centroCusto: "GERAL" } });
    const r = await chamar(hSaidas, { metodo: "PUT", token: local(["A"]), ligado: { id: "10" }, corpo: COMPROVANTE });
    expect(r.status).toBe(403);
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
  });
  test("CANCELAR: o estado vai no WHERE (um pagamento que acabou de sair não é sobrescrito) e a corrida é recusada", async () => {
    regras({ registro: { Status: "APROVADA" } });
    quando(/UPDATE SaidasTesouraria SET Status = 'CANCELADA'/, [], 1);
    const ok = await chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo: { acao: "CANCELAR", motivo: "duplicada" } });
    expect(ok.body).toEqual({ sucesso: true, mensagem: "Saída cancelada." });
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'CANCELADA'/)[0].sql).toMatch(/AND Status IN \('PENDENTE', 'APROVADA'\)/);
    mockRegras = mockRegras.filter(([p]) => !/CANCELADA/.test(p.source));
    quando(/UPDATE SaidasTesouraria SET Status = 'CANCELADA'/, [], 0);
    registrarAuditoria.mockClear();
    const perdeu = await chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo: { acao: "CANCELAR", motivo: "duplicada" } });
    expect(perdeu.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

// =============================================================================================================================================================
// 2. Geração da remessa: o que não passa fica de fora, com todos os motivos
// =============================================================================================================================================================
describe("GestaoRemessasBancarias — a remessa repete as conferências do pagamento comum", () => {
  const INSTITUICAO = { CodigoBanco: "001", Agencia: "1234", Conta: "56789", Cnpj: "12345678000190", RazaoSocial: "IEADESPA", NomeBanco: "BANCO", CodigoConvenio: "1", DigitoAgencia: "0", DigitoConta: "1" };
  const cand = (saidaId, extra = {}) => ({ saidaId, valor: 100, nomeFavorecido: `FORN${saidaId}`, bancoFavorecido: "001", agenciaFavorecido: "1234", contaFavorecido: "98765", congregacaoId: 1, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, ...extra });
  const regras = ({ candidatas, trava = 0, mundoExtra = {} }) => {
    quando(/FROM DadosBancariosInstituicao/, [INSTITUICAO]);
    quando(/sp_getapplock/, (i) => [{ resultado: typeof trava === "function" ? trava(i.recurso) : trava }]);
    quando(/s\.Status = 'APROVADA'/, candidatas);
    quando(/MAX\(NumeroSequencial\)/, [{ proximo: 5 }]);
    quando(/INSERT INTO RemessasBancarias/, [{ RemessaId: 77 }]);
    quando(/INSERT INTO RemessaItens/, []);
    mundo(mundoExtra);
  };
  const gerar = () => chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
  const idsNoArquivo = () => {
    const conteudo = storage.salvarDocumento.mock.calls[0][0].toString("utf-8");
    // Segmento A (registro tipo 3, segmento A): o SaidaId do documento fica nas posições 73-92 (índice 72).
    return conteudo.split(/\r?\n/).filter(l => l.length >= 240 && l.charAt(7) === "3" && l.charAt(13) === "A").map(l => parseInt(l.substring(72, 92), 10));
  };
  const itensGravados = () => rodou(/INSERT INTO RemessaItens/).map(c => c.inputs.saidaId);

  test("item sob tutela fica DE FORA do arquivo e da remessa; a resposta diz qual e por quê; os outros seguem", async () => {
    regras({ candidatas: [cand(900), cand(901, { congregacaoId: 2 })], mundoExtra: { tuteladas: [2] } });
    const r = await gerar();
    expect(r.status).toBe(201);
    expect(r.body.sucesso).toBe(true);
    expect(idsNoArquivo()).toEqual([900]);
    expect(itensGravados()).toEqual([900]);
    expect(r.body.barrados).toEqual([{ saidaId: 901, fornecedorNome: "FORN901", valor: 100, motivos: [{ codigo: "SOB_TUTELA", mensagem: MSG.tutela }] }]);
    expect(r.body.mensagem).toMatch(/gerada com 1 pagamento\(s\)\. 1 Saída\(s\) aprovada\(s\) ficaram DE FORA/);
    expect(rodou(/INSERT INTO RemessasBancarias/)[0].inputs.totalRegistros).toBe(1);
    expect(rodou(/INSERT INTO RemessasBancarias/)[0].inputs.valorTotal).toBe(100);
  });
  test("sem saldo: o saldo é separado Saída a Saída (a primeira entra, a seguinte já não cabe)", async () => {
    regras({ candidatas: [cand(900, { valor: 600 }), cand(901, { valor: 600 })], mundoExtra: { saldoLocal: 1000 } });
    const r = await gerar();
    expect(idsNoArquivo()).toEqual([900]);
    expect(r.body.barrados).toHaveLength(1);
    expect(r.body.barrados[0]).toMatchObject({ saidaId: 901 });
    expect(r.body.barrados[0].motivos[0].codigo).toBe("SALDO_INSUFICIENTE");
    expect(r.body.barrados[0].motivos[0].mensagem).toBe("Saldo insuficiente no Centro de Custo Local (disponível: R$ 400.00, já descontados R$ 600.00 reservados para pagamentos em remessa bancária).");
  });
  test("o saldo desconta o que OUTRAS remessas ainda sem retorno já reservaram", async () => {
    regras({ candidatas: [cand(900, { valor: 400 })], mundoExtra: { saldoLocal: 1000, reservado: 700 } });
    const r = await gerar();
    expect(r.body.sucesso).toBe(false);
    expect(r.body.barrados[0].motivos[0].mensagem).toBe("Saldo insuficiente no Centro de Custo Local (disponível: R$ 300.00, já descontados R$ 700.00 reservados para pagamentos em remessa bancária).");
    const consulta = rodou(/FROM RemessaItens ri\s+JOIN SaidasTesouraria sr/)[0];
    expect(consulta.sql).toMatch(/ri\.Status = 'PENDENTE' AND sr\.Status = 'APROVADA'/);
    expect(consulta.sql).toMatch(/ri\.Status = 'DIVERGENTE'/);
    expect(consulta.sql).toMatch(/sr\.CongregacaoId = @congregacaoId/);
    expect(consulta.inputs).toMatchObject({ centroCusto: "LOCAL", congregacaoId: 1, ignorar: 900 });
    // a própria Saída conferida não conta contra si mesma (a consulta usa o parâmetro, não só o recebe)
    expect(consulta.sql).toMatch(/sr\.SaidaId <> @ignorar/);
    expect(consulta.sql).toMatch(/cr\.CentroCusto = @centroCusto/);
  });
  test("saldo de centro de congregação é POR congregação; o da igreja inteira (GERAL) não filtra congregação", async () => {
    regras({ candidatas: [cand(900, { centroCusto: "GERAL", congregacaoId: 1, valor: 600 }), cand(901, { centroCusto: "GERAL", congregacaoId: 2, valor: 600 })], mundoExtra: { saldoGeral: 1000 } });
    const r = await gerar();
    // As duas saem do MESMO saldo GERAL (não importa a congregação da Saída): a segunda não cabe.
    expect(idsNoArquivo()).toEqual([900]);
    expect(r.body.barrados[0].saidaId).toBe(901);
    expect(rodou(/FROM RemessaItens ri\s+JOIN SaidasTesouraria sr/)[0].sql).not.toMatch(/sr\.CongregacaoId = @congregacaoId/);
    mockConsultas = []; mockRegras = []; storage.salvarDocumento.mockClear();
    regras({ candidatas: [cand(900, { congregacaoId: 1, valor: 600 }), cand(901, { congregacaoId: 2, valor: 600 })], mundoExtra: { saldoLocal: 1000 } });
    const local2 = await gerar();
    expect(idsNoArquivo()).toEqual([900, 901]); // LOCAL: cada congregação tem o seu saldo
    expect(local2.body.barrados).toEqual([]);
  });
  test("Fundo PDQ suspenso: só as Saídas do PDQ ficam de fora", async () => {
    regras({ candidatas: [cand(900, { centroCusto: "PDQ" }), cand(901)], mundoExtra: { pdqSuspenso: true } });
    const r = await gerar();
    expect(idsNoArquivo()).toEqual([901]);
    expect(r.body.barrados).toEqual([{ saidaId: 900, fornecedorNome: "FORN900", valor: 100, motivos: [{ codigo: "FUNDO_PDQ_SUSPENSO", mensagem: MSG_PDQ }] }]);
  });
  test("dado bancário não confirmado ou incompleto: antes a Saída sumia em silêncio; agora aparece como barrada com o motivo", async () => {
    regras({ candidatas: [cand(900, { dadosBancariosConfirmados: false }), cand(901, { contaFavorecido: null }), cand(902, { fornecedorId: null, dadosBancariosConfirmados: null, bancoFavorecido: null, agenciaFavorecido: null, contaFavorecido: null, nomeFavorecido: null })] });
    const r = await gerar();
    expect(r.body.sucesso).toBe(false);
    expect(r.body.barrados.map(b => [b.saidaId, b.motivos.map(m => m.codigo)])).toEqual([
      [900, ["FORNECEDOR_NAO_CONFIRMADO"]],
      [901, ["DADOS_BANCARIOS_INCOMPLETOS"]],
      [902, ["FORNECEDOR_NAO_CONFIRMADO", "DADOS_BANCARIOS_INCOMPLETOS"]]
    ]);
  });
  test("vários motivos na MESMA Saída: todos aparecem na lista (não só o primeiro)", async () => {
    regras({ candidatas: [cand(900, { valor: 5000, dadosBancariosConfirmados: false, campanhaId: 9 })], mundoExtra: { tuteladas: [1], saldoLocal: 10, campanhas: { 9: "CANCELADA" } } });
    const r = await gerar();
    expect(r.body.barrados[0].motivos.map(m => m.codigo)).toEqual(["FORNECEDOR_NAO_CONFIRMADO", "SOB_TUTELA", "SALDO_INSUFICIENTE", "CAMPANHA_CANCELADA"]);
  });
  test("categoria que não existe (centro de custo desconhecido): falha fechada, barrada", async () => {
    regras({ candidatas: [cand(900, { centroCusto: null })] });
    const r = await gerar();
    expect(r.body.barrados[0].motivos[0].codigo).toBe("CATEGORIA_DESCONHECIDA");
  });
  test("todas barradas: nada é gravado (ROLLBACK), nenhum arquivo sobe e a resposta explica cada uma", async () => {
    regras({ candidatas: [cand(900), cand(901)], mundoExtra: { tuteladas: [1] } });
    const r = await gerar();
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Nenhuma das 2 Saída\(s\) aprovada\(s\) pôde entrar na remessa/);
    expect(r.body.barrados.map(b => b.saidaId)).toEqual([900, 901]);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("a seleção das candidatas traz TODAS as aprovadas fora de remessa (não filtra mais por fornecedor), exclui DIVERGENTE e trava a linha (UPDLOCK)", async () => {
    regras({ candidatas: [cand(900)] });
    await gerar();
    const selecao = rodou(/s\.Status = 'APROVADA'/)[0];
    expect(selecao.sql).not.toMatch(/DadosBancariosConfirmados = 1/);
    expect(selecao.sql).toMatch(/ri\.Status IN \('PENDENTE', 'PROCESSADO'\)/);
    expect(selecao.sql).toMatch(/rd\.Status = 'DIVERGENTE'/);
    expect(selecao.sql).toMatch(/FROM SaidasTesouraria s WITH \(UPDLOCK\)/);
    expect(selecao.sql).toMatch(/LEFT JOIN CategoriasSaida/);
  });
  test("duas travas, nesta ordem: RemessaBancaria e depois PagamentoSaida — as conferências e a seleção vêm DEPOIS das duas", async () => {
    regras({ candidatas: [cand(900)] });
    await gerar();
    expect(rodou(/sp_getapplock/).map(c => c.inputs.recurso)).toEqual(["RemessaBancaria", "PagamentoSaida"]);
    const ultimaTrava = mockConsultas.map((c, i) => (/sp_getapplock/.test(c.sql) ? i : -1)).filter(i => i >= 0).pop();
    expect(posicao(/s\.Status = 'APROVADA'/)).toBeGreaterThan(ultimaTrava);
    expect(posicao(/SUM\(ValorRetidoLocal\)/)).toBeGreaterThan(ultimaTrava);
  });
  test("segunda trava não obtida (um pagamento/retorno em andamento): 409, ROLLBACK, nada gravado", async () => {
    regras({ candidatas: [cand(900)], trava: (recurso) => (recurso === "PagamentoSaida" ? -1 : 0) });
    const r = await gerar();
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("a trilha de auditoria guarda quais Saídas ficaram de fora (só id e códigos, sem texto livre)", async () => {
    regras({ candidatas: [cand(900), cand(901, { congregacaoId: 2 })], mundoExtra: { tuteladas: [2] } });
    await gerar();
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.barrados).toEqual([{ saidaId: 901, codigos: ["SOB_TUTELA"] }]);
  });
  test("GET detalhe devolve os motivos das divergências já separados item a item", async () => {
    quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 7, NumeroSequencial: 3, TotalRegistros: 1, ValorTotal: 10, Status: "PROCESSADA", ArquivoUrl: "https://blob/arq", ArquivoRetornoUrl: "https://blob/ret" }]);
    quando(/FROM RemessaItens ri JOIN SaidasTesouraria s/, [{ remessaItemId: 1, saidaId: 900, fornecedorNome: "X", valor: 10, status: "DIVERGENTE", motivoFalha: "resumo", motivosJson: JSON.stringify([{ codigo: "SOB_TUTELA", mensagem: "m" }]), saidaStatus: "APROVADA" }, { remessaItemId: 2, saidaId: 901, fornecedorNome: "Y", valor: 5, status: "PROCESSADO", motivoFalha: null, motivosJson: null }]);
    const r = await chamar(hRemessas, { token: geral(), ligado: { id: "7" } });
    expect(r.body.itens[0].motivos).toEqual([{ codigo: "SOB_TUTELA", mensagem: "m" }]);
    expect(r.body.itens[0].motivosJson).toBeUndefined();
    expect(r.body.itens[1].motivos).toEqual([]);
  });
});

// =============================================================================================================================================================
// 3. Retorno do banco: "00" só vira pagamento regular se a Saída ainda passa; senão, DIVERGENTE
// =============================================================================================================================================================
// `valorPago`: o campo "valor efetivamente pago" do retorno (posições 177-191, 15 dígitos em centavos). Número = esse valor; texto = vai cru para o campo (para simular lixo/brancos);
// o padrão é o valor da Saída simulada abaixo (R$ 100,00 = 10000 centavos), para os cenários que não tratam de valor.
function linhaRetorno(saidaId, ocorrencia, valorPago = 10000) {
  const l = Array(240).fill(" ");
  l[7] = "3"; l[13] = "A";
  String(saidaId).padStart(20, "0").split("").forEach((ch, i) => { l[72 + i] = ch; });
  (typeof valorPago === "number" ? String(valorPago).padStart(15, "0") : String(valorPago).padEnd(15, " ")).split("").forEach((ch, i) => { l[176 + i] = ch; });
  String(ocorrencia).split("").forEach((ch, i) => { l[230 + i] = ch; });
  return l.join("");
}

describe("ProcessarRetornoRemessa — ocorrência '00' repete as conferências; o que não passa vira DIVERGENTE", () => {
  const arquivo = (linhas) => Buffer.from(linhas.join("\r\n"), "utf-8").toString("base64");
  const SAIDA = { congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
  // `saidas`: situação ATUAL de cada Saída (por id); `pendentes`: itens que a remessa ainda tem PENDENTES (por padrão, os mencionados no arquivo).
  const regras = ({ saidas = {}, statusRemessa = "GERADA", statusRemessaTravada, trava = 0, sobras = [], mundoExtra = {}, divergentesReservados = 0 } = {}) => {
    // A remessa é lida duas vezes: antes da transação e de novo já com a trava (a segunda leitura pode ver o que um processamento simultâneo acabou de fazer).
    quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, () => {
      const leituras = mockConsultas.filter(c => /SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/.test(c.sql)).length;
      return [{ RemessaId: 77, Status: leituras > 1 ? (statusRemessaTravada || statusRemessa) : statusRemessa }];
    });
    quando(/FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'/, (i) => [{ RemessaItemId: 1000 + i.saidaId, SaidaId: i.saidaId }]);
    quando(/SELECT RemessaItemId, SaidaId FROM RemessaItens WHERE RemessaId = @remessaId AND Status = 'PENDENTE'/, sobras);
    quando(/sp_getapplock/, [{ resultado: trava }]);
    quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, (i) => (saidas[i.saidaId] === null ? [] : [{ saidaId: i.saidaId, ...SAIDA, ...(saidas[i.saidaId] || {}) }]));
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], 1);
    quando(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, [], 1);
    mundo({ ...mundoExtra, reservado: divergentesReservados });
  };
  const processar = (linhas) => chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: arquivo(linhas), mimeType: "text/plain" } });
  const divergentes = () => rodou(/UPDATE RemessaItens SET Status = 'DIVERGENTE'/);
  const pagas = () => rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/).map(c => c.inputs.saidaId);

  test("tudo em ordem: paga como sempre, dentro da transação e debaixo da trava, com a Saída lida de novo (travada) e conferida", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 1, falharam: 0, divergentes: [] });
    expect(r.body.mensagem).toBe("✅ Retorno processado: 1 pagamento(s) confirmado(s), 0 rejeitado(s) pelo banco.");
    const ordem = [/<<BEGIN>>/, /sp_getapplock/, /FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, /SUM\(ValorRetidoLocal\)/, /UPDATE SaidasTesouraria SET Status = 'PAGA'/, /UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[6]).every(c => c.emTransacao)).toBe(true);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("PagamentoSaida");
    expect(divergentes()).toHaveLength(0);
  });
  test("tutela aplicada DEPOIS do envio: o banco pagou, mas o item vira DIVERGENTE com o motivo — a Saída NÃO é marcada paga, a prebenda não muda", async () => {
    regras({ mundoExtra: { tuteladas: [1] } });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 0, falharam: 0 });
    expect(r.body.divergentes).toEqual([{ saidaId: 900, motivos: [{ codigo: "SOB_TUTELA", mensagem: MSG.tutela }] }]);
    expect(r.body.mensagem).toMatch(/ATENÇÃO: 1 item\(ns\) com divergência/);
    expect(pagas()).toEqual([]);
    expect(rodou(/UPDATE PrebendaGeracoes/)).toHaveLength(0);
    expect(divergentes()).toHaveLength(1);
    expect(divergentes()[0].inputs).toMatchObject({ id: 1900, motivo: MSG.tutela });
    expect(JSON.parse(divergentes()[0].inputs.json)).toEqual([{ codigo: "SOB_TUTELA", mensagem: MSG.tutela }]);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
    expect(rodou(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/)).toHaveLength(1);
  });
  test("Saída cancelada depois do envio: DIVERGENTE (o banco pagou uma Saída que o sistema considera cancelada)", async () => {
    regras({ saidas: { 900: { status: "CANCELADA" } } });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body.divergentes[0].motivos.map(m => m.codigo)).toEqual(["SAIDA_NAO_APROVADA"]);
    expect(pagas()).toEqual([]);
  });
  test("Saída que sumiu: DIVERGENTE (não há como conferir)", async () => {
    regras({ saidas: { 900: null } });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body.divergentes[0].motivos.map(m => m.codigo)).toEqual(["SAIDA_NAO_ENCONTRADA"]);
    expect(pagas()).toEqual([]);
  });
  test("dado bancário do fornecedor trocado e ainda não confirmado: DIVERGENTE (o dinheiro foi para a conta antiga)", async () => {
    regras({ saidas: { 900: { dadosBancariosConfirmados: false } } });
    expect((await processar([linhaRetorno(900, "00")])).body.divergentes[0].motivos[0]).toMatchObject({ codigo: "FORNECEDOR_NAO_CONFIRMADO", mensagem: MSG.fornecedor });
  });
  test("Fundo PDQ suspenso entre o envio e o retorno: DIVERGENTE", async () => {
    regras({ saidas: { 900: { centroCusto: "PDQ" } }, mundoExtra: { pdqSuspenso: true } });
    expect((await processar([linhaRetorno(900, "00")])).body.divergentes[0].motivos[0]).toMatchObject({ codigo: "FUNDO_PDQ_SUSPENSO", mensagem: MSG_PDQ });
  });
  test("saldo gasto por outro pagamento: DIVERGENTE", async () => {
    regras({ mundoExtra: { saldoLocal: 50 } });
    expect((await processar([linhaRetorno(900, "00")])).body.divergentes[0].motivos[0]).toMatchObject({ codigo: "SALDO_INSUFICIENTE", mensagem: "Saldo insuficiente no Centro de Custo Local (disponível: R$ 50.00)." });
  });
  test("o saldo do retorno NÃO desconta os itens PENDENTES (este é um deles), mas desconta o que o banco já pagou e está a tratar (DIVERGENTE)", async () => {
    regras({ mundoExtra: { saldoLocal: 1000 }, divergentesReservados: 950 });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body.divergentes[0].motivos[0].mensagem).toBe("Saldo insuficiente no Centro de Custo Local (disponível: R$ 50.00, já descontados R$ 950.00 reservados para pagamentos em remessa bancária).");
    const consulta = rodou(/FROM RemessaItens ri\s+JOIN SaidasTesouraria sr/)[0];
    expect(consulta.sql).not.toMatch(/ri\.Status = 'PENDENTE'/);
    expect(consulta.sql).toMatch(/ri\.Status = 'DIVERGENTE'/);
  });
  test("vários motivos: todos ficam no item (JSON) e o texto resumido cabe na coluna de 300 caracteres", async () => {
    regras({ saidas: { 900: { dadosBancariosConfirmados: false, campanhaId: 9 } }, mundoExtra: { tuteladas: [1], saldoLocal: 1, campanhas: { 9: "CANCELADA" } } });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body.divergentes[0].motivos.map(m => m.codigo)).toEqual(["FORNECEDOR_NAO_CONFIRMADO", "SOB_TUTELA", "SALDO_INSUFICIENTE", "CAMPANHA_CANCELADA"]);
    expect(divergentes()[0].inputs.motivo.length).toBeLessThanOrEqual(300);
    expect(JSON.parse(divergentes()[0].inputs.json)).toHaveLength(4);
  });
  test("misturados no mesmo arquivo: o que passa é pago, o que não passa fica DIVERGENTE, a rejeição do banco continua FALHOU", async () => {
    regras({ saidas: { 901: { status: "CANCELADA" } } });
    const r = await processar([linhaRetorno(900, "00"), linhaRetorno(901, "00"), linhaRetorno(902, "05")]);
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 1, falharam: 1 });
    expect(r.body.divergentes.map(d => d.saidaId)).toEqual([901]);
    expect(pagas()).toEqual([900]);
    expect(rodou(/UPDATE RemessaItens SET Status = 'FALHOU'/).map(c => c.inputs.id)).toEqual([1902]);
  });
  test("item da remessa que o arquivo NÃO menciona vira DIVERGENTE ('o banco não informou') em vez de ficar PENDENTE para sempre", async () => {
    regras({ sobras: [{ RemessaItemId: 1999, SaidaId: 999 }] });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body.divergentes).toEqual([{ saidaId: 999, motivos: [expect.objectContaining({ codigo: "SEM_RESULTADO_NO_RETORNO" })] }]);
    expect(divergentes().map(c => c.inputs.id)).toEqual([1999]);
    expect(pagas()).toEqual([900]);
  });
  test("processamento duplicado (duplo clique): quem esperou a trava vê a remessa já PROCESSADA, desfaz tudo e não paga de novo", async () => {
    regras({ statusRemessa: "GERADA", statusRemessaTravada: "PROCESSADA" });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Esta remessa já teve o retorno processado." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  test("trava não obtida: 409, ROLLBACK, nada gravado", async () => {
    regras({ trava: -1 });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
  });
  test("falha no meio do arquivo: ROLLBACK de TUDO (antes ficava metade processada), 500 genérico e sem auditoria", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/UPDATE RemessasBancarias/.test(p.source));
    quando(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, () => { throw new Error("deadlock victim segredo-interno"); });
    const r = await processar([linhaRetorno(900, "00")]);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a auditoria registra os divergentes só com id e códigos", async () => {
    regras({ mundoExtra: { tuteladas: [1] } });
    await processar([linhaRetorno(900, "00")]);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).toMatchObject({ confirmados: 0, falharam: 0, divergentes: [{ saidaId: 900, codigos: ["SOB_TUTELA"] }] });
  });
});

// =============================================================================================================================================================
// 4. Tratar a divergência (PUT)
// =============================================================================================================================================================
describe("GestaoRemessasBancarias PUT — tratar um item DIVERGENTE", () => {
  const ITEM = { RemessaItemId: 5, SaidaId: 900, Status: "DIVERGENTE", ArquivoRetornoUrl: "https://blob/ret" };
  const regras = ({ item = ITEM, saida = {}, afetadas = 1, trava = 0 } = {}) => {
    quando(/sp_getapplock/, [{ resultado: trava }]);
    quando(/FROM RemessaItens ri WITH \(UPDLOCK, HOLDLOCK\)/, item === null ? [] : [{ ...ITEM, ...item }]);
    quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, saida === null ? [] : [{ saidaId: 900, status: "APROVADA", ...saida }]);
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], afetadas);
    quando(/UPDATE RemessaItens SET Status = @status/, [], 1);
  };
  const tratar = (corpo, token = geral()) => chamar(hRemessas, { metodo: "PUT", token, ligado: { id: "77" }, corpo: { acao: "TRATAR_DIVERGENCIA", remessaItemId: 5, resolucao: "RECONHECER_PAGAMENTO", observacao: "conferi o extrato: o valor saiu em 02/10", ...corpo } });

  test("RECONHECER_PAGAMENTO: a Saída vira PAGA (com o comprovante = arquivo de retorno), o item vira PROCESSADO com quem/quando/justificativa; tudo numa transação travada", async () => {
    regras();
    const r = await tratar({});
    expect(r.body).toMatchObject({ sucesso: true });
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/)[0].inputs).toMatchObject({ saidaId: 900, pagoPor: 5, comprovanteUrl: "https://blob/ret" });
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/)[0].sql).toMatch(/AND Status = 'APROVADA'/);
    expect(rodou(/UPDATE PrebendaGeracoes SET Status = 'PAGA'/)).toHaveLength(1);
    const item = rodou(/UPDATE RemessaItens SET Status = @status/)[0];
    expect(item.inputs).toMatchObject({ itemId: 5, status: "PROCESSADO", resolucao: "RECONHECER_PAGAMENTO", tratadoPor: 5, observacao: "conferi o extrato: o valor saiu em 02/10" });
    expect(item.sql).toMatch(/AND Status = 'DIVERGENTE'/);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("PagamentoSaida");
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "RemessaItens", registroId: 5, dadosDepois: { saidaId: 900, resolucao: "RECONHECER_PAGAMENTO" } });
  });
  test("RECONHECER de Saída que já não está APROVADA (cancelada): recusado, nada muda", async () => {
    regras({ saida: { status: "CANCELADA" } });
    const r = await tratar({});
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/CANCELADA/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
  });
  test("ENCERRAR: o item vira FALHOU (a Saída aprovada volta a poder entrar numa remessa), sem mexer na Saída", async () => {
    regras();
    const r = await tratar({ resolucao: "ENCERRAR", observacao: "o banco devolveu o valor em 03/10" });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE RemessaItens SET Status = @status/)[0].inputs).toMatchObject({ status: "FALHOU", resolucao: "ENCERRAR" });
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
    expect(rodou(/UPDATE PrebendaGeracoes/)).toHaveLength(0);
  });
  test("item que não está DIVERGENTE (já tratado ou nunca divergiu) ou não é desta remessa: recusado, nada muda", async () => {
    regras({ item: { Status: "PROCESSADO" } });
    expect((await tratar({})).body.sucesso).toBe(false);
    mockConsultas = []; mockRegras = [];
    regras({ item: null });
    expect((await tratar({})).body).toEqual({ sucesso: false, mensagem: "Item não encontrado nesta remessa." });
    expect(escritas()).toHaveLength(0);
  });
  test("a Saída mudou entre a leitura e o UPDATE (corrida): ROLLBACK e nenhum item alterado", async () => {
    regras({ afetadas: 0 });
    const r = await tratar({});
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE RemessaItens/)).toHaveLength(0);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
  });
  test("trava não obtida: 409, nada gravado", async () => {
    regras({ trava: -1 });
    expect((await tratar({})).status).toBe(409);
    expect(escritas()).toHaveLength(0);
  });
  test("entrada inválida: 400 sem abrir transação (ação, item, resolução e justificativa)", async () => {
    regras();
    for (const ruim of [{ acao: "OUTRA" }, { remessaItemId: "0x5" }, { remessaItemId: undefined }, { resolucao: "APAGAR" }, { observacao: "ok" }, { observacao: "x".repeat(301) }, { observacao: 123 }, { observacao: "   " }]) {
      const r = await tratar(ruim);
      expect(r.status).toBe(400);
    }
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  test("remessa com id malformado ou ausente: 'não encontrada' sem tocar no banco", async () => {
    regras();
    const r = await chamar(hRemessas, { metodo: "PUT", token: geral(), ligado: { id: "0x4D" }, corpo: { acao: "TRATAR_DIVERGENCIA", remessaItemId: 5, resolucao: "ENCERRAR", observacao: "texto válido" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Remessa não encontrada." });
    expect(mockConsultas).toHaveLength(0);
  });
  test("só o nível geral trata: o tesoureiro local leva 403 antes de tocar no banco", async () => {
    regras();
    const r = await tratar({}, local(["A"]));
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 5. O módulo compartilhado, direto
// =============================================================================================================================================================
describe("conferenciaPagamento — regras do módulo", () => {
  const exec = { request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (t) => { mockConsultas.push({ sql: t, inputs: { ...inputs } }); for (const [p, v] of mockRegras) if (p.test(t)) return { recordset: typeof v === "function" ? v(inputs) : v, rowsAffected: [1] }; return { recordset: [], rowsAffected: [0] }; } }; return r; } };
  const sqlFalso = new Proxy({}, { get: () => () => undefined });
  const saida = (extra = {}) => ({ saidaId: 1, congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "X", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "1", agencia: "1", conta: "1", ...extra });

  test("chaveSaldo: LOCAL e DEPTO_* separam por congregação; GERAL, PDQ e demais não", () => {
    expect(conferencia.chaveSaldo("LOCAL", 1)).not.toBe(conferencia.chaveSaldo("LOCAL", 2));
    expect(conferencia.chaveSaldo("DEPTO_EBD", 1)).not.toBe(conferencia.chaveSaldo("DEPTO_EBD", 2));
    expect(conferencia.chaveSaldo("GERAL", 1)).toBe(conferencia.chaveSaldo("GERAL", 2));
    expect(conferencia.chaveSaldo("PDQ", 1)).toBe(conferencia.chaveSaldo("PDQ", 9));
  });
  test("Saída não aprovada é recusada por qualquer via", async () => {
    mundo();
    const r = await conferencia.criarConferidor(exec, sqlFalso).conferir(saida({ status: "PENDENTE" }));
    expect(r.ok).toBe(false);
    expect(r.motivos[0].codigo).toBe("SAIDA_NAO_APROVADA");
  });
  test("a conferência sem motivos devolve ok e lista vazia; reservar() só afeta o MESMO centro/congregação", async () => {
    mundo({ saldoLocal: 1000 });
    const conferidor = conferencia.criarConferidor(exec, sqlFalso, { reservas: "todas" });
    expect(await conferidor.conferir(saida({ valor: 700 }))).toEqual({ ok: true, motivos: [] });
    conferidor.reservar(saida({ valor: 700 }));
    expect((await conferidor.conferir(saida({ saidaId: 2, valor: 400 }))).motivos.map(m => m.codigo)).toEqual(["SALDO_INSUFICIENTE"]);
    expect((await conferidor.conferir(saida({ saidaId: 3, valor: 400, congregacaoId: 2 }))).ok).toBe(true);
  });
  test("sem reservas ('nenhuma') o lote não separa saldo: só o saldo calculado conta", async () => {
    mundo({ saldoLocal: 1000, reservado: 999 });
    const conferidor = conferencia.criarConferidor(exec, sqlFalso);
    conferidor.reservar(saida({ valor: 900 }));
    expect((await conferidor.conferir(saida({ valor: 1000 }))).ok).toBe(true);
    expect(rodou(/FROM RemessaItens ri/)).toHaveLength(0);
  });
  test("o conferidor guarda o que já consultou: tutela e suspensão do PDQ uma vez só por lote", async () => {
    mundo({ tuteladas: [1] });
    const conferidor = conferencia.criarConferidor(exec, sqlFalso);
    await conferidor.conferir(saida({ saidaId: 1 }));
    await conferidor.conferir(saida({ saidaId: 2 }));
    expect(rodou(/FROM Congregacoes WHERE CongregacaoId = @id/)).toHaveLength(1);
    await conferidor.conferir(saida({ saidaId: 3, centroCusto: "PDQ" }));
    await conferidor.conferir(saida({ saidaId: 4, centroCusto: "PDQ" }));
    expect(rodou(/FROM PdqFundoSuspensoes/)).toHaveLength(1);
  });
  test("resumirMotivos corta no limite da coluna", () => {
    const motivos = [{ mensagem: "a".repeat(200) }, { mensagem: "b".repeat(200) }];
    const texto = conferencia.resumirMotivos(motivos, 300);
    expect(texto.length).toBe(300);
    expect(texto.endsWith("…")).toBe(true);
    expect(conferencia.resumirMotivos([{ mensagem: "curto" }])).toBe("curto");
  });
});

// =============================================================================================================================================================
// 6. Fornecedor INATIVO: barrado nos três caminhos (pagar na mão, gerar remessa, confirmar retorno) — "vazio = ativo" para a Saída antiga
// =============================================================================================================================================================
const MSG_INATIVO = "Fornecedor inativo: reative o cadastro ou use outro fornecedor.";

describe("fornecedor inativo — o mesmo motivo nos três caminhos do dinheiro", () => {
  test("fornecedorInativo: só Ativo = 0/false conta; vazio (NULL), ausente ou verdadeiro = ativo (Saída antiga nunca é bloqueada)", () => {
    for (const inativo of [false, 0, "0"]) expect(conferencia.fornecedorInativo(inativo)).toBe(true);
    for (const ativo of [true, 1, "1", null, undefined]) expect(conferencia.fornecedorInativo(ativo)).toBe(false);
  });

  describe("pagamento comum (PAGAR)", () => {
    const REGISTRO = { SaidaId: 10, CongregacaoId: 1, congregacaoNome: "A", centroCusto: "LOCAL", Status: "APROVADA", Valor: 100, FornecedorId: 5, CampanhaId: null, SolicitadoPor: 6, Tipo: "MANUTENCAO" };
    const TRAVADA = { saidaId: 10, congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
    const regras = (travada = {}) => {
      quando(/SELECT s\.\*, c\.Nome AS congregacaoNome/, [REGISTRO]);
      quando(/sp_getapplock/, [{ resultado: 0 }]);
      quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, [{ ...TRAVADA, ...travada }]);
      quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], 1);
      mundo();
    };
    const pagar = () => chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo: { acao: "PAGAR", comprovanteBase64: Buffer.from("recibo").toString("base64"), mimeType: "application/pdf" } });

    test("fornecedor inativo: barrado com a mensagem pedida, ROLLBACK, nada pago, nenhum comprovante enviado", async () => {
      regras({ fornecedorAtivo: false });
      const r = await pagar();
      expect(r.body).toMatchObject({ sucesso: false, mensagem: MSG_INATIVO });
      expect(r.body.motivos).toEqual([{ codigo: "FORNECEDOR_INATIVO", mensagem: MSG_INATIVO }]);
      expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
      expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
    });
    test("a Saída é lida COM a coluna Ativo do fornecedor (senão a conferência nunca veria o cadastro desativado)", async () => {
      regras();
      await pagar();
      expect(rodou(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/)[0].sql).toMatch(/f\.Ativo AS fornecedorAtivo/);
    });
    test("Ativo vazio (NULL), ausente ou verdadeiro NÃO bloqueia: a Saída antiga continua pagável", async () => {
      for (const ativo of [null, undefined, true, 1]) {
        mockConsultas = []; mockRegras = [];
        regras({ fornecedorAtivo: ativo });
        expect((await pagar()).body).toEqual({ sucesso: true, mensagem: "✅ Pagamento registrado." });
      }
    });
    test("inativo E dado bancário não confirmado: os dois motivos aparecem, o do cadastro inativo primeiro", async () => {
      regras({ fornecedorAtivo: false, dadosBancariosConfirmados: false });
      const r = await pagar();
      expect(r.body.motivos.map(m => m.codigo)).toEqual(["FORNECEDOR_INATIVO", "FORNECEDOR_NAO_CONFIRMADO"]);
      expect(r.body.mensagem).toBe(MSG_INATIVO);
    });
    test("fornecedor que não existe mais continua com o texto de sempre (não vira 'inativo')", async () => {
      regras({ fornecedorId: null, dadosBancariosConfirmados: null, fornecedorAtivo: null });
      expect((await pagar()).body.motivos.map(m => m.codigo)).toEqual(["FORNECEDOR_NAO_CONFIRMADO"]);
    });
  });

  describe("geração da remessa", () => {
    const INSTITUICAO = { CodigoBanco: "001", Agencia: "1234", Conta: "56789", Cnpj: "12345678000190", RazaoSocial: "IEADESPA", NomeBanco: "BANCO", CodigoConvenio: "1", DigitoAgencia: "0", DigitoConta: "1" };
    const cand = (saidaId, extra = {}) => ({ saidaId, valor: 100, nomeFavorecido: `FORN${saidaId}`, bancoFavorecido: "001", agenciaFavorecido: "1234", contaFavorecido: "98765", congregacaoId: 1, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, ...extra });
    const regras = (candidatas) => {
      quando(/FROM DadosBancariosInstituicao/, [INSTITUICAO]);
      quando(/sp_getapplock/, [{ resultado: 0 }]);
      quando(/s\.Status = 'APROVADA'/, candidatas);
      quando(/MAX\(NumeroSequencial\)/, [{ proximo: 5 }]);
      quando(/INSERT INTO RemessasBancarias/, [{ RemessaId: 77 }]);
      quando(/INSERT INTO RemessaItens/, []);
      mundo();
    };
    const gerar = () => chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });

    test("a Saída de fornecedor inativo fica DE FORA do arquivo, com o motivo; as de fornecedor ativo (ou com Ativo vazio) seguem", async () => {
      regras([cand(900, { fornecedorAtivo: false }), cand(901, { fornecedorAtivo: true }), cand(902, { fornecedorAtivo: null }), cand(903)]);
      const r = await gerar();
      expect(r.status).toBe(201);
      expect(r.body.barrados).toEqual([{ saidaId: 900, fornecedorNome: "FORN900", valor: 100, motivos: [{ codigo: "FORNECEDOR_INATIVO", mensagem: MSG_INATIVO }] }]);
      expect(rodou(/INSERT INTO RemessaItens/).map(c => c.inputs.saidaId)).toEqual([901, 902, 903]);
      expect(registrarAuditoria.mock.calls[0][0].dadosDepois.barrados).toEqual([{ saidaId: 900, codigos: ["FORNECEDOR_INATIVO"] }]);
    });
    test("a seleção das candidatas traz a coluna Ativo do fornecedor", async () => {
      regras([cand(900)]);
      await gerar();
      expect(rodou(/s\.Status = 'APROVADA'/)[0].sql).toMatch(/f\.Ativo AS fornecedorAtivo/);
    });
    test("só fornecedores inativos: nada é gravado (ROLLBACK), nenhum arquivo sobe e a resposta explica cada um", async () => {
      regras([cand(900, { fornecedorAtivo: false }), cand(901, { fornecedorAtivo: 0 })]);
      const r = await gerar();
      expect(r.body.sucesso).toBe(false);
      expect(r.body.barrados.map(b => b.motivos[0].codigo)).toEqual(["FORNECEDOR_INATIVO", "FORNECEDOR_INATIVO"]);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
      expect(escritas()).toHaveLength(0);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
    });
  });

  describe("retorno do banco", () => {
    const SAIDA = { congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
    const regras = (saida = {}) => {
      quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 77, Status: "GERADA" }]);
      quando(/FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'/, (i) => [{ RemessaItemId: 1000 + i.saidaId, SaidaId: i.saidaId }]);
      quando(/SELECT RemessaItemId, SaidaId FROM RemessaItens WHERE RemessaId = @remessaId AND Status = 'PENDENTE'/, []);
      quando(/sp_getapplock/, [{ resultado: 0 }]);
      quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, (i) => [{ saidaId: i.saidaId, ...SAIDA, ...saida }]);
      quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], 1);
      quando(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, [], 1);
      mundo();
    };
    const processar = (linhas) => chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: Buffer.from(linhas.join("\r\n"), "utf-8").toString("base64"), mimeType: "text/plain" } });

    test("o banco pagou, mas o fornecedor foi desativado depois do envio: o item vira DIVERGENTE com o motivo — a Saída NÃO é marcada paga", async () => {
      regras({ fornecedorAtivo: false });
      const r = await processar([linhaRetorno(900, "00")]);
      expect(r.body).toMatchObject({ sucesso: true, confirmados: 0, falharam: 0 });
      expect(r.body.divergentes).toEqual([{ saidaId: 900, motivos: [{ codigo: "FORNECEDOR_INATIVO", mensagem: MSG_INATIVO }] }]);
      expect(rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/)).toHaveLength(0);
      expect(rodou(/UPDATE PrebendaGeracoes/)).toHaveLength(0);
      const div = rodou(/UPDATE RemessaItens SET Status = 'DIVERGENTE'/);
      expect(div).toHaveLength(1);
      expect(div[0].inputs.motivo).toBe(MSG_INATIVO);
      expect(JSON.parse(div[0].inputs.json)).toEqual([{ codigo: "FORNECEDOR_INATIVO", mensagem: MSG_INATIVO }]);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
    });
    test("Ativo vazio ou verdadeiro: o retorno paga como sempre", async () => {
      for (const ativo of [null, undefined, true]) {
        mockConsultas = []; mockRegras = [];
        regras({ fornecedorAtivo: ativo });
        const r = await processar([linhaRetorno(900, "00")]);
        expect(r.body).toMatchObject({ sucesso: true, confirmados: 1, divergentes: [] });
      }
    });
    test("rejeição do banco ('05') de fornecedor inativo continua FALHOU (o fornecedor não importa quando o banco não pagou)", async () => {
      regras({ fornecedorAtivo: false });
      const r = await processar([linhaRetorno(900, "05")]);
      expect(r.body).toMatchObject({ confirmados: 0, falharam: 1, divergentes: [] });
    });
  });
});

// =============================================================================================================================================================
// 7. Retorno do banco: o VALOR pago tem de ser igual ao da Saída (centavos inteiros); ausente/ilegível = divergência (falha fechada)
// =============================================================================================================================================================
describe("retorno do banco — valor efetivamente pago × valor da Saída", () => {
  const SAIDA = { congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
  const regras = ({ saidas = {}, mundoExtra = {} } = {}) => {
    quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 77, Status: "GERADA" }]);
    quando(/FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'/, (i) => [{ RemessaItemId: 1000 + i.saidaId, SaidaId: i.saidaId }]);
    quando(/SELECT RemessaItemId, SaidaId FROM RemessaItens WHERE RemessaId = @remessaId AND Status = 'PENDENTE'/, []);
    quando(/sp_getapplock/, [{ resultado: 0 }]);
    quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, (i) => [{ saidaId: i.saidaId, ...SAIDA, ...(saidas[i.saidaId] || {}) }]);
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], 1);
    quando(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, [], 1);
    mundo({ saldoLocal: 1000000000, ...mundoExtra });
  };
  const processar = (linhas) => chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: Buffer.from(linhas.join("\r\n"), "utf-8").toString("base64"), mimeType: "text/plain" } });
  const pagas = () => rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/).map(c => c.inputs.saidaId);
  const divergentes = () => rodou(/UPDATE RemessaItens SET Status = 'DIVERGENTE'/);
  const MSG_DIF = (pago, esperado) => `Valor pago pelo banco diferente do valor da Saída (pago R$ ${pago}, esperado R$ ${esperado}) — confira o extrato do banco.`;

  test("valor igual: confirma e paga (R$ 100,00 = 10000 centavos)", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", 10000)]);
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 1, falharam: 0, divergentes: [] });
    expect(pagas()).toEqual([900]);
    expect(divergentes()).toHaveLength(0);
  });
  test("valor MENOR que o da Saída: DIVERGENTE com 'pago X, esperado Y' — nada lançado como pago, a Saída e a prebenda ficam como estão", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", 9000)]);
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 0, falharam: 0 });
    expect(r.body.divergentes).toEqual([{ saidaId: 900, motivos: [{ codigo: "VALOR_PAGO_DIFERENTE", mensagem: MSG_DIF("90.00", "100.00") }] }]);
    expect(pagas()).toEqual([]);
    expect(rodou(/UPDATE PrebendaGeracoes/)).toHaveLength(0);
    expect(divergentes()).toHaveLength(1);
    expect(divergentes()[0].inputs).toMatchObject({ id: 1900, motivo: MSG_DIF("90.00", "100.00") });
    expect(JSON.parse(divergentes()[0].inputs.json)).toEqual([{ codigo: "VALOR_PAGO_DIFERENTE", mensagem: MSG_DIF("90.00", "100.00") }]);
    expect(r.body.mensagem).toMatch(/ATENÇÃO: 1 item\(ns\) com divergência/);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
    expect(rodou(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/)).toHaveLength(1);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.divergentes).toEqual([{ saidaId: 900, codigos: ["VALOR_PAGO_DIFERENTE"] }]);
  });
  test("valor MAIOR (inclusive por 1 centavo) e valor menor por 1 centavo: também DIVERGENTE — a comparação é exata", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", 10001), linhaRetorno(901, "00", 9999), linhaRetorno(902, "00", 20000)]);
    expect(r.body.confirmados).toBe(0);
    expect(r.body.divergentes.map(d => [d.saidaId, d.motivos[0].mensagem])).toEqual([
      [900, MSG_DIF("100.01", "100.00")], [901, MSG_DIF("99.99", "100.00")], [902, MSG_DIF("200.00", "100.00")]
    ]);
    expect(pagas()).toEqual([]);
  });
  test("o valor da Saída é comparado em CENTAVOS INTEIROS: valores que o float distorce (0,29; 1,15; 4,35; 8,2; 1234567,89) batem com o retorno certo", async () => {
    const casos = [[0.29, 29], [1.15, 115], [4.35, 435], [8.2, 820], [19.99, 1999], [1234567.89, 123456789], [0.01, 1], [0.1 + 0.2, 30]];
    for (const [valor, centavos] of casos) {
      mockConsultas = []; mockRegras = [];
      regras({ saidas: { 900: { valor } } });
      const r = await processar([linhaRetorno(900, "00", centavos)]);
      expect([valor, r.body.confirmados]).toEqual([valor, 1]);
    }
    mockConsultas = []; mockRegras = [];
    regras({ saidas: { 900: { valor: 0.29 } } });
    expect((await processar([linhaRetorno(900, "00", 28)])).body.divergentes[0].motivos[0].codigo).toBe("VALOR_PAGO_DIFERENTE");
  });
  test("valor AUSENTE (zeros ou brancos — o banco não preencheu): DIVERGENTE 'não informou' — NUNCA vale como igual", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", 0), linhaRetorno(901, "00", ""), linhaRetorno(902, "00", "000000000000000")]);
    expect(r.body.confirmados).toBe(0);
    expect(r.body.divergentes.map(d => [d.saidaId, d.motivos.map(m => m.codigo)])).toEqual([[900, ["VALOR_PAGO_NAO_INFORMADO"]], [901, ["VALOR_PAGO_NAO_INFORMADO"]], [902, ["VALOR_PAGO_NAO_INFORMADO"]]]);
    expect(r.body.divergentes[0].motivos[0].mensagem).toBe("O arquivo de retorno não informou o valor efetivamente pago — confira o extrato do banco antes de reconhecer este pagamento.");
    expect(pagas()).toEqual([]);
  });
  test("valor ILEGÍVEL (letras, vírgula, brancos no meio): DIVERGENTE — nunca vale como igual", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", "00000000010A000"), linhaRetorno(901, "00", "000000001,00   "), linhaRetorno(902, "00", "0000000 0010000"), linhaRetorno(903, "00", "-00000000010000")]);
    expect(r.body.confirmados).toBe(0);
    expect(r.body.divergentes.map(d => d.motivos.map(m => m.codigo))).toEqual([["VALOR_PAGO_NAO_INFORMADO"], ["VALOR_PAGO_NAO_INFORMADO"], ["VALOR_PAGO_NAO_INFORMADO"], ["VALOR_PAGO_NAO_INFORMADO"]]);
    expect(r.body.divergentes[0].motivos[0].mensagem).toBe("O arquivo de retorno trouxe o valor pago ilegível — confira o extrato do banco antes de reconhecer este pagamento.");
    expect(pagas()).toEqual([]);
  });
  test("rejeição do banco ('05') não olha o valor: continua FALHOU mesmo com valor diferente ou ausente (o dinheiro não saiu)", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "05", 1), linhaRetorno(901, "05", 0)]);
    expect(r.body).toMatchObject({ confirmados: 0, falharam: 2, divergentes: [] });
  });
  test("valor diferente E outro motivo (tutela): os dois ficam na lista, o do valor primeiro", async () => {
    regras({ mundoExtra: { tuteladas: [1] } });
    const r = await processar([linhaRetorno(900, "00", 5000)]);
    expect(r.body.divergentes[0].motivos.map(m => m.codigo)).toEqual(["VALOR_PAGO_DIFERENTE", "SOB_TUTELA"]);
  });
  test("no mesmo arquivo: o de valor igual é pago, o de valor diferente e o sem valor ficam DIVERGENTES", async () => {
    regras();
    const r = await processar([linhaRetorno(900, "00", 10000), linhaRetorno(901, "00", 10), linhaRetorno(902, "00", 0)]);
    expect(r.body).toMatchObject({ confirmados: 1, falharam: 0 });
    expect(r.body.divergentes.map(d => d.saidaId)).toEqual([901, 902]);
    expect(pagas()).toEqual([900]);
    expect(divergentes().map(c => c.inputs.id)).toEqual([1901, 1902]);
  });
  test("o pagamento na mão e a geração de remessa NÃO comparam valor (ainda não há o que o banco tenha pago)", async () => {
    const exec = { request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (t) => { for (const [p, v] of mockRegras) if (p.test(t)) return { recordset: typeof v === "function" ? v(inputs) : v, rowsAffected: [1] }; return { recordset: [], rowsAffected: [0] }; } }; return r; } };
    mundo();
    const saida = { saidaId: 1, congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "X", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "1", agencia: "1", conta: "1" };
    const conferidor = conferencia.criarConferidor(exec, new Proxy({}, { get: () => () => undefined }));
    expect(await conferidor.conferir(saida)).toEqual({ ok: true, motivos: [] });
    expect((await conferidor.conferir(saida, { valorPagoBanco: { centavos: 1, problema: null } })).motivos.map(m => m.codigo)).toEqual(["VALOR_PAGO_DIFERENTE"]);
  });
  test("centavosDe: reais com duas casas viram inteiro exato; lixo vira null", () => {
    expect(conferencia.centavosDe(100)).toBe(10000);
    expect(conferencia.centavosDe("123.45")).toBe(12345);
    expect(conferencia.centavosDe(0.29)).toBe(29);
    expect(conferencia.centavosDe(null)).toBeNull();
    expect(conferencia.centavosDe(undefined)).toBeNull();
    expect(conferencia.centavosDe("")).toBeNull();
    expect(conferencia.centavosDe("abc")).toBeNull();
  });
});

// =============================================================================================================================================================
// 8. Layout do retorno (cnab240.parsearRetornoCnab240): o valor efetivamente pago, lido do mesmo Segmento A que a remessa gera
// =============================================================================================================================================================
describe("cnab240 — valor efetivamente pago no Segmento A do retorno", () => {
  const cnab240 = require("../cnab240");
  const INST = { codigoBanco: "001", cnpj: "12345678000190", codigoConvenio: "99", agencia: "1234", digitoAgencia: "0", conta: "56789", digitoConta: "1", razaoSocial: "IEADESPA", nomeBanco: "BANCO" };
  const pag = (saidaId, valor) => ({ saidaId, valor, nomeFavorecido: `FORN ${saidaId}`, bancoFavorecido: "237", agenciaFavorecido: "1234", digitoAgenciaFavorecido: "", contaFavorecido: "98765", digitoContaFavorecido: "", });
  // O que o banco faz: devolve o MESMO arquivo, preenchendo a ocorrência (231-232) e o valor real da efetivação (177-191, centavos em 15 dígitos) de cada Segmento A.
  const retornoDoBanco = (arquivo, porSaida) => arquivo.split("\r\n").map(linha => {
    if (linha.length < 240 || linha.charAt(7) !== "3" || linha.charAt(13) !== "A") return linha;
    const saidaId = parseInt(linha.substring(72, 92), 10);
    const { ocorrencia, valorPago } = porSaida[saidaId];
    const l = linha.split("");
    String(valorPago).padStart(15, "0").split("").forEach((ch, i) => { l[176 + i] = ch; });
    String(ocorrencia).split("").forEach((ch, i) => { l[230 + i] = ch; });
    return l.join("");
  }).join("\r\n");

  test("o arquivo de remessa reserva o campo (15 zeros nas posições 177-191) e traz o valor pedido em 119-133 — o retorno do banco o preenche", () => {
    const arquivo = cnab240.gerarArquivoCnab240(INST, [pag(900, 123.45)], 1);
    const segmento = arquivo.split("\r\n").find(l => l.length === 240 && l.charAt(7) === "3" && l.charAt(13) === "A");
    expect(segmento.substring(118, 133)).toBe("000000000012345");           // valor do pagamento pedido
    expect(segmento.substring(cnab240.OFFSET_VALOR_PAGO, cnab240.OFFSET_VALOR_PAGO + cnab240.TAMANHO_VALOR_PAGO)).toBe("000000000000000"); // valor real da efetivação: ainda zerado
    expect([cnab240.OFFSET_VALOR_PAGO, cnab240.TAMANHO_VALOR_PAGO]).toEqual([176, 15]);
    // o arquivo gerado, devolvido sem o banco preencher, NÃO traz valor pago: ausente (e a ocorrência em branco já não confirma)
    expect(cnab240.parsearRetornoCnab240(arquivo)).toEqual([{ saidaId: 900, sucesso: false, codigoOcorrencia: "", valorPagoCentavos: null, valorPagoProblema: "AUSENTE" }]);
  });
  test("retorno de exemplo completo (header de arquivo/lote, dois Segmentos A, trailers): extrai id, ocorrência e valor pago em centavos de cada pagamento", () => {
    const remessa = cnab240.gerarArquivoCnab240(INST, [pag(900, 123.45), pag(901, 0.29), pag(902, 1000000)], 7);
    expect(remessa.split("\r\n").filter(l => l.length === 240)).toHaveLength(7); // header arquivo + header lote + 3 segmentos A + trailer lote + trailer arquivo
    const retorno = retornoDoBanco(remessa, { 900: { ocorrencia: "00", valorPago: 12345 }, 901: { ocorrencia: "00", valorPago: 29 }, 902: { ocorrencia: "05", valorPago: 0 } });
    expect(cnab240.parsearRetornoCnab240(retorno)).toEqual([
      { saidaId: 900, sucesso: true, codigoOcorrencia: "00", valorPagoCentavos: 12345, valorPagoProblema: null },
      { saidaId: 901, sucesso: true, codigoOcorrencia: "00", valorPagoCentavos: 29, valorPagoProblema: null },
      { saidaId: 902, sucesso: false, codigoOcorrencia: "05", valorPagoCentavos: null, valorPagoProblema: "AUSENTE" }
    ]);
  });
  test("o valor pago é lido em posição própria: valor do pagamento pedido (119-133) preenchido e valor real (177-191) zerado = AUSENTE (o pedido não prova o pago)", () => {
    const linha = cnab240.gerarArquivoCnab240(INST, [pag(900, 50)], 1).split("\r\n").find(l => l.length === 240 && l.charAt(13) === "A");
    const comOcorrencia = linha.substring(0, 230) + "00" + linha.substring(232);
    expect(cnab240.parsearRetornoCnab240(comOcorrencia)[0]).toMatchObject({ sucesso: true, valorPagoCentavos: null, valorPagoProblema: "AUSENTE" });
  });
  test("lerValorPagoCentavos: dígitos viram inteiro; brancos/zeros = AUSENTE; qualquer outra coisa = ILEGIVEL; nunca devolve número para texto estranho", () => {
    const comCampo = (campo) => " ".repeat(176) + campo + " ".repeat(240 - 176 - 15);
    expect(cnab240.lerValorPagoCentavos(comCampo("000000000012345"))).toEqual({ centavos: 12345, problema: null });
    expect(cnab240.lerValorPagoCentavos(comCampo("999999999999999"))).toEqual({ centavos: 999999999999999, problema: null });
    expect(cnab240.lerValorPagoCentavos(comCampo("000000000000001"))).toEqual({ centavos: 1, problema: null });
    for (const vazio of ["               ", "000000000000000"]) expect(cnab240.lerValorPagoCentavos(comCampo(vazio))).toEqual({ centavos: null, problema: "AUSENTE" });
    for (const lixo of ["00000000012,45 ", "0000000001234X5", "-00000000012345", "00000000 012345", "0000000012345  ", "  000000012345 ", "000000000012.45", "０００００００００１２３４５"]) {
      expect(cnab240.lerValorPagoCentavos(comCampo(lixo))).toEqual({ centavos: null, problema: "ILEGIVEL" });
    }
  });
  test("linha de retorno curta demais (truncada) é ignorada, como sempre — não vira valor", () => {
    const remessa = cnab240.gerarArquivoCnab240(INST, [pag(900, 10)], 1);
    const truncado = remessa.split("\r\n").map(l => (l.charAt(13) === "A" && l.charAt(7) === "3" ? l.slice(0, 200) : l)).join("\r\n");
    expect(cnab240.parsearRetornoCnab240(truncado)).toEqual([]);
  });
});

// =============================================================================================================================================================
// 9. Mudança de situação da Saída: o estado esperado vai no WHERE e as linhas afetadas são conferidas (APROVAR, REJEITAR) — antes só PAGAR e CANCELAR faziam isso
// =============================================================================================================================================================
describe("GestaoSaidas — APROVAR e REJEITAR não sobrescrevem uma mudança simultânea", () => {
  const REGISTRO = { SaidaId: 10, CongregacaoId: 1, congregacaoNome: "A", centroCusto: "LOCAL", Status: "PENDENTE", Valor: 100, FornecedorId: 5, SolicitadoPor: 6, Tipo: "MANUTENCAO" };
  // `votos`: o que cada consulta "este aprovador já votou?" devolve, na ordem (a de fora da transação e a de dentro, com a linha travada).
  const regras = ({ registro = {}, travada = "PENDENTE", votos = [false, false], quantidade = 1, nivelMinimo = "CONGREGACAO", total = 1, afetadas = 1, erroInsert = null, afetadasRejeicao = 1 } = {}) => {
    quando(/SELECT s\.\*, c\.Nome AS congregacaoNome/, [{ ...REGISTRO, ...registro }]);
    let consulta = 0;
    quando(/SELECT 1 FROM SaidaAprovacoes/, () => (votos[Math.min(consulta++, votos.length - 1)] ? [{ x: 1 }] : []));
    quando(/FROM AlcadasAprovacao/, [{ NivelMinimoAprovador: nivelMinimo, QuantidadeAprovadores: quantidade }]);
    quando(/SELECT Status FROM SaidasTesouraria WITH \(UPDLOCK, HOLDLOCK\)/, travada === null ? [] : [{ Status: travada }]);
    quando(/INSERT INTO SaidaAprovacoes/, () => { if (erroInsert) throw erroInsert; return []; });
    quando(/SELECT COUNT\(\*\) AS total FROM SaidaAprovacoes/, [{ total }]);
    quando(/UPDATE SaidasTesouraria SET Status = 'APROVADA'/, [], afetadas);
    quando(/UPDATE SaidasTesouraria SET Status = 'REJEITADA'/, [], afetadasRejeicao);
  };
  const aprovar = () => chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo: { acao: "APROVAR" } });
  const rejeitar = () => chamar(hSaidas, { metodo: "PUT", token: geral(), ligado: { id: "10" }, corpo: { acao: "REJEITAR", motivo: "valor fora do orçamento" } });
  const MUDOU = "Esta solicitação mudou de situação (foi aprovada, rejeitada ou cancelada) enquanto você aprovava — atualize a lista. Sua aprovação NÃO foi registrada.";

  test("última aprovação: BEGIN, linha travada, voto, contagem, UPDATE com o estado esperado no WHERE, COMMIT — tudo na transação e nessa ordem", async () => {
    regras();
    const r = await aprovar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Última aprovação necessária registrada — solicitação APROVADA, pronta pra pagamento." });
    const ordem = [/<<BEGIN>>/, /SELECT Status FROM SaidasTesouraria WITH \(UPDLOCK, HOLDLOCK\)/, /INSERT INTO SaidaAprovacoes/, /SELECT COUNT\(\*\) AS total FROM SaidaAprovacoes/, /UPDATE SaidasTesouraria SET Status = 'APROVADA'/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[5]).every(c => c.emTransacao)).toBe(true);
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'APROVADA'/)[0].sql).toMatch(/WHERE SaidaId = @id AND Status = 'PENDENTE'/);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "Aprovou solicitação de pagamento", dadosDepois: { totalAprovacoes: 1, exigido: 1, quatroOlhos: false } });
  });
  test("aprovação intermediária (1 de 2): o voto fica gravado e a Saída segue PENDENTE (nenhum UPDATE de situação)", async () => {
    regras({ quantidade: 2, total: 1 });
    const r = await aprovar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Aprovação registrada (1 de 2 exigida(s))." });
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
    expect(rodou(/INSERT INTO SaidaAprovacoes/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("quatro olhos: valor a partir do crítico exige DUAS aprovações mesmo com a alçada pedindo uma, e a regra de alçada/segregação continua igual", async () => {
    quando(/FROM ParametrosCompliance/, [{ ValorCriticoQuatroOlhos: 100, PeriodicidadeRecertificacaoMeses: 3 }]);
    regras({ quantidade: 1, total: 1 });
    const r = await aprovar();
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Aprovação registrada (1 de 2 exigida(s) — quatro olhos)." });
    expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
  });
  test("a Saída foi cancelada (ou rejeitada/aprovada) entre a leitura e a trava: recusa com a mensagem clara, ROLLBACK, NENHUM voto gravado e sem auditoria", async () => {
    for (const situacao of ["CANCELADA", "REJEITADA", "APROVADA", "PAGA", null]) {
      mockConsultas = []; mockRegras = []; registrarAuditoria.mockClear();
      regras({ travada: situacao });
      const r = await aprovar();
      expect(r.body).toEqual({ sucesso: false, mensagem: MUDOU });
      expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
      expect(rodou(/INSERT INTO SaidaAprovacoes/)).toHaveLength(0);
      expect(rodou(/UPDATE SaidasTesouraria/)).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    }
  });
  test("o UPDATE para APROVADA não pega a linha (a situação mudou apesar da trava): ROLLBACK do voto também, sem COMMIT e sem auditoria", async () => {
    regras({ afetadas: 0 });
    const r = await aprovar();
    expect(r.body).toEqual({ sucesso: false, mensagem: MUDOU });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o mesmo aprovador não vota duas vezes: já votou na leitura de fora, já votou na leitura travada (duplo clique) ou o banco recusa o voto repetido (índice único)", async () => {
    const JA = { sucesso: false, mensagem: "Você já registrou sua aprovação para esta solicitação." };
    regras({ votos: [true] });
    expect((await aprovar()).body).toEqual(JA);
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
    mockConsultas = []; mockRegras = [];
    regras({ votos: [false, true] });
    expect((await aprovar()).body).toEqual(JA);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/INSERT INTO SaidaAprovacoes/)).toHaveLength(0);
    mockConsultas = []; mockRegras = []; registrarAuditoria.mockClear();
    const duplicado = Object.assign(new Error("Violation of UNIQUE KEY constraint 'UQ_SaidaAprovacao_Pessoa'"), { number: 2627 });
    regras({ erroInsert: duplicado });
    const r = await aprovar();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(JA);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("erro inesperado do banco: ROLLBACK, 500 genérico sem vazar o erro interno, sem auditoria", async () => {
    regras({ erroInsert: new Error("deadlock victim segredo-interno") });
    const r = await aprovar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("as recusas de antes continuam sem abrir transação: quem solicitou não aprova a própria, Saída que já não está pendente na leitura, faixa que exige nível maior", async () => {
    regras({ registro: { SolicitadoPor: 5 } });
    expect((await aprovar()).body.mensagem).toBe("Quem solicitou o pagamento não pode aprovar a própria solicitação — segregação de funções.");
    mockConsultas = []; mockRegras = [];
    regras({ registro: { Status: "CANCELADA" } });
    expect((await aprovar()).body.mensagem).toBe("Esta solicitação não está mais pendente de aprovação.");
    mockConsultas = []; mockRegras = [];
    regras({ nivelMinimo: "GLOBAL", registro: { SolicitadoPor: 99 } });
    const ate =await chamar(hSaidas, { metodo: "PUT", token: local(["A"]), ligado: { id: "10" }, corpo: { acao: "APROVAR" } });
    expect(ate.body.mensagem).toBe("Esta faixa de valor exige aprovador de nível GLOBAL ou superior.");
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  test("REJEITAR: o estado esperado (PENDENTE) vai no WHERE; se a aprovação/cancelamento chegou antes, a rejeição é recusada e não sobrescreve", async () => {
    regras();
    const ok = await rejeitar();
    expect(ok.body).toEqual({ sucesso: true, mensagem: "Solicitação rejeitada." });
    expect(rodou(/UPDATE SaidasTesouraria SET Status = 'REJEITADA'/)[0].sql).toMatch(/WHERE SaidaId = @id AND Status = 'PENDENTE'/);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    mockConsultas = []; mockRegras = []; registrarAuditoria.mockClear();
    regras({ afetadasRejeicao: 0 });
    const perdeu = await rejeitar();
    expect(perdeu.body).toEqual({ sucesso: false, mensagem: "Esta solicitação mudou de situação (foi aprovada, rejeitada ou cancelada) enquanto você rejeitava — atualize a lista." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

// =============================================================================================================================================================
// 10. Os mesmos cuidados nas demais transições do financeiro: baixa/cancelamento de conta a receber, vínculo da receita acessória, itens e baixa do retorno
// =============================================================================================================================================================
describe("transições sem estado no WHERE que sobravam — agora com o estado e as linhas afetadas conferidas", () => {
  const hContas = require("../../GestaoContasReceber/index.js");
  const hReceitas = require("../../GestaoReceitasAcessorias/index.js");
  const CONTA = { ContaReceberId: 31, CongregacaoId: 1, congregacaoNome: "A", Status: "PREVISTO", Valor: 100, Tipo: "CESSAO_TEMPLO", Descricao: "Taxa", DizimistaId: null, NomeAvulso: "Maria", CampanhaId: null };
  const regrasConta = ({ linhasBaixa = 1, linhasCancelamento = 1 } = {}) => {
    quando(/SELECT cr\.\*, c\.Nome AS congregacaoNome/, [CONTA]);
    quando(/SELECT Status FROM ContasAReceber WITH \(UPDLOCK, HOLDLOCK\)/, [{ Status: "PREVISTO" }]);
    quando(/MAX\(TermoNumero\)/, [{ proximo: 8 }]);
    quando(/INSERT INTO LancamentosTesouraria/, [{ LancamentoId: 900 }]);
    quando(/UPDATE ContasAReceber SET Status = 'RECEBIDO'/, [], linhasBaixa);
    quando(/UPDATE ContasAReceber SET Status = 'CANCELADO'/, [], linhasCancelamento);
    quando(/UPDATE ReceitasAcessorias SET CanceladaEm/, [], 1);
  };
  const RECUSA_CONTA = { sucesso: false, mensagem: "Esta conta a receber já foi confirmada ou cancelada." };

  test("CONFIRMAR conta a receber: se a baixa não pega a linha, o lançamento recém-criado é desfeito junto (ROLLBACK, sem COMMIT, sem auditoria)", async () => {
    regrasConta({ linhasBaixa: 0 });
    const r = await chamar(hContas, { metodo: "PUT", token: geral(), ligado: { id: "31" }, corpo: { acao: "CONFIRMAR", formaPagamento: "DINHEIRO", mesReferencia: "2026-10" } });
    expect(r.body).toEqual(RECUSA_CONTA);
    expect(rodou(/INSERT INTO LancamentosTesouraria/)).toHaveLength(1);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("CANCELAR conta a receber: se o cancelamento não pega a linha, nada é gravado (nem a receita acessória)", async () => {
    regrasConta({ linhasCancelamento: 0 });
    const r = await chamar(hContas, { metodo: "PUT", token: geral(), ligado: { id: "31" }, corpo: { acao: "CANCELAR", motivo: "acordo desfeito" } });
    expect(r.body).toEqual(RECUSA_CONTA);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/UPDATE ReceitasAcessorias/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("receita acessória: o vínculo da Saída leva 'não cancelada' no WHERE; se a receita foi cancelada no meio, nada é vinculado", async () => {
    quando(/SELECT \* FROM ReceitasAcessorias WHERE ReceitaAcessoriaId = @id/, [{ ReceitaAcessoriaId: 1, CanceladaEm: null }]);
    quando(/UPDATE ReceitasAcessorias SET SaidaId/, [], 1);
    const ok = await chamar(hReceitas, { metodo: "PUT", token: geral(), corpo: { id: 1, saidaId: 9 } });
    expect(ok.body).toEqual({ sucesso: true, mensagem: "✅ Comprovação vinculada." });
    expect(rodou(/UPDATE ReceitasAcessorias SET SaidaId/)[0].sql).toMatch(/WHERE ReceitaAcessoriaId = @id AND CanceladaEm IS NULL/);
    mockConsultas = []; mockRegras = []; registrarAuditoria.mockClear();
    quando(/SELECT \* FROM ReceitasAcessorias WHERE ReceitaAcessoriaId = @id/, [{ ReceitaAcessoriaId: 1, CanceladaEm: null }]);
    quando(/UPDATE ReceitasAcessorias SET SaidaId/, [], 0);
    const perdeu = await chamar(hReceitas, { metodo: "PUT", token: geral(), corpo: { id: 1, saidaId: 9 } });
    expect(perdeu.body).toEqual({ sucesso: false, mensagem: "Esta receita acessória mudou de situação (foi cancelada) enquanto você vinculava — atualize a lista." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("tratar a divergência: se o UPDATE do item não pega a linha (não deveria: ela está travada), ROLLBACK de tudo — a baixa da Saída também — sem COMMIT e sem auditoria", async () => {
    quando(/sp_getapplock/, [{ resultado: 0 }]);
    quando(/FROM RemessaItens ri WITH \(UPDLOCK, HOLDLOCK\)/, [{ RemessaItemId: 5, SaidaId: 900, Status: "DIVERGENTE", ArquivoRetornoUrl: "https://blob/ret" }]);
    quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, [{ saidaId: 900, status: "APROVADA" }]);
    quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], 1);
    quando(/UPDATE RemessaItens SET Status = @status/, [], 0);
    const r = await chamar(hRemessas, { metodo: "PUT", token: geral(), ligado: { id: "77" }, corpo: { acao: "TRATAR_DIVERGENCIA", remessaItemId: 5, resolucao: "RECONHECER_PAGAMENTO", observacao: "conferi o extrato do banco" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Este item mudou de situação enquanto era tratado — atualize a tela." });
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  describe("retorno do banco", () => {
    const SAIDA = { congregacaoId: 1, valor: 100, status: "APROVADA", tipo: "MANUTENCAO", campanhaId: null, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true, banco: "001", agencia: "1", conta: "2" };
    const regras = ({ linhasPaga = 1 } = {}) => {
      quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 77, Status: "GERADA" }]);
      quando(/FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'/, (i) => [{ RemessaItemId: 1000 + i.saidaId, SaidaId: i.saidaId }]);
      quando(/SELECT RemessaItemId, SaidaId FROM RemessaItens WHERE RemessaId = @remessaId AND Status = 'PENDENTE'/, []);
      quando(/sp_getapplock/, [{ resultado: 0 }]);
      quando(/FROM SaidasTesouraria sa WITH \(UPDLOCK, HOLDLOCK\)/, (i) => [{ saidaId: i.saidaId, ...SAIDA }]);
      quando(/UPDATE SaidasTesouraria SET Status = 'PAGA'/, [], linhasPaga);
      quando(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/, [], 1);
      mundo();
    };
    const processar = (linhas) => chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: Buffer.from(linhas.join("\r\n"), "utf-8").toString("base64"), mimeType: "text/plain" } });

    test("os UPDATEs dos itens (PROCESSADO, FALHOU, DIVERGENTE) só valem para item ainda PENDENTE", async () => {
      regras();
      await processar([linhaRetorno(900, "00"), linhaRetorno(901, "05"), linhaRetorno(902, "00", 1)]);
      expect(rodou(/UPDATE RemessaItens SET Status = 'PROCESSADO'/)[0].sql).toMatch(/WHERE RemessaItemId = @id AND Status = 'PENDENTE'/);
      expect(rodou(/UPDATE RemessaItens SET Status = 'FALHOU'/)[0].sql).toMatch(/WHERE RemessaItemId = @id AND Status = 'PENDENTE'/);
      expect(rodou(/UPDATE RemessaItens SET Status = 'DIVERGENTE'/)[0].sql).toMatch(/WHERE RemessaItemId = @id AND Status = 'PENDENTE'/);
    });
    test("a baixa da Saída não pega a linha (não deveria, a linha está travada): o retorno INTEIRO é desfeito — nada fica meio processado, 500 genérico, sem auditoria", async () => {
      regras({ linhasPaga: 0 });
      const r = await processar([linhaRetorno(900, "00")]);
      expect(r.status).toBe(500);
      expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
      expect(rodou(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/)).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================================================================================================
// 11. Migração 135 (Fornecedores.Ativo garantida): roda a CADA deploy sobre dados de produção que ninguém vê daqui, então a regra de segurança é testada no TEXTO
// =============================================================================================================================================================
describe("migração 135 — a coluna Fornecedores.Ativo existe (a conferência nova a lê)", () => {
  const fs = require("fs");
  const path = require("path");
  const pasta = path.join(__dirname, "..", "..", "..", "sql", "migrations");
  const nome = fs.readdirSync(pasta).find(n => n.startsWith("135_"));
  const texto = nome ? fs.readFileSync(path.join(pasta, nome), "utf8") : "";
  const semComentarios = texto.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join("\n");
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const lotes = semComentarios.split(/^\s*GO\s*$/gim).map(l => l.trim()).filter(Boolean);

  test("existe, é um lote só e só ACRESCENTA a coluna quando falta (guarda COL_LENGTH ... IS NULL), com DEFAULT 1 (toda linha existente nasce ativa)", () => {
    expect(nome).toBe("135_fornecedor_ativo_garantido.sql");
    expect(lotes).toHaveLength(1);
    const lote = norm(lotes[0]);
    expect(lote).toContain("IF OBJECT_ID(N'dbo.Fornecedores', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Fornecedores', N'Ativo') IS NULL");
    expect(lote).toContain("ALTER TABLE dbo.Fornecedores ADD Ativo BIT NOT NULL CONSTRAINT DF_Fornecedores_Ativo DEFAULT 1;");
    expect(lote.indexOf("COL_LENGTH")).toBeLessThan(lote.indexOf("ALTER TABLE"));
  });
  test("a criação vai em TRY/CATCH: falhar vira AVISO (só a mensagem do banco, nunca dado de pessoa) e o deploy segue", () => {
    const lote = norm(lotes[0]);
    const inicio = lote.indexOf("BEGIN TRY");
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(lote.indexOf("ALTER TABLE")).toBeGreaterThan(inicio);
    expect(lote.indexOf("ALTER TABLE")).toBeLessThan(lote.indexOf("END TRY"));
    expect(lote).toContain("BEGIN CATCH PRINT N'AVISO migração 135: coluna Fornecedores.Ativo NÃO criada — ' + ERROR_MESSAGE(); END CATCH");
    expect(lote).not.toMatch(/RAISERROR|THROW/i);
  });
  test("nunca apaga nem altera linha: sem DELETE, UPDATE, INSERT, TRUNCATE, DROP nem ALTER COLUMN", () => {
    expect(semComentarios).not.toMatch(/\b(DELETE|UPDATE|INSERT|TRUNCATE|DROP|MERGE)\b/i);
    expect(semComentarios).not.toMatch(/ALTER\s+COLUMN/i);
    expect((semComentarios.match(/ALTER\s+TABLE/gi) || [])).toHaveLength(1);
  });
});
