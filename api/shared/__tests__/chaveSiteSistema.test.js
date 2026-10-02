// Chave combinada entre o site e o sistema na rota "este e-mail é de membro ativo?" (VerificarContaMembro) e o lado do site que a envia (SolicitarCodigoConta).
let mockLinhas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async () => ({ recordset: mockLinhas }) }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));

const { conferirChaveDoSite, CABECALHO } = require("../chaveSiteSistema");
const handler = require("../../VerificarContaMembro/index.js");

let n = 1;
const req = (headers = {}, email = "alguem@exemplo.org") => ({ method: "GET", query: { email }, body: {}, headers: { "x-forwarded-for": `177.88.${Math.floor(n / 250)}.${(n++ % 250) + 1}:1, 40.70.146.136:2`, ...headers } });
async function chamar(headers, email) {
  const context = { bindingData: {}, log: { error() {}, warn() {} } };
  await handler(context, req(headers, email));
  return context.res;
}
const COM_CHAVE = (valor) => { process.env.CHAVE_SITE_SISTEMA = valor; };
afterEach(() => { delete process.env.CHAVE_SITE_SISTEMA; mockLinhas = []; });

describe("conferirChaveDoSite", () => {
  test("sem a variável configurada: não exige nada (compatível com o ambiente antes da configuração)", () => {
    expect(conferirChaveDoSite({ headers: {} }, {})).toEqual({ exigida: false, ok: true });
    expect(conferirChaveDoSite({ headers: {} }, { CHAVE_SITE_SISTEMA: "" })).toEqual({ exigida: false, ok: true });
    expect(conferirChaveDoSite({ headers: {} }, { CHAVE_SITE_SISTEMA: "   " })).toEqual({ exigida: false, ok: true });
  });
  test("configurada: só passa com o cabeçalho IGUAL; ausente, vazio, diferente, maiúscula/minúscula trocada e prefixo/sufixo não passam", () => {
    const env = { CHAVE_SITE_SISTEMA: "chave-combinada-123" };
    const com = (v) => conferirChaveDoSite({ headers: v === undefined ? {} : { [CABECALHO]: v } }, env);
    expect(com("chave-combinada-123")).toEqual({ exigida: true, ok: true });
    for (const errado of [undefined, "", "chave-combinada-124", "CHAVE-COMBINADA-123", "chave-combinada-12", "chave-combinada-1234", " chave-combinada-123", ["chave-combinada-123"], 123]) {
      expect(com(errado).ok).toBe(false);
      expect(com(errado).exigida).toBe(true);
    }
  });
  test("o nome do cabeçalho vale em maiúsculas também; req sem headers não quebra", () => {
    expect(conferirChaveDoSite({ headers: { "X-Site-Key": "k" } }, { CHAVE_SITE_SISTEMA: "k" }).ok).toBe(true);
    expect(conferirChaveDoSite({}, { CHAVE_SITE_SISTEMA: "k" }).ok).toBe(false);
    expect(conferirChaveDoSite(undefined, { CHAVE_SITE_SISTEMA: "k" }).ok).toBe(false);
  });
  test("o valor da chave é usado como veio, sem espaços nas pontas da configuração", () => {
    expect(conferirChaveDoSite({ headers: { [CABECALHO]: "k" } }, { CHAVE_SITE_SISTEMA: "  k  " }).ok).toBe(true);
  });
});

describe("VerificarContaMembro com a chave configurada", () => {
  test("sem cabeçalho ou com a chave errada: 401, sem consultar o banco nem dizer se o e-mail é de membro", async () => {
    COM_CHAVE("segredo-do-site");
    mockLinhas = [{ Total: 1 }];
    for (const headers of [{}, { "x-site-key": "outra" }, { "x-site-key": "" }]) {
      const r = await chamar(headers);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ sucesso: false, mensagem: "Não autorizado." });
      expect(JSON.stringify(r.body)).not.toMatch(/ehMembroAtivo/);
    }
  });
  test("com a chave certa: responde só o booleano", async () => {
    COM_CHAVE("segredo-do-site");
    mockLinhas = [{ Total: 1 }];
    const r = await chamar({ "x-site-key": "segredo-do-site" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ehMembroAtivo: true });
    mockLinhas = [{ Total: 0 }];
    expect((await chamar({ "x-site-key": "segredo-do-site" })).body).toEqual({ ehMembroAtivo: false });
  });
  test("o limite por origem continua valendo antes da chave: chute de chave também é contido (429)", async () => {
    COM_CHAVE("segredo-do-site");
    const mesmaOrigem = { "x-forwarded-for": "177.99.9.9:1, 40.70.146.136:2" };
    let ultimo;
    for (let i = 0; i < 21; i++) ultimo = await chamar({ ...mesmaOrigem, "x-site-key": `palpite-${i}` });
    expect(ultimo.status).toBe(429);
  });
});

