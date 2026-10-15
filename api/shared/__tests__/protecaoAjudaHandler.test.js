// O canal de ajuda sem login (POST /api/protecao-ajuda) com o handler de verdade e a camada de banco SIMULADA: o que a criança lê na confirmação (a mensagem do servidor, o sim/não `avisada`
// e NUNCA a contagem de avisados), o 100 e o 190 em toda resposta e o limite por origem. O comportamento contra o SQL Server é coberto por tools/e2e-localdb (e2e-14, e2e-15).
jest.mock("../db", () => ({ getPool: async () => ({}), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../protecaoDb", () => ({ registrarPedidoDeAjuda: jest.fn() }));

const db = require("../protecaoDb");
const pm = require("../protecaoMenores");
const handler = require("../../ProtecaoAjuda/index.js");

let origem = 0;
async function chamar(corpo, cabecalhos) {
  const context = { log: { error() { }, info() { }, warn() { } } };
  await handler(context, { method: "POST", body: corpo, headers: cabecalhos || { "x-forwarded-for": `9.9.9.9, 198.51.${Math.floor(origem / 250)}.${origem++ % 250}:443, 10.0.0.1:80` } });
  return context.res;
}
beforeEach(() => { jest.clearAllMocks(); });

describe("a confirmação do canal de ajuda", () => {
  test("liderança avisada: 201 com a mensagem de sempre, `avisada: true`, o protocolo e os telefones; nenhuma contagem", async () => {
    db.registrarPedidoDeAjuda.mockResolvedValueOnce({ sucesso: true, protocolo: "PRO-2026-0001", avisada: true, mensagem: pm.textoConfirmacaoDeAjuda({ avisada: true }) });
    const r = await chamar({ texto: "Um adulto me tocou e eu não gostei." });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sucesso: true, protocolo: "PRO-2026-0001", avisada: true, mensagem: pm.textoConfirmacaoDeAjuda({ avisada: true }) });
    expect(r.body.contatosDeAjuda.map((c) => c.numero)).toEqual(["100", "190", null]);
    expect(Object.keys(r.body).sort()).toEqual(["avisada", "contatosDeAjuda", "mensagem", "protocolo", "sucesso"]);
    expect(JSON.stringify(r.body)).not.toMatch(/avisados/);
  });
  test("ninguém foi avisado: a resposta repassa `avisada: false` e a mensagem honesta, com o 100 e o 190 (o pedido está gravado, mas a criança é mandada ligar)", async () => {
    db.registrarPedidoDeAjuda.mockResolvedValueOnce({ sucesso: true, protocolo: "PRO-2026-0002", avisada: false, mensagem: pm.textoConfirmacaoDeAjuda({ avisada: false }) });
    const r = await chamar({ texto: "Um adulto me tocou e eu não gostei." });
    expect(r.status).toBe(201);
    expect(r.body.avisada).toBe(false);
    expect(r.body.mensagem).toMatch(/não conseguimos avisar ninguém da liderança/);
    expect(r.body.mensagem).not.toMatch(/foram avisadas/);
    expect(r.body.mensagem).toMatch(/\b100\b/);
    expect(r.body.mensagem).toMatch(/\b190\b/);
  });
  test("o banco devolvendo algo que não é booleano verdadeiro NUNCA vira promessa: `avisada` sai false (e a contagem do banco não passa)", async () => {
    db.registrarPedidoDeAjuda.mockResolvedValueOnce({ sucesso: true, protocolo: "PRO-2026-0003", avisados: 3, mensagem: "m" });
    const r = await chamar({ texto: "Um adulto me tocou e eu não gostei." });
    expect(r.body.avisada).toBe(false);
    expect("avisados" in r.body).toBe(false);
  });
  test("recusa de regra (422), limite do banco (429) e erro (500) seguem trazendo a orientação do 100 e do 190", async () => {
    db.registrarPedidoDeAjuda.mockResolvedValueOnce({ sucesso: false, mensagem: "Conte um pouco mais." });
    let r = await chamar({ texto: "curto" });
    expect(r.status).toBe(422);
    expect(r.body.contatosDeAjuda).toHaveLength(3);
    db.registrarPedidoDeAjuda.mockResolvedValueOnce({ sucesso: false, limite: true, mensagem: "Estamos recebendo muitas mensagens." });
    r = await chamar({ texto: "um texto longo o bastante" });
    expect(r.status).toBe(429);
    db.registrarPedidoDeAjuda.mockRejectedValueOnce(new Error("banco fora"));
    r = await chamar({ texto: "um texto longo o bastante" });
    expect(r.status).toBe(500);
    expect(r.body.mensagem).toMatch(/190/);
    expect(r.body.mensagem).toMatch(/100/);
    expect(JSON.stringify(r.body)).not.toMatch(/banco fora/);
    expect(r.body.contatosDeAjuda).toHaveLength(3);
  });
});
