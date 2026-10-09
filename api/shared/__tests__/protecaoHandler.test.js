// As rotas da proteção de crianças (v7.8) com o handler de verdade e a camada de banco SIMULADA: a porta de cada ação (sem sessão, PIN, permissão no escopo errado, nível geral),
// o 403 ANTES de qualquer consulta, a confirmação reforçada (428), os identificadores como o HTTP os entrega (TEXTO), o método certo para cada ação e a resposta igual para "não
// existe" e "não é seu". O comportamento contra o SQL Server é coberto pelos roteiros ponta a ponta (tools/e2e-localdb).
jest.mock("../db", () => ({ getPool: async () => ({}), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../protecaoDb", () => ({
  PERMISSAO: "protecao_menores",
  meusIncidentes: jest.fn(async () => [{ protocolo: "PRO-2026-A" }]),
  registrarIncidente: jest.fn(async () => ({ sucesso: true, protocolo: "PRO-2026-A", incidenteId: 1 })),
  listarIncidentes: jest.fn(async () => []),
  detalheIncidente: jest.fn(async () => ({ incidente: { incidenteId: 1 } })),
  lerRelato: jest.fn(async () => ({ relato: { texto: "x" }, adendos: [] })),
  registrarComunicacao: jest.fn(async () => ({ sucesso: true })),
  adicionarAdendo: jest.fn(async () => ({ sucesso: true })),
  reclassificarIncidente: jest.fn(async () => ({ sucesso: true })),
  decidirCautelar: jest.fn(async () => ({ sucesso: true })),
  encerrarIncidente: jest.fn(async () => ({ sucesso: true })),
  padroes: jest.fn(async () => []),
  comiteComposicao: jest.fn(async () => ({ membros: [], avaliacao: { ok: false } })),
  relatorioAnual: jest.fn(async () => ({ ano: 2026 }))
}));

