// A rota do cuidado pastoral (v7.11) com o handler de verdade e a camada de banco SIMULADA: a porta de cada ação (sem sessão, PIN, permissão), o 403 ANTES de qualquer consulta,
// a confirmação reforçada (428) na nota "somente pastor" e no desmarcar do risco, os identificadores como o HTTP os entrega (TEXTO), o método certo para cada ação, o mapa das
// respostas (404, 403, 409, 429, 422) e o no-store. O comportamento contra o SQL Server é coberto pelos roteiros ponta a ponta (tools/e2e-localdb, e2e-23 a 26).
jest.mock("../db", () => ({ getPool: async () => ({}), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../cuidadoPastoralDb", () => ({
  PERMISSAO: "cuidado_pastoral",
  meusItens: jest.fn(async () => []), meusPedidos: jest.fn(async () => ({ oracao: [], visitas: [] })), boletim: jest.fn(async () => []), detalheItem: jest.fn(async () => ({ item: { itemId: 1 } })),
  listarNotas: jest.fn(async () => []), leiturasDaNota: jest.fn(async () => []), listarFila: jest.fn(async () => []), painel: jest.fn(async () => []), congregacoesDoTerritorio: jest.fn(async () => []),
  listarPedidos: jest.fn(async () => []), pedirOracao: jest.fn(async () => ({ sucesso: true, pedidoId: 1 })), pedirVisita: jest.fn(async () => ({ sucesso: true, itemId: 1 })),
  escreverNota: jest.fn(async () => ({ sucesso: true, notaId: 1 })), notaLegivel: jest.fn(async () => ({ notaId: 1, nivel: "PASTORAL", pedeFator: true })), lerNota: jest.fn(async () => ({ notaId: 1, texto: "x" })),
  abrirItem: jest.fn(async () => ({ sucesso: true, itemId: 1 })), buscarPessoas: jest.fn(async () => []), registrarPedidoRecebido: jest.fn(async () => ({ sucesso: true })),
  moderar: jest.fn(async () => ({ sucesso: true })), marcarRisco: jest.fn(async () => ({ sucesso: true })), acompanharPedido: jest.fn(async () => ({ sucesso: true })),
  registrarContato: jest.fn(async () => ({ sucesso: true })), concluir: jest.fn(async () => ({ sucesso: true })), cancelar: jest.fn(async () => ({ sucesso: true })),
  adiar: jest.fn(async () => ({ sucesso: true })), atribuir: jest.fn(async () => ({ sucesso: true }))
}));

