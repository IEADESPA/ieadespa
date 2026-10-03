// v7.6 — PONTO ÚNICO DE ENTRADA (shared/entrada.js) e a lista de sessões encerradas que ele sincroniza antes de cada rota.
//  - Estático: TODO function.json com gatilho HTTP aponta "scriptFile": "../shared/entrada.js" (uma rota nova sem isso passaria por fora da revogação); o host.json
//    não precisa mudar; o exportado é uma função sem propriedades enumeráveis (o host a trata como um index.js comum).
//  - Carga: para CADA pasta de função, o ponto de entrada carrega exatamente o index.js daquela pasta a partir de um functionDirectory verdadeiro (e de um caminho
//    de outra máquina, como o do Azure), sem tocar no banco; nome estranho não carrega nada.
//  - Comportamento: sem token não lê o banco; com token, a primeira leitura bloqueia; relê no máximo a cada 3 s (e chamadas simultâneas dividem a mesma leitura);
//    banco fora: o conjunto antigo vale por até 60 s, depois 503 (falha FECHADO).
const fs = require("fs");
const path = require("path");

let mockRegras = [];
let mockConsultas = [];
let mockFalharLeitura = false;
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    if (mockFalharLeitura && /WHERE Encerrada = 1 AND EncerradaEm >= DATEADD/.test(texto)) throw new Error("banco fora do ar (simulado)");
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const RAIZ_API = path.resolve(__dirname, "..", "..");
const ARQUIVO_ENTRADA = path.join(RAIZ_API, "shared", "entrada.js");
const auth = require("../auth");
const entrada = require("../entrada");