const auth = require("../auth");
const db = require("../protecaoDb");
const handler = require("../../GestaoProtecaoMenores/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const PERM = ["protecao_menores"];
const GERAL = (permissoes = PERM, id = 1, fator = COM_FATOR) => tokenDe(id, { via: "SENHA", fator, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes = PERM, escopo = ["Central"], id = 5) => tokenDe(id, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);        // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const chamadasAoBanco = () => Object.values(db).filter((f) => f && f.mock).reduce((n, f) => n + f.mock.calls.length, 0);
beforeEach(() => { jest.clearAllMocks(); });

const GETS = ["catalogos", "meus", "incidentes", "incidente", "padroes", "comite", "relatorio-anual"];
const POSTS = ["registrar", "relato", "comunicacao", "adendo", "reclassificar", "cautelar-decidir", "encerrar"];
const CORPO = { incidenteId: 7, envolvidoId: 8 };

describe("a porta de todas as rotas", () => {
  test("sem sessão: 401 em TODAS as ações, e o banco nem é tocado", async () => {
    for (const a of GETS) expect((await chamar(a)).status).toBe(401);
    for (const a of POSTS) expect((await chamar(a, { metodo: "POST", corpo: CORPO })).status).toBe(401);
    expect(chamadasAoBanco()).toBe(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", PIN() + "x", "a.b.c"]) expect((await chamar("catalogos", { token: t })).status).toBe(401);
  });
  test("a gestão (incidentes, incidente, relato, comunicacao, adendo, reclassificar): 403 ANTES de qualquer consulta para PIN, liderança sem a permissão", async () => {
    const GESTAO = [["GET", "incidentes"], ["GET", "incidente"], ["POST", "relato"], ["POST", "comunicacao"], ["POST", "adendo"], ["POST", "reclassificar"]];
    for (const token of [PIN(), tokenDe(1001, { via: "PIN" }), LOCAL(["pessoas"]), GERAL(["pessoas"])]) {
      for (const [m, a] of GESTAO) expect((await chamar(a, { metodo: m, query: { incidenteId: 7 }, corpo: CORPO, token })).status).toBe(403);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("o nível geral (cautelar-decidir, encerrar, padroes, comite, relatorio-anual): 403 para quem é só do escopo local, mesmo com a permissão", async () => {
    for (const [m, a] of [["POST", "cautelar-decidir"], ["POST", "encerrar"], ["GET", "padroes"], ["GET", "comite"], ["GET", "relatorio-anual"]]) {
      expect((await chamar(a, { metodo: m, corpo: CORPO, token: LOCAL() })).status).toBe(403);
    }
    expect(chamadasAoBanco()).toBe(0);
  });
  test("qualquer pessoa logada (inclusive PIN) usa catálogo, meus e registrar", async () => {
    expect((await chamar("catalogos", { token: PIN() })).status).toBe(200);
    expect((await chamar("meus", { token: PIN() })).status).toBe(200);
    expect((await chamar("registrar", { metodo: "POST", corpo: { nivel: "QUEBRA_POLITICA" }, token: PIN(33) })).status).toBe(201);
    expect(db.registrarIncidente).toHaveBeenCalledWith(expect.anything(), { dados: { nivel: "QUEBRA_POLITICA" }, registrante: { membroId: 33 } });
  });
  test("método e ação certos: GET numa ação de escrita e POST numa de leitura são 404; PUT, DELETE: 405 (ou 404)", async () => {
    expect((await chamar("registrar", { token: GERAL() })).status).toBe(404);
    expect((await chamar("padroes", { metodo: "POST", corpo: CORPO, token: GERAL() })).status).toBe(404);
    expect((await chamar("catalogos", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect([404, 405]).toContain((await chamar("incidentes", { metodo: "PUT", token: GERAL() })).status);
    expect([404, 405]).toContain((await chamar("incidentes", { metodo: "DELETE", token: GERAL() })).status);
    expect((await chamar("nao-existe", { token: GERAL() })).status).toBe(404);
  });
});

describe("a confirmação reforçada (428) e os identificadores", () => {
  const SEM_FATOR = () => GERAL(PERM, 1, null);
  test("relato, cautelar-decidir e encerrar pedem a confirmação recente ANTES de consultar o banco", async () => {
    for (const a of ["relato", "cautelar-decidir", "encerrar"]) {
      const r = await chamar(a, { metodo: "POST", corpo: CORPO, token: SEM_FATOR() });
      expect(r.status).toBe(428);
      expect(r.body.precisaFator).toBe(true);
    }
    expect(chamadasAoBanco()).toBe(0);
    const velha = tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() - 11 * 60 * 1000 }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
    expect((await chamar("relato", { metodo: "POST", corpo: CORPO, token: velha })).status).toBe(428);
    expect((await chamar("relato", { metodo: "POST", corpo: CORPO, token: GERAL() })).status).toBe(200);
  });
  test("comunicação, adendo e reclassificação NÃO pedem a confirmação reforçada (o relógio de 24 horas não espera)", async () => {
    for (const a of ["comunicacao", "adendo", "reclassificar"]) expect([200, 201]).toContain((await chamar(a, { metodo: "POST", corpo: CORPO, token: SEM_FATOR() })).status);
  });
  test("ids tortos: 400 e o banco não é tocado (incidenteId, envolvidoId, congregacaoId, equipeId, envolvidoMembroId)", async () => {
    for (const id of ["0", "-1", "0x10", "1e1", "abc", "1.5", "1; DROP TABLE x"]) {
      expect((await chamar("incidente", { query: { incidenteId: id }, token: GERAL() })).status).toBe(400);
      expect((await chamar("relato", { metodo: "POST", corpo: { incidenteId: id }, token: GERAL() })).status).toBe(400);
    }
    for (const corpo of [{ incidenteId: 7, envolvidoId: "x" }, { congregacaoId: "0x1" }, { equipeId: "abc" }, { envolvidoMembroId: "1e1" }, { incidenteId: [7] }, { incidenteId: { a: 1 } }, { incidenteId: true }]) {
      expect((await chamar("registrar", { metodo: "POST", corpo, token: PIN() })).status).toBe(400);
    }
    expect((await chamar("encerrar", { metodo: "POST", corpo: {}, token: GERAL() })).status).toBe(400);
    expect((await chamar("cautelar-decidir", { metodo: "POST", corpo: { incidenteId: 7 }, token: GERAL() })).status).toBe(400);
    expect(chamadasAoBanco()).toBe(0);
  });
});

describe("a visão que a rota monta e o que devolve", () => {
  test("nível geral: geral=true; local: só a própria congregação; o membroId é o da sessão (nunca o do corpo)", async () => {
    await chamar("incidentes", { token: GERAL(PERM, 1001) });
    const verGeral = db.listarIncidentes.mock.calls[0][1].ver;
    expect(verGeral).toMatchObject({ membroId: 1001, geral: true });
    await chamar("incidentes", { token: LOCAL(PERM, ["Central"], 3001) });
    const verLocal = db.listarIncidentes.mock.calls[1][1].ver;
    expect(verLocal.geral).toBe(false);
    expect(verLocal.membroId).toBe(3001);
    expect(verLocal.podeVerCongregacao("Central")).toBe(true);
    expect(verLocal.podeVerCongregacao("Vila")).toBe(false);
    await chamar("comunicacao", { metodo: "POST", corpo: { incidenteId: 7, membroId: 999, orgao: "CONSELHO_TUTELAR" }, token: LOCAL(PERM, ["Central"], 3001) });
    expect(db.registrarComunicacao.mock.calls[0][1].ver.membroId).toBe(3001);
  });
  test("incidente fora do escopo, inexistente ou em que a pessoa é envolvida: a MESMA resposta 404 em toda rota", async () => {
    db.detalheIncidente.mockResolvedValueOnce(null);
    db.lerRelato.mockResolvedValueOnce(null);
    const respostas = [await chamar("incidente", { query: { incidenteId: 7 }, token: GERAL() }), await chamar("relato", { metodo: "POST", corpo: { incidenteId: 7 }, token: GERAL() })];
    for (const [fn, acao] of [["registrarComunicacao", "comunicacao"], ["adicionarAdendo", "adendo"], ["reclassificarIncidente", "reclassificar"], ["decidirCautelar", "cautelar-decidir"], ["encerrarIncidente", "encerrar"]]) {
      db[fn].mockResolvedValueOnce({ sucesso: false, naoExiste: true });
      respostas.push(await chamar(acao, { metodo: "POST", corpo: { incidenteId: 7, envolvidoId: 8 }, token: GERAL() }));
    }
    for (const r of respostas) expect(r.status).toBe(404);
    expect(new Set(respostas.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(respostas[0].body).toEqual({ sucesso: false, mensagem: "Incidente não encontrado." });
  });
  test("o relato nunca fica em cache; recusa de regra é 422; limite de registros é 429; sucesso que cria é 201", async () => {
    const r = await chamar("relato", { metodo: "POST", corpo: { incidenteId: 7 }, token: GERAL() });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    db.registrarIncidente.mockResolvedValueOnce({ sucesso: false, mensagem: "dado ruim" });
    expect((await chamar("registrar", { metodo: "POST", corpo: {}, token: PIN() })).status).toBe(422);
    db.registrarIncidente.mockResolvedValueOnce({ sucesso: false, limite: true, mensagem: "muitos" });
    expect((await chamar("registrar", { metodo: "POST", corpo: {}, token: PIN() })).status).toBe(429);
    expect((await chamar("comunicacao", { metodo: "POST", corpo: { incidenteId: 7 }, token: GERAL() })).status).toBe(201);
    expect((await chamar("encerrar", { metodo: "POST", corpo: { incidenteId: 7 }, token: GERAL() })).status).toBe(200);
  });
  test("o catálogo traz os níveis, os contatos de ajuda e o roteiro da escuta (sem inquirição) e diz o papel de quem pergunta", async () => {
    const m = (await chamar("catalogos", { token: PIN() })).body;
    expect(m.papeis).toEqual({ gestao: false, geral: false });
    expect(m.niveis.map((n) => n.codigo)).toEqual(["QUASE_ACIDENTE", "QUEBRA_POLITICA", "ALEGACAO"]);
    expect(m.niveis[2].descricao).toMatch(/24 horas/);
    expect(m.contatosDeAjuda.map((c) => c.numero)).toEqual(["100", "190", null]);
    expect(JSON.stringify(m.roteiroEscuta)).not.toMatch(/interrog/i);
    expect(m.horasPrazo).toBe(24);
    expect((await chamar("catalogos", { token: LOCAL() })).body.papeis).toEqual({ gestao: true, geral: false });
    expect((await chamar("catalogos", { token: GERAL() })).body.papeis).toEqual({ gestao: true, geral: true });
  });
  test("erro de banco vira 500 genérico, sem texto interno", async () => {
    db.listarIncidentes.mockRejectedValueOnce(new Error("Falha no SELECT * FROM IncidentesProtecao: tedious"));
    const r = await chamar("incidentes", { token: GERAL() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT|tedious|IncidentesProtecao/);
  });
});
