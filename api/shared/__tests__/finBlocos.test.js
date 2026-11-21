// Financeiro, incremento 1a (21/11/2026): a regra pura dos blocos de recibo (shared/finBlocos.js) e a porta da rota FinBlocos (sessão, permissão,
// nível geral, ação inválida, a query em texto). O SQL de verdade é provado no LocalDB (tools/e2e-localdb/e2e-200-financeiro-blocos.js).
let mockConsultas = [];
let mockRegras = [];
jest.mock("../db", () => {
  const req = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [0] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; };
  return { getPool: async () => ({ request: req }), sql: new Proxy({}, { get: () => () => undefined }) };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const regra = require("../finBlocos");
const auth = require("../auth");
const rota = require("../../FinBlocos/index.js");

describe("o número do bloco e o lote da gráfica", () => {
  test("o número sai da primeira folha, como no desenho aprovado (70.051 → 1.401; 68.001 → 1.360; 69.401 → 1.388)", () => {
    expect(regra.numeroDoBloco(70051)).toBe(1401);
    expect(regra.numeroDoBloco(70101)).toBe(1402);
    expect(regra.numeroDoBloco(68001)).toBe(1360);
    expect(regra.numeroDoBloco(69401)).toBe(1388);
    expect(regra.numeroDoBloco(70001)).toBe(1400);
  });
  test("o lote de 10.000 folhas a partir da 70.001 vira 200 blocos de 50, em sequência, sem buraco", () => {
    const r = regra.blocosDoLote({ serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
    expect(r.erro).toBeUndefined();
    expect(r.lote).toEqual({ serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, folhasPorBloco: 50, totalFolhas: 10000 });
    expect(r.blocos).toHaveLength(200);
    expect(r.blocos[0]).toEqual({ numero: 1400, primeiraFolha: 70001, ultimaFolha: 70050 });
    expect(r.blocos[1]).toEqual({ numero: 1401, primeiraFolha: 70051, ultimaFolha: 70100 });
    expect(r.blocos[199]).toEqual({ numero: 1599, primeiraFolha: 79951, ultimaFolha: 80000 });
    for (let i = 1; i < r.blocos.length; i++) {
      expect(r.blocos[i].primeiraFolha).toBe(r.blocos[i - 1].ultimaFolha + 1);
      expect(r.blocos[i].numero).toBe(r.blocos[i - 1].numero + 1);
    }
  });
  test("os números vindos da tela em texto também valem", () => {
    const r = regra.blocosDoLote({ serie: "2027", primeiraFolha: "80001", totalFolhas: "100", folhasPorBloco: "50" });
    expect(r.blocos).toHaveLength(2);
  });
  test("recusa o que não confere, com a mensagem de quem lê", () => {
    expect(regra.blocosDoLote({ serie: 1999, primeiraFolha: 1, totalFolhas: 50 }).erro).toMatch(/série/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 0, totalFolhas: 50 }).erro).toMatch(/primeira folha/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 75 }).erro).toMatch(/blocos inteiros/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 10 }).erro).toMatch(/pelo menos um bloco/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 50 * 1001 }).erro).toMatch(/no máximo/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 999999990, totalFolhas: 50 }).erro).toMatch(/limite/);
    for (const lixo of [null, undefined, "abc", 1.5, -3, [], {}, "1e3", " "]) {
      expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: lixo, totalFolhas: 50 }).erro).toBeTruthy();
      expect(regra.blocosDoLote({ serie: lixo, primeiraFolha: 1, totalFolhas: 50 }).erro).toBeTruthy();
    }
    expect(regra.blocosDoLote(null).erro).toBeTruthy();
  });
});

describe("a folha e a situação", () => {
  const bloco = { primeiraFolha: 70051, ultimaFolha: 70100 };
  test("a posição da folha no bloco (70.090 = 40ª) e a folha de fora", () => {
    expect(regra.posicaoDaFolha(70090, bloco)).toBe(40);
    expect(regra.posicaoDaFolha("70051", bloco)).toBe(1);
    expect(regra.posicaoDaFolha(70100, bloco)).toBe(50);
    expect(regra.posicaoDaFolha(70101, bloco)).toBeNull();
    expect(regra.posicaoDaFolha("x", bloco)).toBeNull();
  });
  test("a situação da tela sai do que se guarda e do uso: esperando é entregue sem folha usada", () => {
    expect(regra.situacaoDoBloco("NA_GERAL", 0)).toBe("na-geral");
    expect(regra.situacaoDoBloco("ENTREGUE", 0)).toBe("esperando");
    expect(regra.situacaoDoBloco("ENTREGUE", 38)).toBe("em-uso");
    expect(regra.situacaoDoBloco("DEVOLVIDO", 50)).toBe("fechado");
  });
  test("o filtro, a procura (com o ponto do milhar) e a página aceitam só o que a tela manda", () => {
    expect(regra.filtroDaLista("em-uso")).toBe("em-uso");
    expect(regra.filtroDaLista("EM-USO ")).toBe("em-uso");
    expect(regra.filtroDaLista("'; DROP")).toBe("todos");
    expect(regra.filtroDaLista(undefined)).toBe("todos");
    expect(regra.procuraDaLista("70.090")).toBe(70090);
    expect(regra.procuraDaLista("1401")).toBe(1401);
    expect(regra.procuraDaLista("")).toBeNull();
    expect(regra.procuraDaLista("abc")).toBeUndefined();
    expect(regra.procuraDaLista(["1"])).toBeNull();
    expect(regra.paginaDaLista("3")).toBe(3);
    expect(regra.paginaDaLista("0")).toBe(1);
    expect(regra.paginaDaLista("-2")).toBe(1);
    expect(regra.paginaDaLista({})).toBe(1);
  });
  test("a exceção da folha pede o que aconteceu e a observação", () => {
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "arrancada", observacao: "Rasgou na hora de preencher" }))
      .toEqual({ folha: 70090, destino: "ARRANCADA", observacao: "Rasgou na hora de preencher" });
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "lancada", observacao: "x" }).erro).toMatch(/cancelada, arrancada ou extraviada/);
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "cancelada", observacao: "  " }).erro).toMatch(/observação/);
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "cancelada", observacao: "x".repeat(301) }).erro).toMatch(/300/);
    expect(regra.excecaoDaFolha({ folha: "abc", oQueAconteceu: "cancelada", observacao: "x" }).erro).toMatch(/folha/);
  });
});

