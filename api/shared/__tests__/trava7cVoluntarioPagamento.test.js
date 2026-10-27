// Trava 7-C — decisão de 23/10/2026: as regras de dinheiro do voluntário (Regimento Art. 133 §4º, Art. 135 §2º e §3º; Lei 9.608/98) só AVISAM o tesoureiro.
// A regra pura (shared/voluntarioPagamento.js), a ligação do fornecedor pessoa física à matrícula (GestaoFornecedores), o aviso que precisa ser lido e confirmado antes de a
// saída ser gravada e a gravação junto com os avisos (GestaoSaidas), o detalhe que mostra os avisos, o resumo do mês, Meus Dados, o ROPA e a migração 155.
// O banco é simulado pelo TEXTO da consulta; contra o SQL Server de verdade: tools/e2e-localdb/e2e-43 e e2e-45/46.
let mockRegras = [];
let mockConsultas = [];
function mockExecutar(texto, inputs) {
  mockConsultas.push({ sql: texto, inputs: { ...inputs } });
  for (const [padrao, valor, afetadas] of mockRegras) {
    if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
  }
  return { recordset: [], rowsAffected: [/^\s*(UPDATE|DELETE|INSERT|MERGE)/i.test(texto) ? 1 : 0] };
}
jest.mock("../db", () => {
  const criarRequest = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => mockExecutar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return criarRequest(); } }
  const sqlFalso = new Proxy({ Transaction, Request, MAX: -1 }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : () => undefined) });
  return { getPool: async () => ({ request: criarRequest }), sql: sqlFalso };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://blob/doc-1") }));

