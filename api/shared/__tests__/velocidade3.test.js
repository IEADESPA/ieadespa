// Raio-x de velocidade 3 (17/11/2026) — os relatórios dos departamentos filtrados NO BANCO pelo escopo territorial e pelo departamento da visão (antes, a lista lia os
// relatórios do campo inteiro e filtrava na memória), e o território dos órgãos locais numa consulta só (MeusOrgaosLocais: antes, uma consulta por órgão).
// O banco é simulado por TEXTO da consulta; a prova contra o SQL Server de verdade (a resposta nova igual à antiga, nível a nível, na massa grande) está em
// tools/raio-x/medir-velocidade3.js + comparar-respostas.js.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [0] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const hRelatorios = require("../../GestaoRelatoriosDepartamentais/index.js");
const hOrgaos = require("../../MeusOrgaosLocais/index.js");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", termosPendentes: [], ...extra });
async function chamar(handler, token, bindingData = {}) {
  const context = { bindingData, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await handler(context, { method: "GET", query: {}, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  return context.res;
}
const RELATORIOS = [
  { relatorioDepartamentalId: 1, congregacaoId: 1, congregacaoNome: "Central", departamentoId: 7, mesReferencia: 10, anoReferencia: 2026 },
  { relatorioDepartamentalId: 2, congregacaoId: 2, congregacaoNome: "Vila", departamentoId: 7, mesReferencia: 10, anoReferencia: 2026 },
  { relatorioDepartamentalId: 3, congregacaoId: 1, congregacaoNome: "Central", departamentoId: 8, mesReferencia: 10, anoReferencia: 2026 }
];

beforeEach(() => {
  mockRegras = []; mockConsultas = [];
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes/, [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila" }]);
  quando(/FROM RelatoriosDepartamentais r/, RELATORIOS.map((r) => ({ ...r })));
});

describe("GestaoRelatoriosDepartamentais — a lista filtrada no banco", () => {
  test("congregação: o banco recebe as congregações do escopo; o filtro da rota continua como segunda conferência", async () => {
    const r = await chamar(hRelatorios, tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["relatorios_departamentais"] }));
    expect(r.body.map((x) => x.relatorioDepartamentalId)).toEqual([1, 3]);         // o banco simulado devolve tudo: a rota ainda tira a Vila
    const lista = rodou(/FROM RelatoriosDepartamentais r/)[0];
    expect(lista.sql).toMatch(/AND r\.CongregacaoId IN \(SELECT CAST\(value AS INT\) FROM OPENJSON\(@escopoCongIds\)\)/);
    expect(lista.inputs.escopoCongIds).toBe("[1]");
    expect(lista.sql).not.toMatch(/deptosVisao/);
  });
  test("líder de UM departamento: o banco também recebe o departamento", async () => {
    const r = await chamar(hRelatorios, tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], departamentoId: 7, permissoes: ["relatorios_departamentais"] }));
    expect(r.body.map((x) => x.relatorioDepartamentalId)).toEqual([1]);
    const lista = rodou(/FROM RelatoriosDepartamentais r/)[0];
    expect(lista.sql).toMatch(/AND r\.DepartamentoId IN \(SELECT CAST\(value AS INT\) FROM OPENJSON\(@deptosVisao\)\)/);
    expect(lista.inputs.deptosVisao).toBe("[7]");
  });
  test("geral (TODAS): sem condição de escopo no banco", async () => {
    const r = await chamar(hRelatorios, tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["relatorios_departamentais"] }));
    expect(r.body).toHaveLength(3);
    expect(rodou(/FROM RelatoriosDepartamentais r/)[0].sql).not.toMatch(/escopoCongIds/);
  });
  test("escopo que não alcança congregação nenhuma: lista vazia sem ler os relatórios", async () => {
    const r = await chamar(hRelatorios, tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Inexistente"], permissoes: ["relatorios_departamentais"] }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(rodou(/FROM RelatoriosDepartamentais r/)).toHaveLength(0);
  });
});

describe("MeusOrgaosLocais — o território numa consulta só", () => {
  test("uma consulta para todos os órgãos; nível desconhecido não alcança ninguém (antes, quebrava a rota)", async () => {
    quando(/FROM OrgaosLocais WHERE Ativo = 1/, [
      { orgaoLocalId: 1, sigla: "JAI", nome: "JAI Central", nivel: 1, referenciaId: 1 },
      { orgaoLocalId: 2, sigla: "CRA", nome: "CRA", nivel: 3, referenciaId: 4 },
      { orgaoLocalId: 3, sigla: "X", nome: "Estranho", nivel: 9, referenciaId: 1 }
    ]);
    quando(/FROM OrgaosLocais o\s+JOIN Congregacoes c ON/, [{ orgaoLocalId: 1, nome: "Central" }, { orgaoLocalId: 2, nome: "Central" }, { orgaoLocalId: 2, nome: "Vila" }]);
    const r = await chamar(hOrgaos, tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila"], permissoes: ["reunioes"] }));
    expect(r.status).toBe(200);
    expect(r.body.map((o) => o.orgaoLocalId)).toEqual([2]);
    const t = rodou(/FROM OrgaosLocais o\s+JOIN Congregacoes c ON/);
    expect(t).toHaveLength(1);
    expect(JSON.parse(t[0].inputs.ids)).toEqual([1, 2, 3]);
    expect(rodou(/SELECT Nome FROM Congregacoes WHERE/)).toHaveLength(0);           // nada de uma consulta por órgão
  });
});