describe("a porta da rota FinBlocos", () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-" + "x".repeat(24); });
  beforeEach(() => { mockConsultas = []; mockRegras = []; });
  const sessao = (extra) => auth.reassinarSessao({ membroId: 700002, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
  const GERAL = () => sessao({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
  const LOCAL = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] });
  const SEM = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["pessoas"] });
  async function chamar({ acao, metodo = "GET", query = {}, corpo, token }) {
    const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = String(v);
    await rota(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }

  test("sem sessão: 401 na lista e nas gravações; sem a permissão financeiro: 403", async () => {
    expect((await chamar({})).status).toBe(401);
    expect((await chamar({ acao: "lote", metodo: "POST", corpo: {} })).status).toBe(401);
    expect((await chamar({ token: SEM() })).status).toBe(403);
  });
  test("a congregação e a área não cadastram lote, não registram chegada nem entregam (só a Tesouraria Geral)", async () => {
    for (const acao of ["lote", "chegada", "entregar"]) {
      const r = await chamar({ acao, metodo: "POST", corpo: { serie: 2026, primeiraFolha: 1, totalFolhas: 50 }, token: LOCAL() });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas.filter((c) => /INSERT|UPDATE/.test(c.sql))).toHaveLength(0);
  });
  test("ação que não existe: 404, sem tocar no banco", async () => {
    expect((await chamar({ acao: "apagar", metodo: "POST", token: GERAL() })).status).toBe(404);
    expect((await chamar({ acao: "lote", metodo: "GET", token: GERAL() })).status).toBe(404);
    expect(mockConsultas.filter((c) => /INSERT|UPDATE|DELETE/.test(c.sql))).toHaveLength(0);
  });
  test("a congregação fora do escopo e a que não existe têm a mesma resposta (404)", async () => {
    mockRegras.push([/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (i.id === 5 ? [{ Nome: "Bela Vista" }] : [])]);
    const fora = await chamar({ query: { congregacaoId: 5 }, token: LOCAL() });
    const nao = await chamar({ query: { congregacaoId: 99 }, token: LOCAL() });
    const lixo = await chamar({ query: { congregacaoId: "1 OR 1=1" }, token: LOCAL() });
    expect([fora.status, nao.status, lixo.status]).toEqual([404, 404, 404]);
    expect(fora.body).toEqual(nao.body);
  });
  test("a lista da congregação nunca traz o que está na Geral (a condição vai no SQL) e filtra pelo escopo", async () => {
    mockRegras.push([/SELECT CongregacaoId, Nome FROM Congregacoes/, [{ CongregacaoId: 3, Nome: "Vila Nova" }, { CongregacaoId: 4, Nome: "Bela Vista" }]]);
    const r = await chamar({ query: { situacao: "na-geral", procura: "70.090", pagina: "2" }, token: LOCAL() });
    expect(r.status).toBe(200);
    const lista = mockConsultas.find((c) => /FROM FinBlocos b\s+LEFT JOIN Congregacoes/.test(c.sql));
    expect(lista.sql).toMatch(/b\.CongregacaoId IS NOT NULL/);
    expect(lista.sql).toMatch(/1 = 0/);                       // "na Geral" para a congregação: nada
    expect(lista.inputs.escopoCongIds).toBe(JSON.stringify([3]));
    expect(lista.inputs.n).toBe(70090);
    expect(lista.inputs.pular).toBe(40);
  });
  test("a lista da Tesouraria Geral vê tudo, sem condição de escopo", async () => {
    const r = await chamar({ query: { situacao: "na-geral" }, token: GERAL() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, blocos: [], total: 0, pagina: 1, porPagina: 40, resumo: { tipo: "lote", lote: null } });
    const lista = mockConsultas.find((c) => /FROM FinBlocos b\s+LEFT JOIN Congregacoes/.test(c.sql));
    expect(lista.sql).not.toMatch(/CongregacaoId IS NOT NULL/);
    expect(lista.sql).toMatch(/b\.Situacao = 'NA_GERAL'/);
  });
  test("o lote que não confere volta 422 com a mensagem, sem gravar", async () => {
    const r = await chamar({ acao: "lote", metodo: "POST", corpo: { serie: 2026, primeiraFolha: 70001, totalFolhas: 75 }, token: GERAL() });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/blocos inteiros/);
    expect(mockConsultas.filter((c) => /INSERT/.test(c.sql))).toHaveLength(0);
  });
});
