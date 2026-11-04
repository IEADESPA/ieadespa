// v9.2 — Expansão (Estatuto Art. 5º §5º; Regimento Art. 23, 24 §2º e 109-A): a regra pura (tipos, prazo de 15 dias da CME, urgência, ordem das datas) e a porta da
// rota com o handler de verdade e o banco simulado pelo TEXTO da consulta. O comportamento contra o SQL Server (CHECK, índices únicos, transações, corridas, a emancipação
// movendo os membros) é coberto pelo roteiro ponta a ponta (tools/e2e-localdb, e2e-71 e e2e-72).
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
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));

const ex = require("../expansao");
const auth = require("../auth");
const handler = require("../../GestaoExpansao/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const GERAL = (permissoes = ["expansao"], id = 1) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes = ["expansao"], id = 5, escopo = ["Central"]) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN", permissoes: ["expansao"] });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const CME_SQL = /dep\.Sigla = 'SEMIADESPA'/;
beforeEach(() => { mockRegras = []; mockConsultas = []; });

describe("o pedido (Estatuto Art. 5º §§3º e 5º; Regimento Art. 109-A)", () => {
  const base = { nome: "Tenda do Bairro Novo", justificativa: "Há 12 famílias de membros no bairro e um ponto cedido." };
  test("abertura de Extensão exige a Mãe e o Encarregado", () => {
    expect(ex.validarPedido({ ...base, tipo: "ABERTURA_EXTENSAO" }).mensagem).toMatch(/Congregação-Mãe/);
    expect(ex.validarPedido({ ...base, tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: "3" }).mensagem).toMatch(/Encarregado/);
    const ok = ex.validarPedido({ ...base, tipo: "abertura_extensao", congregacaoMaeId: "3", encarregadoMembroId: 44, areaId: 9 });
    expect(ok.valido).toBe(true);
    expect(ok.dados).toMatchObject({ tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: 3, encarregadoMembroId: 44, areaId: null, extensaoId: null });
  });
  test("emancipação exige a Extensão; a Área é opcional e estrita", () => {
    expect(ex.validarPedido({ ...base, tipo: "EMANCIPACAO" }).mensagem).toMatch(/Extensão/);
    expect(ex.validarPedido({ ...base, tipo: "EMANCIPACAO", extensaoId: 7, areaId: "1e1" }).mensagem).toMatch(/Área inválida/);
    expect(ex.validarPedido({ ...base, tipo: "EMANCIPACAO", extensaoId: 7, areaId: "" }).dados).toMatchObject({ extensaoId: 7, areaId: null, congregacaoMaeId: null });
  });
  test("nome, justificativa, UF e tipo: limites e lixo", () => {
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", nome: " " }).valido).toBe(false);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", nome: "x".repeat(151) }).valido).toBe(false);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", justificativa: "curta" }).valido).toBe(false);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", uf: "XX" }).mensagem).toMatch(/UF/);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", uf: "pa" }).dados.uf).toBe("PA");
    expect(ex.validarPedido({ ...base, tipo: "FILIAL" }).valido).toBe(false);
    expect(ex.validarPedido(null).valido).toBe(false);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", nome: ["a", "b"] }).valido).toBe(false);
    expect(ex.validarPedido({ ...base, tipo: "NOVA_CONGREGACAO", nome: "  Betel   Nova  " }).dados.nome).toBe("Betel Nova");
  });
});

