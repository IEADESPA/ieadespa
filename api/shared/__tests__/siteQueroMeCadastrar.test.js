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
const ENVIO = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const corpoValido = () => ({ nome: "Lucas Ferreira", cpf: "123.456.789-09", email: "lucas@exemplo.org", telefone: "", dataNascimento: "1996-07-22", sexo: "M",
  estadoCivil: "SOLTEIRO", congregacaoId: "7", consentimento: { aceito: true, versao: "2026-11" }, envio: ENVIO });
const TERMO = { versao: "2026-11", texto: "Autorizo a Igreja a guardar estes dados para o cadastro de membros. Veja a política de privacidade." };

let chamadas;
beforeEach(() => {
  chamadas = [];
  process.env.CHAVE_SITE_SISTEMA = "chave-de-teste";
  global.fetch = jest.fn(async (url, op) => {
    chamadas.push({ url, op });
    if (op.method === "GET") return { status: 200, json: async () => ({ sucesso: true, consentimento: TERMO, congregacoes: [{ congregacaoId: 7, nome: "Vila Nova", area: "Área 2", extra: "x" }] }) };
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
    expect(Object.keys(enviado).sort()).toEqual(["congregacaoId", "consentimento", "cpf", "dataNascimento", "email", "envioId", "estadoCivil", "nome", "origemVisitante", "sexo"].sort());
    expect(enviado.congregacaoId).toBe(7);
    expect(enviado.envioId).toBe(ENVIO);
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
  // revisão de 23/11 (M3): a mensagem do sistema fala de "importação do sistema pago" (palavra de dentro); o visitante recebe a dele, e não "fora do ar"
  test("a trava das matrículas (409, antes da importação do sistema pago) chega ao visitante com a mensagem do site, sem palavra de dentro", async () => {
    const msg = "As matrículas novas só começam depois da importação do sistema pago.";
    global.fetch = jest.fn(async () => ({ status: 409, json: async () => ({ sucesso: false, mensagem: msg }) }));
    const r = await chamar(pedido("POST", PROD, corpoValido()));
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "O cadastro pelo site abre em breve. Por enquanto, procure a secretaria da sua congregação." });
    expect(JSON.stringify(r.body)).not.toMatch(/sistema pago|importa/i);
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

describe("as pendências da revisão de 20/11/2026", () => {
  // uma cópia nova da função (a lista guardada por 10 minutos começa vazia)
  const novaFuncao = () => { let f; jest.isolateModules(() => { f = require("../../../site/api/QueroMeCadastrar/index.js"); }); return f; };
  async function chamarCom(f, req) { const context = { log: Object.assign(() => {}, { warn: () => {}, error: () => {} }) }; await f(context, req); return context.res; }
  test("(c) o identificador do envio vai ao sistema como envioId; sem ele (a página antiga) ou fora do formato: 400 'recarregue', nada vai ao sistema", async () => {
    await chamar(pedido("POST", PROD, corpoValido()));
    expect(JSON.parse(chamadas[0].op.body).envioId).toBe(ENVIO);
    for (const envio of [undefined, "", "abc", ENVIO.toUpperCase(), `${ENVIO}0`, 12345, { x: 1 }, "'; DROP TABLE x; --"]) {
      const r = await chamar(pedido("POST", PROD, { ...corpoValido(), envio }));
      expect(r.status).toBe(400);
      expect(r.body.mensagem).toMatch(/recarregue/);
    }
    expect(chamadas.length).toBe(1);
  });
  test("(c) o mesmo envio repetido vai com o MESMO envioId (o sistema devolve o mesmo resultado sem gravar de novo)", async () => {
    await chamar(pedido("POST", PROD, corpoValido()));
    await chamar(pedido("POST", PROD, corpoValido()));
    expect(JSON.parse(chamadas[0].op.body).envioId).toBe(JSON.parse(chamadas[1].op.body).envioId);
  });
  test("(d) o texto do consentimento vem do sistema, junto com a versão, e é guardado com a lista", async () => {
    const f = novaFuncao();
    const r = await chamarCom(f, pedido("GET", PROD));
    expect(r.status).toBe(200);
    expect(r.body.consentimento).toEqual(TERMO);
    const r2 = await chamarCom(f, pedido("GET", PROD));
    expect(r2.body.consentimento).toEqual(TERMO);
    expect(chamadas.length).toBe(1);
  });
  test("(d) o sistema sem o texto (ou sem a versão, ou com texto grande demais): falha fechada, 503, e nada guardado", async () => {
    for (const consentimento of [{ versao: "2026-11" }, { texto: TERMO.texto }, { versao: "2026-11", texto: "" }, { versao: "2026-11", texto: "x".repeat(601) }, { versao: 1, texto: 2 }, null]) {
      const f = novaFuncao();
      chamadas = [];
      global.fetch = jest.fn(async (url, op) => { chamadas.push({ url, op }); return { status: 200, json: async () => ({ sucesso: true, consentimento, congregacoes: [] }) }; });
      expect((await chamarCom(f, pedido("GET", PROD))).status).toBe(503);
      expect((await chamarCom(f, pedido("GET", PROD))).status).toBe(503);
      expect(chamadas.length).toBe(2);   // nada foi guardado: perguntou de novo
    }
  });
  test("(d) a versão do consentimento trocada no sistema: o 400 dele chega à pessoa e a lista guardada é jogada fora (a próxima leitura traz o texto novo)", async () => {
    const f = novaFuncao();
    await chamarCom(f, pedido("GET", PROD));
    global.fetch = jest.fn(async (url, op) => {
      chamadas.push({ url, op });
      if (op.method === "GET") return { status: 200, json: async () => ({ sucesso: true, consentimento: { versao: "2027-01", texto: "Texto novo." }, congregacoes: [] }) };
      return { status: 400, json: async () => ({ sucesso: false, mensagem: "O texto do consentimento foi atualizado: recarregue a página e envie de novo." }) };
    });
    const r = await chamarCom(f, pedido("POST", PROD, corpoValido()));
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/recarregue/);
    const lista = await chamarCom(f, pedido("GET", PROD));
    expect(lista.body.consentimento).toEqual({ versao: "2027-01", texto: "Texto novo." });
  });
});
