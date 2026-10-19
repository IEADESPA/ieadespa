// O portão da EBD (v7.10) do lado da turma e da rota: designar professor numa turma "com menores", marcar/desmarcar a turma (com a confirmação reforçada para desligar) e a resposta
// igual para "não existe" e "fora do escopo". A varredura em si (retirarInaptosDasTurmas) é testada em ministerioMenoresDb.test.js; o banco de verdade, nos roteiros ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [1] };
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), avaliarRequisitos: jest.fn(async () => ({ bloqueado: false, alertas: [] })) }));
jest.mock("../ministerioMenoresDb", () => ({
  aptosParaTurma: jest.fn(), retirarInaptosDasTurmas: jest.fn(async () => ({ retirados: 0, vinculos: 0 }))
}));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const mmDb = require("../ministerioMenoresDb");
const ebd = require("../ebdTurmas");
const handler = require("../../GestaoEbdTurmas/index.js");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const EBD = (escopo = ["Central"], fator = COM_FATOR) => tokenDe(5, { via: "SENHA", fator, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes: ["ebd_gestao"] });
async function chamar(acao, { metodo = "POST", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error(...a) { if (process.env.VER_ERRO) console.error(...a); }, info() { }, warn() { }, verbose() { } } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const turmaBanco = (extra = {}) => ({ TurmaId: 3, CongregacaoId: 1, Nome: "Juniores", FaixaEtaria: "10 a 12", Ativa: 1, ContatoComMenores: 0, CriadoEm: new Date(), ...extra });

beforeEach(() => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); mmDb.aptosParaTurma.mockResolvedValue({ contatoComMenores: false, aptos: new Set([7]), bloqueados: new Map() }); });

