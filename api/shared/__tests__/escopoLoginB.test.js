// Revisão de escopo (02/10/2026) — grupo "login simples B": EBD (atividades, caderneta, chamada, financeiro, revistas, sala de aula), Eventos e Habilitação de Voluntários.
// Estas rotas só pedem LOGIN na porta e conferem permissão/escopo por conta própria; o que se prende aqui:
//  - a sessão de PIN (permissoes: [], escopo: []) não faz nada além do que é dela;
//  - papel LOCAL (escopo ["A"]) com a permissão: fora do escopo → recusa IGUAL à de "não existe" e NADA é gravado; dentro → funciona e grava;
//  - GERAL (nível GLOBAL + escopo TODAS) funciona;
//  - sessão sem a lista de congregações é FECHADA (antes valia como "todas");
//  - rotas de dado do campo todo (catálogo de revistas, plano do campo inteiro) só com escopo TODAS.
// O banco é simulado pelo TEXTO da consulta (como em revisaoV75.test.js); o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
// O calendário (contexto territorial e eventos) é simulado; o que se testa é o filtro de escopo de GestaoEventos/eventosDb sobre o evento REAL.
let mockEventos = {};
const mockCtx = {
  congregacoes: new Map([[1, { nome: "A" }], [2, { nome: "B" }]]),
  areas: new Map(),
  congregacoesDaArea: (areaId) => (areaId === 1 ? [1] : areaId === 2 ? [2] : [])
};
jest.mock("../calendarioDb", () => ({
  carregarContextoTerritorial: async () => mockCtx,
  buscarEvento: async (_pool, id) => mockEventos[id] || null,
  carregarEventos: async () => Object.values(mockEventos)
}));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const hHab = require("../../GestaoHabilitacaoVoluntarios/index.js");
const hEventos = require("../../GestaoEventos/index.js");
const hRevistas = require("../../GestaoEbdRevistas/index.js");
const hAtiv = require("../../GestaoEbdAtividades/index.js");
const hSala = require("../../GestaoEbdSalaAula/index.js");
const hCaderneta = require("../../GestaoEbdCaderneta/index.js");
const hChamada = require("../../GestaoEbdChamada/index.js");
const hFinanceiro = require("../../GestaoEbdFinanceiro/index.js");

async function chamar(handler, acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const escritas = () => mockConsultas.filter(c => /\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });

const PIN = tokenDe(30, { via: "PIN" });
const local = (permissoes, extra = {}) => tokenDe(5, { via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: ["A"], ...extra });
const geral = (permissoes) => tokenDe(1, { via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: "TODAS" });
// sessão sem a lista de congregações (claim ausente): o token é assinado direto, sem o campo
const semLista = (permissoes) => auth.reassinarSessao({ membroId: 6, via: "SENHA", nivel: "GLOBAL", permissoes, termosPendentes: [] });

// ------------------------------------------------------------------------------------------------
// O "mundo" simulado: congregações 1=A e 2=B; membros 10 (A), 20 (B), 21 (B, mas ativo numa equipe de A); equipes 100 (A) e 200 (B).
// ------------------------------------------------------------------------------------------------
const CONG = { 1: "A", 2: "B" };
const MEMBROS = { 10: "A", 20: "B", 21: "B" };
let esteiras;
function mundo() {
  esteiras = new Map();
  quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (CONG[i.id] ? [{ Nome: CONG[i.id] }] : []));
  quando(/LEFT JOIN ExtensoesTenda/, (i) => (MEMBROS[i.id] ? [{ MembroId: i.id, Nome: `Pessoa ${i.id}`, Status: "ATIVO", CongregacaoNome: MEMBROS[i.id], ExtensaoNome: null }] : []));
  quando(/FROM EscalasEquipeMembros em\s+JOIN EscalasEquipes e/, (i) => (i.m === 21 ? [{ CongregacaoNome: "A" }] : []));
  quando(/FROM EscalasEquipes e JOIN Congregacoes c/, (i) => (i.id === 100 ? [{ CongregacaoNome: "A", ContatoComMenores: false }] : i.id === 200 ? [{ CongregacaoNome: "B", ContatoComMenores: true }] : []));
  quando(/FROM VoluntariosHabilitacao\s+WHERE MembroId = @membroId/, (i) => (esteiras.has(i.membroId) ? [esteiras.get(i.membroId)] : []));
  quando(/FROM VoluntariosHabilitacao\s+WHERE HabilitacaoId = @id/, (i) => [...esteiras.values()].filter(e => e.HabilitacaoId === i.id));
  quando(/INSERT INTO VoluntariosHabilitacao/, (i) => { esteiras.set(i.membroId, esteira(i.membroId, i.congregacaoId, 900 + i.membroId)); return []; });
}
const esteira = (membroId, congregacaoId, habilitacaoId) => ({ HabilitacaoId: habilitacaoId, MembroId: membroId, CongregacaoId: congregacaoId, EtapaReferenciasObservacao: "obs sigilosa" });

beforeEach(() => { mockRegras = []; mockConsultas = []; mockEventos = {}; registrarAuditoria.mockClear(); mundo(); });