const pastasDeFuncao = () => fs.readdirSync(RAIZ_API).filter((p) => fs.existsSync(path.join(RAIZ_API, p, "function.json")));
const lerFunctionJson = (pasta) => JSON.parse(fs.readFileSync(path.join(RAIZ_API, pasta, "function.json"), "utf8"));
const ehHttp = (json) => (json.bindings || []).some((b) => b.type === "httpTrigger");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const leiturasDaLista = () => mockConsultas.filter((c) => /WHERE Encerrada = 1 AND EncerradaEm >= DATEADD/.test(c.sql));
const SID_ATIVO = "aaaaaaaa-1111-2222-3333-444444444444";
const SID_ENCERRADO = "bbbbbbbb-1111-2222-3333-444444444444";
const tokenCom = (sid) => auth.reassinarSessao({ membroId: 5, nome: "Fulano", termosPendentes: [], via: "SENHA", nivel: "CONGREGACAO", permissoes: [], escopoCongregacoes: ["Central"], sid });
const contexto = (pasta) => ({ bindingData: {}, executionContext: { functionDirectory: path.join(RAIZ_API, pasta), functionName: pasta }, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) });
async function chamarPelaEntrada(pasta, { token, metodo = "GET", corpo = {}, ligado = {} } = {}) {
  const ctx = contexto(pasta);
  ctx.bindingData = ligado;
  await entrada(ctx, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return ctx.res;
}

let agora = 1_800_000_000_000;
beforeEach(() => {
  mockRegras = []; mockConsultas = []; mockFalharLeitura = false;
  auth._reiniciarRevogacoes();
  agora += 10 * 60 * 1000;
  jest.spyOn(Date, "now").mockImplementation(() => agora);
  quando(/WHERE Encerrada = 1 AND EncerradaEm >= DATEADD/, [{ SessaoId: SID_ENCERRADO.toUpperCase() }]); // o SQL Server devolve GUID em maiúsculas
});
afterEach(() => jest.restoreAllMocks());

// =====================================================================================================================================================
describe("estático: todo gatilho HTTP passa pelo ponto de entrada", () => {
  test("cada function.json HTTP tem scriptFile ../shared/entrada.js, que resolve para o arquivo de verdade", () => {
    const pastas = pastasDeFuncao();
    expect(pastas.length).toBeGreaterThan(150);
    const semEntrada = [];
    for (const pasta of pastas) {
      const json = lerFunctionJson(pasta);
      if (!ehHttp(json)) {
        // gatilho que não é HTTP (timer etc.) fica como está: não tem requisição nem token
        expect(json.scriptFile === undefined || path.resolve(RAIZ_API, pasta, json.scriptFile) !== ARQUIVO_ENTRADA).toBe(true);
        continue;
      }
      if (json.scriptFile !== "../shared/entrada.js" || path.resolve(RAIZ_API, pasta, json.scriptFile) !== ARQUIVO_ENTRADA) semEntrada.push(pasta);
      expect(json.entryPoint).toBeUndefined();
      expect(fs.existsSync(path.join(RAIZ_API, pasta, "index.js"))).toBe(true);
    }
    expect(semEntrada).toEqual([]);
  });

  test("host.json continua o mesmo: versão 2.0, sem lista de funções nem caminho de script", () => {
    const host = JSON.parse(fs.readFileSync(path.join(RAIZ_API, "host.json"), "utf8"));
    expect(host.version).toBe("2.0");
    expect(host.functions).toBeUndefined();
    expect(JSON.stringify(host)).not.toMatch(/scriptFile|entrada/);
  });

  test("o exportado é uma função sem propriedades enumeráveis (o host o trata como um index.js comum)", () => {
    expect(typeof entrada).toBe("function");
    expect(Object.keys(entrada)).toEqual([]);
  });
});

describe("carga: o ponto de entrada carrega o handler certo de CADA pasta", () => {
  test("functionDirectory verdadeiro -> exatamente o index.js daquela pasta (sem tocar no banco)", () => {
    for (const pasta of pastasDeFuncao().filter((p) => ehHttp(lerFunctionJson(p)))) {
      const esperado = require(path.join(RAIZ_API, pasta, "index.js"));
      expect(typeof esperado).toBe("function");
      expect(entrada.carregarHandler(contexto(pasta))).toBe(esperado);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("caminho de outra máquina (como o do Azure) e só o functionName também acham a pasta", () => {
    const esperado = require(path.join(RAIZ_API, "LoginSecretaria", "index.js"));
    expect(entrada.carregarHandler({ executionContext: { functionDirectory: "/home/site/wwwroot/LoginSecretaria" } })).toBe(esperado);
    expect(entrada.carregarHandler({ executionContext: { functionDirectory: "C:\\home\\site\\wwwroot\\LoginSecretaria" } })).toBe(esperado);
    expect(entrada.carregarHandler({ executionContext: { functionName: "LoginSecretaria" } })).toBe(esperado);
  });
  test("nome estranho não carrega nada (nem a pasta shared, nem caminho relativo)", () => {
    for (const ec of [{}, { functionName: "../shared/auth" }, { functionName: "shared" }, { functionDirectory: "/x/shared" }, { functionName: "Login Secretaria" }]) {
      expect(() => entrada.carregarHandler({ executionContext: ec })).toThrow();
    }
    expect(() => entrada.carregarHandler({ executionContext: { functionName: "NaoExisteEssaFuncao" } })).toThrow();
  });
});

// =====================================================================================================================================================
describe("comportamento: a lista de sessões encerradas", () => {
  test("sem token: não lê o banco e o handler responde como sempre", async () => {
    const r = await chamarPelaEntrada("GestaoSessoes");
    expect(r.status).toBe(401);
    expect(r.body.mensagem).toBe("Faça login para continuar.");
    expect(leiturasDaLista()).toHaveLength(0);
  });

  test("com token: a primeira chamada lê a lista; sessão encerrada -> 401 'Sua sessão foi encerrada'; sessão aberta passa", async () => {
    const r1 = await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ENCERRADO) });
    expect(r1.status).toBe(401);
    expect(r1.body.mensagem).toBe("Sua sessão foi encerrada. Entre novamente.");
    const r2 = await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) });
    expect(r2.status).toBe(200);
    expect(leiturasDaLista()).toHaveLength(1); // a segunda, dentro de 3 s, usa a mesma leitura
  });

  test("relê no máximo a cada 3 s; chamadas simultâneas dividem UMA leitura", async () => {
    await Promise.all([1, 2, 3, 4, 5].map(() => chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) })));
    expect(leiturasDaLista()).toHaveLength(1);
    agora += 2000;
    await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) });
    expect(leiturasDaLista()).toHaveLength(1);
    agora += 1500;
    // encerrada em OUTRA instância (só o banco sabe): depois da releitura, o mesmo token cai
    mockRegras.unshift([/WHERE Encerrada = 1 AND EncerradaEm >= DATEADD/, [{ SessaoId: SID_ATIVO }]]);
    const r = await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) });
    expect(leiturasDaLista()).toHaveLength(2);
    expect(r.status).toBe(401);
    expect(r.body.mensagem).toBe("Sua sessão foi encerrada. Entre novamente.");
  });

  test("banco fora na PRIMEIRA leitura: 503 (falha fechado), sem chamar o handler", async () => {
    mockFalharLeitura = true;
    const r = await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) });
    expect(r.status).toBe(503);
    expect(r.body.mensagem).toMatch(/não conseguiu conferir as sessões/);
    expect(mockConsultas.filter((c) => /FROM SessoesAtivas WHERE MembroId/.test(c.sql))).toHaveLength(0);
  });

  test("banco fora depois: a lista antiga vale até 60 s; passou disso, 503", async () => {
    expect((await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) })).status).toBe(200);
    mockFalharLeitura = true;
    agora += 30000;
    expect((await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) })).status).toBe(200);
    expect((await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ENCERRADO) })).status).toBe(401); // a lista antiga continua valendo
    agora += 31000;
    expect((await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) })).status).toBe(503);
    mockFalharLeitura = false;
    agora += 3500;
    expect((await chamarPelaEntrada("GestaoSessoes", { token: tokenCom(SID_ATIVO) })).status).toBe(200); // o banco voltou: volta ao normal
  });

  test("ponta a ponta pela entrada: sair (LogoutSecretaria só com x-auth-token) derruba o token na hora nesta instância", async () => {
    const token = tokenCom(SID_ATIVO);
    expect((await chamarPelaEntrada("GestaoSessoes", { token })).status).toBe(200);
    const sair = await chamarPelaEntrada("LogoutSecretaria", { token, metodo: "POST" });
    expect(sair.status).toBe(200);
    const marcou = mockConsultas.filter((c) => /UPDATE SessoesAtivas SET Encerrada = 1/.test(c.sql));
    expect(marcou).toHaveLength(1);
    expect(marcou[0].inputs.id).toBe(SID_ATIVO);
    const depois = await chamarPelaEntrada("GestaoSessoes", { token });
    expect(depois.status).toBe(401);
    expect(depois.body.mensagem).toBe("Sua sessão foi encerrada. Entre novamente.");
  });
});
