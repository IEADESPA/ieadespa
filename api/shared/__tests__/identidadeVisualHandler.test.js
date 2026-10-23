// A rota da Identidade Visual (v7.14) com o handler de verdade e a camada de banco SIMULADA: a porta de cada ação (sem sessão, PIN, liderança sem o nível Geral, permissão
// enxertada num PIN), o 403 ANTES de qualquer consulta, a confirmação reforçada (428) nos atos que pedem, os identificadores como o HTTP os entrega (TEXTO), o membroId que vem
// sempre da sessão, o mapa das respostas (404, 409, 429, 422, 201) e o no-store. O comportamento contra o SQL Server está nos roteiros tools/e2e-localdb/e2e-31 e e2e-32.
jest.mock("../db", () => ({ getPool: async () => ({}), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../identidadeVisualDb", () => ({
  PERMISSAO: "identidade_visual",
  painelMembro: jest.fn(async () => ({ sucesso: true, ciclo: null })), imagemDaArte: jest.fn(async () => ({ sucesso: true, url: "u" })),
  painelGestao: jest.fn(async () => ({ sucesso: true, ciclos: [] })), listarTemas: jest.fn(async () => []), detalheCiclo: jest.fn(async () => ({ sucesso: true })),
  sugerir: jest.fn(async () => ({ sucesso: true, sugestaoId: 1 })), retirarSugestao: jest.fn(async () => ({ sucesso: true })),
  enviarArte: jest.fn(async () => ({ sucesso: true, arteId: 1 })), retirarArte: jest.fn(async () => ({ sucesso: true })),
  abrirCiclo: jest.fn(async () => ({ sucesso: true, cicloId: 1 })), cancelarCiclo: jest.fn(async () => ({ sucesso: true })),
  salvarTema: jest.fn(async () => ({ sucesso: true })), excluirTema: jest.fn(async () => ({ sucesso: true })), triar: jest.fn(async () => ({ sucesso: true })),
  criarVotacao: jest.fn(async () => ({ sucesso: true })), desempatar: jest.fn(async () => ({ sucesso: true })), salvarCor: jest.fn(async () => ({ sucesso: true })),
  excluirCor: jest.fn(async () => ({ sucesso: true })), recusarArte: jest.fn(async () => ({ sucesso: true })), registrarResultado: jest.fn(async () => ({ sucesso: true }))
}));

