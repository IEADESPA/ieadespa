// Entrada do membro por PIN (fecho da v7.5): MembroEntrar, MembroPin, GestaoPinMembro, ConfirmarCodigoAcessoMembro e o bloqueio do login da liderança.
// O banco é simulado por TEXTO da consulta (cada teste diz o que responder a cada uma); o comportamento do bloqueio contra o SQL Server de verdade está no
// roteiro ponta a ponta. O que importa aqui: a resposta de falha é UMA só, a tentativa é reservada antes de conferir, e a sessão do PIN não tem permissão.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [0] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
const mockEmails = [];
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async (e) => { mockEmails.push(e); }) }));

const auth = require("../auth");
const pin = require("../pinMembro");
const { registrarAuditoria } = require("../auditoria");
const hEntrar = require("../../MembroEntrar/index.js");
const hPin = require("../../MembroPin/index.js");
const hGestao = require("../../GestaoPinMembro/index.js");
const hConfirmar = require("../../ConfirmarCodigoAcessoMembro/index.js");
const hLogin = require("../../LoginSecretaria/index.js");

let contadorIp = 1;
const novoIp = () => `177.20.${Math.floor(contadorIp / 250)}.${(contadorIp++ % 250) + 1}`;            // cada teste vem de uma origem diferente: o limitador é por IP
const cabecalhos = (extra = {}) => ({ "x-forwarded-for": `${novoIp()}:5000, 40.70.146.136:6000`, ...extra });
async function chamar(handler, { corpo = {}, token, ip } = {}) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: "POST", query: {}, body: corpo, headers: { ...(ip ? { "x-forwarded-for": `${ip}:1, 40.70.146.136:2` } : cabecalhos()), ...(token ? { "x-auth-token": token } : {}) } });
  return context.res;
}
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });

beforeEach(() => { mockRegras = []; mockConsultas = []; mockEmails.length = 0; registrarAuditoria.mockClear(); });

const HASH_7392 = pin.hashPin("7392", 20);
const livre = { EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false };
const sessaoCriada = [{ SessaoId: "11111111-2222-3333-4444-555555555555" }];
const membroAtivo = (extra = {}) => [{ MembroId: 20, Nome: "Ana Souza", ...extra }];

