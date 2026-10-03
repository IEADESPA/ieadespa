// Catálogos (GestaoCatalogos): antes, qualquer pessoa da internet lia TODOS sem login (inclusive a matriz de permissões de cada cargo) e quem tinha "pessoas" escrevia em todos.
// Agora: ler exige login (+ a permissão da área nos catálogos internos); escrever exige o nível GERAL.
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async (texto) => { mockConsultas.push(texto); return { recordset: /COUNT\(\*\) AS Total/.test(texto) ? [{ Total: 0 }] : [], rowsAffected: [1] }; } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const handler = require("../../GestaoCatalogos/index.js");

const COM_LOGIN = ["situacoes", "statuses", "departamentos", "areas", "regioes", "quadrantes", "distritos", "extensoes", "congregacoes", "tiposConsagracao", "orgaosLocais", "cargosMinisteriais", "prazos", "tiposVinculoFamiliar", "categoriasEntrada"];
const POR_PERMISSAO = { funcionalidades: "permissoes", papeis: "permissoes", tiposInfracao: "disciplina", tiposPenalidade: "disciplina", planoContas: "financeiro", categoriasSaida: "financeiro", alcadasAprovacao: "financeiro", rateioGeralDestinos: "financeiro", mediadoresArbitros: "mediacao" };
const TODOS = [...COM_LOGIN, ...Object.keys(POR_PERMISSAO)];

const token = (extra = {}) => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", permissoes: [], nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], ...extra });
const MEMBRO = () => token({ via: "PIN", permissoes: [], nivel: null });
const LOCAL = (permissoes) => token({ permissoes });
const GERAL = (permissoes) => token({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
async function chamar(catalogo, { metodo = "GET", tk, corpo = {}, id } = {}) {
  const context = { bindingData: { catalogo, id }, log: { error() {} } };
  await handler(context, { method: metodo, query: {}, body: corpo, headers: tk ? { "x-auth-token": tk } : {} });
  return context.res;
}
beforeEach(() => { mockConsultas = []; });

describe("LEITURA", () => {
  test.each(TODOS)("%s: sem sessão -> 401, sem consultar o banco", async (c) => {
    const r = await chamar(c);
    expect(r.status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("token forjado e sessão de PIN provisório também são recusados", async () => {
    expect((await chamar("congregacoes", { tk: "lixo.lixo" })).status).toBe(401);
    expect((await chamar("congregacoes", { tk: token({ via: "PIN", pinProvisorio: true }) })).status).toBe(403);
  });
  test.each(COM_LOGIN)("%s (referência): qualquer pessoa logada lê, inclusive o membro comum (sessão de PIN)", async (c) => {
    for (const tk of [MEMBRO(), LOCAL(["pessoas"]), GERAL(["pessoas"])]) expect((await chamar(c, { tk })).status).toBe(200);
  });
  test("a leitura com login aceita quem ainda tem termo pendente (a tela de termos monta listas)", async () => {
    expect((await chamar("congregacoes", { tk: token({ termosPendentes: ["CONFIDENCIALIDADE"] }) })).status).toBe(200);
  });
  test.each(Object.entries(POR_PERMISSAO).filter(([c]) => c !== "categoriasEntrada"))("%s (interno): exige a permissão %s — membro comum e líder sem ela levam 403", async (c, permissao) => {
    expect((await chamar(c, { tk: MEMBRO() })).status).toBe(403);
    expect((await chamar(c, { tk: LOCAL(["pessoas", "reunioes"]) })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
    expect((await chamar(c, { tk: LOCAL([permissao]) })).status).toBe(200);
  });
  test("as categorias de ENTRADA (que o membro escolhe ao lançar a própria contribuição) ficam só com login, mesmo sendo do financeiro", async () => {
    expect((await chamar("categoriasEntrada", { tk: MEMBRO() })).status).toBe(200);
  });
  test("catálogo que não existe, e nome que é propriedade do objeto ('constructor', '__proto__'): 404, não 500", async () => {
    for (const c of ["naoexiste", "constructor", "__proto__", "toString", "hasOwnProperty"]) expect((await chamar(c, { tk: GERAL([]) })).status).toBe(404);
  });
});

describe("ESCRITA: só o nível GERAL", () => {
  const corpo = { nome: "X", sigla: "X", codigo: "X", ativo: true };
  test.each(TODOS)("%s: líder local com a permissão certa leva 403 ao criar, alterar e excluir — sem gravar", async (c) => {
    const permissao = POR_PERMISSAO[c] || "pessoas";
    for (const [metodo, extra] of [["POST", { corpo }], ["POST", { corpo: { ...corpo, id: 3 } }], ["DELETE", { id: "3" }]]) {
      const r = await chamar(c, { metodo, tk: LOCAL([permissao]), ...extra });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas.filter(q => /INSERT|UPDATE|DELETE/.test(q))).toHaveLength(0);
  });
  test("papel Global com escopo de uma congregação, e papel local com escopo 'TODAS', também levam 403", async () => {
    expect((await chamar("congregacoes", { metodo: "POST", tk: token({ nivel: "GLOBAL", permissoes: ["pessoas"] }), corpo })).status).toBe(403);
    expect((await chamar("congregacoes", { metodo: "POST", tk: token({ escopoCongregacoes: "TODAS", permissoes: ["pessoas"] }), corpo })).status).toBe(403);
  });
  test("membro comum (sessão de PIN) e sem sessão não escrevem", async () => {
    expect((await chamar("congregacoes", { metodo: "POST", tk: MEMBRO(), corpo })).status).toBe(403);
    expect((await chamar("congregacoes", { metodo: "POST", corpo })).status).toBe(401);
    expect((await chamar("congregacoes", { metodo: "DELETE", id: "3" })).status).toBe(401);
  });
  test("o geral sem a permissão do catálogo (ex.: 'financeiro' no plano de contas) também é recusado", async () => {
    expect((await chamar("planoContas", { metodo: "POST", tk: GERAL(["pessoas"]), corpo })).status).toBe(403);
  });
  test("o geral COM a permissão chega à gravação (a porta abre)", async () => {
    const r = await chamar("congregacoes", { metodo: "DELETE", tk: GERAL(["pessoas"]), id: "3" });
    expect([401, 403]).not.toContain(r.status);
  });
});
