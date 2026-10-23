// (revisão de 23/10/2026) O voto de um formulário com VÁRIAS perguntas é uma transação: ou todas as respostas entram, ou nenhuma. Antes, se a enquete fechasse entre a
// primeira e a segunda resposta, ficava gravada só a primeira e a resposta dizia "registradas". Com UMA pergunta, continua sendo um comando só (atômico).
// O banco é simulado por TEXTO da consulta, com transação (begin/commit/rollback anotados).
let mockRegras = [];
let mockConsultas = [];
let mockEventos = [];
jest.mock("../db", () => {
  const responder = (texto, inputs, tx) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, tx });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) {
      const v = typeof valor === "function" ? valor(inputs, texto) : valor;
      if (v instanceof Error) throw v;
      return v.recordset ? v : { recordset: v, rowsAffected: [0] };
    }
    return { recordset: [], rowsAffected: [0] };
  };
  const novoRequest = (tx) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => responder(texto, inputs, tx) }; return r; };
  class Transaction { constructor() { } async begin() { mockEventos.push("begin"); } async commit() { mockEventos.push("commit"); } async rollback() { mockEventos.push("rollback"); } }
  class Request { constructor(t) { return novoRequest(!!t); } }
  const tipos = new Proxy({}, { get: (_o, k) => (k === "Transaction" ? Transaction : k === "Request" ? Request : () => undefined) });
  return { getPool: async () => ({ request: () => novoRequest(false) }), sql: tipos };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../universo", () => ({ universoDoOrgao: jest.fn(async () => []) }));

const auth = require("../auth");
const handler = require("../../GestaoEnquetes/index.js");
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const token = auth.reassinarSessao({ membroId: 20, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "PIN" });
async function votar(respostas) {
  const context = { bindingData: { id: "1", acao: "votar" }, log: { error() { } } };
  await handler(context, { method: "POST", query: {}, body: { respostas }, headers: { "x-auth-token": token } });
  return context.res;
}
beforeEach(() => { mockRegras = []; mockConsultas = []; mockEventos = []; });
function monta({ perguntas = 2 } = {}) {
  quando(/FROM Enquetes WHERE EnqueteId = @id/, [{ enqueteId: 1, titulo: "Inscrição", visibilidade: "SECRETA", publicoTipo: "TODOS_ATIVOS", vinculante: false, status: "ABERTA", dataFechamentoPrevista: null }]);
  quando(/FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem/, Array.from({ length: perguntas }, (_, i) => ({ perguntaId: 10 + i, ordem: i + 1, titulo: `P${i + 1}`, tipo: "OPCOES" })));
  quando(/FROM OpcoesEnquete WHERE PerguntaId = @id/, (i) => [{ opcaoId: i.id * 10, texto: "Sim" }]);
  quando(/AS apto/, [{ apto: 1 }]);
  quando(/SELECT 1 FROM RespostasEnquete r JOIN PerguntasEnquete p/, []);
}
const duas = [{ perguntaId: 10, opcaoId: 100 }, { perguntaId: 11, opcaoId: 110 }];

test("a enquete fecha entre a 1ª e a 2ª resposta: NADA fica gravado (desfaz) e a resposta é 'encerrada', nunca 'registradas'", async () => {
  monta();
  let n = 0;
  quando(/INSERT INTO RespostasEnquete/, () => ({ recordset: [], rowsAffected: [++n === 1 ? 1 : 0] }));
  const r = await votar(duas);
  expect(r.body).toMatchObject({ sucesso: false, mensagem: "Esta enquete já foi encerrada." });
  expect(rodou(/INSERT INTO RespostasEnquete/).every((c) => c.tx)).toBe(true);
  expect(mockEventos).toEqual(["begin", "rollback"]);
});
test("as duas respostas entram juntas: uma transação, confirmada", async () => {
  monta();
  quando(/INSERT INTO RespostasEnquete/, { recordset: [], rowsAffected: [1] });
  const r = await votar(duas);
  expect(r.body.sucesso).toBe(true);
  expect(rodou(/INSERT INTO RespostasEnquete/)).toHaveLength(2);
  expect(mockEventos).toEqual(["begin", "commit"]);
});
test("dentro da transação, a resposta da 1ª pergunta é lida com trava: um envio simultâneo da mesma pessoa vê 'já respondeu' e não grava nada", async () => {
  monta();
  quando(/FROM RespostasEnquete WITH \(UPDLOCK, HOLDLOCK\) WHERE PerguntaId = @p AND MembroId = @m/, [{ ja: 1 }]);
  quando(/INSERT INTO RespostasEnquete/, { recordset: [], rowsAffected: [1] });
  const r = await votar(duas);
  expect(r.body).toMatchObject({ sucesso: false, mensagem: "Esta matrícula já respondeu este formulário." });
  expect(rodou(/INSERT INTO RespostasEnquete/)).toHaveLength(0);
  expect(mockEventos).toEqual(["begin", "rollback"]);
});
test("a chave única no meio da transação também vira 'já respondeu' (e desfaz)", async () => {
  monta();
  quando(/INSERT INTO RespostasEnquete/, Object.assign(new Error("Violation of UNIQUE KEY"), { number: 2627 }));
  const r = await votar(duas);
  expect(r.body.mensagem).toBe("Esta matrícula já respondeu este formulário.");
  expect(mockEventos).toEqual(["begin", "rollback"]);
});
test("uma pergunta só: um comando só, sem transação", async () => {
  monta({ perguntas: 1 });
  quando(/INSERT INTO RespostasEnquete/, { recordset: [], rowsAffected: [1] });
  expect((await votar([{ perguntaId: 10, opcaoId: 100 }])).body.sucesso).toBe(true);
  expect(mockEventos).toEqual([]);
  expect(rodou(/INSERT INTO RespostasEnquete/)[0].tx).toBe(false);
});
