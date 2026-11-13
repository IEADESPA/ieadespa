// v10.1c — a lista de pessoas filtrada NO BANCO pelo escopo de quem está logado (antes lia o campo inteiro e escondia na memória) e a lista em páginas (?pagina=N).
// O banco é simulado por TEXTO da consulta; o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta (tools/e2e-localdb/e2e-84-pessoas-escopo.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const { condicaoSqlEscopoPessoa } = require("../escopoRotas");
const hPessoas = require("../../GestaoPessoas/index.js");

const CONGREGACOES = [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila Nova" }, { CongregacaoId: 3, Nome: "Jardim" }];
const pessoa = (membroId, nome, congregacao, extra = {}) => ({ membroId, nome, congregacao, congregacaoId: CONGREGACOES.find((c) => c.Nome === congregacao)?.CongregacaoId ?? null,
  extensao: null, status: "ATIVO", situacaoMembro: "EM_COMUNHAO", dataNascimento: "1990-01-01", dataAdmissao: null, fotoUrl: null, cargoMinisterial: null, ...extra });

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const listaDoCadastro = () => rodou(/FROM MembroReferencia m/);
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas"], escopoCongregacoes: [], termosPendentes: [], ...extra });
async function listar(token, query = {}) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hPessoas(context, { method: "GET", query, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  return context.res;
}

beforeEach(() => {
  mockRegras = []; mockConsultas = [];
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes/, { recordset: CONGREGACOES });
});

describe("condicaoSqlEscopoPessoa: o escopo vira condição do banco", () => {
  const pedidoFalso = () => { const inputs = {}; const p = { input: (n, _t, v) => { inputs[n] = v; return p; }, inputs }; return p; };
  const pool = { request: () => ({ query: async () => ({ recordset: CONGREGACOES }) }) };

  test("escopo TODAS: sem filtro (null) e sem ler as congregações", async () => {
    let leu = false;
    const p = pedidoFalso();
    const c = await condicaoSqlEscopoPessoa({ request: () => ({ query: async () => { leu = true; return { recordset: CONGREGACOES }; } }) }, { escopoCongregacoes: "TODAS" }, p, "m.CongregacaoId", "e.Nome");
    expect(c).toBeNull();
    expect(leu).toBe(false);
    expect(p.inputs).toEqual({});
  });
  test("lista de congregações: os ids delas (nome exato, como noEscopoDaPessoa)", async () => {
    const p = pedidoFalso();
    const c = await condicaoSqlEscopoPessoa(pool, { escopoCongregacoes: ["Vila Nova", "Jardim", "vila nova"] }, p, "m.CongregacaoId", "e.Nome");
    expect(c).toBe("((m.CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@escopoIds0))))");
    expect(JSON.parse(p.inputs.escopoIds0)).toEqual([2, 3]);
  });
  test("concessão de extensão: congregação E extensão", async () => {
    const p = pedidoFalso();
    const c = await condicaoSqlEscopoPessoa(pool, { escopoCongregacoes: ["Central"], escopoExtensaoNome: "Tenda Norte" }, p, "m.CongregacaoId", "e.Nome");
    expect(c).toBe("((m.CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@escopoIds0)) AND e.Nome = @escopoExt0))");
    expect(p.inputs.escopoExt0).toBe("Tenda Norte");
  });
  test("várias concessões: uma regra por concessão, unidas por OU (a extensão de uma não estreita a outra)", async () => {
    const p = pedidoFalso();
    const usuario = { concessoes: [
      { origem: "PROPRIA", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"] },
      { origem: "DELEGACAO", permissoes: ["pessoas"], escopoCongregacoes: ["Central"], escopoExtensaoNome: "Tenda Norte" }
    ] };
    const visao = auth.visaoDaPermissao(usuario, "pessoas");
    const c = await condicaoSqlEscopoPessoa(pool, visao, p, "m.CongregacaoId", "e.Nome");
    expect(c).toBe("((m.CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@escopoIds0))) OR (m.CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@escopoIds1)) AND e.Nome = @escopoExt1))");
    expect(JSON.parse(p.inputs.escopoIds0)).toEqual([2]);
    expect(JSON.parse(p.inputs.escopoIds1)).toEqual([1]);
  });
  test("uma concessão TODAS sem extensão basta para não filtrar", async () => {
    const visao = auth.visaoDaPermissao({ concessoes: [
      { origem: "PROPRIA", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"] },
      { origem: "DELEGACAO", permissoes: ["pessoas"], escopoCongregacoes: "TODAS" }
    ] }, "pessoas");
    expect(await condicaoSqlEscopoPessoa(pool, visao, pedidoFalso(), "m.CongregacaoId", "e.Nome")).toBeNull();
  });
  test("escopo vazio, congregação que não existe mais ou escopo malformado: não alcança ninguém (\"\")", async () => {
    expect(await condicaoSqlEscopoPessoa(pool, { escopoCongregacoes: [] }, pedidoFalso(), "a", "b")).toBe("");
    expect(await condicaoSqlEscopoPessoa(pool, { escopoCongregacoes: ["Apagada"] }, pedidoFalso(), "a", "b")).toBe("");
    expect(await condicaoSqlEscopoPessoa(pool, { escopoCongregacoes: "Central" }, pedidoFalso(), "a", "b")).toBe("");
    expect(await condicaoSqlEscopoPessoa(pool, null, pedidoFalso(), "a", "b")).toBe("");
  });
});

describe("GET /api/pessoas filtra no banco", () => {
  test("geral (TODAS): a consulta de antes, sem filtro, e a lista inteira", async () => {
    quando(/FROM MembroReferencia m/, { recordset: [pessoa(7, "Ana", "Central"), pessoa(8, "Bia", "Vila Nova")] });
    const r = await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }));
    expect(r.status).toBe(200);
    expect(r.body.map((p) => p.membroId)).toEqual([7, 8]);
    expect(listaDoCadastro()[0].sql).not.toMatch(/WHERE/);
    expect(rodou(/SELECT CongregacaoId, Nome FROM Congregacoes/)).toHaveLength(0);
  });
  test("dirigente: o banco recebe só os ids do escopo; e quem viesse de fora ainda cai na segunda conferência", async () => {
    quando(/FROM MembroReferencia m/, { recordset: [pessoa(8, "Bia", "Vila Nova"), pessoa(7, "Ana", "Central")] });
    const r = await listar(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }));
    expect(r.status).toBe(200);
    expect(r.body.map((p) => p.membroId)).toEqual([8]);
    const q = listaDoCadastro()[0];
    expect(q.sql).toMatch(/WHERE \(\(m\.CongregacaoId IN \(SELECT CAST\(value AS INT\) FROM OPENJSON\(@escopoIds0\)\)\)\) ORDER BY m\.Nome/);
    expect(JSON.parse(q.inputs.escopoIds0)).toEqual([2]);
  });
  test("escopo que não alcança ninguém: lista vazia sem ler o cadastro", async () => {
    const r = await listar(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Apagada"] }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(listaDoCadastro()).toHaveLength(0);
  });
  test("sem a permissão pessoas: recusa sem ler o cadastro", async () => {
    const r = await listar(tokenDe({ permissoes: ["financeiro"], escopoCongregacoes: "TODAS" }));
    expect(r.status).toBe(403);
    expect(listaDoCadastro()).toHaveLength(0);
  });
});