describe("MembroEntrar — matrícula + PIN", () => {
  test("PIN certo: sessão de MEMBRO (sem permissão, sem nível), marcada via PIN; zera o contador", async () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false, ProvisorioExpiraEm: null }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
    const r = await chamar(hEntrar, { corpo: { matricula: "20", pin: "7392" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, nome: "Ana Souza", matricula: 20, nivel: null, permissoes: [], pinProvisorio: false });
    const sessao = auth.getSessao(r.body.token);
    expect(sessao).toMatchObject({ membroId: 20, permissoes: [], nivel: null, escopoCongregacoes: [], termosPendentes: [], via: "PIN", pinProvisorio: false });
    expect(rodou(/SET Falhas = 0, BloqueadoAte = NULL/)).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain(HASH_7392);
  });
  test("a tentativa é reservada ANTES de conferir o PIN", async () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
    await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" } });
    const ordem = mockConsultas.map(c => (/UPDATE t SET\s+Falhas = CASE/.test(c.sql) ? "reserva" : /SET Falhas = 0/.test(c.sql) ? "zera" : /INSERT INTO SessoesAtivas/.test(c.sql) ? "sessao" : "outra"));
    expect(ordem.indexOf("reserva")).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf("reserva")).toBeLessThan(ordem.indexOf("zera"));
    expect(ordem.indexOf("zera")).toBeLessThan(ordem.indexOf("sessao"));
  });
  test("PIN errado, matrícula inexistente, membro sem PIN e pessoa bloqueada: a MESMA resposta", async () => {
    const respostas = [];
    // PIN errado
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    respostas.push((await chamar(hEntrar, { corpo: { matricula: 20, pin: "0000" } })).body);
    // bloqueada (com o PIN certo!)
    mockRegras = [];
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 5, BloqueadaAgora: true }]);
    respostas.push((await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" } })).body);
    // sem PIN cadastrado
    mockRegras = [];
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    respostas.push((await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" } })).body);
    // matrícula inexistente
    mockRegras = [];
    respostas.push((await chamar(hEntrar, { corpo: { matricula: 99999, pin: "7392" } })).body);
    for (const b of respostas) expect(b).toEqual({ sucesso: false, mensagem: pin.MENSAGEM_GENERICA });
    expect(rodou(/INSERT INTO SessoesAtivas/)).toHaveLength(0);
  });
  test("quem não tem PIN ou não existe NÃO gasta tentativa de ninguém (nada a bloquear, nada a contar)", async () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" } });
    await chamar(hEntrar, { corpo: { matricula: 8, pin: "7392" } });
    expect(rodou(/AcessoTentativas/)).toHaveLength(0);
  });
  test("bloqueada: o PIN certo não entra e a conferência nem chega a abrir sessão", async () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 5, BloqueadaAgora: true }]);
    const r = await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/INSERT INTO SessoesAtivas/)).toHaveLength(0);
    expect(rodou(/SET Falhas = 0/)).toHaveLength(0);
  });
  test("o primeiro bloqueio (5 erros) NÃO enche a trilha imutável; do segundo em diante (10 erros) grava uma linha, sem o PIN e sem IP", async () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: false, Falhas: 5, BloqueadaAgora: true }]);
    await chamar(hEntrar, { corpo: { matricula: 20, pin: "0000" } });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    mockRegras = mockRegras.filter(([p]) => !/UPDATE t SET/.test(String(p)));
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: false, Falhas: 10, BloqueadaAgora: true }]);
    await chamar(hEntrar, { corpo: { matricula: 20, pin: "0000" } });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "MembroPins", registroId: 20, acao: "PIN_BLOQUEADO_POR_TENTATIVAS", usuarioId: null });
    expect(JSON.stringify(aud)).not.toMatch(/0000|7392|177\./);
  });
  test("PIN provisório: entra e a sessão avisa que precisa trocar; vencido não entra", async () => {
    const hashProv = pin.hashPin("4081", 20);
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: hashProv, Provisorio: true, ProvisorioExpiraEm: new Date(Date.now() + 86400000) }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
    const ok = await chamar(hEntrar, { corpo: { matricula: 20, pin: "4081" } });
    expect(ok.body).toMatchObject({ sucesso: true, pinProvisorio: true });
    expect(auth.getSessao(ok.body.token).pinProvisorio).toBe(true);
    mockRegras = []; mockConsultas = [];
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/FROM MembroPins/, [{ PinHash: hashProv, Provisorio: true, ProvisorioExpiraEm: new Date(Date.now() - 1000) }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);                // sem isto a reserva "bloqueia" e a recusa viria por outro motivo: o teste não provaria o prazo
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
    const vencido = await chamar(hEntrar, { corpo: { matricula: 20, pin: "4081" } });
    expect(vencido.body).toEqual({ sucesso: false, mensagem: pin.MENSAGEM_GENERICA });
    expect(rodou(/INSERT INTO SessoesAtivas/)).toHaveLength(0);
  });
  test("entrada malformada: 400 sem consultar o banco", async () => {
    for (const corpo of [{}, { matricula: 20 }, { pin: "7392" }, { matricula: "abc", pin: "7392" }, { matricula: 20, pin: 7392 }, { matricula: 20, pin: "73" }, { matricula: 20, pin: "73920" }, { matricula: "0x14", pin: "7392" }, { matricula: [20], pin: "7392" }, null, "texto", []]) {
      const r = await chamar(hEntrar, { corpo });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("contenção por origem: depois de 60 pedidos no minuto, 429 — e forjar x-forwarded-for não escapa", async () => {
    const ip = "177.30.1.1";
    let r;
    for (let i = 0; i < 60; i++) r = await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" }, ip });
    expect(r.status).toBe(200);
    const bloqueado = await chamar(hEntrar, { corpo: { matricula: 20, pin: "7392" }, ip });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers["Retry-After"]).toBeDefined();
    const context = { bindingData: {}, log: { error() {} } };
    await hEntrar(context, { method: "POST", query: {}, body: { matricula: 20, pin: "7392" }, headers: { "x-forwarded-for": `9.9.${contadorIp++}.1, ${ip}:77, 40.70.146.136:2`, "x-azure-clientip": "5.5.5.5" } });
    expect(context.res.status).toBe(429);
  });
});

