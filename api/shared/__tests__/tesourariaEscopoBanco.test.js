// FASE 10 (raio-x de velocidade, 17/11/2026) — lançamentos e saídas da tesouraria filtrados NO BANCO pelo escopo de quem pede (antes as rotas liam a tabela
// inteira — 68 mil lançamentos na massa — e filtravam na memória), com páginas opcionais. O banco é simulado por TEXTO da consulta; o comportamento contra o
// SQL Server de verdade está no roteiro ponta a ponta (tools/e2e-localdb/e2e-88-tesouraria-escopo.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs, texto) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => (u ? `${u}?assinado` : null), salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const { condicaoSqlEscopoCongregacao } = require("../escopoRotas");
const hLanc = require("../../GestaoLancamentosTesouraria/index.js");
const hSaidas = require("../../GestaoSaidas/index.js");

const CONGREGACOES = [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila Nova" }, { CongregacaoId: 3, Nome: "Jardim" }];
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["financeiro"], escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
async function chamar(h, token, query = {}) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await h(context, { method: "GET", query, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  return context.res;
}
const lanc = (id, cong, extra = {}) => ({ lancamentoId: id, congregacaoId: CONGREGACOES.find((c) => c.Nome === cong).CongregacaoId, congregacaoNome: cong, status: "ATIVO",
  formaPagamento: "PIX", comprovanteUrl: null, conciliacaoId: null, fechamentoId: null, valor: 10, ...extra });
const saida = (id, cong, extra = {}) => ({ saidaId: id, congregacaoId: CONGREGACOES.find((c) => c.Nome === cong).CongregacaoId, congregacaoNome: cong, status: "SOLICITADA",
  centroCusto: "LOCAL", documentoFiscalUrl: "https://x/doc.pdf", comprovantePagamentoUrl: null, valor: 10, ...extra });

beforeEach(() => {
  mockRegras = []; mockConsultas = [];
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes/, { recordset: CONGREGACOES });
});

describe("condicaoSqlEscopoCongregacao: o escopo da visão vira condição do banco", () => {
  const pedidoFalso = () => { const inputs = {}; const p = { input: (n, _t, v) => { inputs[n] = v; return p; }, inputs }; return p; };
  const pool = { request: () => ({ query: async () => ({ recordset: CONGREGACOES }) }) };
  test("TODAS: sem filtro (null)", async () => { expect(await condicaoSqlEscopoCongregacao(pool, { escopoCongregacoes: "TODAS" }, pedidoFalso(), "l.CongregacaoId")).toBeNull(); });
  test("lista de nomes: os ids exatos, pela mesma comparação de auth.estaNoEscopo", async () => {
    const p = pedidoFalso();
    const cond = await condicaoSqlEscopoCongregacao(pool, { escopoCongregacoes: ["Vila Nova", "jardim"] }, p, "l.CongregacaoId");
    expect(cond).toBe("l.CongregacaoId IN (SELECT CAST(value AS INT) FROM OPENJSON(@escopoCongIds))");
    expect(JSON.parse(p.inputs.escopoCongIds)).toEqual([2]);   // "jardim" ≠ "Jardim": o includes do JavaScript não casa (igual ao filtro antigo)
  });
  test("escopo vazio, malformado ou sem congregação que exista: \"\" (nada)", async () => {
    for (const escopo of [[], undefined, null, "Vila Nova", ["Não Existe"]]) expect(await condicaoSqlEscopoCongregacao(pool, { escopoCongregacoes: escopo }, pedidoFalso(), "x")).toBe("");
  });
});

describe("GET /api/tesouraria-lancamentos: o escopo no banco", () => {
  test("Geral (TODAS): nenhuma condição de escopo e a resposta continua uma lista, com o comprovante assinado", async () => {
    quando(/FROM LancamentosTesouraria l/, { recordset: [lanc(1, "Central", { comprovanteUrl: "https://x/c1.png" }), lanc(2, "Vila Nova")] });
    const res = await chamar(hLanc, tokenDe());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((l) => l.lancamentoId)).toEqual([1, 2]);
    expect(res.body[0].comprovanteUrl).toBe("https://x/c1.png?assinado");
    expect(res.body[1].comprovantePendente).toBe(true);
    expect(rodou(/FROM LancamentosTesouraria l/)[0].sql).not.toMatch(/OPENJSON\(@escopoCongIds\)/);
    expect(rodou(/FROM Congregacoes`?$|SELECT CongregacaoId, Nome FROM Congregacoes/).length).toBe(0);
  });
  test("secretaria local: o banco recebe só os ids do escopo; a segunda trava tira o que escapar", async () => {
    quando(/FROM LancamentosTesouraria l/, { recordset: [lanc(5, "Vila Nova"), lanc(6, "Central")] });
    const res = await chamar(hLanc, tokenDe({ escopoCongregacoes: ["Vila Nova"] }), { congregacaoId: "2", mesReferencia: "2026-10" });
    const q = rodou(/FROM LancamentosTesouraria l/)[0];
    expect(q.sql).toMatch(/l\.CongregacaoId IN \(SELECT CAST\(value AS INT\) FROM OPENJSON\(@escopoCongIds\)\)/);
    expect(JSON.parse(q.inputs.escopoCongIds)).toEqual([2]);
    expect(q.inputs.congregacaoId).toBe(2);
    expect(q.inputs.mesReferencia).toBe("2026-10");
    expect(res.body.map((l) => l.lancamentoId)).toEqual([5]);
  });
  test("escopo vazio: lista vazia sem ler a tabela", async () => {
    const res = await chamar(hLanc, tokenDe({ escopoCongregacoes: [] }));
    expect(res.body).toEqual([]);
    expect(rodou(/FROM LancamentosTesouraria/).length).toBe(0);
  });
  test("congregacaoId ou mês malformados: 400 (antes iam para o banco)", async () => {
    expect((await chamar(hLanc, tokenDe(), { congregacaoId: "2 OR 1=1" })).status).toBe(400);
    expect((await chamar(hLanc, tokenDe(), { mesReferencia: "2026-10'--" })).status).toBe(400);
    expect(rodou(/FROM LancamentosTesouraria/).length).toBe(0);
  });
  test("páginas só quando pedidas: pular/trazer, o total e o envelope { itens, total }", async () => {
    quando(/FROM LancamentosTesouraria l/, () => ({ recordset: [{ total: 37 }], recordsets: [[{ total: 37 }], [lanc(9, "Vila Nova")]] }));
    const res = await chamar(hLanc, tokenDe({ escopoCongregacoes: ["Vila Nova"] }), { pagina: "2", porPagina: "10" });
    const q = rodou(/FROM LancamentosTesouraria l/)[0];
    expect(q.sql).toMatch(/SELECT COUNT\(\*\) AS total FROM LancamentosTesouraria l/);
    expect(q.sql).toMatch(/OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY/);
    expect([q.inputs.pular, q.inputs.trazer]).toEqual([10, 10]);
    expect(res.body).toMatchObject({ sucesso: true, total: 37, pagina: 2, porPagina: 10 });
    expect(res.body.itens.map((l) => l.lancamentoId)).toEqual([9]);
  });
  test("porPagina acima do teto vira 200; página inválida vira 1", async () => {
    quando(/FROM LancamentosTesouraria l/, () => ({ recordsets: [[{ total: 0 }], []] }));
    await chamar(hLanc, tokenDe(), { pagina: "abc", porPagina: "99999" });
    const q = rodou(/FROM LancamentosTesouraria l/)[0];
    expect([q.inputs.pular, q.inputs.trazer]).toEqual([0, 200]);
  });
});

describe("GET /api/saidas: o escopo no banco", () => {
  test("Geral (TODAS): sem condição de escopo, lista com os documentos assinados", async () => {
    quando(/FROM SaidasTesouraria s/, { recordset: [saida(1, "Central"), saida(2, "Jardim", { comprovantePagamentoUrl: "https://x/p.pdf" })] });
    const res = await chamar(hSaidas, tokenDe());
    expect(res.body.map((s) => s.saidaId)).toEqual([1, 2]);
    expect(res.body[0].documentoFiscalUrl).toBe("https://x/doc.pdf?assinado");
    expect(res.body[1].comprovantePagamentoUrl).toBe("https://x/p.pdf?assinado");
    expect(rodou(/FROM SaidasTesouraria s/)[0].sql).not.toMatch(/OPENJSON\(@escopoCongIds\)/);
  });
  test("área com duas congregações: os dois ids vão para o banco; a segunda trava continua", async () => {
    quando(/FROM SaidasTesouraria s/, { recordset: [saida(3, "Vila Nova"), saida(4, "Jardim"), saida(5, "Central")] });
    const res = await chamar(hSaidas, tokenDe({ escopoCongregacoes: ["Vila Nova", "Jardim"] }), { status: "SOLICITADA" });
    const q = rodou(/FROM SaidasTesouraria s/)[0];
    expect(JSON.parse(q.inputs.escopoCongIds)).toEqual([2, 3]);
    expect(q.inputs.status).toBe("SOLICITADA");
    expect(res.body.map((s) => s.saidaId)).toEqual([3, 4]);
  });
  test("escopo vazio: lista vazia sem ler a tabela; congregacaoId malformado: 400", async () => {
    expect((await chamar(hSaidas, tokenDe({ escopoCongregacoes: [] }))).body).toEqual([]);
    expect((await chamar(hSaidas, tokenDe(), { congregacaoId: "-1" })).status).toBe(400);
    expect(rodou(/FROM SaidasTesouraria/).length).toBe(0);
  });
  test("páginas só quando pedidas", async () => {
    quando(/FROM SaidasTesouraria s/, () => ({ recordsets: [[{ total: 3 }], [saida(7, "Vila Nova")]] }));
    const res = await chamar(hSaidas, tokenDe({ escopoCongregacoes: ["Vila Nova"] }), { pagina: "1", porPagina: "2" });
    expect(res.body).toMatchObject({ sucesso: true, total: 3, pagina: 1, porPagina: 2 });
    expect(res.body.itens.map((s) => s.saidaId)).toEqual([7]);
    expect(rodou(/FROM SaidasTesouraria s/)[0].sql).toMatch(/SELECT COUNT\(\*\) AS total FROM SaidasTesouraria s WHERE/);
  });
});
