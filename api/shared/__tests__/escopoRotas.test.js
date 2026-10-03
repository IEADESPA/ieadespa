// Regras de escopo compartilhadas pelas rotas (shared/escopoRotas.js) e a falha FECHADA de auth.estaNoEscopo.
const auth = require("../auth");
const er = require("../escopoRotas");
const { criarPoolFalso } = require("./testUtils");

const GERAL = { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] };
const lista = (nomes, extra = {}) => ({ nivel: "CONGREGACAO", escopoCongregacoes: nomes, permissoes: ["pessoas"], ...extra });

describe("auth.estaNoEscopo falha FECHADO", () => {
  test("TODAS passa por qualquer congregação, inclusive sem nome (pessoa sem congregação)", () => {
    expect(auth.estaNoEscopo({ escopoCongregacoes: "TODAS" }, "Central")).toBe(true);
    expect(auth.estaNoEscopo({ escopoCongregacoes: "TODAS" }, null)).toBe(true);
  });
  test("lista: só as congregações da lista; congregação ausente não é alcançada", () => {
    const u = lista(["Central", "Vila Nova"]);
    expect(auth.estaNoEscopo(u, "Central")).toBe(true);
    expect(auth.estaNoEscopo(u, "Outra")).toBe(false);
    expect(auth.estaNoEscopo(u, null)).toBe(false);
    expect(auth.estaNoEscopo(u, "")).toBe(false);
  });
  test("sem a lista (claim ausente, nula, vazia, texto qualquer) NÃO alcança nada — antes valia como 'todas'", () => {
    for (const escopoCongregacoes of [undefined, null, "", "todas", "TODAS ", 0, {}, true]) {
      expect(auth.estaNoEscopo({ escopoCongregacoes }, "Central")).toBe(false);
    }
    expect(auth.estaNoEscopo({}, "Central")).toBe(false);
    expect(auth.estaNoEscopo(null, "Central")).toBe(false);
    expect(auth.estaNoEscopo(lista([]), "Central")).toBe(false);
  });
});

