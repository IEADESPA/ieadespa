// A rota da crise e da segurança (v7.15) com o handler de verdade e a camada de banco SIMULADA: a porta de cada ação (sem sessão, PIN, liderança sem permissão, crise só no
// nível geral, segurança sem Extensão nem Departamento), o 403 ANTES de qualquer consulta, a confirmação reforçada (428) em abrir, designar o porta-voz e encerrar, os
// identificadores como o HTTP os entrega (TEXTO), o método certo, o mapa das respostas (404, 403, 409, 429, 422) e o no-store. O comportamento contra o SQL Server está nos
// roteiros tools/e2e-localdb/e2e-33 e e2e-34.
jest.mock("../db", () => ({ getPool: async () => ({}), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../criseSegurancaDb", () => ({
  faixa: jest.fn(async () => ({ ativa: false })), listarDemandas: jest.fn(async () => ({ gestor: false, criseAtivaId: null, demandas: [] })), listarCrises: jest.fn(async () => []),
  detalheCrise: jest.fn(async () => ({ crise: { criseId: 1 }, historico: [], manifestacoes: [] })), painelSeguranca: jest.fn(async () => []),
  detalheSeguranca: jest.fn(async () => ({ congregacao: { congregacaoId: 1 } })), registrarDemanda: jest.fn(async () => ({ sucesso: true, demandaId: 1 })),
  responderDemanda: jest.fn(async () => ({ sucesso: true })), registrarManifestacao: jest.fn(async () => ({ sucesso: true })), abrir: jest.fn(async () => ({ sucesso: true, criseId: 1 })),
  designarPortaVoz: jest.fn(async () => ({ sucesso: true })), encerrar: jest.fn(async () => ({ sucesso: true })), continuarAviso: jest.fn(async () => ({ sucesso: true })),
  salvarPlano: jest.fn(async () => ({ sucesso: true })), registrarSimulado: jest.fn(async () => ({ sucesso: true })), registrarVistoria: jest.fn(async () => ({ sucesso: true })),
  adicionarEquipe: jest.fn(async () => ({ sucesso: true })), anular: jest.fn(async () => ({ sucesso: true })), resolverPendencia: jest.fn(async () => ({ sucesso: true })),
  encerrarEquipe: jest.fn(async () => ({ sucesso: true })), buscarMembros: jest.fn(async () => [])
}));

