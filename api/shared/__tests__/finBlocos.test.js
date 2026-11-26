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
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 75 }).erro).toBe("O total de folhas tem de ser blocos inteiros de 50 (por exemplo, 10.000 = 200 blocos).");
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 10 }).erro).toMatch(/pelo menos um bloco/);
    expect(regra.blocosDoLote({ serie: 2026, primeiraFolha: 1, totalFolhas: 50 * 1001 }).erro).toBe("Um lote tem no máximo 1.000 blocos. Cadastre em partes.");
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
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "lancada", observacao: "x" }).erro).toBe("Escolha o que aconteceu: cancelada, arrancada, extraviada ou inexistente.");
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "cancelada", observacao: "  " }).erro).toMatch(/observação/);
    expect(regra.excecaoDaFolha({ folha: 2 ** 40, oQueAconteceu: "cancelada", observacao: "x" }).erro).toMatch(/folha/);
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

// ---- incremento 2 (22/11/2026): as folhas de um bloco, a exceção, o livro, o rastreio e a devolução ----
describe("as folhas e o livro (regra pura)", () => {
  test("a contagem das folhas: cada destino e as livres, de linhas soltas ou agrupadas", () => {
    expect(regra.contagemDasFolhas([{ Destino: "LANCADA" }, { Destino: "LANCADA" }, { Destino: "CANCELADA" }], 50))
      .toEqual({ lancadas: 2, canceladas: 1, arrancadas: 0, extraviadas: 0, inexistentes: 0, livres: 47 });
    expect(regra.contagemDasFolhas([{ Destino: "LANCADA", N: 49 }, { Destino: "CANCELADA", N: 1 }, { Destino: "OUTRO", N: 9 }], 50))
      .toEqual({ lancadas: 49, canceladas: 1, arrancadas: 0, extraviadas: 0, inexistentes: 0, livres: 0 });
    expect(regra.contagemDasFolhas(null, 50).livres).toBe(50);
    expect(regra.destinoDaTela("EXTRAVIADA")).toBe("extraviada");
    expect(regra.destinoDaTela("X")).toBeNull();
  });
  test("a pessoa do livro: do cadastro ou escrita; lixo não passa", () => {
    expect(regra.pessoaDoLivro({ membroId: 1003 }, "x")).toEqual({ membroId: 1003, nome: null });
    expect(regra.pessoaDoLivro({ membroId: "1003", nome: "ignorado" }, "x")).toEqual({ membroId: 1003, nome: null });
    expect(regra.pessoaDoLivro({ nome: "  Lia Fontes " }, "x")).toEqual({ membroId: null, nome: "Lia Fontes" });
    expect(regra.pessoaDoLivro({}, "Informe quem devolveu o bloco.").erro).toBe("Informe quem devolveu o bloco.");
    expect(regra.pessoaDoLivro(null, "r").erro).toBe("r");
    expect(regra.pessoaDoLivro({ nome: "a".repeat(201) }, "r").erro).toMatch(/200/);
    for (const lixo of [0, -1, 1.5, "1e3", "1 OR 1=1", 2147483648, true, [1], { a: 1 }]) expect(regra.pessoaDoLivro({ membroId: lixo }, "r").erro).toBeTruthy();
  });
  test("o livro em páginas de 5 (notebook) ou 3 (celular); outro valor = 5", () => {
    expect(regra.porPaginaDoLivro("3")).toBe(3);
    expect(regra.porPaginaDoLivro(5)).toBe(5);
    for (const lixo of ["40", 0, "-3", "abc", undefined, null, 3.5]) expect(regra.porPaginaDoLivro(lixo)).toBe(5);
  });
  test("os blocos agora: esperando (nenhuma usada), em uso e a devolver (todas com destino)", () => {
    expect(regra.blocosAgora([{ Usadas: 0, Total: 50 }, { Usadas: 12, Total: 50 }, { Usadas: 50, Total: 50 }, { Usadas: 3, Total: 50 }]))
      .toEqual({ emUso: 2, esperando: 1, aDevolver: 1 });
    expect(regra.blocosAgora([])).toEqual({ emUso: 0, esperando: 0, aDevolver: 0 });
  });
});