describe("MembroPin — criar e trocar o PIN", () => {
  const nasc = new Date("1985-03-27T00:00:00Z");
  const base = () => { quando(/FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'/, [{ MembroId: 20, DataNascimento: nasc }]); };
  const gravou = () => rodou(/UPDATE MembroPins SET PinHash/).length + rodou(/INSERT INTO MembroPins/).length;

  test("sem sessão: 401; PIN malformado: 400; sessão de outra pessoa não existe aqui (vale para a matrícula da sessão)", async () => {
    expect((await chamar(hPin, { corpo: { pin: "7392" } })).status).toBe(401);
    for (const p of [1234, "12", "12345", "abcd", null, undefined, ["7392"]]) expect((await chamar(hPin, { token: tokenDe(20), corpo: { pin: p } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("PIN fácil de adivinhar: 422 e nada é gravado (inclusive ligado à data de nascimento e à matrícula)", async () => {
    base();
    for (const fraco of ["1234", "0000", "2008", "2703", "0327", "0020"]) {
      const r = await chamar(hPin, { token: tokenDe(20), corpo: { pin: fraco } });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toMatch(/fácil de adivinhar/);
    }
    expect(gravou()).toBe(0);
  });
  test("primeiro PIN (a pessoa ainda não tem): grava sem pedir o atual, devolve token novo e audita SEM o PIN", async () => {
    base();
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 0 }]);
    const r = await chamar(hPin, { token: tokenDe(20, { pinProvisorio: false }), corpo: { pin: "7392" } });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(auth.getSessao(r.body.token)).toMatchObject({ membroId: 20, pinProvisorio: false });
    expect(rodou(/INSERT INTO MembroPins/)).toHaveLength(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "MembroPins", registroId: 20, acao: "PIN_CRIADO", usuarioId: 20 });
    expect(JSON.stringify([registrarAuditoria.mock.calls, mockConsultas.map(c => c.inputs.h)])).not.toContain("7392");
  });
  test("trocar um PIN que já existe exige o PIN atual: sem ele 400; errado 403; bloqueada 403; certo grava", async () => {
    base();
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    const sem = await chamar(hPin, { token: tokenDe(20), corpo: { pin: "4081" } });
    expect(sem.status).toBe(400);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    const errado = await chamar(hPin, { token: tokenDe(20), corpo: { pin: "4081", pinAtual: "1111" } });
    expect(errado.status).toBe(403);
    expect(gravou()).toBe(0);
    mockRegras = mockRegras.filter(([p]) => !/AcessoTentativas SET\\s\+Falhas/.test(String(p)));
    mockRegras.unshift([/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 5, BloqueadaAgora: true }]]);
    const bloqueada = await chamar(hPin, { token: tokenDe(20), corpo: { pin: "4081", pinAtual: "7392" } });
    expect(bloqueada.status).toBe(403);
    expect(gravou()).toBe(0);
    mockRegras.shift();
    mockRegras.unshift([/UPDATE t SET\s+Falhas = CASE/, [livre]]);
    const certo = await chamar(hPin, { token: tokenDe(20), corpo: { pin: "4081", pinAtual: "7392" } });
    expect(certo.status).toBe(200);
    expect(registrarAuditoria.mock.calls.pop()[0].acao).toBe("PIN_ALTERADO");
  });
  test("quem entrou agora pelo código do e-mail, ou com o PIN provisório, troca sem informar o atual (esqueci o PIN não tranca ninguém)", async () => {
    base();
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    expect((await chamar(hPin, { token: tokenDe(20, { via: "CODIGO" }), corpo: { pin: "4081" } })).status).toBe(200);
    expect((await chamar(hPin, { token: tokenDe(20, { via: "PIN", pinProvisorio: true }), corpo: { pin: "6205" } })).status).toBe(200);
    expect(rodou(/AcessoTentativas/).filter(c => /Falhas = CASE/.test(c.sql))).toHaveLength(0);            // não gastou tentativa do PIN
  });
  test("a sessão de quem tem só a senha da liderança também precisa do PIN atual quando já existe um", async () => {
    base();
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    expect((await chamar(hPin, { token: tokenDe(20, { via: undefined, permissoes: ["pessoas"], nivel: "GLOBAL" }), corpo: { pin: "4081" } })).status).toBe(400);
  });
});

describe("GestaoPinMembro — PIN provisório gerado pela Secretaria", () => {
  const secretaria = (extra = {}) => tokenDe(5, { permissoes: ["pessoas"], escopoCongregacoes: ["Central"], ...extra });
  const membroDaCentral = () => quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [{ MembroId: 20, Nome: "Ana Souza", Email: "ana@exemplo.org", DataNascimento: new Date("1985-03-27T00:00:00Z"), CongregacaoNome: "Central" }]);

  test("sem sessão 401; sem a permissão 'pessoas' 403", async () => {
    expect((await chamar(hGestao, { corpo: { membroId: 20 } })).status).toBe(401);
    expect((await chamar(hGestao, { token: tokenDe(5, { permissoes: ["financeiro"], escopoCongregacoes: "TODAS" }), corpo: { membroId: 20 } })).status).toBe(403);
    expect((await chamar(hGestao, { token: tokenDe(20), corpo: { membroId: 20 } })).status).toBe(403);            // o próprio membro não gera PIN para si por aqui
    expect(mockConsultas).toHaveLength(0);
  });
  test("matrícula malformada: 400; fora do escopo e inexistente: a MESMA recusa", async () => {
    for (const m of ["abc", "0x14", 0, -1, null, undefined, [20]]) expect((await chamar(hGestao, { token: secretaria(), corpo: { membroId: m } })).status).toBe(400);
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [{ MembroId: 20, Nome: "Ana", Email: null, DataNascimento: null, CongregacaoNome: "Vila Nova" }]);
    const fora = await chamar(hGestao, { token: secretaria(), corpo: { membroId: 20 } });
    mockRegras = [];
    const inexistente = await chamar(hGestao, { token: secretaria(), corpo: { membroId: 21 } });
    expect(fora.status).toBe(403);
    expect(inexistente.status).toBe(403);
    expect(fora.body).toEqual(inexistente.body);
    expect(rodou(/MembroPins/)).toHaveLength(0);
  });
  test("gera um PIN de 4 dígitos fácil de digitar e difícil de adivinhar, grava SÓ o hash e devolve o PIN uma vez, sem cache", async () => {
    membroDaCentral();
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 0 }]);
    const r = await chamar(hGestao, { token: secretaria(), corpo: { membroId: 20 } });
    expect(r.status).toBe(200);
    expect(r.body.pin).toMatch(/^\d{4}$/);
    expect(pin.pinFraco(r.body.pin, { nascimento: "1985-03-27", matricula: 20 }).fraco).toBe(false);
    expect(r.body).toMatchObject({ sucesso: true, nome: "Ana Souza", validadeDias: 7, avisadoPorEmail: true });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const insercao = rodou(/INSERT INTO MembroPins/)[0];
    expect(insercao.inputs).toMatchObject({ m: 20, prov: true, por: 5 });
    expect(insercao.inputs.h).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(pin.verificarPin(r.body.pin, 20, insercao.inputs.h)).toBe(true);
    // gerar um novo desbloqueia
    expect(rodou(/SET Falhas = 0, BloqueadoAte = NULL/)).toHaveLength(1);
  });
  test("o PIN não vai para a auditoria nem para o e-mail; o e-mail só avisa", async () => {
    membroDaCentral();
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    const r = await chamar(hGestao, { token: secretaria(), corpo: { membroId: 20 } });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "MembroPins", registroId: 20, acao: "PIN_PROVISORIO_GERADO", usuarioId: 5 });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toContain(r.body.pin);
    expect(mockEmails).toHaveLength(1);
    expect(mockEmails[0].email).toBe("ana@exemplo.org");
    expect(JSON.stringify(mockEmails)).not.toContain(r.body.pin);
  });
  test("membro sem e-mail: gera do mesmo jeito, sem aviso", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [{ MembroId: 20, Nome: "Ana", Email: null, DataNascimento: null, CongregacaoNome: "Central" }]);
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    const r = await chamar(hGestao, { token: secretaria(), corpo: { membroId: 20 } });
    expect(r.body).toMatchObject({ sucesso: true, avisadoPorEmail: false });
    expect(mockEmails).toHaveLength(0);
  });
});