// ================================================================================================
// GestaoHabilitacaoVoluntarios
// ================================================================================================
describe("habilitacao-voluntarios · iniciar (a esteira é de uma PESSOA)", () => {
  const iniciar = (token, corpo) => chamar(hHab, "iniciar", { metodo: "POST", token, corpo });

  test("sem sessão: 401; sessão de PIN: 403 sem tocar no banco", async () => {
    expect((await iniciar(undefined, { membroId: 10, congregacaoId: 1 })).status).toBe(401);
    const r = await iniciar(PIN, { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel local SEM a permissão habilitacao_voluntarios: 403 e nada gravado", async () => {
    expect((await iniciar(local(["pessoas"]), { membroId: 10, congregacaoId: 1 })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("pessoa de OUTRA congregação (sem equipe no escopo): 403, nada é gravado, a esteira dela não nasce", async () => {
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 20, congregacaoId: 1 });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect(esteiras.size).toBe(0);
  });
  test("congregação do corpo fora do escopo: 403 e nada gravado, mesmo com a pessoa do escopo", async () => {
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 10, congregacaoId: 2 });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("pessoa inexistente e pessoa de fora do escopo recebem a MESMA resposta", async () => {
    const t = local(["habilitacao_voluntarios"]);
    const fora = await iniciar(t, { membroId: 20, congregacaoId: 1 });
    const inexistente = await iniciar(t, { membroId: 99, congregacaoId: 1 });
    expect(inexistente.status).toBe(fora.status);
    expect(inexistente.body).toEqual(fora.body);
  });
  test("pessoa do escopo: 201 e a esteira é gravada com a pessoa e a congregação certas, com auditoria", async () => {
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(201);
    expect(r.body.habilitacao.membroId).toBe(10);
    const ins = rodou(/INSERT INTO VoluntariosHabilitacao/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ membroId: 10, congregacaoId: 1, criadoPor: 5 });
    const aud = registrarAuditoria.mock.calls.map(c => c[0]).filter(a => a.acao === "ESTEIRA_ABERTA");
    expect(aud).toHaveLength(1);
    expect(aud[0]).toMatchObject({ tabela: "VoluntariosHabilitacao", usuarioId: 5, dadosDepois: { membroId: 10, congregacaoId: 1 } });
  });
  test("voluntário de outra congregação que está ATIVO numa equipe do escopo: pode abrir a esteira", async () => {
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 21, congregacaoId: 1 });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO VoluntariosHabilitacao/)).toHaveLength(1);
  });
  test("esteira que já existe noutra unidade NUNCA é devolvida: 403 igual, sem gravar", async () => {
    esteiras.set(10, esteira(10, 2, 910));                 // a pessoa 10 (de A) tem esteira aberta pela congregação B
    const t = local(["habilitacao_voluntarios"]);
    const r = await iniciar(t, { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toMatch(/obs sigilosa|habilitacaoId|910/);
    expect(escritas()).toHaveLength(0);
    const fora = await iniciar(t, { membroId: 20, congregacaoId: 1 });
    expect(r.body).toEqual(fora.body);
  });
  test("esteira existente da própria congregação: 201 devolve a existente, sem novo INSERT", async () => {
    esteiras.set(10, esteira(10, 1, 910));
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(201);
    expect(r.body.habilitacao.habilitacaoId).toBe(910);
    expect(escritas()).toHaveLength(0);
  });
  test("corrida: a esteira da pessoa nasce noutra unidade entre a leitura e a gravação — o INSERT bate no UNIQUE e a esteira alheia NÃO é devolvida", async () => {
    mockRegras.unshift([/INSERT INTO VoluntariosHabilitacao/, (i) => { esteiras.set(i.membroId, esteira(i.membroId, 2, 950)); throw Object.assign(new Error("duplicada"), { number: 2627 }); }]);
    const r = await iniciar(local(["habilitacao_voluntarios"]), { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toMatch(/obs sigilosa|950/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("GERAL abre a esteira de pessoa de qualquer congregação", async () => {
    const r = await iniciar(geral(["habilitacao_voluntarios"]), { membroId: 20, congregacaoId: 2 });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO VoluntariosHabilitacao/)).toHaveLength(1);
  });
  test("sessão SEM a lista de congregações (claim ausente) não alcança nada", async () => {
    const r = await iniciar(semLista(["habilitacao_voluntarios"]), { membroId: 10, congregacaoId: 1 });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("ids em forma não canônica: 400", async () => {
    for (const membroId of ["0x10", "1e1", { a: 1 }]) {
      expect((await iniciar(geral(["habilitacao_voluntarios"]), { membroId, congregacaoId: 1 })).status).toBe(400);
    }
  });
});

describe("habilitacao-voluntarios · leituras e escritas da esteira", () => {
  const T = () => local(["habilitacao_voluntarios"]);

  test("detalhe: 'sem esteira' e 'esteira de outra unidade' respondem IGUAL (404); a do escopo vem; GERAL vê a de fora", async () => {
    esteiras.set(10, esteira(10, 1, 910));
    esteiras.set(20, esteira(20, 2, 920));
    const semEsteira = await chamar(hHab, "detalhe", { query: { membroId: "21" }, token: T() });
    const deFora = await chamar(hHab, "detalhe", { query: { membroId: "20" }, token: T() });
    expect(semEsteira.status).toBe(404);
    expect(deFora.status).toBe(404);
    expect(deFora.body).toEqual(semEsteira.body);
    expect(JSON.stringify(deFora.body)).not.toMatch(/obs sigilosa/);
    const dentro = await chamar(hHab, "detalhe", { query: { membroId: "10" }, token: T() });
    expect(dentro.status).toBe(200);
    expect(dentro.body.habilitacao.habilitacaoId).toBe(910);
    expect((await chamar(hHab, "detalhe", { query: { membroId: "20" }, token: geral(["habilitacao_voluntarios"]) })).status).toBe(200);
  });
  test("detalhe, lista: PIN e papel sem a permissão levam 403", async () => {
    expect((await chamar(hHab, "detalhe", { query: { membroId: "10" }, token: PIN })).status).toBe(403);
    expect((await chamar(hHab, "detalhe", { query: { membroId: "10" }, token: local(["pessoas"]) })).status).toBe(403);
    expect((await chamar(hHab, "lista", { query: { congregacaoId: "1" }, token: PIN })).status).toBe(403);
  });
  test("lista: congregação fora do escopo 403; do escopo 200", async () => {
    expect((await chamar(hHab, "lista", { query: { congregacaoId: "2" }, token: T() })).status).toBe(403);
    expect((await chamar(hHab, "lista", { query: { congregacaoId: "1" }, token: T() })).status).toBe(200);
  });

  test.each([
    ["concluir-etapa", { etapa: "FICHA_INSCRICAO" }, /UPDATE VoluntariosHabilitacao SET etapaFichaInscricaoEm/],
    ["marcar-inapto", { motivo: "Motivo suficiente" }, /UPDATE VoluntariosHabilitacao SET Status = 'INAPTO'/],
    ["reabilitar", {}, /UPDATE VoluntariosHabilitacao\s+SET InaptoMotivo = NULL/]
  ])("%s: esteira de outra unidade e esteira inexistente respondem IGUAL (404) e nada é gravado; a do escopo grava", async (acao, extra, padraoEscrita) => {
    esteiras.set(10, esteira(10, 1, 910));
    esteiras.set(20, esteira(20, 2, 920));
    expect((await chamar(hHab, acao, { metodo: "POST", token: PIN, corpo: { habilitacaoId: 910, ...extra } })).status).toBe(403);
    expect((await chamar(hHab, acao, { metodo: "POST", token: local(["pessoas"]), corpo: { habilitacaoId: 910, ...extra } })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    const fora = await chamar(hHab, acao, { metodo: "POST", token: T(), corpo: { habilitacaoId: 920, ...extra } });
    const inexistente = await chamar(hHab, acao, { metodo: "POST", token: T(), corpo: { habilitacaoId: 999, ...extra } });
    expect(fora.status).toBe(404);
    expect(fora.body).toEqual(inexistente.body);
    expect(escritas()).toHaveLength(0);
    const dentro = await chamar(hHab, acao, { metodo: "POST", token: T(), corpo: { habilitacaoId: 910, ...extra } });
    expect(dentro.status).toBe(200);
    expect(rodou(padraoEscrita).length).toBeGreaterThan(0);
    const geralR = await chamar(hHab, acao, { metodo: "POST", token: geral(["habilitacao_voluntarios"]), corpo: { habilitacaoId: 920, ...extra } });
    expect(geralR.status).toBe(200);
  });

  test("equipes-flag GET: exige a permissão (antes bastava o escopo); fora do escopo 403; do escopo 200; GERAL 200", async () => {
    expect((await chamar(hHab, "equipes-flag", { query: { congregacaoId: "1" }, token: PIN })).status).toBe(403);
    const semPermissao = await chamar(hHab, "equipes-flag", { query: { congregacaoId: "1" }, token: local(["pessoas", "reunioes"]) });
    expect(semPermissao.status).toBe(403);
    expect(rodou(/FROM EscalasEquipes WHERE CongregacaoId/)).toHaveLength(0);
    expect((await chamar(hHab, "equipes-flag", { query: { congregacaoId: "2" }, token: T() })).status).toBe(403);
    expect((await chamar(hHab, "equipes-flag", { query: { congregacaoId: "1" }, token: T() })).status).toBe(200);
    expect((await chamar(hHab, "equipes-flag", { query: { congregacaoId: "2" }, token: geral(["habilitacao_voluntarios"]) })).status).toBe(200);
  });
  test("equipes-flag POST: equipe de fora e equipe inexistente respondem IGUAL (404) sem gravar; a do escopo grava E deixa auditoria com antes/depois", async () => {
    expect((await chamar(hHab, "equipes-flag", { metodo: "POST", token: PIN, corpo: { equipeId: 100, contatoComMenores: true } })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    const fora = await chamar(hHab, "equipes-flag", { metodo: "POST", token: T(), corpo: { equipeId: 200, contatoComMenores: false } });
    const inexistente = await chamar(hHab, "equipes-flag", { metodo: "POST", token: T(), corpo: { equipeId: 999, contatoComMenores: false } });
    expect(fora.status).toBe(404);
    expect(fora.body).toEqual(inexistente.body);
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    const dentro = await chamar(hHab, "equipes-flag", { metodo: "POST", token: T(), corpo: { equipeId: 100, contatoComMenores: true } });
    expect(dentro.status).toBe(200);
    const upd = rodou(/UPDATE EscalasEquipes SET ContatoComMenores/);
    expect(upd).toHaveLength(1);
    expect(upd[0].inputs).toMatchObject({ id: 100, valor: true });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
      tabela: "EscalasEquipes", registroId: 100, acao: "CONTATO_COM_MENORES_ALTERADO", usuarioId: 5,
      dadosAntes: { contatoComMenores: false }, dadosDepois: { contatoComMenores: true }
    }));
    // v7.7: DESLIGAR a marca (equipe que já tem menores) derruba todo o portão: exige a confirmação reforçada (428 sem ela); LIGAR é livre (acima)
    const semFator = await chamar(hHab, "equipes-flag", { metodo: "POST", token: geral(["habilitacao_voluntarios"]), corpo: { equipeId: 200, contatoComMenores: false } });
    expect(semFator.status).toBe(428);
    expect(semFator.body.precisaFator).toBe(true);
    expect(rodou(/UPDATE EscalasEquipes SET ContatoComMenores/)).toHaveLength(1);       // só a do "ligar" acima: o desligar sem fator não gravou
    const comFator = tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] });
    expect((await chamar(hHab, "equipes-flag", { metodo: "POST", token: comFator, corpo: { equipeId: 200, contatoComMenores: false } })).status).toBe(200);
  });
  test("reabilitar a si mesmo é recusado (403): o 'inapto' é trava de proteção de crianças", async () => {
    esteiras.set(1, { ...esteira(1, 1, 901), Status: "INAPTO" });
    const r = await chamar(hHab, "reabilitar", { metodo: "POST", token: geral(["habilitacao_voluntarios"]), corpo: { habilitacaoId: 901 } });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toMatch(/Ninguém reabilita a si mesmo/);
    expect(escritas()).toHaveLength(0);
  });

  test("elegibilidade-menores: pessoa de fora = inexistente (mesma resposta); equipe de fora não entrega a marca; do escopo 200; GERAL 200", async () => {
    // a leitura dos dados de elegibilidade devolveria a pessoa (e a marca da equipe) se a rota chegasse até ela — então só a conferência de escopo segura a pessoa de fora
    quando(/FROM MembroReferencia WHERE MembroId = @id/, (i) => (MEMBROS[i.id] ? [{ MembroId: i.id, Nome: `Pessoa ${i.id}`, DataAdmissao: null }] : []));
    quando(/SELECT ContatoComMenores FROM EscalasEquipes WHERE EquipeId = @id/, [{ ContatoComMenores: true }]);
    expect((await chamar(hHab, "elegibilidade-menores", { query: { membroId: "10" }, token: PIN })).status).toBe(403);
    const fora = await chamar(hHab, "elegibilidade-menores", { query: { membroId: "20" }, token: T() });
    const inexistente = await chamar(hHab, "elegibilidade-menores", { query: { membroId: "99" }, token: T() });
    expect(fora.status).toBe(404);
    expect(fora.body).toEqual(inexistente.body);
    expect(JSON.stringify(fora.body)).not.toMatch(/Pessoa 20/);
    // pessoa do escopo, equipe de OUTRA congregação: a marca da equipe não é lida nem devolvida
    const equipeFora = await chamar(hHab, "elegibilidade-menores", { query: { membroId: "10", equipeId: "200" }, token: T() });
    expect(equipeFora.status).toBe(404);
    expect(equipeFora.body).toEqual(fora.body);
    expect(rodou(/SELECT ContatoComMenores FROM EscalasEquipes/)).toHaveLength(0);
    const dentro = await chamar(hHab, "elegibilidade-menores", { query: { membroId: "10", equipeId: "100" }, token: T() });
    expect(dentro.status).toBe(200);
    expect((await chamar(hHab, "elegibilidade-menores", { query: { membroId: "10", equipeId: "200" }, token: geral(["habilitacao_voluntarios"]) })).status).toBe(200);
  });

  test("desligamento (registro de RH): pessoa de fora = inexistente (404 igual) e nada é gravado; equipe de fora 404; do escopo grava", async () => {
    quando(/INSERT INTO VoluntariosDesligamentos/, [{ DesligamentoId: 8 }]);
    const corpo = (membroId, extra = {}) => ({ membroId, motivo: "Motivo suficiente", tipoMotivo: "OUTRO", ...extra });
    expect((await chamar(hHab, "desligamento", { metodo: "POST", token: PIN, corpo: corpo(10) })).status).toBe(403);
    const fora = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(20) });
    const inexistente = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(99) });
    expect(fora.status).toBe(404);
    expect(fora.body).toEqual(inexistente.body);
    const equipeFora = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(10, { equipeId: 200 }) });
    const equipeInexistente = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(10, { equipeId: 999 }) });
    expect(equipeFora.status).toBe(404);
    expect(equipeFora.body).toEqual(equipeInexistente.body);
    expect(escritas()).toHaveLength(0);
    const dentro = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(10, { equipeId: 100 }) });
    expect(dentro.status).toBe(201);
    expect(rodou(/INSERT INTO VoluntariosDesligamentos/)[0].inputs).toMatchObject({ membroId: 10, equipeId: 100 });
    expect((await chamar(hHab, "desligamento", { metodo: "POST", token: geral(["habilitacao_voluntarios"]), corpo: corpo(20, { equipeId: 200 }) })).status).toBe(201);
  });
  test("desligamento com removidoDaEscala: pessoa inexistente e pessoa fora do alcance respondem IGUAL (422) e nada é gravado", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, (i) => (MEMBROS[i.id] ? [{ MembroId: i.id, Nome: `Pessoa ${i.id}`, Email: null, CongregacaoNome: MEMBROS[i.id] }] : []));
    // a pessoa 20 só serve em equipe de B (a regra do mundo devolve vazio para ela)
    const corpo = (membroId) => ({ membroId, motivo: "Motivo suficiente", tipoMotivo: "OUTRO", removidoDaEscala: true });
    const fora = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(20) });
    const inexistente = await chamar(hHab, "desligamento", { metodo: "POST", token: T(), corpo: corpo(99) });
    expect(fora.status).toBe(422);
    expect(fora.body).toEqual(inexistente.body);
    expect(escritas()).toHaveLength(0);
  });
  test("desligamentos GET: só o que o escopo alcança; pessoa inexistente devolve lista vazia igual à de fora", async () => {
    quando(/FROM VoluntariosDesligamentos d/, (i) => [
      { desligamentoId: 1, equipeId: null, tipoMotivo: "OUTRO", motivo: "sem equipe", removidoDaEscala: false, desligadoEm: null, congregacaoNome: null },
      { desligamentoId: 2, equipeId: 100, tipoMotivo: "OUTRO", motivo: "equipe de A", removidoDaEscala: false, desligadoEm: null, congregacaoNome: "A" },
      { desligamentoId: 3, equipeId: 200, tipoMotivo: "OUTRO", motivo: "equipe de B", removidoDaEscala: false, desligadoEm: null, congregacaoNome: "B" }
    ].filter(() => i.membroId === 10 || i.membroId === 20));
    expect((await chamar(hHab, "desligamentos", { query: { membroId: "10" }, token: PIN })).status).toBe(403);
    const deA = await chamar(hHab, "desligamentos", { query: { membroId: "10" }, token: T() });
    expect(deA.body.desligamentos.map(d => d.desligamentoId)).toEqual([1, 2]);          // o de B (equipe de fora) não aparece
    const deB = await chamar(hHab, "desligamentos", { query: { membroId: "20" }, token: T() });
    expect(deB.body.desligamentos.map(d => d.desligamentoId)).toEqual([2]);             // pessoa de B: o sem-equipe é dela (fora); o da equipe de A é visível
    const inexistente = await chamar(hHab, "desligamentos", { query: { membroId: "99" }, token: T() });
    expect(inexistente.status).toBe(200);
    expect(inexistente.body.desligamentos).toEqual([]);
    const tudo = await chamar(hHab, "desligamentos", { query: { membroId: "10" }, token: geral(["habilitacao_voluntarios"]) });
    expect(tudo.body.desligamentos.map(d => d.desligamentoId)).toEqual([1, 2, 3]);
  });
});