describe("GET /api/pessoas?pagina=N — a lista em páginas", () => {
  const respostaPaginada = (total, itens) => () => ({ recordset: [{ total }], recordsets: [[{ total }], itens] });

  test("página 2 de 10: pula 10, traz 10, devolve o total e os itens", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada(23, [pessoa(11, "Caio", "Vila Nova"), pessoa(12, "Davi", "Vila Nova")]));
    const r = await listar(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }), { pagina: "2", porPagina: "10" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, total: 23, pagina: 2, porPagina: 10 });
    expect(r.body.itens.map((p) => p.membroId)).toEqual([11, 12]);
    const q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.inputs).toMatchObject({ pular: 10, trazer: 10 });
    expect(q.sql).toMatch(/OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY/);
    expect(q.sql).toMatch(/ORDER BY m\.Nome, m\.MembroId/);
    // o escopo vale para a contagem E para a página
    expect(q.sql.match(/OPENJSON\(@escopoIds0\)/g)).toHaveLength(2);
  });
  test("busca por nome escapa os curingas; só número também procura a matrícula", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada(0, []));
    await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", busca: "50%_a" });
    let q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.inputs.busca).toBe("%50\\%\\_a%");
    expect(q.sql).toMatch(/m\.Nome LIKE @busca ESCAPE '\\'/);
    expect(q.sql).not.toMatch(/CAST\(m\.MembroId AS NVARCHAR\(12\)\) LIKE/);
    mockConsultas = [];
    await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", busca: "123" });
    q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.sql).toMatch(/CAST\(m\.MembroId AS NVARCHAR\(12\)\) LIKE @busca/);
  });
  test("filtros de congregação e de situação vão para o banco; congregação inválida é recusada", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada(0, []));
    await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", congregacaoId: "3", situacao: "EM_COMUNHAO" });
    const q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.inputs).toMatchObject({ filtroCong: 3, filtroSituacao: "EM_COMUNHAO" });
    expect(q.sql).toMatch(/m\.CongregacaoId = @filtroCong AND m\.SituacaoMembro = @filtroSituacao/);
    const r = await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", congregacaoId: "abc" });
    expect(r.status).toBe(400);
  });
  test("tamanho da página tem teto (100) e piso (1); página inválida vira a 1", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada(0, []));
    const r = await listar(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "x", porPagina: "5000" });
    expect(r.body).toMatchObject({ pagina: 1, porPagina: 100 });
    expect(rodou(/SELECT COUNT\(\*\) AS total/)[0].inputs).toMatchObject({ pular: 0, trazer: 100 });
  });
  test("escopo que não alcança ninguém: página vazia, sem ler o cadastro", async () => {
    const r = await listar(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: [] }), { pagina: "1" });
    expect(r.body).toEqual({ sucesso: true, itens: [], total: 0, pagina: 1, porPagina: 20 });
    expect(listaDoCadastro()).toHaveLength(0);
  });
});