describe("ConfirmarCodigoAcessoMembro — o código do e-mail é o primeiro acesso e o 'esqueci o PIN'", () => {
  const hashCodigo = require("../codigoAcesso").hashCodigo("123456");
  const codigoPendente = () => {
    quando(/FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'/, membroAtivo());
    quando(/SELECT TOP 1 CodigoId, CodigoHash, ExpiraEm FROM CodigosAcessoMembro/, [{ CodigoId: 9, CodigoHash: hashCodigo, ExpiraEm: new Date(Date.now() + 60000) }]);
    quando(/UPDATE CodigosAcessoMembro SET Tentativas = Tentativas \+ 1/, [{ Tentativas: 1 }]);
    quando(/UPDATE CodigosAcessoMembro SET Usado = 1 OUTPUT/, [{ CodigoId: 9 }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);                       // o contador do MEMBRO no canal CODIGO
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
  };
  test("sem PIN ainda: entra e é mandado criar o PIN; a sessão leva via CODIGO", async () => {
    codigoPendente();
    const r = await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "123456" } });
    expect(r.body).toMatchObject({ sucesso: true, precisaCriarPin: true, permissoes: [], nivel: null });
    expect(auth.getSessao(r.body.token)).toMatchObject({ membroId: 20, via: "CODIGO", permissoes: [] });
  });
  test("já tem PIN definitivo: entra direto (precisaCriarPin falso); só o provisório ainda manda criar", async () => {
    codigoPendente();
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: false }]);
    expect((await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "123456" } })).body.precisaCriarPin).toBe(false);
    mockRegras = []; codigoPendente();
    quando(/FROM MembroPins/, [{ PinHash: HASH_7392, Provisorio: true, ProvisorioExpiraEm: new Date(Date.now() + 1000) }]);
    expect((await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "123456" } })).body.precisaCriarPin).toBe(true);
  });
  test("código errado, vencido, sem código pedido e matrícula inexistente: a MESMA mensagem", async () => {
    const msgs = [];
    codigoPendente();
    msgs.push((await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "000000" } })).body.mensagem);
    mockRegras = [];
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    msgs.push((await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "123456" } })).body.mensagem);                  // nenhum código pendente
    mockRegras = [];
    quando(/FROM MembroReferencia WHERE MembroId = @id/, membroAtivo());
    quando(/SELECT TOP 1 CodigoId/, [{ CodigoId: 9, CodigoHash: hashCodigo, ExpiraEm: new Date(Date.now() - 1000) }]);
    msgs.push((await chamar(hConfirmar, { corpo: { matricula: 20, codigo: "123456" } })).body.mensagem);                  // vencido
    mockRegras = [];
    msgs.push((await chamar(hConfirmar, { corpo: { matricula: 777, codigo: "123456" } })).body.mensagem);                 // matrícula inexistente
    expect(new Set(msgs).size).toBe(1);
    expect(msgs[0]).toBe(require("../codigoAcesso").MENSAGEM_FALHA);
  });
  test("entrada malformada: 400", async () => {
    for (const corpo of [{}, { matricula: 20 }, { codigo: "123456" }, { matricula: "x", codigo: "123456" }, { matricula: 20, codigo: 123456 }, null]) expect((await chamar(hConfirmar, { corpo })).status).toBe(400);
  });
});