describe("ehGeral / exigirGeral", () => {
  test("geral = nível GLOBAL E escopo TODAS; nenhum dos dois sozinho basta", () => {
    expect(er.ehGeral(GERAL)).toBe(true);
    expect(er.ehGeral({ nivel: "GLOBAL", escopoCongregacoes: ["Central"] })).toBe(false);           // papel Global com escopo de uma congregação
    expect(er.ehGeral({ nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" })).toBe(false);          // papel local concedido com escopo "global" por esquecimento
    expect(er.ehGeral({ nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS" })).toBe(false);         // Líder Geral de Departamento
    expect(er.ehGeral({ nivel: null, escopoCongregacoes: "TODAS" })).toBe(false);
    expect(er.ehGeral({ nivel: "GLOBAL" })).toBe(false);
    expect(er.ehGeral(null)).toBe(false);
    expect(er.ehGeral(undefined)).toBe(false);
  });
  const sessao = (claims) => ({ headers: { "x-auth-token": auth.reassinarSessao({ membroId: 5, termosPendentes: [], ...claims }) } });
  const chamar = (req, permissao) => { const context = {}; const u = er.exigirGeral(req, context, permissao); return { u, res: context.res }; };
  test("sem sessão: 401", () => {
    expect(chamar({ headers: {} }, "pessoas").res.status).toBe(401);
  });
  test("com a permissão mas sem ser geral: 403 (mensagem da administração geral)", () => {
    for (const claims of [{ nivel: "CONGREGACAO", escopoCongregacoes: ["Central"] }, { nivel: "GLOBAL", escopoCongregacoes: ["Central"] }, { nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" }]) {
      const r = chamar(sessao({ permissoes: ["financeiro"], ...claims }), "financeiro");
      expect(r.u).toBeNull();
      expect(r.res).toMatchObject({ status: 403, body: { sucesso: false, mensagem: er.MSG_GERAL } });
    }
  });
  test("geral sem a permissão: 403 da permissão (a ordem é permissão primeiro)", () => {
    const r = chamar(sessao({ permissoes: ["reunioes"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), "financeiro");
    expect(r.u).toBeNull();
    expect(r.res.status).toBe(403);
    expect(r.res.body.mensagem).not.toBe(er.MSG_GERAL);
  });
  test("geral com a permissão: passa; lista de permissões vale 'qualquer uma'; sem permissão exigida só pede login", () => {
    const base = { permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" };
    expect(chamar(sessao(base), "financeiro").u).toMatchObject({ membroId: 5 });
    expect(chamar(sessao(base), ["cli", "financeiro"]).u).toMatchObject({ membroId: 5 });
    expect(chamar(sessao(base), ["cli", "assembleia"]).u).toBeNull();
    expect(chamar(sessao(base), null).u).toMatchObject({ membroId: 5 });
    expect(chamar(sessao({ permissoes: [], nivel: null, escopoCongregacoes: [] }), null).res.status).toBe(403);       // sessão de PIN: nunca geral
  });
  test("a sessão de PIN provisório e os termos pendentes continuam barrando antes do nível", () => {
    expect(chamar(sessao({ permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", pinProvisorio: true }), "financeiro").res.body.criarPin).toBe(true);
    expect(chamar(sessao({ permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", termosPendentes: ["X"] }), "financeiro").res.body.termosPendentes).toEqual(["X"]);
  });
});

describe("noEscopoDaPessoa", () => {
  test("congregação da lista passa; de fora, não; sem congregação só para TODAS", () => {
    expect(er.noEscopoDaPessoa(lista(["Central"]), "Central", null)).toBe(true);
    expect(er.noEscopoDaPessoa(lista(["Central"]), "Vila Nova", null)).toBe(false);
    expect(er.noEscopoDaPessoa(lista(["Central"]), null, null)).toBe(false);
    expect(er.noEscopoDaPessoa(GERAL, null, null)).toBe(true);
  });
  test("escopo por Extensão da Tenda é mais estreito que a congregação-mãe", () => {
    const ext = lista(["Central"], { escopoExtensaoNome: "Tenda Norte" });
    expect(er.noEscopoDaPessoa(ext, "Central", "Tenda Norte")).toBe(true);
    expect(er.noEscopoDaPessoa(ext, "Central", "Tenda Sul")).toBe(false);
    expect(er.noEscopoDaPessoa(ext, "Central", null)).toBe(false);
    expect(er.noEscopoDaPessoa(lista(["Central"]), "Central", "Tenda Sul")).toBe(true);        // sem restrição de extensão, a extensão da pessoa não importa
  });
});

describe("carregarPessoa / pessoaAlcancavel / filtrarPorEscopo / congregacaoNoEscopo", () => {
  const linha = (extra = {}) => ({ MembroId: 40, Nome: "Maria", Status: "ATIVO", CongregacaoNome: "Central", ExtensaoNome: null, ...extra });

  test("matrícula malformada não consulta o banco", async () => {
    for (const ruim of ["0x10", "1e1", "05", "-1", " 5", "abc", null, undefined, true, [5], 0]) {
      const { pool, chamadas } = criarPoolFalso([[linha()]]);
      expect(await er.carregarPessoa(pool, ruim)).toBeNull();
      expect(chamadas).toHaveLength(0);
    }
  });
  test("devolve nome, status, congregação e extensão; inexistente → null", async () => {
    const { pool, chamadas } = criarPoolFalso([[linha({ ExtensaoNome: "Tenda Norte" })], []]);
    expect(await er.carregarPessoa(pool, "40")).toEqual({ membroId: 40, nome: "Maria", status: "ATIVO", congregacaoNome: "Central", extensaoNome: "Tenda Norte" });
    expect(chamadas[0].inputs.id).toBe(40);
    expect(chamadas[0].sql).toMatch(/LEFT JOIN Congregacoes/);
    expect(chamadas[0].sql).toMatch(/LEFT JOIN ExtensoesTenda/);
    expect(await er.carregarPessoa(pool, 41)).toBeNull();
  });
  test("pessoaAlcancavel: no escopo devolve a pessoa; fora do escopo e inexistente dão o MESMO null", async () => {
    const dentro = await er.pessoaAlcancavel(criarPoolFalso([[linha()]]).pool, lista(["Central"]), 40);
    expect(dentro).toMatchObject({ membroId: 40 });
    const fora = await er.pessoaAlcancavel(criarPoolFalso([[linha({ CongregacaoNome: "Vila Nova" })]]).pool, lista(["Central"]), 40);
    const inexistente = await er.pessoaAlcancavel(criarPoolFalso([[]]).pool, lista(["Central"]), 40);
    expect(fora).toBeNull();
    expect(inexistente).toBeNull();
    expect(await er.pessoaAlcancavel(criarPoolFalso([[linha({ CongregacaoNome: null })]]).pool, lista(["Central"]), 40)).toBeNull();      // sem congregação
    expect(await er.pessoaAlcancavel(criarPoolFalso([[linha({ CongregacaoNome: null })]]).pool, GERAL, 40)).toMatchObject({ membroId: 40 });
  });
  test("filtrarPorEscopo filtra a lista pela congregação (e extensão) de cada linha", () => {
    const linhas = [{ id: 1, c: "Central" }, { id: 2, c: "Vila Nova" }, { id: 3, c: null }, { id: 4, c: "Central", e: "Tenda Norte" }];
    expect(er.filtrarPorEscopo(lista(["Central"]), linhas, l => l.c, l => l.e).map(l => l.id)).toEqual([1, 4]);
    expect(er.filtrarPorEscopo(GERAL, linhas, l => l.c).map(l => l.id)).toEqual([1, 2, 3, 4]);
    expect(er.filtrarPorEscopo(lista(["Central"], { escopoExtensaoNome: "Tenda Norte" }), linhas, l => l.c, l => l.e).map(l => l.id)).toEqual([4]);
    expect(er.filtrarPorEscopo(lista([]), linhas, l => l.c)).toEqual([]);
    expect(er.filtrarPorEscopo(GERAL, null, l => l.c)).toEqual([]);
  });
  test("congregacaoNoEscopo: no escopo true; fora, inexistente e id malformado false", async () => {
    expect(await er.congregacaoNoEscopo(criarPoolFalso([[{ Nome: "Central" }]]).pool, lista(["Central"]), 3)).toBe(true);
    expect(await er.congregacaoNoEscopo(criarPoolFalso([[{ Nome: "Vila Nova" }]]).pool, lista(["Central"]), 3)).toBe(false);
    expect(await er.congregacaoNoEscopo(criarPoolFalso([[]]).pool, lista(["Central"]), 3)).toBe(false);
    const { pool, chamadas } = criarPoolFalso([[{ Nome: "Central" }]]);
    expect(await er.congregacaoNoEscopo(pool, GERAL, "0x3")).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});
