// Trava de Revisão 7-C (23/10/2026) — os avisos que não podem segurar a resposta nem a rodada das 7h:
//   - o e-mail do motor sai pelo cliente SEM novas tentativas (o 429 não espera o Retry-After de minutos) e sem esperar a entrega;
//   - os e-mails da rodada do motor entram no MESMO teto por hora da comunicação (passou, fica só no sininho e no celular; o obrigatório é reenviado depois);
//   - as retenções e o apagamento da saúde rodam ANTES dos avisos;
//   - o aviso com prazo (`prazoMs`) cria o sininho de todos primeiro e não espera o e-mail e o celular além do prazo;
//   - a rota do mural do site decide o pedido comum SEM pedir a conexão ao banco (o banco pausado não estoura o tempo do site).
// Cada teste falha no código de antes (2d73bee).

describe("o e-mail do motor (notificacaoEmail)", () => {
  let mockCliente, mockBeginSend, mockPoll;
  beforeEach(() => {
    jest.resetModules();
    mockPoll = jest.fn(async () => ({}));
    mockBeginSend = jest.fn(async () => ({ pollUntilDone: mockPoll }));
    mockCliente = jest.fn().mockImplementation(() => ({ beginSend: mockBeginSend }));
    jest.doMock("@azure/communication-email", () => ({ EmailClient: mockCliente }));
    process.env.ACS_CONNECTION_STRING = "endpoint=https://exemplo.invalid/;accesskey=teste";
  });
  afterAll(() => { delete process.env.ACS_CONNECTION_STRING; });
  test("o cliente do aviso é o SEM novas tentativas (retryOptions.maxRetries = 0)", async () => {
    const { enviarEmailNotificacao } = require("../notificacaoEmail");
    expect(await enviarEmailNotificacao({ email: "a@x.org", titulo: "t", mensagem: "m", aguardarEntrega: false })).toBe(true);
    expect(mockCliente).toHaveBeenCalledTimes(1);
    expect(mockCliente.mock.calls[0][1]).toEqual({ retryOptions: { maxRetries: 0 } });
    expect(mockPoll).not.toHaveBeenCalled();
  });
  test("o 429 volta na hora como não enviado (a notificação fica pendente para o reenvio)", async () => {
    mockBeginSend.mockRejectedValueOnce(Object.assign(new Error("Too Many Requests"), { statusCode: 429 }));
    const { enviarEmailNotificacao } = require("../notificacaoEmail");
    expect(await enviarEmailNotificacao({ email: "a@x.org", titulo: "t", mensagem: "m", aguardarEntrega: false })).toBe(false);
  });
});

describe("a rodada do motor (avaliarRegras) no teto da comunicação", () => {
  let enviados;
  function montar({ cota, destinatarios = 3 }) {
    jest.resetModules();
    enviados = [];
    jest.doMock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async (o) => { enviados.push(o); return true; }) }));
    jest.doMock("../notificacaoPush", () => ({ enviarPushNotificacao: jest.fn(async () => 0) }));
    jest.doMock("../notificacaoDetectores", () => ({ DETECTORES: { REGRA_X: { tabela: "T", detectar: async () => [{ referenciaId: 1, fatoGerador: "f", destinatarios: Array.from({ length: destinatarios }, (_, i) => ({ membroId: i + 1, email: `p${i}@x` })) }] } } }));
    let n = 0;
    jest.doMock("../notificacoes", () => ({
      resolverDestinatariosPorPermissao: jest.fn(async () => []), criarNotificacao: jest.fn(async () => ({ criada: true, notificacaoId: ++n })),
      marcarEmailEnviado: jest.fn(async () => {}), podeReceberEmail: jest.fn(async () => true)
    }));
    jest.doMock("../comunicacaoDb", () => ({ cotaDeEmailsDosAvisos: jest.fn(async () => cota) }));
    const pool = { request: () => { const r = { input: () => r, query: async () => ({ recordset: [{ Chave: "REGRA_X", Titulo: "T", Categoria: "C", CanalEmail: true, CanalPush: false, Obrigatoria: true, Ativa: true }] }) }; return r; } };
    return { motor: require("../notificacaoMotor"), pool };
  }
  test("com a cota da hora esgotada, nenhum e-mail sai (o aviso fica no sininho)", async () => {
    const { motor, pool } = montar({ cota: 0 });
    const r = await motor.avaliarRegras(pool);
    expect(r.criadas).toBe(3);
    expect(enviados).toHaveLength(0);
    expect(r.emailsEnviados).toBe(0);
  });
  test("com cota 2, saem 2 e-mails e o terceiro fica para o reenvio; nenhum espera a entrega", async () => {
    const { motor, pool } = montar({ cota: 2 });
    const r = await motor.avaliarRegras(pool);
    expect(enviados).toHaveLength(2);
    expect(r.emailsEnviados).toBe(2);
    expect(enviados.every((o) => o.aguardarEntrega === false)).toBe(true);
  });
});

