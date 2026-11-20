// O "Quero me cadastrar" do SITE (outro aplicativo, site/api/QueroMeCadastrar): repassa ao sistema servidor a servidor.
// O que não pode falhar: a prévia do site nunca grava na produção; endereço desconhecido não repassa; o robô (campo escondido) não chega ao sistema;
// só os campos do formulário vão adiante; o sistema fora do ar vira "tente de novo", nunca um "recebemos" falso.
const funcao = require("../../../site/api/QueroMeCadastrar/index.js");
const { ambienteDoPedido } = funcao;

const PROD = "ieadespa.org.br";
const PREVIA = "salmon-bay-0efd06d0f-21.eastus2.6.azurestaticapps.net";
let ipSeq = 0;
const pedido = (metodo, host, body, extra = {}) => ({ method: metodo, body, headers: { host, "x-forwarded-for": `177.1.1.${++ipSeq}:1000, 40.0.0.1:2`, ...extra } });
async function chamar(req) { const context = { log: Object.assign(() => {}, { warn: () => {}, error: () => {} }) }; await funcao(context, req); return context.res; }
const corpoValido = () => ({ nome: "Lucas Ferreira", cpf: "123.456.789-09", email: "lucas@exemplo.org", telefone: "", dataNascimento: "1996-07-22", sexo: "M",
  estadoCivil: "SOLTEIRO", congregacaoId: "7", consentimento: { aceito: true, versao: "2026-11" } });

let chamadas;
beforeEach(() => {
  chamadas = [];
  process.env.CHAVE_SITE_SISTEMA = "chave-de-teste";
  global.fetch = jest.fn(async (url, op) => {
    chamadas.push({ url, op });
    if (op.method === "GET") return { status: 200, json: async () => ({ sucesso: true, consentimento: { versao: "2026-11" }, congregacoes: [{ congregacaoId: 7, nome: "Vila Nova", area: "Área 2", extra: "x" }] }) };
    return { status: 200, json: async () => ({ sucesso: true, mensagem: "Recebemos o seu cadastro." }) };
  });
});
afterEach(() => { delete global.fetch; });

describe("para onde vai", () => {
  test("o domínio do site e o endereço padrão de produção -> produção", () => {
    expect(ambienteDoPedido({ headers: { host: PROD } })).toBe("producao");
    expect(ambienteDoPedido({ headers: { host: "www.ieadespa.org.br" } })).toBe("producao");
    expect(ambienteDoPedido({ headers: { "X-MS-Original-URL": "https://salmon-bay-0efd06d0f.6.azurestaticapps.net/api/quero-me-cadastrar" } })).toBe("producao");
  });
  test("o x-forwarded-host (que o visitante inventa) não muda o destino", () => {
    expect(ambienteDoPedido({ headers: { host: PROD, "x-forwarded-host": PREVIA } })).toBe("producao");
  });
  test("a prévia do pull request -> homologação, mesmo que outro cabeçalho diga produção", () => {
    expect(ambienteDoPedido({ headers: { host: PREVIA } })).toBe("homologacao");
    expect(ambienteDoPedido({ headers: { host: PROD, "x-ms-original-url": `https://${PREVIA}/api/quero-me-cadastrar` } })).toBe("homologacao");
  });
  test("endereço desconhecido (ou parecido) -> nenhum", () => {
    expect(ambienteDoPedido({ headers: { host: "localhost:7071" } })).toBe(null);
    expect(ambienteDoPedido({ headers: { host: "ieadespa.org.br.golpe.com" } })).toBe(null);
    expect(ambienteDoPedido({ headers: {} })).toBe(null);
  });
});