const auth = require("../auth");
const db = require("../criseSegurancaDb");
const handler = require("../../GestaoCriseSeguranca/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const SEM_FATOR = { via: "NENHUM" };
const GERAL = (fator = COM_FATOR, permissoes = ["crise_gestao", "seguranca_congregacao"]) => tokenDe(1, { via: "SENHA", fator, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const DIRIGENTE = (permissoes = ["seguranca_congregacao"]) => tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes });
const LIDER_SEM = () => tokenDe(6, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const chamadasAoBanco = () => Object.values(db).filter((f) => f && f.mock).reduce((n, f) => n + f.mock.calls.length, 0);
beforeEach(() => { jest.clearAllMocks(); });

const CRISE_GET = ["crises"];
const CRISE_POST = ["abrir", "porta-voz", "encerrar", "continuar-aviso"];
const SEG_GET = ["seguranca", "congregacao"];
const SEG_POST = ["plano", "simulado", "vistoria", "resolver-pendencia", "anular-simulado", "anular-vistoria", "buscar-membros", "equipe", "sair-equipe"];
const TODOS_GET = ["faixa", "catalogos", "demandas", "crise", ...CRISE_GET, ...SEG_GET];
const TODOS_POST = ["demanda", "responder", "manifestacao", ...CRISE_POST, ...SEG_POST];
const IDS = { criseId: 1, congregacaoId: 1, vistoriaItemId: 1, simuladoId: 1, vistoriaId: 1, equipeId: 1, demandaId: 1 };

describe("a porta", () => {
  test("sem sessão: 401 em todas as ações, sem tocar no banco", async () => {
    for (const a of TODOS_GET) expect((await chamar(a)).status).toBe(401);
    for (const a of TODOS_POST) expect((await chamar(a, { metodo: "POST" })).status).toBe(401);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("PIN (membro) não entra em nada, nem com permissão enxertada no token", async () => {
    const enxertado = tokenDe(10, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["crise_gestao", "seguranca_congregacao"] });
    for (const tok of [PIN(), enxertado]) {
      for (const a of TODOS_GET) expect((await chamar(a, { token: tok, query: IDS })).status).toBe(403);
      for (const a of TODOS_POST) expect((await chamar(a, { metodo: "POST", token: tok, corpo: IDS })).status).toBe(403);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("liderança sem permissão: lê a faixa e registra o pedido da imprensa; crise e segurança dão 403 ANTES de consultar", async () => {
    expect((await chamar("faixa", { token: LIDER_SEM() })).status).toBe(200);
    expect((await chamar("demanda", { metodo: "POST", token: LIDER_SEM(), corpo: { veiculo: "Rádio" } })).status).toBe(201);
    jest.clearAllMocks();
    for (const a of [...CRISE_GET, ...SEG_GET]) expect((await chamar(a, { token: LIDER_SEM(), query: IDS })).status).toBe(403);
    for (const a of [...CRISE_POST, ...SEG_POST]) expect((await chamar(a, { metodo: "POST", token: LIDER_SEM(), corpo: IDS })).status).toBe(403);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("a crise é do NÍVEL GERAL: crise_gestao numa concessão local (delegação) não abre crise", async () => {
    const local = tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["crise_gestao"] });
    for (const a of CRISE_POST) expect((await chamar(a, { metodo: "POST", token: local, corpo: IDS })).status).toBe(403);
    expect(db.abrir).not.toHaveBeenCalled();
    expect((await chamar("catalogos", { token: local })).body.papeis).toEqual({ crise: false, seguranca: false, geralSeguranca: false });
    expect((await chamar("catalogos", { token: GERAL() })).body.papeis).toEqual({ crise: true, seguranca: true, geralSeguranca: true });
  });
  test("a segurança é territorial: a concessão de Extensão e a de Departamento não entram", async () => {
    const extensao = tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: "Ext 1", permissoes: ["seguranca_congregacao"] });
    const depto = tokenDe(5, { via: "SENHA", fator: COM_FATOR, nivel: "DEPARTAMENTO", escopoCongregacoes: ["Central"], permissoes: ["seguranca_congregacao"] });
    for (const tok of [extensao, depto]) expect((await chamar("seguranca", { token: tok })).status).toBe(403);
    expect((await chamar("seguranca", { token: DIRIGENTE() })).status).toBe(200);
    const ver = db.painelSeguranca.mock.calls[0][1].ver;
    expect([ver.seguranca, ver.geralSeguranca, ver.crise, ver.podeVerCongregacao("Central"), ver.podeVerCongregacao("Vila")]).toEqual([true, false, false, true, false]);
  });
  test("o banco recebe o membroId da sessão, nunca do corpo", async () => {
    await chamar("demanda", { metodo: "POST", token: DIRIGENTE(), corpo: { membroId: 99, veiculo: "Rádio" } });
    expect(db.registrarDemanda.mock.calls[0][1].ver.membroId).toBe(5);
  });
});

describe("a confirmação reforçada", () => {
  test("abrir, designar o porta-voz e encerrar sem fator recente: 428, sem tocar no banco", async () => {
    for (const a of ["abrir", "porta-voz", "encerrar"]) {
      const r = await chamar(a, { metodo: "POST", token: GERAL(SEM_FATOR), corpo: IDS });
      expect([a, r.status, r.body.precisaFator]).toEqual([a, 428, true]);
    }
    const velho = { via: "CHAVE", em: Date.now() - 11 * 60000 };
    expect((await chamar("abrir", { metodo: "POST", token: GERAL(velho) })).status).toBe(428);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("com o fator recente: chegam ao banco", async () => {
    expect((await chamar("abrir", { metodo: "POST", token: GERAL(), corpo: { motivo: "Acidente" } })).status).toBe(201);
    expect((await chamar("encerrar", { metodo: "POST", token: GERAL(), corpo: { criseId: "3", resumo: "Fim" } })).status).toBe(200);
    expect(db.encerrar.mock.calls[0][1].criseId).toBe(3);
    // os atos que não mudam o regime não pedem o fator
    expect((await chamar("manifestacao", { metodo: "POST", token: GERAL(SEM_FATOR), corpo: { criseId: 1 } })).status).toBe(201);
    expect((await chamar("continuar-aviso", { metodo: "POST", token: GERAL(SEM_FATOR) })).status).toBe(200);
  });
});

describe("os identificadores e os métodos", () => {
  test("identificador em texto, como o HTTP entrega, vale; lixo é 400 sem consultar", async () => {
    expect((await chamar("congregacao", { token: DIRIGENTE(), query: { congregacaoId: "12" } })).status).toBe(200);
    expect(db.detalheSeguranca.mock.calls[0][1].congregacaoId).toBe(12);
    expect((await chamar("crise", { token: GERAL(), query: { criseId: "7" } })).status).toBe(200);
    expect(db.detalheCrise.mock.calls[0][1].criseId).toBe(7);
    jest.clearAllMocks();
    for (const lixo of ["0x10", "1e1", "-1", "1.5", "abc", "0", "1;DROP TABLE X"]) {
      expect((await chamar("congregacao", { token: DIRIGENTE(), query: { congregacaoId: lixo } })).status).toBe(400);
      expect((await chamar("equipe", { metodo: "POST", token: DIRIGENTE(), corpo: { congregacaoId: 1, membroId: lixo } })).status).toBe(400);
      expect((await chamar("responder", { metodo: "POST", token: GERAL(), corpo: { demandaId: lixo } })).status).toBe(400);
    }
    for (const lixo of [true, [5], { a: 1 }]) expect((await chamar("sair-equipe", { metodo: "POST", token: DIRIGENTE(), corpo: { equipeId: lixo } })).status).toBe(400);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("sem o identificador obrigatório: 400; ação desconhecida ou no método errado: 404; outro método: 405", async () => {
    expect((await chamar("congregacao", { token: DIRIGENTE() })).status).toBe(400);
    expect((await chamar("plano", { metodo: "POST", token: DIRIGENTE(), corpo: {} })).status).toBe(400);
    expect((await chamar("encerrar", { metodo: "POST", token: GERAL(), corpo: {} })).status).toBe(400);
    expect((await chamar("abrir", { token: GERAL() })).status).toBe(404);
    expect((await chamar("faixa", { metodo: "POST", token: GERAL() })).status).toBe(404);
    expect((await chamar("qualquer", { token: GERAL() })).status).toBe(404);
    expect((await chamar("faixa", { metodo: "DELETE", token: GERAL() })).status).toBe(405);
    expect(chamadasAoBanco()).toBe(0);
  });
});

describe("as respostas", () => {
  test("o mapa: não existe 404 (sem detalhe), proibido 403, mudou 409, limite 429, recusa 422; e o no-store", async () => {
    db.abrir.mockResolvedValueOnce({ sucesso: false, naoExiste: true });
    let r = await chamar("abrir", { metodo: "POST", token: GERAL() });
    expect([r.status, r.body]).toEqual([404, { sucesso: false, mensagem: "Não encontrado." }]);
    db.responderDemanda.mockResolvedValueOnce({ sucesso: false, proibido: true, mensagem: "Só o porta-voz." });
    r = await chamar("responder", { metodo: "POST", token: GERAL(), corpo: { demandaId: 1 } });
    expect([r.status, r.body.proibido]).toEqual([403, undefined]);
    db.encerrar.mockResolvedValueOnce({ sucesso: false, mudou: true, mensagem: "Já encerrada." });
    expect((await chamar("encerrar", { metodo: "POST", token: GERAL(), corpo: { criseId: 1 } })).status).toBe(409);
    db.salvarPlano.mockResolvedValueOnce({ sucesso: false, limite: true, mensagem: "Ocupado." });
    expect((await chamar("plano", { metodo: "POST", token: DIRIGENTE(), corpo: { congregacaoId: 1 } })).status).toBe(429);
    db.registrarSimulado.mockResolvedValueOnce({ sucesso: false, mensagem: "Data inválida." });
    r = await chamar("simulado", { metodo: "POST", token: DIRIGENTE(), corpo: { congregacaoId: 1 } });
    expect([r.status, r.headers["Cache-Control"]]).toEqual([422, "no-store"]);
    db.detalheSeguranca.mockResolvedValueOnce(null);
    expect((await chamar("congregacao", { token: DIRIGENTE(), query: { congregacaoId: 99 } })).status).toBe(404);
  });
  test("o erro inesperado do banco vira 500 sem texto interno", async () => {
    db.faixa.mockRejectedValueOnce(new Error("SELECT TOP 1 ... ConnectionError tedious"));
    const r = await chamar("faixa", { token: GERAL() });
    expect([r.status, r.body.mensagem]).toEqual([500, "Erro interno."]);
  });
  test("o pedido da imprensa tem limite por pessoa (10 em 10 minutos)", async () => {
    const tok = tokenDe(321, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] });
    const st = [];
    for (let i = 0; i < 12; i++) st.push((await chamar("demanda", { metodo: "POST", token: tok, corpo: {} })).status);
    expect(st.filter((s) => s === 201)).toHaveLength(10);
    expect(st.slice(10)).toEqual([429, 429]);
  });
});