describe("a rodada das 7h (NotificacoesAgendador)", () => {
  test("as retenções e o apagamento da saúde rodam ANTES dos avisos do motor", async () => {
    jest.resetModules();
    const ordem = [];
    const passo = (nome, valor) => jest.fn(async () => { ordem.push(nome); return valor; });
    jest.doMock("../db", () => ({ getPool: async () => ({}) }));
    jest.doMock("../cronAuth", () => ({ exigirSegredoRotina: () => true }));
    jest.doMock("../notificacaoMotor", () => ({ avaliarRegras: passo("avisos", { criadas: 0, emailsEnviados: 0, falhas: [] }) }));
    jest.doMock("../voluntariadoDb", () => ({ anonimizarIpsVencidos: passo("ip-voluntariado", { anonimizados: 0 }) }));
    jest.doMock("../setoresTecnicosDb", () => ({ anonimizarIpsVencidos: passo("ip-setores", { anonimizados: 0 }) }));
    jest.doMock("../ministerioMenoresDb", () => ({ retirarInaptosDasEscalas: jest.fn(async () => ({ retirados: 0, alocacoes: 0 })), anonimizarIpsVencidos: passo("ip-menores", { anonimizados: 0 }) }));
    jest.doMock("../menoresConsentimentoDb", () => ({ anonimizarIpsVencidos: passo("ip-consentimentos", { anonimizados: 0 }), apagarFotosDeMenoresSemConsentimento: jest.fn(async () => ({ apagadas: 0 })) }));
    jest.doMock("../checkinInfantilDb", () => ({ apagarSaudeSemConsentimento: passo("saude-checkin", { apagadas: 0 }), aplicarRetencao: passo("retencao-checkin", { contatosApagados: 0, anonimizados: 0 }) }));
    jest.doMock("../cuidadoPastoralDb", () => ({ rotinaDiaria: jest.fn(async () => ({ falhas: [] })) }));
    jest.doMock("../comunicacaoDb", () => ({ rotinaDiaria: jest.fn(async () => ({ falhas: [] })) }));
    jest.doMock("../criseSegurancaDb", () => ({ rotinaDiaria: jest.fn(async () => ({ falhas: [] })) }));
    jest.doMock("../protecaoPendencia", () => ({ atualizar: jest.fn(async () => {}) }));
    jest.doMock("../protecaoDb", () => ({ reenviarEmailsPendentes: jest.fn(async () => ({ tentados: 0 })) }));
    const handler = require("../../NotificacoesAgendador/index.js");
    const context = { log: Object.assign(() => {}, { error() {}, warn() {}, info() {} }) };
    await handler(context, { method: "POST", headers: {} });
    expect(context.res.status).toBe(200);
    expect(ordem[ordem.length - 1]).toBe("avisos");
    expect(ordem.slice(0, -1).sort()).toEqual(["ip-consentimentos", "ip-menores", "ip-setores", "ip-voluntariado", "retencao-checkin", "saude-checkin"]);
  });
});

describe("o aviso com prazo (canaisDb.notificarAgora com prazoMs)", () => {
  test("o sininho de TODOS nasce antes de qualquer e-mail, e a resposta não espera o e-mail que demora além do prazo", async () => {
    jest.resetModules();
    jest.doMock("../db", () => ({ sql: new Proxy({}, { get: () => () => undefined }) }));
    const { notificarAgora } = require("../canaisDb");
    const ordem = [];
    const criarNotificacao = jest.fn(async (_p, o) => { ordem.push(`sininho-${o.destinatarioMembroId}`); return { criada: true, notificacaoId: o.destinatarioMembroId }; });
    const enviarCanais = jest.fn((_p, o) => { ordem.push(`canal-${o.destinatarioMembroId}`); return o.destinatarioMembroId === 2 ? new Promise(() => {}) : Promise.resolve({ emailEnviado: true, pushEnviados: 0 }); });
    const pool = { request: () => { const r = { input: () => r, query: async () => ({ recordset: [{ Chave: "R", Titulo: "T", Categoria: "C" }] }) }; return r; } };
    const inicio = Date.now();
    const r = await notificarAgora(pool, { regraChave: "R", destinatarios: [{ membroId: 1, email: "a" }, { membroId: 2, email: "b" }, { membroId: 3, email: "c" }], mensagem: "m",
      referenciaTabela: "X", referenciaId: 1, prazoMs: 300, deps: { criarNotificacao, enviarCanais } });
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(ordem.slice(0, 3)).toEqual(["sininho-1", "sininho-2", "sininho-3"]);
    expect(r).toMatchObject({ criadas: 3, externas: 2, aCaminho: 1 });
    expect(enviarCanais.mock.calls.every((c) => c[1].aguardarEntrega === false)).toBe(true);
  }, 5000);
});

describe("a rota do mural do site (CuidadoPastoralSite)", () => {
  test("o pedido comum responde SEM pedir a conexão ao banco; o confidencial pede", async () => {
    jest.resetModules();
    jest.dontMock("../cuidadoPastoralDb");           // (o teste da rodada das 7h o simulou)
    const getPool = jest.fn(async () => { throw new Error("banco pausado"); });
    jest.doMock("../db", () => ({ getPool, sql: new Proxy({}, { get: () => () => undefined }) }));
    process.env.CHAVE_SITE_SISTEMA = "chave-teste-7c";
    const handler = require("../../CuidadoPastoralSite/index.js");
    const chamar = async (corpo) => { const context = { log: Object.assign(() => {}, { error() {}, warn() {} }) }; await handler(context, { method: "POST", headers: { "x-site-key": "chave-teste-7c" }, body: corpo, query: {} }); return context.res; };
    const comum = await chamar({ texto: "pela saúde da minha avó", confidencial: false });
    expect(comum.status).toBe(200);
    expect(comum.body).toEqual({ sucesso: true, gravado: false, risco: false });
    expect(getPool).not.toHaveBeenCalled();
    const vazio = await chamar({ texto: " ", confidencial: true });
    expect(vazio.status).toBe(400);
    expect(getPool).not.toHaveBeenCalled();
    const conf = await chamar({ texto: "um pedido só para a equipe", confidencial: true });
    expect(getPool).toHaveBeenCalledTimes(1);
    expect(conf.status).toBe(500);
    delete process.env.CHAVE_SITE_SISTEMA;
  });
});
