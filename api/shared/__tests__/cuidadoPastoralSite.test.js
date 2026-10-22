// v7.11.1 — o mural de oração do site entra no cuidado pastoral. A rota (CuidadoPastoralSite) falha FECHADA sem a chave combinada, valida o corpo e responde só sim/não;
// a camada de banco (receberDoSite) não abre o banco para o pedido comum, guarda o confidencial e o com risco só no nível geral, e avisa a Diretoria na hora, sem o texto.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs, tx) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, tx });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) { const rs = typeof valor === "function" ? valor(inputs) : valor; if (rs instanceof Error) throw rs; return { recordset: rs, rowsAffected: [1] }; }
    return { recordset: [], rowsAffected: [0] };
  };
  const novaRequisicao = (tx) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs, tx) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor(t) { return novaRequisicao(!!t); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: () => novaRequisicao(false) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ notificarAgora: jest.fn(async () => ({ criadas: 2, externas: 1 })), lerPrazoDias: jest.fn(async (_p, _s, padrao) => padrao) }));
jest.mock("../notificacoes", () => ({ resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 1, nome: "Presidente", email: "p@x" }, { membroId: 2, nome: "Secretário", email: "s@x" }]) }));
jest.mock("../financeiroSeguro", () => ({ obterTrava: jest.fn(async () => true) }));

const { notificarAgora } = require("../canaisDb");
const { registrarAuditoria } = require("../auditoria");
const db = require("../cuidadoPastoralDb");
const { getPool } = require("../db");
const handler = require("../../CuidadoPastoralSite/index.js");
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const CHAVE = "chave-do-teste-site-sistema";
async function chamar({ corpo = {}, chave = CHAVE, metodo = "POST" } = {}) {
  const context = { log: Object.assign(() => { }, { error() { }, warn() { } }) };
  await handler(context, { method: metodo, headers: chave ? { "x-site-key": chave } : {}, body: corpo, query: {} });
  return context.res;
}
beforeEach(() => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); process.env.CHAVE_SITE_SISTEMA = CHAVE; });
// a contagem do banco real sempre devolve uma linha (o teste do teto põe a sua antes)
const contagemPadrao = () => quando(/SELECT COUNT\(\*\) AS n FROM PedidosOracao WHERE Origem = 'SITE' AND Risco = @r/, [{ n: 0 }]);
afterAll(() => { delete process.env.CHAVE_SITE_SISTEMA; });