describe("a CME e o prazo de 15 dias (Regimento Art. 23 e 24 §2º)", () => {
  test("só a emancipação e a nova congregação passam pela CME", () => {
    expect(ex.precisaCME("ABERTURA_EXTENSAO")).toBe(false);
    expect(ex.precisaCME("EMANCIPACAO")).toBe(true);
    expect(ex.precisaCME("NOVA_CONGREGACAO")).toBe(true);
  });
  test("o prazo vence no 15º dia; vencido só depois dele", () => {
    expect(ex.prazoParecer("2026-11-01")).toBe("2026-11-16");
    const p = { status: "EM_PARECER", tipo: "EMANCIPACAO", solicitadoEm: "2026-11-01" };
    expect(ex.parecerVencido(p, "2026-11-16")).toBe(false);
    expect(ex.parecerVencido(p, "2026-11-17")).toBe(true);
    expect(ex.parecerVencido({ ...p, status: "AGUARDANDO_CLI" }, "2026-12-31")).toBe(false);
    expect(ex.parecerVencido({ ...p, tipo: "ABERTURA_EXTENSAO" }, "2026-12-31")).toBe(false);
  });
  test("o parecer: favorável ou contrário, com fundamentação", () => {
    expect(ex.validarParecer({ parecer: "talvez", fundamentacao: "x".repeat(20) }).valido).toBe(false);
    expect(ex.validarParecer({ parecer: "favoravel", fundamentacao: "curta" }).valido).toBe(false);
    expect(ex.validarParecer({ parecer: "contrario", fundamentacao: "Sem sustento comprovado para o aluguel." }).dados.parecer).toBe("CONTRARIO");
  });
});

describe("a decisão da CLI", () => {
  const emParecer = { status: "EM_PARECER", tipo: "EMANCIPACAO", solicitadoEm: "2026-11-01", parecerEm: null };
  const comParecer = { status: "AGUARDANDO_CLI", tipo: "EMANCIPACAO", solicitadoEm: "2026-11-01", parecerEm: "2026-11-05" };
  test("validação: resultado, reunião e o motivo da recusa", () => {
    expect(ex.validarDecisao({ resultado: "TALVEZ", sessaoId: 1 }).valido).toBe(false);
    expect(ex.validarDecisao({ resultado: "APROVADO" }).mensagem).toMatch(/reunião/);
    expect(ex.validarDecisao({ resultado: "REJEITADO", sessaoId: 2 }).mensagem).toMatch(/motivo/);
    expect(ex.validarDecisao({ resultado: "aprovado", sessaoId: "2", urgencia: "true" }).dados).toEqual({ resultado: "APROVADO", sessaoId: 2, urgencia: true, motivo: null });
  });
  test("sem parecer, só com urgência (2/3); com parecer, a urgência não cabe", () => {
    expect(ex.podeDecidir(emParecer, { reuniao: { data: "2026-11-10" }, urgencia: false }).pode).toBe(false);
    expect(ex.podeDecidir(emParecer, { reuniao: { data: "2026-11-10" }, urgencia: true }).pode).toBe(true);
    expect(ex.podeDecidir(comParecer, { reuniao: { data: "2026-11-10" }, urgencia: true }).pode).toBe(false);
    expect(ex.podeDecidir(comParecer, { reuniao: { data: "2026-11-10" }, urgencia: false }).pode).toBe(true);
    // a abertura de Extensão não passa pela CME: a urgência não tem o que dispensar (o banco também recusa)
    const abertura = { status: "AGUARDANDO_CLI", tipo: "ABERTURA_EXTENSAO", solicitadoEm: "2026-11-01", parecerEm: null };
    expect(ex.podeDecidir(abertura, { reuniao: { data: "2026-11-10" }, urgencia: true }).mensagem).toMatch(/não passa pela CME/);
    expect(ex.podeDecidir(abertura, { reuniao: { data: "2026-11-10" }, urgencia: false }).pode).toBe(true);
  });
  test("a reunião não pode ser anterior ao pedido nem ao parecer", () => {
    expect(ex.podeDecidir(comParecer, { reuniao: { data: "2026-10-31" }, urgencia: false }).mensagem).toMatch(/anterior ao pedido/);
    expect(ex.podeDecidir(comParecer, { reuniao: { data: "2026-11-04" }, urgencia: false }).mensagem).toMatch(/anterior ao parecer/);
    expect(ex.podeDecidir(comParecer, { reuniao: { data: "2026-11-05" }, urgencia: false }).pode).toBe(true);
  });
  test("decidido ou retirado não se decide de novo", () => {
    for (const status of ["APROVADO", "REJEITADO", "DESISTIDO"]) expect(ex.podeDecidir({ ...comParecer, status }, { reuniao: { data: "2026-11-10" } }).pode).toBe(false);
  });
  test("troca de Encarregado e desistência pedem o motivo", () => {
    expect(ex.validarTrocaEncarregado({ membroId: "8" }).valido).toBe(false);
    expect(ex.validarTrocaEncarregado({ membroId: "x", motivo: "mudou de cidade" }).valido).toBe(false);
    expect(ex.validarTrocaEncarregado({ membroId: "8", motivo: "mudou de cidade" }).dados).toEqual({ membroId: 8, motivo: "mudou de cidade" });
    expect(ex.validarMotivo({ motivo: "" }).valido).toBe(false);
  });
  test("textos dos avisos", () => {
    expect(ex.textoPedidoNovo({ tipo: "EMANCIPACAO", nome: "Betel", mae: "Central" })).toMatch(/CME.*15 dias/);
    expect(ex.textoPedidoNovo({ tipo: "ABERTURA_EXTENSAO", nome: "Tenda", mae: "Central" })).toMatch(/aguardando a CLI/);
    expect(ex.textoParecerVencido({ tipo: "EMANCIPACAO", nome: "Betel", prazo: "2026-11-16", hoje: "2026-11-17" })).toMatch(/1 dia de atraso/);
    expect(ex.textoDecidido({ tipo: "NOVA_CONGREGACAO", nome: "Betel", resultado: "REJEITADO", motivo: "sem local" })).toMatch(/recusou.*sem local/);
  });
});