describe("designar professor numa turma \"com menores\"", () => {
  const preparar = () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco()]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 7 }]);
  };
  test("turma sem a marca: designa como sempre (o portão devolve 'não é turma com menores')", async () => {
    preparar();
    const r = await ebd.designarProfessor(require("../db").getPool && await require("../db").getPool(), { turmaId: 3, membroId: 7, principal: true, designadoPorMembroId: 5 });
    expect(r.sucesso).toBe(true);
    expect(mmDb.aptosParaTurma).toHaveBeenCalledWith(expect.anything(), { turmaId: 3, membroIds: [7] });
    expect(mockConsultas.some((c) => /INSERT INTO EbdTurmaProfessores/.test(c.sql))).toBe(true);
  });
  test("turma COM a marca e professor apto: designa", async () => {
    preparar();
    mmDb.aptosParaTurma.mockResolvedValue({ contatoComMenores: true, aptos: new Set([7]), bloqueados: new Map() });
    const r = await ebd.designarProfessor(await require("../db").getPool(), { turmaId: 3, membroId: 7, principal: false, designadoPorMembroId: 5 });
    expect(r.sucesso).toBe(true);
  });
  test("turma COM a marca e professor SEM habilitação: recusa com o motivo curto, sem gravar nada (nem na reativação de um vínculo antigo)", async () => {
    preparar();
    mmDb.aptosParaTurma.mockResolvedValue({ contatoComMenores: true, aptos: new Set(), bloqueados: new Map([[7, "habilitação para servir com menores pendente (certidão de antecedentes vencida)"]]) });
    let r = await ebd.designarProfessor(await require("../db").getPool(), { turmaId: 3, membroId: 7, principal: false, designadoPorMembroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/marcada como "com menores" e o professor não pode ser designado: habilitação para servir com menores pendente/);
    expect(escritas()).toHaveLength(0);
    quando(/SELECT \* FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId/, [{ TurmaProfessorId: 9, TurmaId: 3, MembroId: 7, Principal: 0, Ativo: 0 }]);
    r = await ebd.designarProfessor(await require("../db").getPool(), { turmaId: 3, membroId: 7, principal: false, designadoPorMembroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("a marca da turma (rota turmas/menores)", () => {
  const BODY = { turmaId: 3, contatoComMenores: true };
  test("sem sessão: 401; sem a permissão ebd_gestao: 403, antes de qualquer consulta", async () => {
    expect((await chamar("turmas/menores", { corpo: BODY })).status).toBe(401);
    expect((await chamar("turmas/menores", { corpo: BODY, token: tokenDe(10, { via: "PIN" }) })).status).toBe(403);
    expect((await chamar("turmas/menores", { corpo: BODY, token: tokenDe(5, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] }) })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("corpo ruim: 400 (boolean de verdade, id na grafia canônica)", async () => {
    for (const corpo of [{}, { turmaId: 3 }, { turmaId: 3, contatoComMenores: "true" }, { turmaId: 3, contatoComMenores: 1 }, { turmaId: "0x3", contatoComMenores: true }, { turmaId: "03", contatoComMenores: true }, { turmaId: -3, contatoComMenores: true }, { turmaId: 3.5, contatoComMenores: true },
      // uma lista [3] vira "3" ao virar texto e passava como o número 3 (achado na prova no banco real: a marca era ligada com o id dentro de uma lista)
      { turmaId: [3], contatoComMenores: true }, { turmaId: { toString: () => "3" }, contatoComMenores: true }, { turmaId: true, contatoComMenores: true }]) {
      expect((await chamar("turmas/menores", { corpo, token: EBD() })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("turma que não existe e turma de outra congregação recebem a MESMA resposta (404)", async () => {
    const a = await chamar("turmas/menores", { corpo: { turmaId: 99, contatoComMenores: true }, token: EBD() });
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco()]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    const b = await chamar("turmas/menores", { corpo: BODY, token: EBD(["Vila"]) });
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body).toEqual(b.body);
    expect(escritas()).toHaveLength(0);
  });
  test("ligar a marca é livre (sem confirmação reforçada): grava, audita só a mudança e tira da turma, na hora, o professor sem habilitação", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco()]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    mmDb.retirarInaptosDasTurmas.mockResolvedValue({ retirados: 1, vinculos: 2 });
    const r = await chamar("turmas/menores", { corpo: BODY, token: EBD(["Central"], null) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, mudou: true, retirados: 2 });
    expect(r.body.mensagem).toMatch(/2 professor\(es\) sem habilitação saíram da turma/);
    expect(escritas()[0].sql).toMatch(/UPDATE EbdTurmas SET ContatoComMenores = @v/);
    expect(escritas()[0].inputs).toMatchObject({ id: 3, v: 1 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "TURMA_CONTATO_COM_MENORES_ALTERADO", registroId: 3, usuarioId: 5, dadosAntes: { contatoComMenores: false }, dadosDepois: { contatoComMenores: true } });
    expect(mmDb.retirarInaptosDasTurmas).toHaveBeenCalledWith(expect.anything(), { turmaId: 3 });
  });
  test("a varredura que falha ao ligar a marca não desfaz a marca: avisa e a rotina diária refaz", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco()]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    mmDb.retirarInaptosDasTurmas.mockRejectedValue(new Error("fora do ar"));
    const r = await chamar("turmas/menores", { corpo: BODY, token: EBD() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, mudou: true, retiradaFalhou: true, retirados: 0 });
    expect(escritas().some((c) => /UPDATE EbdTurmas SET ContatoComMenores/.test(c.sql))).toBe(true);
  });
  test("desligar uma marca que estava ligada pede a confirmação reforçada (428); com ela, desliga e audita", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco({ ContatoComMenores: 1 })]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    const semFator = await chamar("turmas/menores", { corpo: { turmaId: 3, contatoComMenores: false }, token: EBD(["Central"], null) });
    expect(semFator.status).toBe(428);
    expect(escritas()).toHaveLength(0);
    const ok = await chamar("turmas/menores", { corpo: { turmaId: 3, contatoComMenores: false }, token: EBD() });
    expect(ok.status).toBe(200);
    expect(escritas()[0].inputs).toMatchObject({ id: 3, v: 0 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ dadosAntes: { contatoComMenores: true }, dadosDepois: { contatoComMenores: false } });
    expect(mmDb.retirarInaptosDasTurmas).not.toHaveBeenCalled();
  });
  test("repetir o mesmo valor não grava nem audita (mudou:false); desligar o que já estava desligado não pede confirmação", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco({ ContatoComMenores: 0 })]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    const r = await chamar("turmas/menores", { corpo: { turmaId: 3, contatoComMenores: false }, token: EBD(["Central"], null) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, mudou: false });
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a turma devolve a marca na leitura (contatoComMenores) para a tela mostrar", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco({ ContatoComMenores: 1 })]);
    expect((await ebd.buscarTurmaPorId(await require("../db").getPool(), 3)).contatoComMenores).toBe(true);
    mockRegras = []; quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [turmaBanco()]);
    expect((await ebd.buscarTurmaPorId(await require("../db").getPool(), 3)).contatoComMenores).toBe(false);
  });
});