// ================================================================================================
// GestaoEventos
// ================================================================================================
describe("eventos-gestao · caixas (financeiro por evento)", () => {
  const evento = (id, over = {}) => ({
    id, titulo: `Evento ${id}`, dataInicio: "2026-11-10", dataFim: "2026-11-12", horaInicio: "19:00", local: "Templo", tipo: { codigo: "CONGRESSO", nome: "Congresso" },
    nivel: 3, rotuloNivel: "Região", abrangencia: "AREAS", congregacaoNome: null, areaNomes: [], status: "HOMOLOGADO", slugSite: null, publicoNoSite: false,
    areaIds: [1], congregacaoId: null, propostoPorMembroId: null, ...over
  });
  const caixaLinha = (eventoId, extra = {}) => ({ EventoId: eventoId, Status: "ABERTO", Ciclo: 1, AbertoEm: new Date(), AbertoPorNome: "Fulano", PrazoEncerramentoEm: "2026-12-31", ...extra });
  beforeEach(() => {
    mockEventos = { 1: evento(1, { areaIds: [1] }), 2: evento(2, { areaIds: [2] }), 3: evento(3, { abrangencia: "CAMPO", areaIds: [] }) };
    quando(/SELECT EventoId FROM EventoCaixas/, [{ EventoId: 3 }, { EventoId: 2 }, { EventoId: 1 }]);
    quando(/FROM EventoCaixas c JOIN MembroReferencia ab/, (i) => [caixaLinha(i.e)]);
    quando(/FROM EventoCaixaLancamentos l JOIN/, []);
    quando(/FROM EventoCaixaDestinos WHERE EventoId/, []);
    quando(/SELECT Papel FROM EventoOrganizadores/, []);
  });
  const ids = (r) => r.body.caixas.map(x => x.evento.eventoId).sort();

  test("PIN e papel sem a permissão: 403 sem tocar nos caixas", async () => {
    expect((await chamar(hEventos, "caixas", { token: PIN })).status).toBe(403);
    expect((await chamar(hEventos, "caixas", { token: local(["pessoas"]) })).status).toBe(403);
    expect((await chamar(hEventos, "caixas", { token: local(["financeiro"]) })).status).toBe(403);   // financeiro de escopo local não é a Tesouraria Geral
    expect(rodou(/EventoCaixas/)).toHaveLength(0);
  });
  test("gestão de eventos de escopo local vê SÓ os caixas de eventos das Áreas do escopo (antes via todos os de Áreas)", async () => {
    const r = await chamar(hEventos, "caixas", { token: local(["eventos_gestao"]) });
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([1]);                                    // o 2 é de Área fora do escopo; o 3 é do campo inteiro
    const outro = await chamar(hEventos, "caixas", { token: local(["eventos_gestao"], { escopoCongregacoes: ["B"] }) });
    expect(ids(outro)).toEqual([2]);
  });
  test("gestão de eventos GERAL e Tesouraria Geral (financeiro + escopo TODAS) veem todos", async () => {
    expect(ids(await chamar(hEventos, "caixas", { token: geral(["eventos_gestao"]) }))).toEqual([1, 2, 3]);
    expect(ids(await chamar(hEventos, "caixas", { token: geral(["financeiro"]) }))).toEqual([1, 2, 3]);
  });
  test("sessão SEM a lista de congregações (claim ausente) não vê nenhum caixa — antes valia como global", async () => {
    const r = await chamar(hEventos, "caixas", { token: semLista(["eventos_gestao"]) });
    expect(r.status).toBe(200);
    expect(r.body.caixas).toEqual([]);
    // e a Tesouraria exige o escopo TODAS de verdade: sem a lista não é global
    expect((await chamar(hEventos, "caixas", { token: semLista(["financeiro"]) })).status).toBe(403);
  });
  test("caixa de um evento: gestão local só no evento coberto; sem lista, 403", async () => {
    expect((await chamar(hEventos, "caixa", { query: { eventoId: "1" }, token: local(["eventos_gestao"]) })).status).toBe(200);
    expect((await chamar(hEventos, "caixa", { query: { eventoId: "2" }, token: local(["eventos_gestao"]) })).status).toBe(403);
    expect((await chamar(hEventos, "caixa", { query: { eventoId: "1" }, token: semLista(["eventos_gestao"]) })).status).toBe(403);
    expect((await chamar(hEventos, "caixa", { query: { eventoId: "1" }, token: PIN })).status).toBe(403);
  });
  test("eventoId em forma não canônica: 400, nunca outro evento", async () => {
    for (const eventoId of ["0x1", "1e0", "01", " 1"]) {
      expect((await chamar(hEventos, "caixa", { query: { eventoId }, token: geral(["eventos_gestao"]) })).status).toBe(400);
    }
  });
});