const auth = require("../auth");
const db = require("../identidadeVisualDb");
const handler = require("../../GestaoIdentidadeVisual/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const VELHO = { via: "CHAVE", em: Date.now() - 3600000 };
const PERM = ["identidade_visual"];
const GERAL = (fator = COM_FATOR, permissoes = PERM) => tokenDe(1, { via: "SENHA", fator, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = () => tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: PERM });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const chamadasAoBanco = () => Object.values(db).filter((f) => f && f.mock).reduce((n, f) => n + f.mock.calls.length, 0);
beforeEach(() => { jest.clearAllMocks(); });

const GESTAO_GET = ["painel", "ciclo", "temas"];
const GESTAO_POST = ["abrir-ciclo", "cancelar-ciclo", "tema", "excluir-tema", "triar", "abrir-votacao", "desempate", "cor", "excluir-cor", "recusar-arte", "resultado"];
const TODOS_GET = ["catalogos", "meu", "imagem", ...GESTAO_GET];
const TODOS_POST = ["sugerir", "retirar-sugestao", "arte", "retirar-arte", ...GESTAO_POST];
const CORPO = { cicloId: 1, sugestaoId: 1, arteId: 1, corId: 1, temaUsadoId: 1, decisao: "DESCARTADA" };

describe("a porta", () => {
  test("sem sessão: 401 em todas as ações, sem tocar no banco", async () => {
    for (const a of TODOS_GET) expect((await chamar(a)).status).toBe(401);
    for (const a of TODOS_POST) expect((await chamar(a, { metodo: "POST" })).status).toBe(401);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("PIN, Dirigente com a permissão (não é o Geral) e Geral sem a permissão: 403 em TODA ação da Diretoria, ANTES de qualquer consulta", async () => {
    for (const tok of [PIN(), LOCAL(), GERAL(COM_FATOR, ["pessoas"])]) {
      for (const a of GESTAO_GET) expect((await chamar(a, { token: tok, query: { cicloId: 1 } })).status).toBe(403);
      for (const a of GESTAO_POST) expect((await chamar(a, { metodo: "POST", token: tok, corpo: CORPO })).status).toBe(403);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("o PIN com a permissão e o nível enxertados no token continua sem gestão (não é sessão de liderança)", async () => {
    const enxertado = tokenDe(10, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
    expect((await chamar("painel", { token: enxertado })).status).toBe(403);
    expect((await chamar("catalogos", { token: enxertado })).body.papeis).toEqual({ gestao: false });
    expect((await chamar("catalogos", { token: GERAL() })).body.papeis).toEqual({ gestao: true });
  });
  test("o membro por PIN usa as ações dele; o membroId é sempre o da sessão (nunca o do corpo)", async () => {
    expect((await chamar("sugerir", { metodo: "POST", token: PIN(10), corpo: { texto: "Fé", membroId: 99 } })).status).toBe(201);
    expect(db.sugerir.mock.calls[0][1]).toEqual({ membroId: 10, texto: "Fé" });
    await chamar("retirar-sugestao", { metodo: "POST", token: PIN(10), corpo: { sugestaoId: "7", membroId: 99 } });
    expect(db.retirarSugestao.mock.calls[0][1]).toEqual({ membroId: 10, sugestaoId: 7 });
    await chamar("arte", { metodo: "POST", token: PIN(10), corpo: { imagemBase64: "x", tipo: "image/png", membroId: 99 } });
    expect(db.enviarArte.mock.calls[0][1].membroId).toBe(10);
    await chamar("meu", { token: PIN(10) });
    expect(db.painelMembro.mock.calls[0][1]).toEqual({ membroId: 10 });
    await chamar("imagem", { token: PIN(10), query: { arteId: 3 } });
    expect(db.imagemDaArte.mock.calls[0][1]).toEqual({ membroId: 10, gestao: false, arteId: 3 });
  });
  test("ação inexistente: 404; método errado: 405; GET de uma ação de escrita: 404", async () => {
    expect((await chamar("nada", { token: GERAL() })).status).toBe(404);
    expect((await chamar("meu", { metodo: "PUT", token: GERAL() })).status).toBe(405);
    expect((await chamar("sugerir", { token: PIN() })).status).toBe(404);
    expect((await chamar("painel", { metodo: "POST", token: GERAL() })).status).toBe(404);
  });
});

describe("a confirmação reforçada", () => {
  test("aprovar finalista, abrir a votação, desempatar e registrar o resultado: 428 sem a confirmação recente (nada chega ao banco)", async () => {
    const velho = GERAL(VELHO);
    for (const [acao, corpo] of [["triar", { sugestaoId: 1, decisao: "FINALISTA" }], ["abrir-votacao", { cicloId: 1 }], ["desempate", { sugestaoId: 1, motivo: "x" }],
      ["resultado", { cicloId: 1, arteId: 1, corId: 1 }]]) {
      const r = await chamar(acao, { metodo: "POST", token: velho, corpo });
      expect(r.status).toBe(428);
      expect(r.body.precisaFator).toBe(true);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("descartar, cores, temas e abrir o ciclo não pedem", async () => {
    const velho = GERAL(VELHO);
    expect((await chamar("triar", { metodo: "POST", token: velho, corpo: { sugestaoId: 1, decisao: "DESCARTADA", criterio: 1 } })).status).toBe(200);
    expect((await chamar("cor", { metodo: "POST", token: velho, corpo: { cicloId: 1, ordem: 1 } })).status).toBe(200);
    expect((await chamar("tema", { metodo: "POST", token: velho, corpo: { ano: 2010, tema: "x" } })).status).toBe(201);
    expect((await chamar("abrir-ciclo", { metodo: "POST", token: velho, corpo: { anoAlvo: 2028 } })).status).toBe(201);
  });
  test("com a confirmação, o ato chega ao banco com quem fez", async () => {
    expect((await chamar("abrir-votacao", { metodo: "POST", token: GERAL(), corpo: { cicloId: "4" } })).status).toBe(201);
    expect(db.criarVotacao.mock.calls[0][1]).toEqual({ cicloId: 4, porMembroId: 1 });
    await chamar("resultado", { metodo: "POST", token: GERAL(), corpo: { cicloId: "4", arteId: "5", corId: "6", dataCulto: "2027-12-19" } });
    expect(db.registrarResultado.mock.calls[0][1]).toMatchObject({ ver: { membroId: 1, gestao: true }, cicloId: 4, dados: { arteId: 5, corId: 6, dataCulto: "2027-12-19" } });
  });
});

describe("os identificadores e as respostas", () => {
  test.each(["0x10", "1e1", "-1", "1.5", "abc", "0", " ", "99999999999"])("identificador %p: 400 sem tocar no banco", async (v) => {
    expect((await chamar("ciclo", { token: GERAL(), query: { cicloId: v } })).status).toBe(400);
    expect((await chamar("retirar-sugestao", { metodo: "POST", token: PIN(), corpo: { sugestaoId: v } })).status).toBe(400);
    expect((await chamar("cor", { metodo: "POST", token: GERAL(), corpo: { cicloId: v } })).status).toBe(400);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("lista, objeto e booleano no lugar do id: 400", async () => {
    for (const v of [[1], { a: 1 }, true]) expect((await chamar("retirar-arte", { metodo: "POST", token: PIN(), corpo: { arteId: v } })).status).toBe(400);
  });
  test("o que falta: 400 com o nome do campo", async () => {
    const r = await chamar("excluir-cor", { metodo: "POST", token: GERAL(), corpo: {} });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/corId/);
    expect((await chamar("imagem", { token: PIN() })).status).toBe(400);
  });
  test("o mapa: não existe 404 (sem detalhes), mudou 409, ocupado 429, recusa 422, criou 201", async () => {
    db.retirarSugestao.mockResolvedValueOnce({ sucesso: false, naoExiste: true });
    const r404 = await chamar("retirar-sugestao", { metodo: "POST", token: PIN(), corpo: { sugestaoId: 1 } });
    expect(r404.status).toBe(404);
    expect(r404.body).toEqual({ sucesso: false, mensagem: "Não encontrado." });
    db.triar.mockResolvedValueOnce({ sucesso: false, mudou: true, mensagem: "mudou" });
    expect((await chamar("triar", { metodo: "POST", token: GERAL(), corpo: { sugestaoId: 1, decisao: "DESCARTADA" } })).status).toBe(409);
    db.sugerir.mockResolvedValueOnce({ sucesso: false, limite: true, mensagem: "ocupado" });
    expect((await chamar("sugerir", { metodo: "POST", token: PIN(), corpo: { texto: "x" } })).status).toBe(429);
    db.sugerir.mockResolvedValueOnce({ sucesso: false, mensagem: "não" });
    expect((await chamar("sugerir", { metodo: "POST", token: PIN(), corpo: { texto: "x" } })).status).toBe(422);
    expect((await chamar("abrir-ciclo", { metodo: "POST", token: GERAL(), corpo: { anoAlvo: 2028 } })).status).toBe(201);
  });
  test("nada fica em cache", async () => {
    const r = await chamar("meu", { token: PIN() });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect((await chamar("painel", { token: PIN() })).headers["Cache-Control"]).toBe("no-store");
  });
  test("erro do banco: 500 sem o texto interno", async () => {
    db.painelMembro.mockRejectedValueOnce(new Error("SELECT * FROM IdentidadeCiclos falhou: timeout"));
    const r = await chamar("meu", { token: PIN() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT|IdentidadeCiclos/);
  });
  test("o limitador por pessoa: a 21ª sugestão em 10 minutos recebe 429 (outra pessoa segue)", async () => {
    for (let i = 0; i < 20; i++) expect((await chamar("sugerir", { metodo: "POST", token: PIN(77), corpo: { texto: "x" } })).status).toBe(201);
    expect((await chamar("sugerir", { metodo: "POST", token: PIN(77), corpo: { texto: "x" } })).status).toBe(429);
    expect((await chamar("sugerir", { metodo: "POST", token: PIN(78), corpo: { texto: "x" } })).status).toBe(201);
  });
});
