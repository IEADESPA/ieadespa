// Volta 10 do Membros (importante 1 do portão v9): quem está em ARROLAMENTO (a ficha a completar, vinda do sistema pago) não emite pelo aplicativo a Carta de
// Recomendação nem o Atestado Supletivo, e nenhum documento de carta diz "Membro" ou "Comunhão" dessa pessoa. A recusa é clara e neutra, a mesma família de
// frase da carteirinha ("a carteirinha sai depois que a secretaria completar a ficha").
// A regra pura (shared/cartaSituacao.js) e a guarda nas duas rotas, com o banco simulado (o banco de verdade fica no e2e-103).
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => { mockConsultas.push({ sql: texto, inputs: { ...inputs } }); return { recordset: mockRespostas.length ? mockRespostas.shift() : [], rowsAffected: [1] }; } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../directusContas", () => ({ garantirContaSite: jest.fn(async () => true) }));
jest.mock("../protocolo", () => ({ gerarProtocolo: jest.fn(async () => "CARTA-2026-0001") }));
const mockConsultas = [];
const mockRespostas = [];

const auth = require("../auth");
const cartaSituacao = require("../cartaSituacao");
const solicitar = require("../../SolicitarCarta/index.js");
const cartaPdf = require("../../CartaPdf/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
async function chamar(handler, { metodo = "GET", ligacao = {}, query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: ligacao, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
beforeEach(() => { mockConsultas.length = 0; mockRespostas.length = 0; });

const RECUSA = /ficha ainda está para completar: a carta sai depois que a secretaria completar a ficha/;

describe("a regra pura (cartaSituacao)", () => {
  test("arrolamento: a Recomendação e o Atestado Supletivo não saem na hora; a frase é neutra", () => {
    expect(cartaSituacao.recusaDaEmissaoNaHora("RECOMENDACAO", "ARROLAMENTO")).toMatch(RECUSA);
    expect(cartaSituacao.recusaDaEmissaoNaHora("ATESTADO_SUPLETIVO", "ARROLAMENTO")).toMatch(RECUSA);
    // a frase não diz por quê (nada de "sistema pago", "data", "arrolamento")
    expect(cartaSituacao.recusaDaEmissaoNaHora("RECOMENDACAO", "ARROLAMENTO")).not.toMatch(/arrolamento|sistema pago|data/i);
  });
  test("as outras situações seguem como antes; a Mudança não muda aqui (a saída é a missão B)", () => {
    for (const s of ["EM_COMUNHAO", "SEM_COMUNHAO", "CONGREGADO", "NOVO_CONVERTIDO"]) {
      expect(cartaSituacao.recusaDaEmissaoNaHora("RECOMENDACAO", s)).toBeNull();
      expect(cartaSituacao.recusaDaEmissaoNaHora("ATESTADO_SUPLETIVO", s)).toBeNull();
    }
    expect(cartaSituacao.recusaDaEmissaoNaHora("MUDANCA", "ARROLAMENTO")).toBeNull();
  });
  test("o documento (PDF e impressão) de quem está em arrolamento não sai, seja qual for o tipo", () => {
    for (const t of ["RECOMENDACAO", "ATESTADO_SUPLETIVO", "MUDANCA"]) expect(cartaSituacao.recusaDoDocumento(t, "ARROLAMENTO")).toMatch(RECUSA);
    expect(cartaSituacao.recusaDoDocumento("RECOMENDACAO", "EM_COMUNHAO")).toBeNull();
  });
  test("a situação na carta antiga: sem padrão 'Comunhão' para o que não está na lista", () => {
    expect(cartaSituacao.rotuloSituacaoCartaAntiga("EM_COMUNHAO")).toBe("Comunhão");
    expect(cartaSituacao.rotuloSituacaoCartaAntiga("SEM_COMUNHAO")).toBe("Paz");
    expect(cartaSituacao.rotuloSituacaoCartaAntiga("CONGREGADO")).toBe("Observação");
    expect(cartaSituacao.rotuloSituacaoCartaAntiga("ARROLAMENTO")).toBeNull();
    expect(cartaSituacao.rotuloSituacaoCartaAntiga("QUALQUER")).toBeNull();
    expect(cartaSituacao.rotuloSituacaoCartaAntiga(null)).toBeNull();
  });
});

describe("SolicitarCarta: quem está em arrolamento não emite sozinho", () => {
  const membro = (situacao) => [{ MembroId: 31, Nome: "Ana de Mentira", Email: null, SituacaoMembro: situacao }];
  test.each(["RECOMENDACAO", "ATESTADO_SUPLETIVO"])("%s de quem está em arrolamento: recusada, sem gravar carta", async (tipo) => {
    mockRespostas.push(membro("ARROLAMENTO"), []);
    const r = await chamar(solicitar, { metodo: "POST", corpo: { matricula: 31, tipo, destino: "Igreja de mentira" }, token: tokenDe(31) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(RECUSA);
    expect(mockConsultas.some((c) => /INSERT INTO CartasTransito/.test(c.sql))).toBe(false);
  });
  test("a mesma Recomendação de quem está em comunhão continua saindo na hora (201)", async () => {
    mockRespostas.push(membro("EM_COMUNHAO"), [], [{ CartaId: 7 }]);
    const r = await chamar(solicitar, { metodo: "POST", corpo: { matricula: 31, tipo: "RECOMENDACAO", destino: "Igreja de mentira" }, token: tokenDe(31) });
    expect(r.status).toBe(201);
    expect(r.body.sucesso).toBe(true);
  });
});

describe("CartaPdf: o documento de quem está em arrolamento não sai (nem para o titular, nem para a secretaria)", () => {
  const carta = (situacao, tipo = "RECOMENDACAO") => [{
    cartaId: 5, membroId: 31, nome: "Ana de Mentira", congregacao: "Congregação de Mentira", tipo, status: "EMITIDA", destino: "Igreja de mentira",
    protocolo: null, motivoSaida: null, declaracaoCiencia: null, dataEmissao: "2026-11-25", dataValidade: "2026-12-25", dataAdmissao: "2012-05-05",
    funcao: null, cargoMinisterial: null, situacaoMembro: situacao, estadoCivil: null
  }];
  test.each(["RECOMENDACAO", "ATESTADO_SUPLETIVO", "MUDANCA"])("%s já emitida, o titular pede o PDF: 422 com a frase neutra, sem gastar protocolo", async (tipo) => {
    mockRespostas.push(carta("ARROLAMENTO", tipo));
    const r = await chamar(cartaPdf, { ligacao: { id: "5" }, query: { matricula: "31" }, token: tokenDe(31) });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(RECUSA);
    expect(mockConsultas.some((c) => /UPDATE CartasTransito SET Protocolo/.test(c.sql))).toBe(false);
  });
  test("a secretaria (pessoas, no escopo) também recebe a recusa", async () => {
    const sec = auth.reassinarSessao({ membroId: 90, permissoes: ["pessoas"], escopoCongregacoes: ["Congregação de Mentira"], termosPendentes: [], nivel: "LOCAL" });
    mockRespostas.push([{ CongregacaoNome: "Congregação de Mentira", ExtensaoNome: null }], carta("ARROLAMENTO"));
    const r = await chamar(cartaPdf, { ligacao: { id: "5" }, query: { matricula: "31" }, token: sec });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(RECUSA);
  });
});
