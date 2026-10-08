// As rotas dos Setores Técnicos (v7.6) com os handlers de verdade e o banco simulado pelo TEXTO da consulta: a porta de cada ação (sem sessão, PIN, permissão no escopo
// errado, nível geral), o 403 ANTES de qualquer consulta, os identificadores como o HTTP os entrega (TEXTO) e a resposta igual para "não existe" e "não é seu".
// O comportamento contra o SQL Server (transações, gatilhos, tetos, avisos) é coberto pelo roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../escopo", () => ({ ...jest.requireActual("../escopo"), ancestraisTerritoriais: jest.fn(async () => ({ areaId: null, regiaoId: null, quadranteId: null, distritoId: null })) }));

const auth = require("../auth");
const handlerSetores = require("../../GestaoSetoresTecnicos/index.js");
const handlerVistorias = require("../../GestaoVistoriasAntecedentes/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const GERAL = (permissoes = TUDO, id = 1) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes, escopo = ["Central"], id = 5) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(handler, acao, { metodo = "GET", query = {}, corpo = {}, token, headers = {} } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);   // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token, ...headers } : headers });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));

beforeEach(() => { mockRegras = []; mockConsultas = []; });

const GETS_LOGIN = ["catalogos", "setores", "meu-painel"];
const GESTAO = [["GET", "vinculos"], ["POST", "setor"], ["POST", "setor-editar"], ["POST", "setor-ativo"], ["POST", "indicar"], ["POST", "aprovar"], ["POST", "recusar"], ["POST", "encerrar"], ["POST", "registrar-termo"]];
const DIRETORIA = [["POST", "decidir"]];
const TODAS = [...GETS_LOGIN.map(a => ["GET", a]), ["GET", "termo"], ["GET", "atos"], ["GET", "atos-da-congregacao"], ["GET", "ato"], ["GET", "canais"], ...GESTAO, ["POST", "candidatar"], ["POST", "sair"], ["POST", "aceitar-termo"],
  ["POST", "interdicao"], ["POST", "pedido-remocao"], ...DIRETORIA, ["POST", "levantar"], ["POST", "atender"], ["POST", "cancelar"]];

describe("a porta de todas as rotas de Setores Técnicos", () => {
  test("sem sessão: 401 em TODAS as ações, e nada é consultado", async () => {
    for (const [metodo, acao] of TODAS) { const r = await chamar(handlerSetores, acao, { metodo }); expect(r.status).toBe(401); }
    expect(mockConsultas).toHaveLength(0);
  });
  test("sem sessão: 401 também nas rotas da vistoria", async () => {
    for (const acao of ["catalogos", "lista", "vistoria", "pendentes"]) expect((await chamar(handlerVistorias, acao)).status).toBe(401);
    for (const acao of ["solicitar", "lavrar"]) expect((await chamar(handlerVistorias, acao, { metodo: "POST" })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", PIN() + "x", "a.b.c"]) expect((await chamar(handlerSetores, "catalogos", { token: t })).status).toBe(401);
  });
  test("as ações de GESTÃO respondem 403 ANTES de qualquer consulta para PIN, dirigente, permissão no escopo errado e quem só tem a permissão da Diretoria", async () => {
    const intrusos = [PIN(), LOCAL(["pessoas"]), LOCAL(["setores_tecnicos"]), GERAL(["setores_ratificacao", "vistoria_antecedentes"]), GERAL(["pessoas"])];
    for (const [metodo, acao] of GESTAO) for (const t of intrusos) {
      const r = await chamar(handlerSetores, acao, { metodo, token: t, query: { vinculoId: 1 }, corpo: { vinculoId: 1, setorId: 1, membroId: 2 } });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a ratificação é só de quem tem setores_ratificacao NO NÍVEL GERAL — a gestão e o dirigente não decidem", async () => {
    for (const t of [PIN(), LOCAL(["setores_ratificacao"]), GERAL(["setores_tecnicos"]), LOCAL(["setores_tecnicos"])]) {
      const r = await chamar(handlerSetores, "decidir", { metodo: "POST", token: t, corpo: { intervencaoId: 1, decisao: "RATIFICAR" } });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a lista geral de atos exige a gestão ou a Diretoria no nível geral", async () => {
    for (const t of [PIN(), LOCAL(["pessoas"]), LOCAL(["setores_ratificacao"])]) expect((await chamar(handlerSetores, "atos", { token: t })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
    expect((await chamar(handlerSetores, "atos", { token: GERAL(["setores_tecnicos"]) })).status).toBe(200);
    expect((await chamar(handlerSetores, "atos", { token: GERAL(["setores_ratificacao"]) })).status).toBe(200);
  });
  test("sessão de PIN ou de código que carregue cargo e permissões NUNCA vale como gestão, Diretoria nem líder", async () => {
    for (const via of ["PIN", "CODIGO"]) {
      const t = tokenDe(1, { via, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: TUDO });
      const c = await chamar(handlerSetores, "catalogos", { token: t });
      expect(c.body.papeis).toEqual({ gestao: false, diretoria: false, lider: false });
      for (const [metodo, acao] of [...GESTAO, ...DIRETORIA]) expect((await chamar(handlerSetores, acao, { metodo, token: t, corpo: { vinculoId: 1, intervencaoId: 1, setorId: 1 } })).status).toBe(403);
      expect((await chamar(handlerSetores, "atos", { token: t })).status).toBe(403);
      expect((await chamar(handlerSetores, "atos-da-congregacao", { token: t, query: { congregacaoId: 1 } })).status).toBe(403);
    }
  });
  test("as rotas da vistoria: só a liderança, no nível geral, com vistoria_antecedentes — PIN, local e permissão errada recebem 403 sem consulta", async () => {
    const intrusos = [PIN(), LOCAL(["vistoria_antecedentes"]), GERAL(["setores_tecnicos", "setores_ratificacao"]), GERAL(["pessoas"]), tokenDe(7, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: [] })];
    for (const t of intrusos) {
      for (const acao of ["catalogos", "lista", "vistoria", "pendentes"]) expect((await chamar(handlerVistorias, acao, { token: t })).status).toBe(403);
      for (const acao of ["solicitar", "lavrar"]) expect((await chamar(handlerVistorias, acao, { metodo: "POST", token: t, corpo: { membroId: 5 } })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("uma sessão de PIN que também tenha cargo nunca vale como liderança na vistoria", async () => {
    const t = tokenDe(1, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["vistoria_antecedentes"] });
    expect((await chamar(handlerVistorias, "lista", { token: t })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("lavrar sem confirmação reforçada recente responde 428 (a tela confirma e repete), e nada é gravado", async () => {
    const semFator = tokenDe(1, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["vistoria_antecedentes"] });
    const r = await chamar(handlerVistorias, "lavrar", { metodo: "POST", token: semFator, corpo: { membroId: 5 } });
    expect(r.status).toBe(428);
    expect(r.body.precisaFator).toBe(true);
    expect(mockConsultas).toHaveLength(0);
    const vencido = tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() - 11 * 60 * 1000 }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["vistoria_antecedentes"] });
    expect((await chamar(handlerVistorias, "lavrar", { metodo: "POST", token: vencido, corpo: { membroId: 5 } })).status).toBe(428);
  });
});

describe("identificadores como o HTTP os entrega (texto)", () => {
  test("a gestão com setorId e status em texto: a consulta recebe o NÚMERO", async () => {
    quando(/FROM SetoresTecnicosMembros v/, []);
    const r = await chamar(handlerSetores, "vinculos", { token: GERAL(), query: { setorId: "2", status: "ativo" } });
    expect(r.status).toBe(200);
    const c = mockConsultas.find((x) => /FROM SetoresTecnicosMembros v/.test(x.sql));
    expect(c.inputs.s).toBe(2);
    expect(c.inputs.st).toBe("ATIVO");
  });
  test("identificador malformado é 400 em toda ação que recebe id — nunca erro 500 nem consulta", async () => {
    const ruins = ["abc", "0x10", "1e1", "-1", "0", "1.5", "1;DROP TABLE X", "99999999999999999999"];
    for (const v of ruins) {
      for (const [acao, campo] of [["termo", "vinculoId"], ["ato", "intervencaoId"], ["atos-da-congregacao", "congregacaoId"], ["canais", "congregacaoId"]]) {
        const r = await chamar(handlerSetores, acao, { token: GERAL(), query: { [campo]: v } });
        expect(r.status).toBe(400);
      }
      for (const acao of ["aprovar", "recusar", "encerrar", "sair", "aceitar-termo", "registrar-termo"]) {
        const r = await chamar(handlerSetores, acao, { metodo: "POST", token: GERAL(), corpo: { vinculoId: v } });
        expect(r.status).toBe(400);
      }
      for (const acao of ["decidir", "levantar", "atender", "cancelar"]) {
        const r = await chamar(handlerSetores, acao, { metodo: "POST", token: GERAL(), corpo: { intervencaoId: v } });
        expect(r.status).toBe(400);
      }
      for (const acao of ["setor-editar", "setor-ativo"]) expect((await chamar(handlerSetores, acao, { metodo: "POST", token: GERAL(), corpo: { setorId: v, ativo: true } })).status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("filtros fora da lista são 400", async () => {
    expect((await chamar(handlerSetores, "vinculos", { token: GERAL(), query: { status: "XXX" } })).status).toBe(400);
    expect((await chamar(handlerSetores, "vinculos", { token: GERAL(), query: { setorId: "abc" } })).status).toBe(400);
    expect((await chamar(handlerSetores, "atos", { token: GERAL(), query: { tipo: "XXX" } })).status).toBe(400);
    expect((await chamar(handlerSetores, "atos", { token: GERAL(), query: { status: "XXX" } })).status).toBe(400);
    expect((await chamar(handlerSetores, "atos", { token: GERAL(), query: { congregacaoId: "0x1" } })).status).toBe(400);
  });
  test("na vistoria: matrícula e identificador de termo malformados são 400", async () => {
    for (const v of ["abc", "0x10", "1e1", "-1", "0", "1.5"]) {
      expect((await chamar(handlerVistorias, "lista", { token: GERAL(), query: { membroId: v } })).status).toBe(400);
      expect((await chamar(handlerVistorias, "vistoria", { token: GERAL(), query: { vistoriaId: v } })).status).toBe(400);
    }
    expect((await chamar(handlerVistorias, "vistoria", { token: GERAL() })).status).toBe(400);
  });
});

describe("quem não tem relação com o ato recebe a mesma resposta de 'não existe'", () => {
  const linhaAto = (extra = {}) => ({ IntervencaoId: 9, Tipo: "REMOCAO_POSTAGEM", SetorId: 6, VinculoId: 3, EmitidaPorMembroId: 50, CongregacaoId: 1, CanalId: 8, Motivo: "ERRO_GROSSEIRO", Objeto: "Instagram", Referencia: "https://x.org/p", Descricao: "Texto da justificativa do pedido.",
    RegistroProfissional: null, Status: "EMITIDA", EmitidaEm: new Date("2026-10-01T10:00:00Z"), SetorNome: "Comunicação", SetorCodigo: "COMUNICACAO", EmitenteNome: "Bia", CongregacaoNome: "Central", CanalNome: "Instagram da Central", ...extra });
  test("ato existente de que não tenho relação × ato que não existe: 404 com a mesma mensagem, para ver, decidir-fechar e atender", async () => {
    quando(/FROM SetoresTecnicosIntervencoes i/, (i) => (Number(i.id) === 9 ? [linhaAto()] : []));
    quando(/FROM SetoresTecnicosMembros WHERE MembroId = @m AND Status = 'ATIVO'/, []);
    quando(/FROM CanalAdministradores WHERE MembroId = @m/, []);
    const estranho = LOCAL([], ["Vila Nova"], 77);
    for (const [metodo, acao, campo] of [["GET", "ato", "query"], ["POST", "levantar", "corpo"], ["POST", "atender", "corpo"], ["POST", "cancelar", "corpo"], ["POST", "decidir", "corpo"]]) {
      const token = acao === "decidir" ? GERAL(["setores_ratificacao"], 1) : estranho;
      if (acao === "decidir") continue;          // a decisão exige a permissão antes; coberta no bloco da porta
      const existe = await chamar(handlerSetores, acao, { metodo, token, [campo]: { intervencaoId: 9, observacao: "x".repeat(12) } });
      const naoExiste = await chamar(handlerSetores, acao, { metodo, token, [campo]: { intervencaoId: 123456, observacao: "x".repeat(12) } });
      expect(existe.status).toBe(404);
      expect(naoExiste.status).toBe(404);
      expect(existe.body).toEqual(naoExiste.body);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("o líder cujo escopo alcança a congregação vê o ato, mas não o levanta (nem cancela): 403 com motivo, sem escrita", async () => {
    quando(/FROM SetoresTecnicosIntervencoes i/, [linhaAto({ Tipo: "INTERDICAO", Status: "EMITIDA", CanalId: null, CanalNome: null })]);
    quando(/FROM SetoresTecnicosMembros WHERE MembroId = @m AND Status = 'ATIVO'/, []);
    quando(/FROM CanalAdministradores WHERE MembroId = @m/, []);
    const lider = LOCAL(["pessoas"], ["Central"], 5);
    expect((await chamar(handlerSetores, "ato", { token: lider, query: { intervencaoId: 9 } })).status).toBe(200);
    const r = await chamar(handlerSetores, "levantar", { metodo: "POST", token: lider, corpo: { intervencaoId: 9, observacao: "Quero reabrir o templo já." } });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("a consulta da congregação: fora do escopo e inexistente respondem IGUAL (403), sem consultar atos", async () => {
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (Number(i.id) === 1 ? [{ Nome: "Central" }] : Number(i.id) === 2 ? [{ Nome: "Vila Nova" }] : []));
    const lider = LOCAL(["pessoas"], ["Central"], 5);
    const fora = await chamar(handlerSetores, "atos-da-congregacao", { token: lider, query: { congregacaoId: 2 } });
    const inexistente = await chamar(handlerSetores, "atos-da-congregacao", { token: lider, query: { congregacaoId: 999 } });
    expect(fora.status).toBe(403);
    expect(inexistente).toEqual(fora);
    expect(mockConsultas.some((c) => /FROM SetoresTecnicosIntervencoes/.test(c.sql))).toBe(false);
    expect((await chamar(handlerSetores, "atos-da-congregacao", { token: PIN(), query: { congregacaoId: 1 } })).status).toBe(403);
  });
});

describe("falha do banco", () => {
  test("erro inesperado vira 500 com mensagem genérica (sem vazar o erro do banco)", async () => {
    quando(/FROM SetoresTecnicos s/, () => { throw new Error("Login failed for user 'segredo' on server srv-interno"); });
    const r = await chamar(handlerSetores, "setores", { token: PIN() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo|srv-interno|Login failed/);
  });
  test("método e ação desconhecidos", async () => {
    expect((await chamar(handlerSetores, "nao-existe", { token: PIN() })).status).toBe(404);
    expect((await chamar(handlerSetores, "nao-existe", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect((await chamar(handlerSetores, "setores", { metodo: "DELETE", token: PIN() })).status).toBe(405);
    expect((await chamar(handlerVistorias, "nao-existe", { token: GERAL() })).status).toBe(404);
  });
  test("corpo que não é objeto é tratado como vazio (400/422, nunca 500)", async () => {
    for (const corpo of ["texto", [1, 2], 5, null]) {
      const r = await chamar(handlerSetores, "candidatar", { metodo: "POST", token: PIN(), corpo });
      expect([400, 422]).toContain(r.status);
    }
  });
});