const fs = require("fs");
const path = require("path");
const auth = require("../auth");
const vp = require("../voluntarioPagamento");
const vpDb = require("../voluntarioPagamentoDb");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const { DETECTORES } = require("../notificacaoDetectores");
const { REGISTROS_TRATAMENTO } = require("../ropa");
const hSaidas = require("../../GestaoSaidas/index.js");
const hFornecedores = require("../../GestaoFornecedores/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE|SET XACT_ABORT)/i.test(c.sql));
const tokenDe = (extra = {}) => auth.reassinarSessao({ membroId: 5, via: "SENHA", termosPendentes: [], nivel: "CONGREGACAO", escopoCongregacoes: ["A"], permissoes: ["financeiro"], ...extra });
const GERAL = (extra = {}) => tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", ...extra });
const LOCAL = (nomes = ["A"]) => tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: nomes });
async function chamar(handler, { metodo = "GET", corpo, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
beforeEach(() => { mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); storage.salvarDocumento.mockClear(); });

const HOJE = "2026-10-23";   // sexta-feira

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("a regra pura (shared/voluntarioPagamento.js)", () => {
  const base = { pessoaFisica: true, prebendado: false, voluntario: false, datasPagamentos: [], limite: 3, janela: 60, descricao: "Serviço de limpeza" };
  test("pessoa jurídica nunca recebe aviso (nem voluntário, nem habitualidade, nem cachê)", () => {
    expect(vp.avaliarAvisos({ ...base, pessoaFisica: false, voluntario: true, datasPagamentos: ["2026-10-01", "2026-10-08", "2026-10-15"], descricao: "cachê" }, { hoje: HOJE })).toEqual([]);
  });
  test("voluntário ativo: o aviso cita a Lei 9.608/98, o Art. 135 e a Ordem de Serviço prévia do Art. 133 §4º", () => {
    const a = vp.avaliarAvisos({ ...base, voluntario: true }, { hoje: HOJE });
    expect(a.map((x) => x.codigo)).toEqual(["VOLUNTARIO_ATIVO"]);
    expect(a[0].texto).toMatch(/9\.608\/98/);
    expect(a[0].texto).toMatch(/Art\. 135/);
    expect(a[0].texto).toMatch(/Ordem de Serviço prévia \(Regimento Art\. 133 §4º\)/);
  });
  test("habitualidade: 3 semanas diferentes CONTANDO este pagamento acendem; duas na mesma semana contam uma", () => {
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: ["2026-10-06", "2026-10-13"] }, { hoje: HOJE })[0].codigo).toBe("HABITUALIDADE");
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: ["2026-10-19", "2026-10-21"] }, { hoje: HOJE })).toEqual([]);   // a mesma semana de hoje
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: ["2026-10-13"] }, { hoje: HOJE })).toEqual([]);
    const t = vp.avaliarAvisos({ ...base, datasPagamentos: ["2026-09-29", "2026-10-06", "2026-10-13"] }, { hoje: HOJE })[0].texto;
    expect(t).toMatch(/4 semanas diferentes nos últimos 60 dias/);
    expect(t).toMatch(/diarista disfarçada/);
    expect(t).toMatch(/Art\. 135 §2º/);
  });
  test("habitualidade vale para qualquer pessoa física (membro ou não), mas nunca para o ministro com prebenda", () => {
    const datas = ["2026-10-06", "2026-10-13"];
    expect(vp.avaliarAvisos({ ...base, membroId: null, datasPagamentos: datas }, { hoje: HOJE }).map((x) => x.codigo)).toEqual(["HABITUALIDADE"]);
    expect(vp.avaliarAvisos({ ...base, prebendado: true, datasPagamentos: datas }, { hoje: HOJE })).toEqual([]);
  });
  test("o limite e a janela vêm do parâmetro (e lixo vira o padrão 3/60)", () => {
    const datas = ["2026-10-06", "2026-10-13"];
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: datas, limite: 4 }, { hoje: HOJE })).toEqual([]);
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: datas, limite: "abc" }, { hoje: HOJE })[0].codigo).toBe("HABITUALIDADE");
    expect(vp.avaliarAvisos({ ...base, datasPagamentos: datas, janela: 30 }, { hoje: HOJE })[0].texto).toMatch(/últimos 30 dias/);
  });
  test("cachê ou comissão na descrição: só para voluntário, com e sem acento, plural e variações", () => {
    for (const d of ["Cachê do cantor", "cache banda", "CACHÊS", "comissão da cantina", "comissionamento bazar", "Comissoes"]) {
      expect(vp.temPalavraCacheComissao(d)).toBe(true);
      expect(vp.avaliarAvisos({ ...base, voluntario: true, descricao: d }, { hoje: HOJE }).map((x) => x.codigo)).toEqual(["VOLUNTARIO_ATIVO", "CACHE_COMISSAO"]);
      expect(vp.avaliarAvisos({ ...base, voluntario: false, descricao: d }, { hoje: HOJE })).toEqual([]);
    }
    for (const d of ["cachorro-quente", "comissária", "Comissão de Finanças", null]) {
      // "Comissão" (órgão) também acende: o sistema avisa, quem lança confere — o falso positivo custa um clique; o falso negativo, a regra
      expect(vp.temPalavraCacheComissao(d)).toBe(/Comissão/.test(String(d)));
    }
    expect(vp.avaliarAvisos({ ...base, voluntario: true, descricao: "comissão" }, { hoje: HOJE })[1].texto).toMatch(/Art\. 135 §3º/);
  });
  test("semanas: segunda a domingo; data inválida não conta", () => {
    expect(vp.semanaDe("2026-10-19")).toBe(vp.semanaDe("2026-10-25"));      // segunda e domingo
    expect(vp.semanaDe("2026-10-26")).toBe(vp.semanaDe("2026-10-25") + 1);   // a segunda seguinte
    expect(vp.semanaDe("lixo")).toBeNull();
    expect(vp.semanasDistintas(["lixo", null, "2026-10-01"], HOJE)).toBe(2);
  });
  test("a confirmação: só códigos conhecidos; todos os avisos de AGORA precisam estar confirmados", () => {
    const avisos = [{ codigo: "VOLUNTARIO_ATIVO" }, { codigo: "HABITUALIDADE" }];
    expect(vp.todosConfirmados(avisos, ["VOLUNTARIO_ATIVO", "HABITUALIDADE"])).toBe(true);
    expect(vp.todosConfirmados(avisos, ["VOLUNTARIO_ATIVO"])).toBe(false);
    expect(vp.todosConfirmados(avisos, "VOLUNTARIO_ATIVO,HABITUALIDADE")).toBe(false);
    expect(vp.todosConfirmados(avisos, [true, { codigo: "HABITUALIDADE" }, "VOLUNTARIO_ATIVO"])).toBe(false);
    expect(vp.codigosConfirmados(["X", "HABITUALIDADE", "HABITUALIDADE", 5])).toEqual(["HABITUALIDADE"]);
    expect(vp.todosConfirmados([], undefined)).toBe(true);
  });
  test("o resumo do mês lista as pessoas e os rótulos, cabe em 1000 caracteres", () => {
    const casos = Array.from({ length: 30 }, (_, i) => ({ fornecedorNome: `Pessoa ${String(i).padStart(2, "0")} ${"x".repeat(40)}`, codigos: ["VOLUNTARIO_ATIVO", "HABITUALIDADE"] }));
    const t = vp.textoResumoMensal(casos, 60);
    expect(t.length).toBeLessThanOrEqual(1000);
    expect(t).toMatch(/^30 pessoa\(s\) receberam pagamentos com aviso nos últimos 60 dias: Pessoa 00/);
    expect(t).toMatch(/Pessoa voluntária, Pagamento habitual à mesma pessoa/);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoSaidas — o aviso precisa ser lido e confirmado; a saída e os avisos entram juntos", () => {
  const CORPO = (extra = {}) => ({ congregacaoId: 1, fornecedorId: 9, tipo: "LIMPEZA", descricao: "Limpeza do templo", valor: 150, documentoFiscalBase64: Buffer.from("pdf").toString("base64"), mimeType: "application/pdf", ...extra });
  function cenario({ tipo = "PF", membroId = 40, prebendado = 0, voluntario = 1, datas = [], dias = { TESOURARIA_HABITUAL_PAGAMENTOS: 3, TESOURARIA_HABITUAL_JANELA_DIAS: 60 } } = {}) {
    quando(/FROM ParametrosSaida/, [{ ValorReferenciaCotacoes: 100000 }]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "A" }]);
    quando(/FROM CategoriasSaida WHERE Codigo = @codigo/, [{ Codigo: "LIMPEZA", CentroCusto: "GERAL", TipoFundo: "LIVRE" }]);
    quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ FornecedorId: 9, Ativo: true, DadosBancariosConfirmados: true, Tipo: tipo }]);
    quando(/SELECT COUNT\(\*\) AS total FROM SaidasTesouraria/, [{ total: 0 }]);
    quando(/SELECT f\.FornecedorId, f\.Tipo, f\.MembroId/, [{ FornecedorId: 9, Tipo: tipo, MembroId: membroId, Prebendado: prebendado }]);
    quando(/FROM Prazos WHERE Sigla = @sigla/, (inp) => [{ Dias: dias[inp.sigla] }]);
    quando(/DATEADD\(HOUR, -3, s\.SolicitadoEm\)/, datas.map((d) => ({ Data: d })));
    quando(/AS Voluntario/, [{ Voluntario: voluntario }]);
    quando(/SET XACT_ABORT ON/, [{ SaidaId: 77 }]);
    quando(/FROM SaidaAvisosVoluntario a JOIN MembroReferencia/, []);
  }

  test("voluntário ativo: a primeira tentativa NÃO grava nem sobe o arquivo — devolve os avisos para a tela", async () => {
    cenario();
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: false, precisaConfirmarAvisos: true });
    expect(r.body.avisos.map((a) => a.codigo)).toEqual(["VOLUNTARIO_ATIVO"]);
    expect(r.body.avisos[0]).toMatchObject({ rotulo: "Pessoa voluntária" });
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("com a confirmação de todos os avisos: grava a saída e os avisos NUMA transação (XACT_ABORT), com quem confirmou; a auditoria e a mensagem registram", async () => {
    cenario({ datas: ["2026-10-06", "2026-10-13"] });
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL({ membroId: 31 }), corpo: CORPO({ descricao: "cachê do louvor", confirmoAvisos: ["VOLUNTARIO_ATIVO", "HABITUALIDADE", "CACHE_COMISSAO"] }) });
    expect(r.status).toBe(201);
    expect(r.body.saidaId).toBe(77);
    expect(r.body.mensagem).toMatch(/3 aviso\(s\) sobre esta pessoa ficaram registrados/);
    const lote = rodou(/SET XACT_ABORT ON/);
    expect(lote).toHaveLength(1);
    expect(lote[0].sql).toMatch(/BEGIN TRANSACTION[\s\S]*INSERT INTO SaidasTesouraria[\s\S]*INSERT INTO SaidaAvisosVoluntario[\s\S]*COMMIT TRANSACTION/);
    expect(lote[0].inputs.solicitadoPor).toBe(31);
    const avisos = JSON.parse(lote[0].inputs.avisos);
    expect(avisos.map((a) => a.codigo)).toEqual(["VOLUNTARIO_ATIVO", "HABITUALIDADE", "CACHE_COMISSAO"]);
    expect(avisos[1].texto).toMatch(/3 semanas diferentes/);
    expect(rodou(/INSERT INTO SaidasTesouraria/).filter((c) => !/SET XACT_ABORT/.test(c.sql))).toHaveLength(0);   // não sobrou o INSERT solto de antes
    const aud = registrarAuditoria.mock.calls.map((c) => c[0]).find((a) => a.acao === "Solicitou pagamento");
    expect(aud.dadosDepois.avisosConfirmados).toEqual(["VOLUNTARIO_ATIVO", "HABITUALIDADE", "CACHE_COMISSAO"]);
  });
  test("confirmação parcial (ou de um aviso que não é o de agora): pede de novo e nada grava", async () => {
    cenario({ datas: ["2026-10-06", "2026-10-13"] });
    let r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO({ confirmoAvisos: ["VOLUNTARIO_ATIVO"] }) });
    expect(r.body.precisaConfirmarAvisos).toBe(true);
    r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO({ confirmoAvisos: "VOLUNTARIO_ATIVO,HABITUALIDADE" }) });
    expect(r.body.precisaConfirmarAvisos).toBe(true);
    expect(escritas()).toHaveLength(0);
  });
  test("sem aviso (pessoa física sem matrícula, poucos pagamentos): grava direto, com a lista de avisos vazia", async () => {
    cenario({ membroId: null, voluntario: 0, datas: ["2026-10-13"] });
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    expect(r.status).toBe(201);
    expect(JSON.parse(rodou(/SET XACT_ABORT ON/)[0].inputs.avisos)).toEqual([]);
    expect(rodou(/AS Voluntario/)).toHaveLength(0);           // sem matrícula ligada, nem pergunta se é voluntário
    expect(r.body.mensagem).not.toMatch(/aviso\(s\) sobre esta pessoa/);
  });
  test("pessoa jurídica: não conta pagamentos nem pergunta se é voluntário", async () => {
    cenario({ tipo: "PJ", membroId: null, voluntario: 0 });
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    expect(r.status).toBe(201);
    expect(rodou(/DATEADD\(HOUR, -3, s\.SolicitadoEm\)/)).toHaveLength(0);
    expect(rodou(/AS Voluntario/)).toHaveLength(0);
  });
  test("prebendado com pagamentos semanais: sem aviso de habitualidade (a relação é eclesiástica)", async () => {
    cenario({ membroId: null, voluntario: 0, prebendado: 1, datas: ["2026-10-06", "2026-10-13"] });
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    expect(r.status).toBe(201);
  });
  test("a contagem considera só os pagamentos ativos da janela, do mesmo fornecedor, na data de Brasília", async () => {
    cenario({ membroId: null, voluntario: 0 });
    await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    const q = rodou(/DATEADD\(HOUR, -3, s\.SolicitadoEm\)/)[0];
    expect(q.sql).toMatch(/s\.FornecedorId = @id AND s\.Status NOT IN \('REJEITADA', 'CANCELADA'\) AND s\.SolicitadoEm >= DATEADD\(DAY, -@janela, SYSUTCDATETIME\(\)\)/);
    expect(q.inputs.janela).toBe(60);
  });
  test("o aviso é conferido DEPOIS das recusas de sempre: fornecedor com dado bancário pendente segue recusado sem perguntar nada", async () => {
    cenario();
    mockRegras.unshift([/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ FornecedorId: 9, Ativo: true, DadosBancariosConfirmados: false }]]);
    const r = await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO() });
    expect(r.body.mensagem).toMatch(/aguardam confirmação/);
    expect(rodou(/AS Voluntario/)).toHaveLength(0);
  });
  test("identificador malformado (fornecedor ou congregação) é 400 antes de qualquer consulta (antes virava erro do driver, 500)", async () => {
    for (const lixo of ["abc", 2 ** 40, [9], { id: 9 }, true, "0x9", -1, 1.5]) {
      mockConsultas = [];
      expect((await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO({ fornecedorId: lixo }) })).status).toBe(400);
      expect((await chamar(hSaidas, { metodo: "POST", token: GERAL(), corpo: CORPO({ congregacaoId: lixo }) })).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    }
  });
  test("o detalhe da saída mostra os avisos registrados (quem confirmou e quando) a quem aprova e paga", async () => {
    quando(/WHERE s\.SaidaId = @id/, [{ saidaId: 77, congregacaoNome: "A", centroCusto: "GERAL", valor: 150, documentoFiscalUrl: "u" }]);
    quando(/FROM SaidaAvisosVoluntario a JOIN MembroReferencia/, [{ Codigo: "HABITUALIDADE", Texto: "Pagamentos a esta pessoa em 3 semanas", ConfirmadoPorNome: "Tesoureiro", ConfirmadoEm: "2026-10-23T10:00:00" }]);
    const r = await chamar(hSaidas, { token: GERAL(), ligado: { id: "77" } });
    expect(r.body.avisosVoluntario).toEqual([{ codigo: "HABITUALIDADE", rotulo: "Pagamento habitual à mesma pessoa", texto: "Pagamentos a esta pessoa em 3 semanas", confirmadoPorNome: "Tesoureiro", confirmadoEm: "2026-10-23T10:00:00" }]);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoFornecedores — o fornecedor pessoa física ligado à matrícula", () => {
  const corpo = (extra = {}) => ({ nome: "Maria Diarista", cpfCnpj: "111.222.333-44", tipo: "PF", ...extra });
  const pessoa = (congregacao) => (inp) => (Number(inp.id) === 40 ? [{ MembroId: 40, Nome: "Maria", Status: "ATIVO", CongregacaoNome: congregacao, ExtensaoNome: null }] : []);
  test("cadastra ligado à matrícula de uma pessoa do território (e a trilha guarda a matrícula)", async () => {
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, pessoa("A"));
    quando(/INSERT INTO Fornecedores/, [{ FornecedorId: 55 }]);
    const r = await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo({ membroId: "40" }) });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO Fornecedores/)[0].inputs.membroId).toBe(40);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.membroId).toBe(40);
  });
  test("pessoa fora do território e matrícula que não existe: a mesma resposta, e nada é gravado", async () => {
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, pessoa("B"));
    const fora = await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo({ membroId: 40 }) });
    const naoExiste = await chamar(hFornecedores, { metodo: "POST", token: LOCAL(), corpo: corpo({ membroId: 41 }) });
    expect(fora.body).toEqual(naoExiste.body);
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Membro não encontrado no seu território." });
    expect(rodou(/INSERT INTO Fornecedores/)).toHaveLength(0);
  });
  test("pessoa jurídica não se liga a matrícula; lixo no membroId é 400", async () => {
    let r = await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo({ tipo: "PJ", membroId: 40 }) });
    expect(r.status).toBe(400);
    for (const lixo of [true, [40], { id: 40 }, "0x28", -3, "abc", 1.5]) {
      r = await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo({ membroId: lixo }) });
      expect(r.status).toBe(400);
    }
    expect(rodou(/INSERT INTO Fornecedores/)).toHaveLength(0);
  });
  test("a matrícula já ligada a outro fornecedor é recusada; a corrida que fura a conferência recebe o 409 com a frase certa", async () => {
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, pessoa("A"));
    quando(/SELECT TOP 1 FornecedorId FROM Fornecedores WHERE MembroId = @m/, [{ FornecedorId: 3 }]);
    let r = await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo({ membroId: 40 }) });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Esta matrícula já está ligada a outro fornecedor." });
    mockRegras = [];
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, pessoa("A"));
    mockRegras.push([/INSERT INTO Fornecedores/, () => { const e = new Error("Cannot insert duplicate key row in object 'dbo.Fornecedores' with unique index 'UX_Fornecedores_Membro'"); e.number = 2601; throw e; }]);
    r = await chamar(hFornecedores, { metodo: "POST", token: GERAL(), corpo: corpo({ membroId: 40 }) });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toBe("Esta matrícula já está ligada a outro fornecedor.");
  });
  test("alterar: ligar e desligar ficam na trilha (antes e depois); sem membroId no corpo, a ligação não muda", async () => {
    const REG = { FornecedorId: 9, Nome: "Maria", Tipo: "PF", MembroId: null, Ativo: true, DadosBancariosConfirmados: true };
    quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [REG]);
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, pessoa("A"));
    let r = await chamar(hFornecedores, { metodo: "PUT", token: GERAL(), ligado: { id: "9" }, corpo: { membroId: 40 } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE Fornecedores SET/)[0].inputs.membroId).toBe(40);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).toMatchObject({ membroIdAntes: null, membroId: 40 });
    mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear();
    quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ ...REG, MembroId: 40 }]);
    r = await chamar(hFornecedores, { metodo: "PUT", token: GERAL(), ligado: { id: "9" }, corpo: { nome: "Maria S." } });
    expect(rodou(/UPDATE Fornecedores SET/)[0].inputs.membroId).toBe(40);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.membroId).toBeUndefined();
    mockConsultas = []; registrarAuditoria.mockClear();
    r = await chamar(hFornecedores, { metodo: "PUT", token: GERAL(), ligado: { id: "9" }, corpo: { membroId: null } });
    expect(rodou(/UPDATE Fornecedores SET/)[0].inputs.membroId).toBeNull();
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).toMatchObject({ membroIdAntes: 40, membroId: null });
  });
  test("a busca do membro filtra pelo território e não aceita busca curta; o tesoureiro local vê só SE há matrícula ligada", async () => {
    quando(/SELECT TOP 60 m\.MembroId/, [{ MembroId: 40, Nome: "Maria A", CongregacaoNome: "A" }, { MembroId: 41, Nome: "Maria B", CongregacaoNome: "B" }]);
    let r = await chamar(hFornecedores, { token: LOCAL(), query: { buscaMembro: "Mar" } });
    expect(r.body.membros).toEqual([{ membroId: 40, nome: "Maria A", congregacaoNome: "A" }]);
    expect(rodou(/SELECT TOP 60/)[0].inputs.nome).toBe("%Mar%");
    mockConsultas = [];
    r = await chamar(hFornecedores, { token: LOCAL(), query: { buscaMembro: "Ma" } });
    expect(r.body.membros).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
    r = await chamar(hFornecedores, { token: LOCAL(), query: { buscaMembro: "50%_[x" } });
    expect(rodou(/SELECT TOP 60/)[0].inputs.nome).toBe("%50[%][_][[]x%");   // curinga do LIKE vira texto
    mockRegras = [];
    quando(/FROM Fornecedores f WHERE NOT EXISTS/, [{ FornecedorId: 9, Nome: "Maria", Tipo: "PF", Ativo: true, DadosBancariosConfirmados: true, MembroId: 40 }]);
    r = await chamar(hFornecedores, { token: LOCAL() });
    expect(r.body).toEqual([{ fornecedorId: 9, nome: "Maria", tipo: "PF", ativo: true, dadosBancariosConfirmados: true, membroVinculado: true }]);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("o resumo do mês, Meus Dados, o ROPA e a migração 155", () => {
  test("o detector mensal: um fato por mês, só se houver caso, com os rótulos e sem repetir o fornecedor", async () => {
    quando(/FROM Prazos WHERE Sigla = @sigla/, [{ Dias: 60 }]);
    quando(/FROM SaidaAvisosVoluntario a\s+JOIN SaidasTesouraria s/, [
      { FornecedorId: 9, FornecedorNome: "Maria", Codigo: "HABITUALIDADE" }, { FornecedorId: 9, FornecedorNome: "Maria", Codigo: "VOLUNTARIO_ATIVO" }, { FornecedorId: 3, FornecedorNome: "João", Codigo: "VOLUNTARIO_ATIVO" }]);
    const fatos = await vpDb.detectarMensal(require("../db").getPool ? await require("../db").getPool() : null, { hoje: HOJE });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].referenciaId).toBe((2026 - 2000) * 12 + 10);
    expect(fatos[0].fatoGerador).toMatch(/^2 pessoa\(s\)/);
    expect(fatos[0].fatoGerador).toMatch(/João \(Pessoa voluntária\); Maria \(Pessoa voluntária, Pagamento habitual à mesma pessoa\)/);
    mockRegras = [];
    quando(/FROM Prazos WHERE Sigla = @sigla/, [{ Dias: 60 }]);
    expect(await vpDb.detectarMensal(await require("../db").getPool(), { hoje: HOJE })).toEqual([]);
  });
  test("a regra do resumo e a da aptidão estão no motor (rotina diária)", () => {
    expect(DETECTORES.TESOURARIA_VOLUNTARIO_PAGO.tabela).toBe("SaidaAvisosVoluntario");
    expect(typeof DETECTORES.MENORES_FUNCAO_SEM_APTIDAO.detectar).toBe("function");
  });
  test("Meus Dados: o cadastro de fornecedor ligado à pessoa e os avisos (código, rótulo e data)", async () => {
    quando(/SELECT Nome, Tipo, Ativo FROM Fornecedores WHERE MembroId = @m/, [{ Nome: "Maria", Tipo: "PF", Ativo: true }]);
    quando(/WHERE f\.MembroId = @m ORDER BY a\.AvisoId DESC/, [{ Codigo: "VOLUNTARIO_ATIVO", ConfirmadoEm: "2026-10-23T10:00:00" }]);
    const d = await vpDb.dadosDoTitular(await require("../db").getPool(), 40);
    expect(d).toEqual({ fornecedor: { nome: "Maria", tipo: "PF", ativo: true }, avisosDePagamento: [{ codigo: "VOLUNTARIO_ATIVO", rotulo: "Pessoa voluntária", em: "2026-10-23T10:00:00" }] });
    const fonte = fs.readFileSync(path.join(__dirname, "..", "..", "MeusDadosLGPD", "index.js"), "utf8");
    expect(fonte).toMatch(/const tesouraria = await voluntarioPagamentoDb\.dadosDoTitular\(pool, alvo\);/);
    expect(fonte).toMatch(/criseSeguranca,\s+tesouraria\s+\}/);
  });
  test("ROPA: a entrada nova cita as tabelas, a base do Art. 11 (dado sensível) e a retenção", () => {
    const r = REGISTROS_TRATAMENTO.find((x) => x.chave === "VOLUNTARIO_PAGAMENTO");
    expect(r.tabelasEnvolvidas).toEqual(["Fornecedores", "SaidaAvisosVoluntario"]);
    expect(r.baseLegal).toMatch(/Art\. 11, II, \\?"a\\?"/);
    expect(r.baseLegal).toMatch(/9\.608\/98/);
    expect(r.baseLegal).toMatch(/nunca o legítimo interesse/);
    expect(r.retencao).toMatch(/Meus Dados/);
    expect(REGISTROS_TRATAMENTO.find((x) => x.chave === "MINISTERIO_COM_MENORES").retencao).toMatch(/Departamentos\.ContatoComMenores, Papeis\.ContatoComMenores/);
  });
  describe("migração 155", () => {
    const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "155_trava_7c_decisoes.sql"), "utf8");
    test("tudo idempotente; a coluna, o CHECK só de pessoa física e o índice único filtrado", () => {
      expect(TEXTO).toMatch(/IF COL_LENGTH\(N'dbo\.Fornecedores', N'MembroId'\) IS NULL\s+ALTER TABLE dbo\.Fornecedores ADD MembroId INT NULL/);
      expect(TEXTO).toMatch(/CHECK \(MembroId IS NULL OR Tipo = N'PF'\)/);
      expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_Fornecedores_Membro ON dbo\.Fornecedores\(MembroId\) WHERE MembroId IS NOT NULL/);
      expect(TEXTO).toMatch(/IF OBJECT_ID\(N'dbo\.SaidaAvisosVoluntario', N'U'\) IS NULL/);
    });
    test("o aviso confirmado: código fechado (sem NULL), um por saída e código, e o gatilho que não deixa editar nem apagar", () => {
      expect(TEXTO).toMatch(/CHECK \(Codigo IS NOT NULL AND Codigo IN \(N'VOLUNTARIO_ATIVO', N'HABITUALIDADE', N'CACHE_COMISSAO'\)\)/);
      expect(TEXTO).toMatch(/UNIQUE \(SaidaId, Codigo\)/);
      expect(TEXTO).toMatch(/CREATE OR ALTER TRIGGER dbo\.TR_SaidaAvisosVoluntario_Imutavel ON dbo\.SaidaAvisosVoluntario AFTER UPDATE, DELETE/);
      expect(vp.CODIGOS).toEqual(["VOLUNTARIO_ATIVO", "HABITUALIDADE", "CACHE_COMISSAO"]);
    });
    test("os prazos e as regras: só entram se não existem, nos limites das colunas; a da aptidão é obrigatória", () => {
      const prazos = [...TEXTO.matchAll(/VALUES \(N'(TESOURARIA_HABITUAL_[A-Z_]+)', N'([^']+)'/g)];
      expect(prazos).toHaveLength(2);
      for (const [, sigla, nome] of prazos) { expect(sigla.length).toBeLessThanOrEqual(40); expect(nome.length).toBeLessThanOrEqual(150); }
      expect(TEXTO).toMatch(/WHERE Sigla = N'TESOURARIA_HABITUAL_PAGAMENTOS'\)\s+INSERT/);
      expect(TEXTO).toMatch(/WHERE Sigla = N'TESOURARIA_HABITUAL_JANELA_DIAS'\)\s+INSERT/);
      for (const chave of ["TESOURARIA_VOLUNTARIO_PAGO", "MENORES_FUNCAO_SEM_APTIDAO"]) {
        expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM dbo\\.NotificacaoRegras WHERE Chave = N'${chave}'\\)`));
        const titulo = TEXTO.match(new RegExp(`VALUES \\(N'${chave}', N'([^']+)'`))[1];
        expect(titulo.length).toBeLessThanOrEqual(150);
      }
      expect(TEXTO).toMatch(/N'TESOURARIA_VOLUNTARIO_PAGO', N'[^']+', N'FINANCEIRO', N'financeiro', N'GLOBAL', 1, 0, 0\)/);
      expect(TEXTO).toMatch(/N'MENORES_FUNCAO_SEM_APTIDAO', N'[^']+', N'MENORES', NULL, NULL, 1, 1, 1\)/);
    });
    test("as marcas nascem desligadas; só a União de Crianças nasce marcada, e só no lote que cria a coluna (nada regrava o que a tela edita)", () => {
      expect(TEXTO).toMatch(/IF COL_LENGTH\(N'dbo\.Departamentos', N'ContatoComMenores'\) IS NULL\s+BEGIN\s+ALTER TABLE dbo\.Departamentos ADD ContatoComMenores BIT NOT NULL CONSTRAINT DF_Departamentos_ContatoComMenores DEFAULT 0;\s+EXEC\(N'UPDATE dbo\.Departamentos SET ContatoComMenores = 1 WHERE Sigla = N''UCADESPA'''\);\s+END/);
      expect(TEXTO).toMatch(/IF COL_LENGTH\(N'dbo\.Papeis', N'ContatoComMenores'\) IS NULL\s+ALTER TABLE dbo\.Papeis ADD ContatoComMenores BIT NOT NULL CONSTRAINT DF_Papeis_ContatoComMenores DEFAULT 0;/);
      expect((TEXTO.match(/UPDATE dbo\.Departamentos/g) || []).length).toBe(1);
    });
  });
});