describe("a porta da rota /api/expansao", () => {
  const TODAS = [["GET", "catalogos"], ["GET", "painel"], ["GET", "pedidos"], ["GET", "pedido"], ["GET", "extensoes"], ["GET", "extensao-historico"], ["GET", "reunioes"],
    ...["pedido", "parecer", "decidir", "desistir", "encarregado"].map((a) => ["POST", a])];
  test("sem sessão: 401 em todas, nada consultado", async () => {
    for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (de membro): 403 antes de qualquer consulta", async () => {
    for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo, token: PIN() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("liderança sem a permissão e fora da CME: 403, só a composição da CME é lida, nada gravado", async () => {
    for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo, token: LOCAL(["pessoas"]) })).status).toBe(403);
    expect(mockConsultas.every((c) => CME_SQL.test(c.sql))).toBe(true);
    expect(escritas()).toHaveLength(0);
  });
  test("quem compõe a CME entra mesmo sem a permissão (o Secretário de Missões com o papel antigo)", async () => {
    quando(CME_SQL, [{ membroId: 5, nome: "Sec", email: null, cargoOuFuncao: "Secretário de Missões", origemSigla: "Missões", secretarioMissoes: 1, comAcessoTela: 0 }]);
    expect((await chamar("pedidos", { token: LOCAL(["pessoas"], 5, []) })).status).toBe(200);
  });
  test("decidir: só o nível geral (403 ao local) e com a confirmação recente (428)", async () => {
    expect((await chamar("decidir", { metodo: "POST", corpo: { pedidoId: "2" }, token: LOCAL() })).status).toBe(403);
    const semFator = tokenDe(1, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["expansao"] });
    expect((await chamar("decidir", { metodo: "POST", corpo: { pedidoId: "2" }, token: semFator })).status).toBe(428);
    expect(escritas()).toHaveLength(0);
  });
  test("reuniões da CLI: só o nível geral", async () => {
    expect((await chamar("reunioes", { token: LOCAL() })).status).toBe(403);
    expect((await chamar("reunioes", { token: GERAL() })).status).toBe(200);
  });
  test("identificador em TEXTO vale; lixo é 400 sem gravar nada; ação desconhecida 404; método errado 405", async () => {
    expect((await chamar("pedido", { query: { pedidoId: 3 }, token: GERAL() })).status).toBe(404);
    for (const ruim of ["0x3", "3.0", "-3", "abc", ""]) expect((await chamar("pedido", { query: { pedidoId: ruim }, token: GERAL() })).status).toBe(400);
    for (const corpo of [{}, { pedidoId: "1e1" }, { pedidoId: true }, { pedidoId: [1] }]) expect((await chamar("parecer", { metodo: "POST", corpo, token: GERAL() })).status).toBe(400);
    expect((await chamar("status-qualquer", { token: GERAL() })).status).toBe(404);
    expect((await chamar("pedidos", { query: { status: "XYZ" }, token: GERAL() })).status).toBe(400);
    expect((await chamar("painel", { metodo: "DELETE", token: GERAL() })).status).toBe(405);
    expect(escritas()).toHaveLength(0);
  });
  test("nova congregação é só do nível geral: o local recebe 403 sem gravar", async () => {
    const r = await chamar("pedido", { metodo: "POST", token: LOCAL(), corpo: { tipo: "NOVA_CONGREGACAO", nome: "Betel", justificativa: "Bairro novo sem igreja perto." } });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("abertura de Extensão para Mãe fora do escopo: recusada sem gravar (e a mesma resposta de 'não existe')", async () => {
    quando(/FROM Congregacoes\s+WHERE CongregacaoId = @id/, [{ CongregacaoId: 9, Nome: "Outra", Ativa: 1, Categoria: "CONGREGACAO", AreaId: null }]);
    const r = await chamar("pedido", { metodo: "POST", token: LOCAL(), corpo: { tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: 9, encarregadoMembroId: 4, nome: "Tenda", justificativa: "Ponto de pregação no bairro." } });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/não encontrada no seu escopo/);
    expect(escritas()).toHaveLength(0);
  });
  test("o escopo de uma Extensão não alcança a Mãe: não pede pela Mãe", async () => {
    quando(/FROM Congregacoes\s+WHERE CongregacaoId = @id/, [{ CongregacaoId: 2, Nome: "Central", Ativa: 1, Categoria: "CONGREGACAO", AreaId: null }]);
    const daExtensao = tokenDe(6, { via: "SENHA", nivel: "EXTENSAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: "Tenda Velha", permissoes: ["expansao"] });
    const corpo = { tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: 2, encarregadoMembroId: 4, nome: "Tenda", justificativa: "Ponto de pregação no bairro." };
    const r = await chamar("pedido", { metodo: "POST", token: daExtensao, corpo });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/não encontrada no seu escopo/);
    // o Dirigente da mesma congregação (escopo inteiro) passa dessa porta e chega à conferência do Encarregado
    const doDirigente = await chamar("pedido", { metodo: "POST", token: LOCAL(), corpo });
    expect(doDirigente.body.mensagem).toMatch(/Matrícula do Encarregado não encontrada/);
    expect(escritas()).toHaveLength(0);
  });
  test("Mãe rebaixada pelo PSC não abre Extensão (Art. 129 §3º)", async () => {
    quando(/FROM Congregacoes\s+WHERE CongregacaoId = @id/, [{ CongregacaoId: 2, Nome: "Central", Ativa: 1, Categoria: "EXTENSAO_TENDA", AreaId: null }]);
    const r = await chamar("pedido", { metodo: "POST", token: LOCAL(), corpo: { tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: 2, encarregadoMembroId: 4, nome: "Tenda", justificativa: "Ponto de pregação no bairro." } });
    expect(r.body.mensagem).toMatch(/rebaixada/);
    expect(escritas()).toHaveLength(0);
  });
  test("Encarregado de outra congregação é recusado (Art. 109-A, I)", async () => {
    quando(/FROM Congregacoes\s+WHERE CongregacaoId = @id/, [{ CongregacaoId: 2, Nome: "Central", Ativa: 1, Categoria: "CONGREGACAO", AreaId: null }]);
    quando(/SELECT MembroId, Nome, Status, SituacaoMembro, CongregacaoId FROM MembroReferencia/, [{ MembroId: 4, Nome: "Fulano", Status: "ATIVO", SituacaoMembro: "COMUNGANTE", CongregacaoId: 3 }]);
    const r = await chamar("pedido", { metodo: "POST", token: LOCAL(), corpo: { tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: 2, encarregadoMembroId: 4, nome: "Tenda", justificativa: "Ponto de pregação no bairro." } });
    expect(r.body.mensagem).toMatch(/própria Congregação-Mãe/);
    expect(escritas()).toHaveLength(0);
  });
  test("a CME não emite parecer sobre o pedido que ela mesma fez; quem não é da CME recebe 403", async () => {
    quando(CME_SQL, [{ membroId: 5, nome: "Pastor", cargoOuFuncao: "Pastor de Área", secretarioMissoes: 0, comAcessoTela: 1 }]);
    quando(/FROM PedidosExpansao p\s*WITH \(UPDLOCK, ROWLOCK\)/, [{ PedidoId: 2, Tipo: "EMANCIPACAO", Status: "EM_PARECER", Nome: "Betel", SolicitadoPor: 5, SolicitadoEm: "2026-11-01", MaeNome: "Central" }]);
    const proprio = await chamar("parecer", { metodo: "POST", token: LOCAL(), corpo: { pedidoId: 2, parecer: "FAVORAVEL", fundamentacao: "Viável: aluguel coberto pela Mãe." } });
    expect(proprio.status).toBe(422);
    expect(proprio.body.mensagem).toMatch(/Quem fez o pedido/);
    mockRegras = [];
    const fora = await chamar("parecer", { metodo: "POST", token: GERAL(), corpo: { pedidoId: 2, parecer: "FAVORAVEL", fundamentacao: "Viável: aluguel coberto pela Mãe." } });
    expect(fora.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("o local só vê os pedidos da congregação dele; a CME vê todos", async () => {
    const linhas = [
      { PedidoId: 1, Tipo: "ABERTURA_EXTENSAO", Status: "AGUARDANDO_CLI", Nome: "A", MaeNome: "Central", SolicitadoEm: "2026-11-01" },
      { PedidoId: 2, Tipo: "EMANCIPACAO", Status: "EM_PARECER", Nome: "B", MaeNome: "Outra", SolicitadoEm: "2026-11-01" },
      { PedidoId: 3, Tipo: "NOVA_CONGREGACAO", Status: "EM_PARECER", Nome: "C", MaeNome: null, SolicitadoEm: "2026-11-01" }
    ];
    quando(/ORDER BY CASE WHEN p.Status IN/, linhas);
    const local = await chamar("pedidos", { token: LOCAL() });
    expect(local.body.pedidos.map((p) => p.pedidoId)).toEqual([1]);
    quando(CME_SQL, [{ membroId: 7, nome: "Pastor", cargoOuFuncao: "Pastor de Área", secretarioMissoes: 0, comAcessoTela: 1 }]);
    const cme = await chamar("pedidos", { token: LOCAL(["expansao"], 7, ["Bairro"]) });
    expect(cme.body.pedidos.map((p) => p.pedidoId)).toEqual([1, 2, 3]);
  });
  test("a composição da CME na tela das Comissões não leva o e-mail", async () => {
    quando(CME_SQL, [{ membroId: 7, nome: "Pastor", email: "p@x.org", cargoOuFuncao: "Pastor de Área", origemSigla: "Área 1", secretarioMissoes: 0, comAcessoTela: 1 }]);
    const handlerComissoes = require("../../GestaoComissoes/index.js");
    const context = { bindingData: {}, log: { error() { } } };
    await handlerComissoes(context, { method: "GET", query: {}, body: {}, headers: { "x-auth-token": GERAL(["reunioes"]) } });
    expect(context.res.status).toBe(200);
    expect(context.res.body.CME).toEqual([{ membroId: 7, nome: "Pastor", cargoOuFuncao: "Pastor de Área", origemSigla: "Área 1" }]);
  });
});