describe("LoginSecretaria — bloqueio por tentativas e uma resposta só", () => {
  const linhaLideranca = (senha) => [{ membroId: 5, escopoTipo: "GLOBAL", escopoId: null, senhaHash: auth.hashSenha(senha), departamentoId: null, ativoAte: null, papelNome: "Presidente", papelNivel: "GLOBAL", permissoesStr: "pessoas", nome: "Pr. Silva" }];
  test("matrícula sem acesso, senha errada e pessoa bloqueada respondem igual", async () => {
    const msgs = [];
    msgs.push((await chamar(hLogin, { corpo: { matricula: 20, senha: "qualquer" } })).body.mensagem);                     // não é da liderança
    quando(/FROM Lideranca l/, linhaLideranca("senhaCerta"));
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    msgs.push((await chamar(hLogin, { corpo: { matricula: 5, senha: "senhaErrada" } })).body.mensagem);
    mockRegras.shift();
    mockRegras.unshift([/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 10, BloqueadaAgora: true }]]);
    msgs.push((await chamar(hLogin, { corpo: { matricula: 5, senha: "senhaCerta" } })).body.mensagem);                     // bloqueada: nem a certa entra
    expect(new Set(msgs).size).toBe(1);
    expect(rodou(/INSERT INTO SessoesAtivas/)).toHaveLength(0);
  });
  test("a tentativa da senha é reservada com o limite de 10 e zerada ao acertar", async () => {
    quando(/FROM Lideranca l/, linhaLideranca("senhaCerta"));
    quando(/UPDATE t SET\s+Falhas = CASE/, [livre]);
    quando(/INSERT INTO SessoesAtivas/, sessaoCriada);
    const r = await chamar(hLogin, { corpo: { matricula: "5", senha: "senhaCerta" } });
    expect(r.body.sucesso).toBe(true);
    const reserva = rodou(/UPDATE t SET\s+Falhas = CASE/)[0];
    expect(reserva.inputs).toMatchObject({ m: 5, c: "SENHA", lim: 10 });
    expect(rodou(/SET Falhas = 0, BloqueadoAte = NULL/)).toHaveLength(1);
  });
  test("entrada malformada: 400; origem que passa de 30 pedidos no minuto: 429", async () => {
    for (const corpo of [{}, { matricula: 5 }, { senha: "x" }, { matricula: "abc", senha: "x" }, { matricula: [5], senha: "x" }, null]) expect((await chamar(hLogin, { corpo })).status).toBe(400);
    const ip = "177.31.1.1";
    let r;
    for (let i = 0; i < 31; i++) r = await chamar(hLogin, { corpo: { matricula: 5, senha: "x" }, ip });
    expect(r.status).toBe(429);
  });
});