describe("o repasse", () => {
  test("a prévia manda à homologação, com a chave; a produção, à produção", async () => {
    expect((await chamar(pedido("POST", PREVIA, corpoValido()))).status).toBe(200);
    expect(chamadas[0].url).toBe("https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net/api/pre-cadastro-site");
    expect(chamadas[0].op.headers["x-site-key"]).toBe("chave-de-teste");
    await chamar(pedido("POST", PROD, corpoValido()));
    expect(chamadas[1].url).toBe("https://app.ieadespa.org.br/api/pre-cadastro-site");
  });
  test("só os campos do formulário vão adiante (congregação em número, o visitante pelo IP)", async () => {
    const corpo = { ...corpoValido(), situacao: "ATIVO", matricula: "1" };
    await chamar(pedido("POST", PREVIA, corpo));
    const enviado = JSON.parse(chamadas[0].op.body);
    expect(Object.keys(enviado).sort()).toEqual(["congregacaoId", "consentimento", "cpf", "dataNascimento", "email", "estadoCivil", "nome", "origemVisitante", "sexo"].sort());
    expect(enviado.congregacaoId).toBe(7);
    expect(enviado.origemVisitante).toMatch(/^177\.1\.1\.\d+:1000\|$/);
    await chamar(pedido("POST", PREVIA, { ...corpoValido(), visitante: "a1b2c3d4-e5f6" }));
    expect(JSON.parse(chamadas[1].op.body).origemVisitante).toMatch(/\|a1b2c3d4-e5f6$/);
  });
  test("endereço desconhecido ou sem a chave: 503 e nada vai ao sistema", async () => {
    expect((await chamar(pedido("POST", "localhost", corpoValido()))).status).toBe(503);
    delete process.env.CHAVE_SITE_SISTEMA;
    expect((await chamar(pedido("POST", PROD, corpoValido()))).status).toBe(503);
    expect(chamadas.length).toBe(0);
  });
  test("o robô que preenche o campo escondido recebe 'recebemos' e nada vai ao sistema", async () => {
    const r = await chamar(pedido("POST", PROD, { ...corpoValido(), site: "http://spam" }));
    expect(r.status).toBe(200);
    expect(chamadas.length).toBe(0);
  });
  test("sem consentimento ou sem congregação: 400 sem chamar o sistema", async () => {
    expect((await chamar(pedido("POST", PROD, { ...corpoValido(), consentimento: { aceito: false } }))).status).toBe(400);
    expect((await chamar(pedido("POST", PROD, { ...corpoValido(), congregacaoId: "abc" }))).status).toBe(400);
    expect(chamadas.length).toBe(0);
  });
  test("o sistema fora do ar, recusando a chave ou demorando: 503, nunca um 'recebemos' falso", async () => {
    global.fetch = jest.fn(async () => ({ status: 401, json: async () => ({ sucesso: false, mensagem: "Não autorizado." }) }));
    expect((await chamar(pedido("POST", PROD, corpoValido()))).status).toBe(503);
    global.fetch = jest.fn(async () => ({ status: 500, json: async () => { throw new Error("html"); } }));
    expect((await chamar(pedido("POST", PROD, corpoValido()))).status).toBe(503);
    global.fetch = jest.fn(async () => { throw new Error("The operation was aborted due to timeout"); });
    const r = await chamar(pedido("POST", PROD, corpoValido()));
    expect(r.status).toBe(503);
    expect(r.body.sucesso).toBe(false);
  });
  test("o 400 de formato do sistema chega à pessoa como o sistema disse", async () => {
    global.fetch = jest.fn(async () => ({ status: 400, json: async () => ({ sucesso: false, mensagem: "CPF inválido." }) }));
    const r = await chamar(pedido("POST", PROD, corpoValido()));
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toBe("CPF inválido.");
  });
  test("a lista das congregações: só id, nome e área; guardada 10 minutos por ambiente", async () => {
    const r1 = await chamar(pedido("GET", PREVIA));
    expect(r1.status).toBe(200);
    expect(r1.body.ambiente).toBe("homologacao");
    expect(r1.body.congregacoes).toEqual([{ congregacaoId: 7, nome: "Vila Nova", area: "Área 2" }]);
    await chamar(pedido("GET", PREVIA));
    expect(chamadas.length).toBe(1);
    const r3 = await chamar(pedido("GET", PROD));
    expect(r3.body.ambiente).toBe("producao");
    expect(chamadas.length).toBe(2);
  });
});