describe("a rota CuidadoPastoralSite", () => {
  test("FALHA FECHADA: sem a chave configurada no sistema, ninguém entra (diferente da VerificarContaMembro)", async () => {
    delete process.env.CHAVE_SITE_SISTEMA;
    expect((await chamar({ corpo: { texto: "quero morrer", confidencial: false } })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("chave errada ou ausente: 401, sem tocar no banco", async () => {
    expect((await chamar({ chave: "outra", corpo: { texto: "x x", confidencial: true } })).status).toBe(401);
    expect((await chamar({ chave: null, corpo: { texto: "x x", confidencial: true } })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("corpo ruim: 400; outro método: 405", async () => {
    expect((await chamar({ corpo: { confidencial: true } })).status).toBe(400);
    expect((await chamar({ corpo: { texto: "ok ok", confidencial: "sim" } })).status).toBe(400);
    expect((await chamar({ corpo: { texto: "ok ok", confidencial: true, nome: 5 } })).status).toBe(400);
    expect((await chamar({ corpo: { texto: "ok ok", confidencial: true, siteItemId: "1e1" } })).status).toBe(400);
    expect((await chamar({ corpo: { texto: " ", confidencial: true } })).status).toBe(400);
    expect((await chamar({ metodo: "GET" })).status).toBe(405);
  });
  test("o pedido comum (sem confidencialidade e sem risco) NÃO abre o banco", async () => {
    const r = await chamar({ corpo: { texto: "pela saúde da minha mãe", confidencial: false } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sucesso: true, gravado: false, risco: false });
    expect(mockConsultas).toHaveLength(0);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  test("o confidencial sem risco é guardado só no nível geral, sem aviso imediato", async () => {
    contagemPadrao(); quando(/INSERT INTO PedidosOracao/, [{ id: 40 }]);
    const r = await chamar({ corpo: { texto: "um assunto da família", nome: "Joana", confidencial: true, siteItemId: 77 } });
    expect(r.body).toEqual({ sucesso: true, gravado: true, risco: false });
    const ins = mockConsultas.find((c) => /INSERT INTO PedidosOracao/.test(c.sql));
    expect(ins.sql).toMatch(/VALUES \(NULL, NULL, NULL, @sn, 'PROPRIO', 'OUTRO', @t, 0, 0, @rk, @ro, @rc, @rk, CASE WHEN @rk = 1 THEN SYSUTCDATETIME\(\) ELSE NULL END, 1, 'SITE', @si\)/);
    expect(ins.inputs).toMatchObject({ sn: "Joana", t: "um assunto da família", rk: 0, si: 77 });
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("com risco: guarda, avisa o nível geral NA HORA (sem o texto) e responde risco:true", async () => {
    contagemPadrao(); quando(/INSERT INTO PedidosOracao/, [{ id: 41 }]);
    const r = await chamar({ corpo: { texto: "não aguento mais viver <3 segredo", confidencial: false } });
    expect(r.body).toEqual({ sucesso: true, gravado: true, risco: true, avisada: true });
    const ins = mockConsultas.find((c) => /INSERT INTO PedidosOracao/.test(c.sql));
    expect(ins.inputs.t).toBe("não aguento mais viver ‹3 segredo");
    expect(ins.inputs.rk).toBe(1);
    const aviso = notificarAgora.mock.calls[0][1];
    expect(aviso.regraChave).toBe("CUIDADO_RISCO");
    expect(aviso.destinatarios.map((d) => d.membroId)).toEqual([1, 2]);
    expect(aviso.mensagem).toMatch(/mural de oração do SITE/);
    expect(aviso.mensagem).not.toMatch(/segredo|aguento/);
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/segredo|aguento|risco/i);
  });
  test("o mesmo texto do site em 10 minutos é o mesmo pedido: sem gravar nem avisar de novo", async () => {
    quando(/SELECT TOP 1 PedidoId, Risco FROM PedidosOracao WHERE Origem = 'SITE' AND Texto = @t/, [{ PedidoId: 9, Risco: true }]);
    quando(/INSERT INTO/, new Error("não devia gravar"));
    const r = await chamar({ corpo: { texto: "quero morrer", confidencial: false } });
    expect(r.body).toMatchObject({ sucesso: true, gravado: true, risco: true });
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("no teto da hora, não grava (o de risco tem teto próprio, maior)", async () => {
    quando(/SELECT COUNT\(\*\) AS n FROM PedidosOracao WHERE Origem = 'SITE' AND Risco = @r/, (i) => [{ n: i.r ? 60 : 30 }]);
    quando(/INSERT INTO/, new Error("não devia gravar"));
    expect((await chamar({ corpo: { texto: "confidencial qualquer", confidencial: true } })).body).toMatchObject({ gravado: false, limite: true });
    expect((await chamar({ corpo: { texto: "quero morrer", confidencial: false } })).body).toMatchObject({ gravado: false, risco: true, limite: true });
  });
});

describe("o texto que vem do site nunca é recusado por um caractere", () => {
  test("limparTextoDoSite troca < e >, tira o invisível e corta no tamanho", () => {
    const cp = require("../cuidadoPastoral");
    expect(cp.limparTextoDoSite("eu <3 Deus​\u0000", 1000)).toBe("eu ‹3 Deus");
    expect(cp.limparTextoDoSite("a".repeat(2000), 1000)).toHaveLength(1000);
    expect(cp.limparTextoDoSite(5, 10)).toBe("");
    expect(cp.textoRisco({ doSite: true, crianca: true })).toMatch(/Proteção de crianças/);
  });
});

describe("o pedido do site na tela da Diretoria", () => {
  const pedido = { PedidoId: 5, CongregacaoId: null, CongregacaoNome: null, Origem: "SITE", SiteItemId: 77, SoNivelGeral: true, PodeBoletim: false, Moderacao: "AGUARDANDO", Risco: false, Texto: "t", Categoria: "OUTRO", ParaQuem: "PROPRIO", SolicitanteMembroId: null };
  const GERAL = { membroId: 1, gestao: true, geral: true, acima: true, podeVerCongregacao: () => true };
  test("não vai ao boletim, não abre acompanhamento; marcar risco avisa o nível geral sem abrir item", async () => {
    quando(/WHERE p\.PedidoId = @id/, [pedido]);
    expect((await db.moderar(await getPool(), { pedidoId: 5, dados: { decisao: "APROVAR" }, ver: GERAL })).mensagem).toMatch(/painel do site/);
    expect((await db.acompanharPedido(await getPool(), { pedidoId: 5, ver: GERAL })).mensagem).toMatch(/mural do site/);
    quando(/UPDATE PedidosOracao SET Risco = 1/, [{ n: 1 }]);
    quando(/FROM AuditLog/, [{ n: 1 }]);
    quando(/INSERT INTO CuidadoItens/, new Error("não devia abrir item"));
    const r = await db.marcarRisco(await getPool(), { pedidoId: 5, dados: { marcar: true }, ver: GERAL });
    expect(r).toMatchObject({ sucesso: true, itemId: null, avisada: true });
    expect(notificarAgora.mock.calls[0][1]).toMatchObject({ regraChave: "CUIDADO_RISCO", referenciaTabela: "PedidosOracaoSiteMarcado", referenciaId: 51 });
  });
  test("só o nível geral vê o pedido do site", async () => {
    quando(/WHERE p\.PedidoId = @id/, [pedido]);
    const DIR = { membroId: 3, gestao: true, geral: false, acima: false, podeVerCongregacao: () => true };
    expect(await db.moderar(await getPool(), { pedidoId: 5, dados: { decisao: "NAO_PUBLICAR" }, ver: DIR })).toMatchObject({ naoExiste: true });
  });
});