describe("VerificarContaMembro sem a chave configurada (antes de combinar com o site)", () => {
  test("segue como antes: sem cabeçalho responde o booleano", async () => {
    mockLinhas = [{ Total: 1 }];
    expect((await chamar({})).body).toEqual({ ehMembroAtivo: true });
  });
});

describe("o lado do site (SolicitarCodigoConta) envia a chave e avisa quando o sistema a recusa", () => {
  jest.mock("@azure/communication-email", () => ({ EmailClient: function () {} }), { virtual: true });
  const site = () => require("../../../site/api/SolicitarCodigoConta/index.js");
  const base = { DIRECTUS_URL: "http://directus.invalido", DIRECTUS_ADMIN_TOKEN: "t", ACS_CONNECTION_STRING: "endpoint=x" };
  let chamadas, aviso;
  const rodar = async (respostaSistema, email) => {
    chamadas = []; aviso = [];
    global.fetch = jest.fn(async (url, opcoes) => {
      chamadas.push({ url: String(url), opcoes });
      if (String(url).includes("/items/contas?")) return { ok: true, json: async () => ({ data: [] }) };       // conta nova
      if (String(url).includes("verificar-conta-membro")) return respostaSistema;
      return { ok: true, json: async () => ({}) };
    });
    const context = { log: { error() {}, warn: (m) => aviso.push(m) } };
    await site()(context, { headers: { "x-forwarded-for": `177.77.${n % 250}.${(n++ % 250) + 1}` }, body: { email } });
    return context.res;
  };
  const verificacao = () => chamadas.find(c => c.url.includes("verificar-conta-membro"));

  let salvo;
  beforeEach(() => { salvo = { ...process.env }; Object.assign(process.env, base); jest.resetModules(); });
  afterEach(() => { process.env = salvo; delete global.fetch; });

  test("com CHAVE_SITE_SISTEMA no ambiente do site: manda x-site-key", async () => {
    process.env.CHAVE_SITE_SISTEMA = "segredo-do-site";
    await rodar({ ok: true, status: 200, json: async () => ({ ehMembroAtivo: false }) }, "novo1@exemplo.org");
    expect(verificacao().opcoes.headers).toEqual({ "x-site-key": "segredo-do-site" });
  });
  test("sem a variável: não manda cabeçalho nenhum (nada de 'undefined' no fio)", async () => {
    delete process.env.CHAVE_SITE_SISTEMA;
    await rodar({ ok: true, status: 200, json: async () => ({ ehMembroAtivo: false }) }, "novo2@exemplo.org");
    expect(verificacao().opcoes.headers).toEqual({});
  });
  test("o sistema recusa a chave (401): a criação da conta segue, mas o aviso aparece no log e NÃO ecoa a chave", async () => {
    process.env.CHAVE_SITE_SISTEMA = "segredo-do-site";
    await rodar({ ok: false, status: 401, json: async () => ({}) }, "novo3@exemplo.org");
    expect(aviso).toHaveLength(1);
    expect(aviso[0]).toMatch(/recusou a chave do site/);
    expect(aviso[0]).not.toContain("segredo-do-site");
  });
  test("membro ativo é barrado como antes (409)", async () => {
    process.env.CHAVE_SITE_SISTEMA = "segredo-do-site";
    const res = await rodar({ ok: true, status: 200, json: async () => ({ ehMembroAtivo: true }) }, "membro@exemplo.org");
    expect(res.status).toBe(409);
  });
});