describe("eventos-gestao · conferir o caixa (segregação)", () => {
  const evento = (over = {}) => ({ id: 1, titulo: "Congresso", dataInicio: "2026-11-10", dataFim: "2026-11-12", status: "HOMOLOGADO", abrangencia: "CAMPO", areaIds: [], propostoPorMembroId: null, tipo: { codigo: "CONGRESSO", nome: "Congresso" }, ...over });
  const conferir = (token) => chamar(hEventos, "caixa/conferir", { metodo: "POST", token, corpo: { eventoId: 1 } });
  beforeEach(() => {
    mockEventos = { 1: evento() };
    quando(/SELECT \* FROM EventoCaixas WHERE EventoId = @e/, [{ EventoId: 1, Status: "ENCERRADO", EncerradoPorMembroId: 9, Ciclo: 1 }]);
    quando(/SELECT Papel FROM EventoOrganizadores/, (i) => (i.m === 7 ? [{ Papel: "ORGANIZADOR" }] : []));
  });
  const tesouraria = (membroId) => tokenDe(membroId, { via: "SENHA", nivel: "GLOBAL", permissoes: ["financeiro"], escopoCongregacoes: "TODAS" });

  test("PIN e financeiro de escopo local: 403 sem gravar", async () => {
    expect((await conferir(PIN)).status).toBe(403);
    expect((await conferir(local(["financeiro"]))).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("quem organiza o evento (qualquer papel) não confere o caixa dele, mesmo sem ter encerrado: 422 e nada gravado", async () => {
    const r = await conferir(tesouraria(7));
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/organiza este evento/);
    expect(escritas()).toHaveLength(0);
  });
  test("o proponente do evento no calendário também não confere", async () => {
    mockEventos = { 1: evento({ propostoPorMembroId: 8 }) };
    const r = await conferir(tesouraria(8));
    expect(r.status).toBe(422);
    expect(escritas()).toHaveLength(0);
  });
  test("quem encerrou também não confere (regra que já existia)", async () => {
    expect((await conferir(tesouraria(9))).status).toBe(422);
    expect(escritas()).toHaveLength(0);
  });
  test("o botão de conferir (acoes.conferirCaixa) só aparece para quem pode conferir", async () => {
    quando(/FROM EventoCaixas c JOIN MembroReferencia ab/, [{ EventoId: 1, Status: "ENCERRADO", Ciclo: 1, AbertoEm: new Date(), AbertoPorNome: "Fulano", PrazoEncerramentoEm: "2026-12-31", EncerradoPorMembroId: 9 }]);
    quando(/FROM EventoCaixaLancamentos l JOIN/, []);
    quando(/FROM EventoCaixaDestinos WHERE EventoId/, []);
    const ver = async (membroId) => (await chamar(hEventos, "caixa", { query: { eventoId: "1" }, token: tesouraria(membroId) })).body.acoes.conferirCaixa;
    expect(await ver(3)).toBe(true);
    expect(await ver(7)).toBe(false);              // organizador do evento
    expect(await ver(9)).toBe(false);              // quem encerrou
  });
  test("outra pessoa da Tesouraria Geral confere: 200, grava e audita", async () => {
    const r = await conferir(tesouraria(3));
    expect(r.status).toBe(200);
    expect(rodou(/UPDATE EventoCaixas SET Status = 'CONFERIDO'/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "CAIXA_CONFERIDO", usuarioId: 3 }));
  });
});

// ================================================================================================
// GestaoEbdRevistas
// ================================================================================================
describe("ebd-revistas · catálogo (vale para o campo inteiro)", () => {
  const cadastrar = (token) => chamar(hRevistas, "catalogo", { metodo: "POST", token, corpo: { nome: "Revista X", trimestre: "2026-T4", precoUnitario: 12.5 } });
  beforeEach(() => { quando(/INSERT INTO EbdCatalogoRevistas/, [{ RevistaId: 7 }]); });

  test("PIN, papel sem ebd_gestao (mesmo geral): 403 sem gravar", async () => {
    expect((await cadastrar(undefined)).status).toBe(401);
    expect((await cadastrar(PIN)).status).toBe(403);
    expect((await cadastrar(geral(["pessoas"]))).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("ebd_gestao de escopo LOCAL não cadastra revista para o campo todo: 403 antes de tocar no banco", async () => {
    const r = await cadastrar(local(["ebd_gestao"]));
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o nível GLOBAL do papel sozinho não basta (escopo de lista) e sessão sem a lista também não", async () => {
    expect((await cadastrar(local(["ebd_gestao"], { nivel: "GLOBAL" }))).status).toBe(403);
    expect((await cadastrar(semLista(["ebd_gestao"]))).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("escopo TODAS + ebd_gestao cadastra (inclui o Líder Geral de Departamento, nível DEPARTAMENTO)", async () => {
    for (const token of [geral(["ebd_gestao"]), local(["ebd_gestao"], { nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS" })]) {
      mockConsultas = [];
      const r = await cadastrar(token);
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO EbdCatalogoRevistas/)).toHaveLength(1);
    }
  });
  test("o catálogo continua legível por qualquer sessão (a tela do professor precisa dele)", async () => {
    expect((await chamar(hRevistas, "catalogo", { token: PIN })).status).toBe(200);
  });
  test.each(["pedidos/aprovar", "pedidos/pagamento"])("%s de pedido cuja turma sumiu dá 403, não 500", async (acao) => {
    quando(/SELECT \* FROM EbdPedidosRevistas WHERE PedidoId = @id/, [{ PedidoId: 1, TurmaId: 77 }]);
    const r = await chamar(hRevistas, acao, { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { pedidoId: 1 } });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("ids em forma não canônica: 400", async () => {
    expect((await chamar(hRevistas, "pedidos", { query: { turmaId: "0x10" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hRevistas, "pedido", { query: { pedidoId: "1e1" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hRevistas, "pedidos", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { turmaId: {}, trimestre: "2026-T4" } })).status).toBe(400);
  });
});

// ================================================================================================
// GestaoEbdAtividades — a questão/atividade é da congregação da turma do aluno
// ================================================================================================
describe("ebd-atividades · resposta de aluno (dado de aluno, inclusive menor)", () => {
  // aluno 40 na turma 5 (congregação A=1); professor da turma 5 = membro 5; questão 100 e atividade 50 são de A; questão 200 e atividade 60 são de B
  beforeEach(() => {
    quando(/SELECT AlunoId, TurmaId FROM EbdAlunos WHERE AlunoId = @id AND Ativo = 1/, (i) => (i.id === 40 ? [{ AlunoId: 40, TurmaId: 5 }] : []));
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, (i) => (i.id === 5 ? [{ TurmaId: 5, CongregacaoId: 1, Nome: "Jovens", Ativa: true }] : []));
    quando(/FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId/, (i) => (i.turmaId === 5 && i.membroId === 5 ? [{ x: 1 }] : []));
    quando(/FROM EbdAtividadeQuestoes q\s+JOIN EbdAtividades a/, (i) => (i.id === 100 ? [{ CongregacaoId: 1 }] : i.id === 200 ? [{ CongregacaoId: 2 }] : []));
    quando(/FROM EbdAtividades a\s+JOIN EbdLicoes l/, (i) => (i.id === 50 ? [{ CongregacaoId: 1 }] : i.id === 60 ? [{ CongregacaoId: 2 }] : []));
    quando(/SELECT \* FROM EbdAtividadeQuestoes WHERE QuestaoId = @id/, (i) => [{ QuestaoId: i.id, AtividadeId: 50, Tipo: "VF", Enunciado: "Questão", OpcoesJson: null, GabaritoJson: "true", Ordem: 0 }]);
    quando(/INSERT INTO EbdRespostasAlunos/, [{ RespostaId: 1 }]);
    quando(/FROM EbdAtividadeQuestoes q\s+LEFT JOIN EbdRespostasAlunos r/, []);
    quando(/FROM EbdAlunos a LEFT JOIN MembroReferencia m/, []);
  });
  const responder = (token, questaoId) => chamar(hAtiv, "resposta", { metodo: "POST", token, corpo: { questaoId, alunoId: 40, resposta: true } });
  const professor = () => tokenDe(5, { via: "PIN" });                         // o professor entra pelo PIN: permissões vazias, mas é o professor da turma
  const gestaoDeA = () => local(["ebd_gestao"]);

  test("sem sessão 401; membro comum (PIN) que não é professor da turma: 403 sem gravar", async () => {
    expect((await responder(undefined, 100)).status).toBe(401);
    expect((await responder(PIN, 100)).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("professor da turma, questão da própria congregação: 200, corrige e grava", async () => {
    const r = await responder(professor(), 100);
    expect(r.status).toBe(200);
    expect(r.body.correta).toBe(true);
    expect(rodou(/INSERT INTO EbdRespostasAlunos/)).toHaveLength(1);
  });
  test("questão de OUTRA congregação e questão inexistente: 403 igual, nada gravado, sem oráculo do gabarito", async () => {
    const alheia = await responder(professor(), 200);
    const inexistente = await responder(professor(), 999);
    expect(alheia.status).toBe(403);
    expect(alheia.body).toEqual(inexistente.body);
    expect(alheia.body.correta).toBeUndefined();
    expect(escritas()).toHaveLength(0);
    expect(rodou(/SELECT \* FROM EbdAtividadeQuestoes WHERE QuestaoId/)).toHaveLength(0);   // nem chegou a ler a questão alheia
  });
  test("gestão de escopo local: aluno da própria congregação grava; turma de outra congregação 403; questão alheia 403", async () => {
    expect((await responder(gestaoDeA(), 100)).status).toBe(200);
    expect((await responder(gestaoDeA(), 200)).status).toBe(403);
    expect((await responder(local(["ebd_gestao"], { escopoCongregacoes: ["B"], membroId: 6 }), 100)).status).toBe(403);
    expect((await responder(geral(["ebd_gestao"]), 100)).status).toBe(200);
  });
  test("respostas GET: atividade de outra congregação não devolve nem o enunciado (403 igual à inexistente)", async () => {
    const propria = await chamar(hAtiv, "respostas", { query: { atividadeId: "50", alunoId: "40" }, token: professor() });
    expect(propria.status).toBe(200);
    const alheia = await chamar(hAtiv, "respostas", { query: { atividadeId: "60", alunoId: "40" }, token: professor() });
    const inexistente = await chamar(hAtiv, "respostas", { query: { atividadeId: "999", alunoId: "40" }, token: professor() });
    expect(alheia.status).toBe(403);
    expect(alheia.body).toEqual(inexistente.body);
    expect(rodou(/FROM EbdAtividadeQuestoes q\s+LEFT JOIN EbdRespostasAlunos r/)).toHaveLength(1);   // só a consulta da atividade própria
    expect((await chamar(hAtiv, "respostas", { query: { atividadeId: "50", alunoId: "40" }, token: PIN })).status).toBe(403);
  });
  test("resumo GET: atividade de outra congregação 403; turma do professor e gestão do escopo 200", async () => {
    expect((await chamar(hAtiv, "resumo", { query: { atividadeId: "50", turmaId: "5" }, token: professor() })).status).toBe(200);
    expect((await chamar(hAtiv, "resumo", { query: { atividadeId: "60", turmaId: "5" }, token: professor() })).status).toBe(403);
    expect((await chamar(hAtiv, "resumo", { query: { atividadeId: "50", turmaId: "5" }, token: PIN })).status).toBe(403);
    expect((await chamar(hAtiv, "resumo", { query: { atividadeId: "50", turmaId: "5" }, token: gestaoDeA() })).status).toBe(200);
    expect((await chamar(hAtiv, "resumo", { query: { atividadeId: "60", turmaId: "5" }, token: geral(["ebd_gestao"]) })).status).toBe(403);   // nem o geral grava/lê atividade de uma congregação na turma de outra
  });
  test("ids em forma não canônica: 400", async () => {
    for (const questaoId of ["abc", "0x10", "1e1", {}, 0]) {
      expect((await responder(professor(), questaoId)).status).toBe(400);
    }
    expect((await chamar(hAtiv, "respostas", { query: { atividadeId: "1.5", alunoId: "40" }, token: professor() })).status).toBe(400);
  });
});

// ================================================================================================
// GestaoEbdSalaAula — escopo "global" só com TODAS
// ================================================================================================
describe("ebd-sala · plano de aula do campo inteiro", () => {
  const criar = (token, extra = {}) => chamar(hSala, "planos", { metodo: "POST", token, corpo: { data: "2026-10-11", titulo: "Plano de aula", ...extra } });
  beforeEach(() => { quando(/INSERT INTO EbdPlanosAula/, [{ PlanoId: 3 }]); });

  test("PIN e papel sem ebd_gestao: 403 sem gravar", async () => {
    expect((await criar(undefined)).status).toBe(401);
    expect((await criar(PIN)).status).toBe(403);
    expect((await criar(geral(["pessoas"]))).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("plano do CAMPO INTEIRO (sem congregação): só escopo TODAS; local e sessão sem lista levam 403", async () => {
    expect((await criar(local(["ebd_gestao"]))).status).toBe(403);
    expect((await criar(semLista(["ebd_gestao"]))).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await criar(geral(["ebd_gestao"]))).status).toBe(201);
    expect(rodou(/INSERT INTO EbdPlanosAula/)).toHaveLength(1);
  });
  test("plano de uma congregação: a do escopo grava; a de fora 403 sem gravar", async () => {
    expect((await criar(local(["ebd_gestao"]), { congregacaoId: 2 })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await criar(local(["ebd_gestao"]), { congregacaoId: 1 })).status).toBe(201);
    expect(rodou(/INSERT INTO EbdPlanosAula/)[0].inputs).toMatchObject({ congregacaoId: 1 });
  });
  test("lista de gestão: sessão sem a lista enxerga só os planos do campo inteiro (não vira 'todas')", async () => {
    await chamar(hSala, "planos", { query: { dataInicio: "2026-10-01", dataFim: "2026-10-31" }, token: semLista(["ebd_gestao"]) });
    await chamar(hSala, "planos", { query: { dataInicio: "2026-10-01", dataFim: "2026-10-31" }, token: geral(["ebd_gestao"]) });
    const consultas = rodou(/FROM EbdPlanosAula p/);
    expect(consultas[0].sql).toMatch(/AND p\.CongregacaoId IS NULL/);
    expect(consultas[1].sql).not.toMatch(/p\.CongregacaoId IS NULL/);
  });
  test("ids em forma não canônica: 400", async () => {
    expect((await chamar(hSala, "plano", { query: { planoId: "0x2" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hSala, "planos/turma", { query: { turmaId: "1e1" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await criar(geral(["ebd_gestao"]), { congregacaoId: "abc" })).status).toBe(400);
    expect((await chamar(hSala, "planos", { query: { congregacaoId: "abc" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
  });
});

// ================================================================================================
// Caderneta, Chamada e Financeiro — o escopo já era conferido; aqui se prende que continua assim e que id malformado dá 400 (não 500)
// ================================================================================================
describe("ebd-caderneta · salvar a linha da turma", () => {
  beforeEach(() => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, (i) => (i.id === 5 ? [{ TurmaId: 5, CongregacaoId: 1, Nome: "Jovens", Ativa: true }] : i.id === 6 ? [{ TurmaId: 6, CongregacaoId: 2, Nome: "Adultos", Ativa: true }] : []));
    quando(/SELECT TurmaId, CongregacaoId, Ativa FROM EbdTurmas WHERE TurmaId = @id/, (i) => (i.id === 5 ? [{ TurmaId: 5, CongregacaoId: 1, Ativa: true }] : []));
    quando(/FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId/, (i) => (i.turmaId === 5 && i.membroId === 5 ? [{ x: 1 }] : []));
    quando(/SELECT \* FROM EbdLicoes WHERE LicaoId = @id/, [{ LicaoId: 9, CongregacaoId: 1, Data: new Date("2026-10-04T00:00:00Z"), Status: "ABERTA" }]);
    quando(/SELECT COUNT\(\*\) AS Total FROM EbdAlunos/, [{ Total: 3 }]);
    quando(/INSERT INTO EbdCadernetas/, [{ CadernetaId: 1 }]);
  });
  const salvar = (token, extra = {}) => chamar(hCaderneta, "caderneta/salvar", { metodo: "POST", token, corpo: { licaoId: 9, turmaId: 5, biblias: 2, revistas: 2, ...extra } });

  test("PIN comum 403; professor da turma grava; gestão de fora do escopo 403 sem gravar; GERAL grava", async () => {
    expect((await salvar(PIN)).status).toBe(403);
    expect((await salvar(local(["ebd_gestao"], { escopoCongregacoes: ["B"], membroId: 6 }))).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await salvar(tokenDe(5, { via: "PIN" }))).status).toBe(200);
    expect(rodou(/INSERT INTO EbdCadernetas/)).toHaveLength(1);
    mockConsultas = [];
    expect((await salvar(geral(["ebd_gestao"]))).status).toBe(200);
  });
  test("ids em forma não canônica: 400, nunca 500", async () => {
    expect((await salvar(geral(["ebd_gestao"]), { licaoId: {} })).status).toBe(400);
    expect((await salvar(geral(["ebd_gestao"]), { turmaId: "0x5" })).status).toBe(400);
    expect((await chamar(hCaderneta, "relatorio", { query: { trimestre: "2026-T4", congregacaoId: "abc" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hCaderneta, "fechamento", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { congregacaoId: "1e0", trimestre: "2026-T4" } })).status).toBe(400);
  });
});

describe("ebd-chamada · abrir lição e ids", () => {
  const abrir = (token, corpo) => chamar(hChamada, "licao/abrir", { metodo: "POST", token, corpo });
  beforeEach(() => { quando(/INSERT INTO EbdLicoes/, [{ LicaoId: 9 }]); });

  test("PIN e papel sem ebd_gestao 403; gestão local: congregação de fora 403 sem gravar, do escopo 201; GERAL 201", async () => {
    expect((await abrir(PIN, { congregacaoId: 1, data: "2026-10-04" })).status).toBe(403);
    expect((await abrir(local(["ebd_gestao"]), { congregacaoId: 2, data: "2026-10-04" })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await abrir(local(["ebd_gestao"]), { congregacaoId: 1, data: "2026-10-04" })).status).toBe(201);
    expect(rodou(/INSERT INTO EbdLicoes/)[0].inputs).toMatchObject({ congregacaoId: 1 });
    expect((await abrir(geral(["ebd_gestao"]), { congregacaoId: 2, data: "2026-10-04" })).status).toBe(201);
  });
  test("data e ids malformados: 400, não 500", async () => {
    expect((await abrir(geral(["ebd_gestao"]), { congregacaoId: 1, data: "amanhã" })).status).toBe(400);
    expect((await abrir(geral(["ebd_gestao"]), { congregacaoId: "0x1", data: "2026-10-04" })).status).toBe(400);
    expect((await chamar(hChamada, "licao", { query: { congregacaoId: "1", data: "xx" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hChamada, "roster", { query: { turmaId: "1e1", licaoId: "1" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hChamada, "presenca", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { licaoId: 1, turmaId: 5, alunoId: [1], status: "PRESENTE" } })).status).toBe(400);
    expect((await chamar(hChamada, "licao/fechar", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { licaoId: "abc" } })).status).toBe(400);
    expect((await chamar(hChamada, "licao/fechar", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { licaoId: "0x9" } })).status).toBe(400);
    expect((await chamar(hChamada, "licao/reabrir", { metodo: "POST", token: geral(["ebd_gestao"]), corpo: { licaoId: "1e1" } })).status).toBe(400);
  });
  test("roster de turma que não é do usuário: PIN comum 403 (só o professor da turma ou a gestão do escopo)", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [{ TurmaId: 5, CongregacaoId: 1, Nome: "Jovens", Ativa: true }]);
    expect((await chamar(hChamada, "roster", { query: { turmaId: "5", licaoId: "9" }, token: PIN })).status).toBe(403);
    expect((await chamar(hChamada, "roster", { query: { turmaId: "5", licaoId: "9" }, token: local(["ebd_gestao"], { escopoCongregacoes: ["B"] }) })).status).toBe(403);
    expect((await chamar(hChamada, "roster", { query: { turmaId: "5", licaoId: "9" }, token: local(["ebd_gestao"]) })).status).toBe(200);
  });
});

describe("ebd-financeiro · caixa da escola", () => {
  beforeEach(() => {
    quando(/SELECT LicaoId, CongregacaoId, Data FROM EbdLicoes WHERE LicaoId = @id/, (i) => (i.id === 9 ? [{ LicaoId: 9, CongregacaoId: 1, Data: new Date("2026-10-04T00:00:00Z") }] : i.id === 10 ? [{ LicaoId: 10, CongregacaoId: 2, Data: new Date("2026-10-04T00:00:00Z") }] : []));
    quando(/SELECT \* FROM EbdOfertas WHERE LicaoId = @licaoId/, []);
    quando(/SELECT \* FROM EbdLancamentosFinanceiros WHERE LancamentoId = @id/, (i) => (i.id === 70 ? [{ LancamentoId: 70, CongregacaoId: 2, Valor: 5 }] : []));
  });
  const oferta = (token, licaoId) => chamar(hFinanceiro, "oferta", { metodo: "POST", token, corpo: { licaoId, valor: 10 } });

  test("PIN e papel sem ebd_gestao 403; congregação de fora 403 sem gravar; do escopo e GERAL gravam", async () => {
    expect((await oferta(PIN, 9)).status).toBe(403);
    expect((await oferta(local(["pessoas"]), 9)).status).toBe(403);
    expect((await oferta(local(["ebd_gestao"]), 10)).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await oferta(local(["ebd_gestao"]), 9)).status).toBe(200);
    expect(rodou(/MERGE EbdOfertas/)).toHaveLength(1);
    expect((await oferta(geral(["ebd_gestao"]), 10)).status).toBe(200);
  });
  test("excluir lançamento de outra congregação: 403 e nada apagado; id e mês malformados dão 400", async () => {
    const del = (token, id) => chamar(hFinanceiro, "lancamentos", { metodo: "DELETE", query: { id }, token });
    expect((await del(local(["ebd_gestao"]), "70")).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect((await del(geral(["ebd_gestao"]), "abc")).status).toBe(400);
    expect((await del(geral(["ebd_gestao"]), "0x46")).status).toBe(400);
    for (const mes of ["13", "0", "1.5", "abc"]) {
      expect((await chamar(hFinanceiro, "lancamentos", { query: { congregacaoId: "1", mes, ano: "2026" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    }
    expect((await chamar(hFinanceiro, "consolidado", { query: { congregacaoId: "1", mes: "10", ano: "26" }, token: geral(["ebd_gestao"]) })).status).toBe(400);
    expect((await chamar(hFinanceiro, "consolidado", { query: { congregacaoId: "2", mes: "10", ano: "2026" }, token: local(["ebd_gestao"]) })).status).toBe(403);
    expect((await chamar(hFinanceiro, "consolidado", { query: { congregacaoId: "1", mes: "10", ano: "2026" }, token: local(["ebd_gestao"]) })).status).toBe(200);
  });
});
