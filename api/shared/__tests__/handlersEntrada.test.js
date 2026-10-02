// Entrada dos handlers de escalas, habilitação e voluntariado, do jeito que o HTTP entrega: query string sempre em TEXTO.
// Pega o erro que passou na v7.5: a validação de id trabalhava bem com número e recusava "5" (um regex mal escapado), então toda consulta
// com ?congregacaoId=1 virava 400. O banco aqui é um pool vazio: só importa se o handler deixa passar ou recusa na entrada.
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async () => ({ recordset: [], rowsAffected: [0] }) }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const hEsc = require("../../GestaoEscalas/index.js");
const hHab = require("../../GestaoHabilitacaoVoluntarios/index.js");
const hVol = require("../../GestaoVoluntariado/index.js");

const token = auth.reassinarSessao({ membroId: 5, permissoes: ["escalas", "habilitacao_voluntarios"], escopoCongregacoes: "TODAS" });
async function chamar(handler, metodo, acao, { query, corpo } = {}) {
  const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query: query || {}, body: corpo === undefined ? {} : corpo, headers: { "x-auth-token": token } });
  return context.res;
}

describe("id em texto de dígitos (como chega do HTTP) passa na entrada", () => {
  test.each([
    ["habilitação lista", hHab, "GET", "lista", { congregacaoId: "1" }],
    ["habilitação detalhe", hHab, "GET", "detalhe", { membroId: "5" }],
    ["habilitação elegibilidade", hHab, "GET", "elegibilidade-menores", { membroId: "5", equipeId: "2" }],
    ["habilitação desligamentos", hHab, "GET", "desligamentos", { membroId: "5" }],
    ["habilitação equipes-flag", hHab, "GET", "equipes-flag", { congregacaoId: "1" }],
    ["escalas equipes", hEsc, "GET", "equipes", { congregacaoId: "1" }],
    ["escalas servicos", hEsc, "GET", "servicos", { congregacaoId: "1" }],
    ["escalas servicos-detalhe", hEsc, "GET", "servicos-detalhe", { servicoId: "9" }],
    ["escalas trocas", hEsc, "GET", "trocas", { equipeId: "3" }],
    ["voluntariado rodizios", hVol, "GET", "rodizios", { congregacaoId: "1" }],
    ["voluntariado remocoes", hVol, "GET", "remocoes", { equipeId: "3" }],
    ["voluntariado adesoes", hVol, "GET", "adesoes", { congregacaoId: "1" }]
  ])("%s", async (_rotulo, handler, metodo, acao, query) => {
    const res = await chamar(handler, metodo, acao, { query });
    expect(res.status).not.toBe(400);          // 403/404 do objeto inexistente no pool vazio é o esperado; 400 seria recusa na entrada
    expect(res.status).toBeLessThan(500);
  });

  test("corpo com id numérico em texto também passa", async () => {
    expect((await chamar(hHab, "POST", "desligamento", { corpo: { membroId: "5", motivo: "Motivo suficiente", removidoDaEscala: false } })).status).not.toBe(400);
    expect((await chamar(hEsc, "POST", "equipes-membros", { corpo: { equipeId: "3", membroId: "5" } })).status).not.toBe(400);
  });
});

describe("lixo no lugar do id é recusado na entrada (400), nunca 500", () => {
  const lixo = ["abc", "1;DROP TABLE X", "1 OR 1=1", "-1", "0", "1.5", "0x10", "99999999999999999999", ["1", "2"], { a: 1 }, true];
  test.each(lixo.map(v => [JSON.stringify(v), v]))("query com %s", async (_r, v) => {
    for (const [h, acao, campo] of [[hHab, "lista", "congregacaoId"], [hHab, "detalhe", "membroId"], [hEsc, "equipes", "congregacaoId"], [hEsc, "servicos-detalhe", "servicoId"]]) {
      const res = await chamar(h, "GET", acao, { query: { [campo]: v } });
      expect(res.status).toBe(400);
    }
  });
  test.each(lixo.map(v => [JSON.stringify(v), v]))("corpo com %s", async (_r, v) => {
    for (const [h, acao, corpo] of [
      [hHab, "iniciar", { membroId: v, congregacaoId: 1 }], [hHab, "concluir-etapa", { habilitacaoId: v, etapa: "FICHA_INSCRICAO" }], [hHab, "desligamento", { membroId: v, motivo: "Motivo suficiente" }],
      [hEsc, "auto-escalar", { servicoId: v }], [hEsc, "publicar", { servicoId: v }], [hEsc, "confirmar", { alocacaoId: v }], [hEsc, "trocas", { alocacaoOrigemId: v, membroDestinoId: 2 }]
    ]) {
      const res = await chamar(h, "POST", acao, { corpo });
      expect(res.status).toBe(400);
    }
  });
  test("corpo que nem é objeto não derruba o handler", async () => {
    for (const corpo of [null, "texto", [], 42, true]) {
      for (const [h, acao] of [[hHab, "iniciar"], [hEsc, "publicar"], [hVol, "gerar"]]) {
        expect((await chamar(h, "POST", acao, { corpo })).status).toBeLessThan(500);
      }
    }
  });
});

describe("texto longo demais é recusado antes de chegar à coluna", () => {
  test("escalas: nome, descrição, observação e motivo", async () => {
    const grande = "x".repeat(5000);
    expect((await chamar(hEsc, "POST", "equipes", { corpo: { nome: grande, congregacaoId: 1, liderMembroId: 2 } })).status).toBe(400);
    expect((await chamar(hEsc, "POST", "servicos", { corpo: { congregacaoId: 1, dataHora: "2026-10-10T19:00", descricao: grande } })).status).toBe(400);
    expect((await chamar(hEsc, "POST", "trocas-aprovar", { corpo: { trocaId: 1, aprovar: true, observacao: grande } })).status).toBe(400);
    expect((await chamar(hEsc, "POST", "indisponibilidade", { corpo: { dataInicio: "2026-10-10", dataFim: "2026-10-11", motivo: grande } })).status).toBe(400);
  });
});