describe("a porta das ações do incremento 2", () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-" + "x".repeat(24); });
  beforeEach(() => { mockConsultas = []; mockRegras = []; });
  const sessao = (extra) => auth.reassinarSessao({ membroId: 700002, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
  const LOCAL = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] });
  const SEM = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["pessoas"] });
  async function chamar({ acao, metodo = "GET", query = {}, corpo, token }) {
    const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = String(v);
    await rota(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }
  test("folhas, livro e exceção: 401 sem sessão e 403 sem a permissão financeiro", async () => {
    for (const [acao, metodo] of [["folhas", "GET"], ["livro", "GET"], ["folha", "POST"]]) {
      expect((await chamar({ acao, metodo })).status).toBe(401);
      expect((await chamar({ acao, metodo, token: SEM() })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o rastreio e a devolução são só da Tesouraria Geral (403 para a congregação, sem tocar no banco)", async () => {
    expect((await chamar({ acao: "rastreio", query: { folha: 68001 }, token: LOCAL() })).status).toBe(403);
    expect((await chamar({ acao: "devolver", metodo: "POST", corpo: { primeiraFolha: 68001, pessoa: { nome: "x" } }, token: LOCAL() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o bloco pedido com lixo na query: 404 antes do banco", async () => {
    for (const lixo of ["1 OR 1=1", "-1", "1.5", "abc"]) expect((await chamar({ acao: "folhas", query: { bloco: lixo }, token: LOCAL() })).status).toBe(404);
    expect(mockConsultas).toHaveLength(0);
  });
  test("a exceção sem observação volta 422 com a mensagem, sem gravar", async () => {
    const r = await chamar({ acao: "folha", metodo: "POST", corpo: { folha: 70090, oQueAconteceu: "cancelada", observacao: "  " }, token: LOCAL() });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/observação/);
    expect(mockConsultas.filter((c) => /INSERT|UPDATE/.test(c.sql))).toHaveLength(0);
  });

  // revisão m7 (o M9 de antes): o escopo das folhas e do livro também provado no jest, que o CI roda (o SQL de verdade, no e2e local)
  const CONGREGACOES = [/SELECT CongregacaoId, Nome FROM Congregacoes/, [{ CongregacaoId: 3, Nome: "Vila Nova" }, { CongregacaoId: 4, Nome: "Bela Vista" }]];
  const ESCOPO_NO_SQL = (coluna) => new RegExp(`${coluna.replace(".", "\\.")} IN \\(SELECT CAST\\(value AS INT\\) FROM OPENJSON\\(@escopoCongIds\\)\\)`);
  test("as folhas da congregação: só as entregas que foram para o escopo dela (a condição vai no SQL, com os ids do escopo)", async () => {
    mockRegras.push(CONGREGACOES);
    const r = await chamar({ acao: "folhas", token: LOCAL() });
    expect(r.status).toBe(200);
    const vistas = mockConsultas.find((c) => /WITH vistas AS/.test(c.sql));
    expect(vistas.sql).toMatch(ESCOPO_NO_SQL("s.CongregacaoId"));
    expect(vistas.inputs.escopoCongIds).toBe(JSON.stringify([3]));
  });
  test("o bloco pedido pela congregação passa pela mesma condição de escopo; fora dele, o 404 é o mesmo do que não existe", async () => {
    mockRegras.push(CONGREGACOES);
    const fora = await chamar({ acao: "folhas", query: { bloco: 7 }, token: LOCAL() });
    const vistas = mockConsultas.find((c) => /WITH vistas AS/.test(c.sql));
    expect(vistas.sql).toMatch(ESCOPO_NO_SQL("s.CongregacaoId"));
    expect(vistas.inputs).toMatchObject({ id: 7, escopoCongIds: JSON.stringify([3]) });
    const nao = await chamar({ acao: "folhas", query: { bloco: 9999999 }, token: LOCAL() });
    expect([fora.status, nao.status]).toEqual([404, 404]);
    expect(fora.body).toEqual(nao.body);
    expect(mockConsultas.filter((c) => /FROM FinFolhas f\s+LEFT JOIN FinLivroBlocos/.test(c.sql))).toHaveLength(0);
  });
  test("o escopo sem nenhuma congregação conhecida: nada, sem nem consultar os blocos", async () => {
    mockRegras.push([/SELECT CongregacaoId, Nome FROM Congregacoes/, [{ CongregacaoId: 4, Nome: "Bela Vista" }]]);
    expect((await chamar({ acao: "folhas", query: { bloco: 7 }, token: LOCAL() })).status).toBe(404);
    const r = await chamar({ acao: "folhas", token: LOCAL() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ bloco: null, folhas: [], opcoes: [] });
    expect(mockConsultas.filter((c) => /WITH vistas AS|FROM FinFolhas/.test(c.sql))).toHaveLength(0);
  });
  test("regra 4 do banco (revisão m4): o filtro das entregas não põe função na coluna", async () => {
    mockRegras.push(CONGREGACOES);
    await chamar({ acao: "folhas", token: LOCAL() });
    const vistas = mockConsultas.find((c) => /WITH vistas AS/.test(c.sql));
    expect(vistas.sql).not.toMatch(/ISNULL\(/);
    expect(vistas.sql).toMatch(/\(e\.RegistroId IS NULL OR e\.Parcial = 0 OR e\.PrimeiraFolha > s\.PrimeiraFolha\)/);
  });
  test("o livro da congregação: só as linhas do escopo, e o quadro \"agora\" também", async () => {
    mockRegras.push(CONGREGACOES);
    const r = await chamar({ acao: "livro", token: LOCAL() });
    expect(r.status).toBe(200);
    const livro = mockConsultas.find((c) => /FROM FinLivroBlocos l\b/.test(c.sql));
    expect(livro.sql).toMatch(/l\.Tipo IN \('SAIDA', 'ENTRADA'\)/);
    expect(livro.sql).toMatch(ESCOPO_NO_SQL("l.CongregacaoId"));
    expect(livro.inputs.escopoCongIds).toBe(JSON.stringify([3]));
    const agora = mockConsultas.find((c) => /FROM FinBlocos b\s+OUTER APPLY/.test(c.sql));
    expect(agora.sql).toMatch(/b\.Situacao = 'ENTREGUE' AND /);
    expect(agora.sql).toMatch(ESCOPO_NO_SQL("b.CongregacaoId"));
    expect(agora.inputs.escopoCongIds).toBe(JSON.stringify([3]));
  });
});

// ---- a revisão de 23/11/2026: a regra dele de desfazer a exceção da folha e o "levado pela área" ----
describe("a revisão de 23/11/2026 (regra pura)", () => {
  test("\"levado pela área\": sim, não ou sem o campo; qualquer outra coisa é recusada (nunca vira \"não\" calado)", () => {
    expect(regra.levadoPelaArea(true)).toBe(true);
    expect(regra.levadoPelaArea(false)).toBe(false);
    expect(regra.levadoPelaArea(undefined)).toBe(false);
    expect(regra.levadoPelaArea(null)).toBe(false);
    for (const lixo of ["true", "false", 1, 0, "sim", "", [], {}, [true]]) expect(regra.levadoPelaArea(lixo)).toBeNull();
  });
  test("desfazer a exceção: a folha e o motivo, obrigatório (até 300 letras)", () => {
    expect(regra.desfazimentoDaFolha({ folha: "70090", motivo: "  Marcada na folha errada  " })).toEqual({ folha: 70090, motivo: "Marcada na folha errada" });
    expect(regra.desfazimentoDaFolha({ folha: 70090, motivo: "   " }).erro).toMatch(/motivo/);
    expect(regra.desfazimentoDaFolha({ folha: 70090 }).erro).toMatch(/motivo/);
    expect(regra.desfazimentoDaFolha({ folha: 70090, motivo: "x".repeat(301) }).erro).toMatch(/300/);
    for (const lixo of [null, undefined, "abc", 1.5, -3, 0, 2 ** 40, [], {}, "1e3"]) expect(regra.desfazimentoDaFolha({ folha: lixo, motivo: "x" }).erro).toBeTruthy();
    expect(regra.desfazimentoDaFolha(null).erro).toBeTruthy();
  });
});

// ---- a regra dele de 24/11/2026 (no lugar da "devolução só de bloco cheio" de 23/11): a devolução completa ou parcial ----
describe("a devolução completa ou parcial (regra de 24/11/2026)", () => {
  test("parcial: sim (true), não (false ou sem o campo); qualquer outra coisa é recusada (nunca vira \"completa\" calada)", () => {
    expect(regra.devolucaoParcial(true)).toBe(true);
    expect(regra.devolucaoParcial(false)).toBe(false);
    expect(regra.devolucaoParcial(undefined)).toBe(false);
    expect(regra.devolucaoParcial(null)).toBe(false);
    for (const lixo of ["true", "parcial", 1, 0, "", [], {}, [true]]) expect(regra.devolucaoParcial(lixo)).toBeNull();
  });
  test("nada se recusa por folha livre (r30): as recusas de 23/11 e da primeira leitura de 24/11 saíram", () => {
    expect(regra.recusaDoBlocoComFolhaLivre).toBeUndefined();
    expect(regra.recusaDaDevolucaoCompleta).toBeUndefined();
  });
  test("a mensagem da devolução parcial: as folhas que voltam livres (a r30), no plural e no singular", () => {
    expect(regra.mensagemDaParcial(1288, 64436, 64450)).toBe("Bloco 1.288 de volta, parcial: as folhas 64.436 a 64.450 estão livres para outra entrega.");
    expect(regra.mensagemDaParcial(1288, 64450, 64450)).toBe("Bloco 1.288 de volta, parcial: a folha 64.450 está livre para outra entrega.");
  });
  test("a parcial com inexistentes (resposta dele, 24/11/2026): as do fim ficam fora das livres; as do meio, ditas", () => {
    expect(regra.faixaLivre(70140, 70150, [70150])).toEqual({ de: 70140, ate: 70149, menos: [] });
    expect(regra.faixaLivre(70140, 70150, [70149, 70150])).toEqual({ de: 70140, ate: 70148, menos: [] });
    expect(regra.faixaLivre(70240, 70250, [70247, 70245])).toEqual({ de: 70240, ate: 70250, menos: [70245, 70247] });
    expect(regra.faixaLivre(70240, 70250, [70245, 70250])).toEqual({ de: 70240, ate: 70249, menos: [70245] });
    expect(regra.faixaLivre(64436, 64450, [])).toEqual({ de: 64436, ate: 64450, menos: [] });
    expect(regra.mensagemDaParcial(1402, 70140, 70149)).toBe("Bloco 1.402 de volta, parcial: as folhas 70.140 a 70.149 estão livres para outra entrega.");
    expect(regra.mensagemDaParcial(1404, 70240, 70250, [70245]))
      .toBe("Bloco 1.404 de volta, parcial: as folhas 70.240 a 70.250 (menos a 70.245, inexistente) estão livres para outra entrega.");
    expect(regra.mensagemDaParcial(1404, 70240, 70250, [70243, 70245, 70247]))
      .toBe("Bloco 1.404 de volta, parcial: as folhas 70.240 a 70.250 (menos as 70.243, 70.245 e 70.247, inexistentes) estão livres para outra entrega.");
    expect(regra.mensagemJaVoltouParcial(1404, "2026-11-20", 70240, 70250, [70245]))
      .toBe("O bloco 1.404 já voltou, parcial, em 20/11/2026: as folhas 70.240 a 70.250 (menos a 70.245, inexistente) estão livres na Tesouraria Geral para outra entrega.");
  });

  test("o bloco que já voltou em parte e está na Geral não volta de novo antes de sair (revisão m3: não é \"não saiu\")", () => {
    expect(regra.mensagemJaVoltouParcial(1288, "2026-11-20", 64436, 64450))
      .toBe("O bloco 1.288 já voltou, parcial, em 20/11/2026: as folhas 64.436 a 64.450 estão livres na Tesouraria Geral para outra entrega.");
    expect(regra.mensagemJaVoltouParcial(1288, "2026-11-20", 64450, 64450))
      .toBe("O bloco 1.288 já voltou, parcial, em 20/11/2026: a folha 64.450 está livre na Tesouraria Geral para outra entrega.");
  });
});

describe("a porta de desfazer a exceção da folha (só a Tesouraria Geral)", () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-" + "x".repeat(24); });
  beforeEach(() => { mockConsultas = []; mockRegras = []; });
  const sessao = (extra) => auth.reassinarSessao({ membroId: 700002, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
  const GERAL = () => sessao({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
  const LOCAL = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] });
  const AREA = () => sessao({ nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Central"], permissoes: ["financeiro"] });
  async function chamar({ acao, metodo = "GET", corpo, token }) {
    const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await rota(context, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }
  test("sem sessão 401; a congregação e a área 403, sem tocar no banco", async () => {
    const corpo = { folha: 70090, motivo: "Marcada na folha errada" };
    expect((await chamar({ acao: "desfazer-folha", metodo: "POST", corpo })).status).toBe(401);
    expect((await chamar({ acao: "desfazer-folha", metodo: "POST", corpo, token: LOCAL() })).status).toBe(403);
    expect((await chamar({ acao: "desfazer-folha", metodo: "POST", corpo, token: AREA() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sem o motivo: 422 com a mensagem, sem tocar no banco", async () => {
    const r = await chamar({ acao: "desfazer-folha", metodo: "POST", corpo: { folha: 70090, motivo: " " }, token: GERAL() });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/motivo/);
    expect(mockConsultas).toHaveLength(0);
  });
  test("pelo GET não desfaz (ação inválida)", async () => {
    expect((await chamar({ acao: "desfazer-folha", metodo: "GET", token: GERAL() })).status).toBe(404);
  });
  test("a devolução com o \"parcial\" que não é sim nem não: 422 com a mensagem, sem tocar no banco (regra de 24/11/2026)", async () => {
    for (const lixo of ["sim", "true", 1]) {
      const r = await chamar({ acao: "devolver", metodo: "POST", corpo: { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: lixo }, token: GERAL() });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toBe("Diga se a devolução é completa ou parcial.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a devolução parcial sem a primeira folha em branco (ou com lixo nela): 422, sem tocar no banco (a r30)", async () => {
    for (const lixo of [undefined, null, "", "abc", 1.5, -1, 0, [], {}]) {
      const r = await chamar({ acao: "devolver", metodo: "POST", corpo: { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: true, primeiraEmBranco: lixo }, token: GERAL() });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toBe("Informe a primeira folha em branco do bloco.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a devolução completa com a primeira folha em branco: 422, sem tocar no banco (o \"parcial\" perdido nunca fecha o bloco calado)", async () => {
    for (const parcial of [false, undefined]) {
      const r = await chamar({ acao: "devolver", metodo: "POST", corpo: { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial, primeiraEmBranco: 70090 }, token: GERAL() });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toBe("A primeira folha em branco só vale na devolução parcial.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
});

// ---- decisão dele de 24/11/2026 (com a aprovação da r30): a FOLHA INEXISTENTE, a que a gráfica não imprimiu ----
// Um tipo a mais de exceção, onde as outras já aparecem: a numeração não pode pular, então a folha que faltou no bloco se cataloga. A observação
// segue a regra das outras exceções (obrigatória).
describe("a folha inexistente (decisão dele de 24/11/2026)", () => {
  test("a exceção aceita \"inexistente\", com a observação obrigatória como as outras", () => {
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "inexistente", observacao: "A gráfica não imprimiu" }))
      .toEqual({ folha: 70090, destino: "INEXISTENTE", observacao: "A gráfica não imprimiu" });
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "Inexistente ", observacao: "x" }).destino).toBe("INEXISTENTE");
    expect(regra.excecaoDaFolha({ folha: 70090, oQueAconteceu: "inexistente", observacao: "  " }).erro).toBe("Escreva a observação: o que aconteceu com a folha.");
  });
  test("o destino guardado vira \"inexistente\" na tela e entra na contagem, como as outras exceções", () => {
    expect(regra.destinoDaTela("INEXISTENTE")).toBe("inexistente");
    expect(regra.contagemDasFolhas([{ Destino: "LANCADA", N: 48 }, { Destino: "INEXISTENTE", N: 1 }, { Destino: "EXTRAVIADA", N: 1 }], 50))
      .toEqual({ lancadas: 48, canceladas: 0, arrancadas: 0, extraviadas: 1, inexistentes: 1, livres: 0 });
  });
});

describe("o histórico da folha e o desfazer (r30-blocos-desfazer)", () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-" + "x".repeat(24); });
  beforeEach(() => { mockConsultas = []; mockRegras = []; });
  const sessao = (extra) => auth.reassinarSessao({ membroId: 700002, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
  const LOCAL = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] });
  const SEM_FINANCEIRO = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["pessoas"] });
  async function chamar({ acao, metodo = "GET", query = {}, token }) {
    const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await rota(context, { method: metodo, query, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }
  test("o motivo vazio: a mensagem da r30", () => {
    expect(regra.desfazimentoDaFolha({ folha: 70086, motivo: "  " }).erro).toBe("Escreva o motivo para desfazer.");
  });
  test("a hora do histórico em Brasília (o banco guarda UTC), como \"aaaa-mm-ddThh:mm\"", () => {
    expect(regra.horaBrasilia(new Date("2026-11-12T12:40:31.123Z"))).toBe("2026-11-12T09:40");
    expect(regra.horaBrasilia(new Date("2026-11-13T01:05:00Z"))).toBe("2026-11-12T22:05");
    expect(regra.horaBrasilia(null)).toBeNull();
  });
  test("quem marcou: o papel da liderança da pessoa (uma por pessoa), na congregação ou na área; fora delas, a Tesouraria Geral", () => {
    expect(regra.papelNoHistorico({ escopoTipo: "CONGREGACAO", papel: "Tesoureiro", congregacao: "Vila Nova" })).toBe("tesoureiro de Vila Nova");
    expect(regra.papelNoHistorico({ escopoTipo: "AREA", papel: "Tesoureiro", area: "Área 2" })).toBe("tesoureiro da Área 2");
    expect(regra.papelNoHistorico({ escopoTipo: "CONGREGACAO", papel: null, congregacao: "Vila Nova" })).toBe("liderança de Vila Nova");
    expect(regra.papelNoHistorico({ escopoTipo: "GLOBAL", papel: "Tesoureiro" })).toBe("Tesouraria Geral");
    expect(regra.papelNoHistorico({ escopoTipo: "CONGREGACAO", papel: "Tesoureiro", congregacao: null })).toBe("Tesouraria Geral");
    expect(regra.papelNoHistorico({})).toBe("Tesouraria Geral");
  });
  test("a porta do histórico: sem sessão 401, sem a permissão financeiro 403, a folha que não é número 404, sem tocar no banco", async () => {
    expect((await chamar({ acao: "historico", query: { folha: "70086" } })).status).toBe(401);
    expect((await chamar({ acao: "historico", query: { folha: "70086" }, token: SEM_FINANCEIRO() })).status).toBe(403);
    for (const folha of ["", "abc", "70086 OR 1=1", "-5", "1.5", "99999999999", undefined]) {
      const r = await chamar({ acao: "historico", query: { folha }, token: LOCAL() });
      expect(r.status).toBe(404);
      expect(r.body.mensagem).toBe("Registro não encontrado.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o histórico só pelo GET (o POST é ação inválida da Tesouraria Geral)", async () => {
    expect((await chamar({ acao: "historico", metodo: "POST", token: LOCAL() })).status).toBe(403);
  });
});
describe("a devolução (r30-blocos-devolver)", () => {
  test("o nome do destino na frase: \"já está lançada\"", () => {
    expect(regra.nomeDoDestino("LANCADA")).toBe("lançada");
    expect(regra.nomeDoDestino("CANCELADA")).toBe("cancelada");
    expect(regra.nomeDoDestino("ARRANCADA")).toBe("arrancada");
    expect(regra.nomeDoDestino("EXTRAVIADA")).toBe("extraviada");
    expect(regra.nomeDoDestino("INEXISTENTE")).toBe("inexistente");
  });
});
describe("a saída (r30-blocos-saida)", () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-so-do-teste-" + "x".repeat(24); });
  beforeEach(() => { mockConsultas = []; mockRegras = []; });
  const sessao = (extra) => auth.reassinarSessao({ membroId: 700002, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
  const GERAL = () => sessao({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
  const LOCAL = () => sessao({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] });
  const AREA = () => sessao({ nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Monte Sião"], permissoes: ["financeiro"] });
  async function chamar({ acao, metodo = "GET", query = {}, token }) {
    const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await rota(context, { method: metodo, query, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }
  test("a porta de para-saida: sem sessão 401; a congregação e a área 403 (só a Tesouraria Geral), sem tocar no banco", async () => {
    expect((await chamar({ acao: "para-saida" })).status).toBe(401);
    expect((await chamar({ acao: "para-saida", token: LOCAL() })).status).toBe(403);
    expect((await chamar({ acao: "para-saida", query: { congregacaoId: "2" }, token: AREA() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("a congregação que não é número: o mesmo 404 da que não existe, sem tocar no banco", async () => {
    for (const congregacaoId of ["abc", "2 OR 1=1", "-5", "1.5", "99999999999"]) {
      const r = await chamar({ acao: "para-saida", query: { congregacaoId }, token: GERAL() });
      expect(r.status).toBe(404);
      expect(r.body.mensagem).toBe("Registro não encontrado.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("para-saida só pelo GET", async () => {
    expect((await chamar({ acao: "para-saida", metodo: "POST", token: GERAL() })).status).toBe(404);
  });
});
describe("a folha digitada vai junto (portão da parte 2, I1)", () => {
  test("sem a folha digitada (pedido antigo), nada muda; com ela, só número inteiro positivo", () => {
    for (const v of [undefined, null, ""]) expect(regra.folhaDigitada(v)).toEqual({ folha: null, erro: null });
    expect(regra.folhaDigitada(64436)).toEqual({ folha: 64436, erro: null });
    for (const v of ["64436", "abc", -1, 0, 1.5, "1 OR 1=1", 99999999999, {}, []]) expect(regra.folhaDigitada(v)).toEqual({ folha: null, erro: "A folha digitada não confere." });
  });
  test("a folha digitada tem de ser do bloco que a primeira folha aponta (a resposta de um número anterior gravaria o bloco errado)", () => {
    const b = { numero: 1403, primeiraFolha: 70151, ultimaFolha: 70200 };
    expect(regra.folhaForaDoBloco(null, b)).toBeNull();
    expect(regra.folhaForaDoBloco(70151, b)).toBeNull();
    expect(regra.folhaForaDoBloco(70200, b)).toBeNull();
    expect(regra.folhaForaDoBloco(64436, b)).toBe("A folha 64.436 não é do bloco 1.403: confira o número.");
    expect(regra.folhaForaDoBloco(70201, b)).toBe("A folha 70.201 não é do bloco 1.403: confira o número.");
  });
});