const auth = require("../auth");
const db = require("../cuidadoPastoralDb");
const handler = require("../../GestaoCuidadoPastoral/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const PERM = ["cuidado_pastoral"];
const LIDER = (fator = COM_FATOR, permissoes = PERM) => tokenDe(5, { via: "SENHA", fator, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes });
const GERAL = () => tokenDe(1, { via: "SENHA", fator: COM_FATOR, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const chamadasAoBanco = () => Object.values(db).filter((f) => f && f.mock).reduce((n, f) => n + f.mock.calls.length, 0);
beforeEach(() => { jest.clearAllMocks(); });

const GESTAO_GET = ["fila", "painel", "congregacoes", "pedidos", "boletim"];
const GESTAO_POST = ["abrir", "atribuir", "adiar", "cancelar", "buscar-pessoas", "registrar-pedido", "moderar", "risco", "acompanhar-pedido"];
const TODOS_GET = ["catalogos", "meus", "meus-pedidos", "boletim-meu", "item", "notas", "leituras", ...GESTAO_GET];
const TODOS_POST = ["pedir-oracao", "pedir-visita", "contato", "concluir", "nota", "abrir-nota", ...GESTAO_POST];

describe("a porta", () => {
  test("sem sessão: 401 em todas as ações, sem tocar no banco", async () => {
    for (const a of TODOS_GET) expect((await chamar(a)).status).toBe(401);
    for (const a of TODOS_POST) expect((await chamar(a, { metodo: "POST" })).status).toBe(401);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("PIN e liderança sem a permissão: 403 em TODA ação da liderança, ANTES de qualquer consulta", async () => {
    for (const tok of [PIN(), LIDER(COM_FATOR, ["pessoas"])]) {
      for (const a of GESTAO_GET) expect((await chamar(a, { token: tok })).status).toBe(403);
      for (const a of GESTAO_POST) expect((await chamar(a, { metodo: "POST", token: tok, corpo: { itemId: 1, pedidoId: 1, congregacaoId: 1, responsavelMembroId: 2 } })).status).toBe(403);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("o PIN com permissão enxertada no token continua sem liderança", async () => {
    const enxertado = tokenDe(10, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
    expect((await chamar("fila", { token: enxertado })).status).toBe(403);
    expect((await chamar("catalogos", { token: enxertado })).body.papeis).toEqual({ gestao: false, geral: false });
  });
  test("o membro por PIN usa as ações dele (o banco recebe o membroId da sessão, nunca do corpo)", async () => {
    expect((await chamar("pedir-oracao", { metodo: "POST", token: PIN(10), corpo: { membroId: 99 } })).status).toBe(201);
    expect(db.pedirOracao.mock.calls[0][1].membroId).toBe(10);
    expect((await chamar("meus", { token: PIN(10) })).status).toBe(200);
    expect(db.meusItens.mock.calls[0][1]).toBe(10);
    await chamar("item", { token: PIN(10), query: { itemId: 3 } });
    expect(db.detalheItem.mock.calls[0][2].ver).toMatchObject({ membroId: 10, gestao: false, geral: false });
  });
  test("(revisão) a concessão de Extensão ou de Departamento não opera a fila (a Extensão veria a congregação-mãe inteira pelo nome)", async () => {
    const ext = tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: "Extensão X", permissoes: PERM });
    const dep = tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: PERM });
    for (const tok of [ext, dep]) {
      expect((await chamar("fila", { token: tok })).status).toBe(403);
      expect((await chamar("catalogos", { token: tok })).body.papeis).toEqual({ gestao: false, geral: false });
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("(revisão) \"da Área para cima\" vai para o banco: o Dirigente não, o Pastor de Área sim", async () => {
    await chamar("risco", { metodo: "POST", token: LIDER(), corpo: { pedidoId: 1, marcar: true } });
    expect(db.marcarRisco.mock.calls[0][1].ver.acima).toBe(false);
    const area = tokenDe(6, { via: "SENHA", fator: COM_FATOR, nivel: "AREA", escopoCongregacoes: ["Central", "Vila"], permissoes: PERM });
    await chamar("risco", { metodo: "POST", token: area, corpo: { pedidoId: 1, marcar: true } });
    expect(db.marcarRisco.mock.calls[1][1].ver.acima).toBe(true);
  });
  test("o catálogo diz o papel", async () => {
    expect((await chamar("catalogos", { token: LIDER() })).body.papeis).toEqual({ gestao: true, geral: false });
    expect((await chamar("catalogos", { token: GERAL() })).body.papeis).toEqual({ gestao: true, geral: true });
  });
});

describe("identificadores, método e ação", () => {
  test("id mal escrito é 400 e não chega ao banco (a query chega em texto)", async () => {
    for (const v of ["0x10", "1e1", "-1", "abc", "1.5", "99999999999"]) {
      expect((await chamar("item", { token: LIDER(), query: { itemId: v } })).status).toBe(400);
      expect((await chamar("contato", { metodo: "POST", token: LIDER(), corpo: { itemId: v } })).status).toBe(400);
    }
    for (const v of [true, [5], { a: 1 }]) expect((await chamar("moderar", { metodo: "POST", token: LIDER(), corpo: { pedidoId: v } })).status).toBe(400);
    expect(chamadasAoBanco()).toBe(0);
    expect((await chamar("item", { token: LIDER(), query: { itemId: "12" } })).status).toBe(200);
    expect(db.detalheItem.mock.calls[0][1]).toBe(12);
  });
  test("POST em leitura, GET em escrita e ação desconhecida: 404; outro método: 405", async () => {
    expect((await chamar("fila", { metodo: "POST", token: LIDER() })).status).toBe(404);
    expect((await chamar("abrir", { metodo: "GET", token: LIDER() })).status).toBe(404);
    expect((await chamar("nada", { token: LIDER() })).status).toBe(404);
    expect((await chamar("fila", { metodo: "DELETE", token: LIDER() })).status).toBe(405);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("notas exige UM alvo (membroId ou itemId)", async () => {
    expect((await chamar("notas", { token: LIDER() })).status).toBe(400);
    expect((await chamar("notas", { token: LIDER(), query: { membroId: 1, itemId: 2 } })).status).toBe(400);
    expect((await chamar("notas", { token: LIDER(), query: { membroId: 1 } })).status).toBe(200);
  });
  test("toda resposta leva no-store", async () => {
    expect((await chamar("catalogos", { token: PIN() })).headers["Cache-Control"]).toBe("no-store");
    expect((await chamar("fila", { token: PIN() })).headers["Cache-Control"]).toBe("no-store");
  });
});

describe("a confirmação reforçada (428)", () => {
  test("abrir nota \"somente pastor\" de outra pessoa pede o fator ANTES do texto", async () => {
    const r = await chamar("abrir-nota", { metodo: "POST", token: LIDER({ via: "NENHUM" }), corpo: { notaId: 1 } });
    expect(r.status).toBe(428);
    expect(db.lerNota).not.toHaveBeenCalled();
    expect((await chamar("abrir-nota", { metodo: "POST", token: LIDER(), corpo: { notaId: 1 } })).status).toBe(200);
    db.notaLegivel.mockResolvedValueOnce({ notaId: 2, nivel: "LIDERANCA", pedeFator: false });
    expect((await chamar("abrir-nota", { metodo: "POST", token: LIDER({ via: "NENHUM" }), corpo: { notaId: 2 } })).status).toBe(200);
    db.notaLegivel.mockResolvedValueOnce(null);
    expect((await chamar("abrir-nota", { metodo: "POST", token: LIDER(), corpo: { notaId: 3 } })).status).toBe(404);
  });
  test("o fator velho (mais de 10 minutos) não vale", async () => {
    expect((await chamar("abrir-nota", { metodo: "POST", token: LIDER({ via: "CHAVE", em: Date.now() - 11 * 60000 }), corpo: { notaId: 1 } })).status).toBe(428);
  });
  test("desmarcar o risco pede o fator; marcar não (rapidez)", async () => {
    expect((await chamar("risco", { metodo: "POST", token: LIDER({ via: "NENHUM" }), corpo: { pedidoId: 1, marcar: false, motivo: "falso" } })).status).toBe(428);
    expect(db.marcarRisco).not.toHaveBeenCalled();
    expect((await chamar("risco", { metodo: "POST", token: LIDER({ via: "NENHUM" }), corpo: { pedidoId: 1, marcar: true } })).status).toBe(200);
  });
});

describe("o mapa das respostas", () => {
  test.each([[{ naoExiste: true, sucesso: false }, 404], [{ sucesso: false, proibido: true, mensagem: "x" }, 403], [{ sucesso: false, mudou: true, mensagem: "x" }, 409],
    [{ sucesso: false, limite: true, mensagem: "x" }, 429], [{ sucesso: false, mensagem: "x" }, 422], [{ sucesso: true }, 200]])("%j → %i", async (resultado, status) => {
    db.concluir.mockResolvedValueOnce(resultado);
    const r = await chamar("concluir", { metodo: "POST", token: LIDER(), corpo: { itemId: 1 } });
    expect(r.status).toBe(status);
    expect(r.body.naoExiste).toBeUndefined();
    expect(r.body.proibido).toBeUndefined();
  });
  test("o que cria responde 201", async () => {
    expect((await chamar("abrir", { metodo: "POST", token: LIDER() })).status).toBe(201);
    expect((await chamar("nota", { metodo: "POST", token: LIDER() })).status).toBe(201);
  });
  test("erro inesperado: 500 genérico, sem o texto interno", async () => {
    db.listarFila.mockRejectedValueOnce(new Error("SELECT * FROM CuidadoItens deu errado"));
    const r = await chamar("fila", { token: LIDER() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT/);
  });
});
