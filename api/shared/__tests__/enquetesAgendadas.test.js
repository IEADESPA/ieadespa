// v7.14 — o que a Identidade Visual pediu às Enquetes (v2.8): a enquete que fecha sozinha (DataFechamentoPrevista: lida na hora, conferida no próprio INSERT do voto e
// encerrada pela rotina), o voto que confere o público só da pessoa, o segundo voto simultâneo que vira "já respondeu" (e não 500), a votação da identidade que não se encerra
// à mão e a lista de Meu Painel → Votações. O banco é simulado por TEXTO da consulta (como em revisaoV75.test.js); contra o SQL Server: tools/e2e-localdb/e2e-31 e e2e-32.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) {
      if (valor instanceof Error) throw valor;
      return { recordset: typeof valor === "function" ? valor(inputs, texto) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
    }
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../universo", () => ({ universoDoOrgao: jest.fn(async () => [{ membroId: 20 }, { membroId: 21 }]) }));

const auth = require("../auth");
const enquetes = require("../enquetes");
const handler = require("../../GestaoEnquetes/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const GERAL = (permissoes = ["reunioes", "assembleia"]) => tokenDe(1, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
async function chamar({ metodo = "GET", id, acao, corpo = {}, query = {}, token }) {
  const context = { bindingData: { id, acao }, log: { error() { } } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
beforeEach(() => { mockRegras = []; mockConsultas = []; });

const FUTURO = new Date(Date.now() + 86400000).toISOString().slice(0, 23);
const PASSADO = new Date(Date.now() - 60000).toISOString().slice(0, 23);
function monta(extra = {}) {
  quando(/FROM Enquetes WHERE EnqueteId = @id/, [{ enqueteId: 1, titulo: "Tema", descricao: null, visibilidade: "SECRETA", publicoTipo: "TODOS_ATIVOS", vinculante: false, quorumTipo: null,
    status: "ABERTA", resultadoAprovado: null, criadoPor: null, dataFechamentoPrevista: FUTURO, ...extra }]);
  quando(/FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem/, [{ perguntaId: 10, ordem: 1, titulo: "Qual?", tipo: "OPCOES" }]);
  quando(/FROM OpcoesEnquete WHERE PerguntaId = @id/, [{ opcaoId: 100, texto: "A" }, { opcaoId: 101, texto: "B" }]);
  quando(/AS apto/, [{ apto: 1 }]);
}
const votar = (token = tokenDe(20)) => chamar({ metodo: "POST", id: "1", acao: "votar", corpo: { respostas: [{ perguntaId: 10, opcaoId: 100 }] }, token });

describe("passouDoFechamento", () => {
  test("sem data: nunca; com data: a partir do instante (com ou sem o Z)", () => {
    expect(enquetes.passouDoFechamento({ dataFechamentoPrevista: null })).toBe(false);
    expect(enquetes.passouDoFechamento({ dataFechamentoPrevista: "2027-12-01T03:00:00" }, new Date("2027-12-01T02:59:59Z"))).toBe(false);
    expect(enquetes.passouDoFechamento({ dataFechamentoPrevista: "2027-12-01T03:00:00" }, new Date("2027-12-01T03:00:00Z"))).toBe(true);
    expect(enquetes.passouDoFechamento({ dataFechamentoPrevista: "2027-12-01T03:00:00.000Z" }, new Date("2027-12-01T03:00:01Z"))).toBe(true);
  });
});

describe("o voto", () => {
  test("aberta e no público: o INSERT só grava com a enquete aberta e antes do instante, pela hora do banco", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, [], 1);
    const r = await votar();
    expect(r.body.sucesso).toBe(true);
    const ins = rodou(/INSERT INTO RespostasEnquete/)[0];
    expect(ins.inputs).toMatchObject({ enqueteId: 1, perguntaId: 10, membroId: 20, opcaoId: 100 });
    // (revisão) a enquete é lida COM TRAVA dentro do INSERT: com READ_COMMITTED_SNAPSHOT, sem ela o voto não esperava o encerramento em curso
    expect(ins.sql).toMatch(/WHERE EXISTS \(SELECT 1 FROM Enquetes WITH \(UPDLOCK, REPEATABLEREAD\) WHERE EnqueteId = @enqueteId AND Status = 'ABERTA'\s+AND \(DataFechamentoPrevista IS NULL OR DataFechamentoPrevista > SYSUTCDATETIME\(\)\)\)/);
  });
  test("o público é conferido só para a pessoa (sem reler o cadastro inteiro)", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, [], 1);
    await votar();
    expect(rodou(/AS apto/)[0].inputs).toEqual({ m: 20 });
    expect(require("../universo").universoDoOrgao).not.toHaveBeenCalled();
    mockRegras = []; mockConsultas = [];
    monta(); mockRegras = mockRegras.filter(([p]) => !p.test("AS apto")); quando(/AS apto/, [{ apto: 0 }]);
    const fora = await votar(tokenDe(33));
    expect(fora.body.mensagem).toMatch(/não está no público/);
    expect(rodou(/INSERT INTO RespostasEnquete/)).toHaveLength(0);
  });
  test("passou do instante marcado: \"encerrada\", sem tentar gravar", async () => {
    monta({ dataFechamentoPrevista: PASSADO });
    const r = await votar();
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "Esta enquete já foi encerrada." });
    expect(rodou(/INSERT INTO RespostasEnquete/)).toHaveLength(0);
  });
  test("fechou entre a leitura e a gravação (o INSERT não grava nada): \"encerrada\"", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, [], 0);
    expect((await votar()).body).toMatchObject({ sucesso: false, mensagem: "Esta enquete já foi encerrada." });
  });
  test("dois envios da mesma pessoa ao mesmo tempo: o segundo esbarra na chave única e recebe \"já respondeu\" (antes, 500)", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, Object.assign(new Error("Violation of UNIQUE KEY constraint"), { number: 2627 }));
    const r = await votar();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "Esta matrícula já respondeu este formulário." });
  });
  test("outro erro do banco não vira \"já respondeu\"", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, Object.assign(new Error("timeout"), { number: -2 }));
    await expect(votar()).rejects.toThrow("timeout");
  });
});

describe("a lista e o encerramento", () => {
  test("a lista mostra ENCERRADA a que passou do instante, com a data prevista", async () => {
    quando(/SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY/, [{ enqueteId: 1 }]);
    monta({ dataFechamentoPrevista: PASSADO });
    quando(/FROM RespostasEnquete r JOIN MembroReferencia m/, []);
    const r = await chamar({ token: GERAL() });
    expect(r.body[0]).toMatchObject({ status: "ENCERRADA", dataFechamentoPrevista: PASSADO });
  });
  test("(revisão) passada a hora, a LEITURA encerra de verdade, uma vez: a vinculante sai com o resultado gravado (antes: 'Não aprovado' até a rotina das 7h)", async () => {
    quando(/SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY/, [{ enqueteId: 1 }]);
    monta({ dataFechamentoPrevista: PASSADO, vinculante: true, quorumTipo: "MAIORIA_SIMPLES" });
    quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 1);
    mockRegras.unshift([/FROM OpcoesEnquete o WHERE o\.PerguntaId/, [{ OpcaoId: 100, votos: 3 }, { OpcaoId: 101, votos: 1 }], 0]);   // antes da regra das perguntas (o texto da contagem também as cita)
    quando(/FROM RespostasEnquete r JOIN MembroReferencia m/, []);
    const r = await chamar({ token: GERAL() });
    expect(r.body[0]).toMatchObject({ status: "ENCERRADA", resultadoAprovado: true });
    const fechou = rodou(/UPDATE Enquetes SET Status = 'ENCERRADA'/);
    expect(fechou).toHaveLength(1);
    expect(fechou[0].inputs).toMatchObject({ id: 1, agendada: 1 });
    expect(fechou[0].sql).toMatch(/DataFechamentoPrevista <= SYSUTCDATETIME\(\)/);
    expect(rodou(/UPDATE Enquetes SET ResultadoAprovado = @resultado/)[0].inputs).toMatchObject({ resultado: true });
    expect(require("../auditoria").registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "Enquetes", registroId: 1, acao: "Encerrou enquete (fechamento agendado)", usuarioId: null }));
  });
  test("(revisão) o voto não relê as respostas de todo mundo", async () => {
    monta();
    quando(/INSERT INTO RespostasEnquete/, [], 1);
    await votar();
    expect(rodou(/FROM RespostasEnquete r JOIN MembroReferencia m/)).toHaveLength(0);
  });
  test("a votação da Identidade Visual aberta não mostra a contagem nem quem votou (nem à mesa do geral); fechada, mostra", async () => {
    for (const [prevista, deveMostrar] of [[FUTURO, false], [PASSADO, true]]) {
      mockRegras = []; mockConsultas = [];
      quando(/SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY/, [{ enqueteId: 1 }]);
      quando(/SELECT EnqueteId FROM IdentidadeCiclos WHERE EnqueteId IS NOT NULL/, [{ EnqueteId: 1 }]);
      monta({ dataFechamentoPrevista: prevista });
      quando(/FROM RespostasEnquete r JOIN MembroReferencia m/, [{ membroId: 20, nome: "Luz", opcaoId: 100 }, { membroId: 21, nome: "Dora", opcaoId: 101 }]);
      const r = await chamar({ token: GERAL() });
      const opcoes = r.body[0].perguntas[0].opcoes;
      expect(opcoes.every((o) => o.votos !== undefined)).toBe(deveMostrar);
      expect(r.body[0].participantes.length).toBe(deveMostrar ? 2 : 0);
    }
  });
  test("a votação da Identidade Visual não se encerra à mão (nem pelo geral)", async () => {
    monta();
    quando(/SELECT AnoAlvo FROM IdentidadeCiclos WHERE EnqueteId = @id/, [{ AnoAlvo: 2028 }]);
    const r = await chamar({ metodo: "POST", id: "1", acao: "encerrar", token: GERAL() });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/fecha sozinha/);
    expect(rodou(/UPDATE Enquetes SET Status = 'ENCERRADA'/)).toHaveLength(0);
  });
  test("a enquete comum continua se encerrando à mão", async () => {
    monta({ criadoPor: 1 });
    quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 1);
    expect((await chamar({ metodo: "POST", id: "1", acao: "encerrar", token: GERAL() })).body.sucesso).toBe(true);
  });
});

describe("criar com data de fechamento (horário de Brasília)", () => {
  const corpo = (dataFechamentoPrevista) => ({ titulo: "Agendada", publicoTipo: "TODOS_ATIVOS", perguntas: [{ titulo: "Sim?", tipo: "OPCOES", opcoes: ["Sim", "Não"] }], dataFechamentoPrevista });
  const brasilia = (ms) => new Date(Date.now() + ms - 3 * 3600000).toISOString().slice(0, 16);
  beforeEach(() => {
    quando(/INSERT INTO Enquetes/, [{ EnqueteId: 50 }]);
    quando(/INSERT INTO PerguntasEnquete/, [{ PerguntaId: 500 }]);
    quando(/FROM Enquetes WHERE EnqueteId = @id/, [{ enqueteId: 50, titulo: "Agendada", visibilidade: "SECRETA", publicoTipo: "TODOS_ATIVOS", status: "ABERTA", criadoPor: 1 }]);
  });
  test("dia e hora de Brasília viram UTC (+3 h) no banco", async () => {
    const local = brasilia(2 * 86400000);
    const r = await chamar({ metodo: "POST", corpo: corpo(local), token: GERAL() });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO Enquetes/)[0];
    expect(ins.inputs.prevista).toBe(new Date(Date.parse(`${local}:00-03:00`)).toISOString().slice(0, 19));
    expect(ins.sql).toMatch(/CONVERT\(datetime2, @prevista, 126\)/);
  });
  test("sem data: a enquete não fecha sozinha (como antes)", async () => {
    await chamar({ metodo: "POST", corpo: corpo(undefined), token: GERAL() });
    expect(rodou(/INSERT INTO Enquetes/)[0].inputs.prevista).toBeNull();
  });
  test.each([["2027-02-30T10:00"], ["2027-12-01"], ["01/12/2027 10:00"], [12345], [["2027-12-01T10:00"]]])("data malformada %p: 400, nada gravado", async (v) => {
    expect((await chamar({ metodo: "POST", corpo: corpo(v), token: GERAL() })).status).toBe(400);
    expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
  });
  test("no passado, em menos de 5 minutos ou a mais de 1 ano: recusado", async () => {
    for (const ms of [-3600000, 60000, 400 * 86400000]) {
      const r = await chamar({ metodo: "POST", corpo: corpo(brasilia(ms)), token: GERAL() });
      expect(r.body.sucesso).toBe(false);
    }
    expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
  });
});

describe("Meu Painel → Votações (?paraVotar=1)", () => {
  const abertas = () => {
    quando(/FROM Enquetes WHERE Status = 'ABERTA' AND \(DataFechamentoPrevista IS NULL OR DataFechamentoPrevista > SYSUTCDATETIME\(\)\)/, [
      { enqueteId: 1, titulo: "Tema 2028", publicoTipo: "TODOS_ATIVOS", visibilidade: "SECRETA", dataFechamentoPrevista: FUTURO },
      { enqueteId: 2, titulo: "Departamento", publicoTipo: "LISTA_CUSTOM", visibilidade: "SECRETA", dataFechamentoPrevista: null },
      { enqueteId: 3, titulo: "Outra geral", publicoTipo: "TODOS_ATIVOS", visibilidade: "PUBLICA", dataFechamentoPrevista: null }]);
    quando(/FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem/, (i) => [{ perguntaId: i.id * 10, ordem: 1, titulo: "Qual?", tipo: "OPCOES" }]);
    quando(/FROM OpcoesEnquete WHERE PerguntaId = @id ORDER BY OpcaoId/, [{ opcaoId: 100, texto: "A" }, { opcaoId: 101, texto: "B" }]);
    quando(/SELECT 1 AS ok FROM PublicoEnqueteCustom/, []);
    quando(/AS apto/, [{ apto: 1 }]);
    quando(/SELECT TOP 1 CONVERT\(varchar\(33\), r\.DataResposta, 126\) AS em/, (i) => (i.enqueteId === 3 ? [{ em: "2026-10-01T10:00:00" }] : []));
    quando(/SELECT AnoAlvo FROM IdentidadeCiclos WHERE EnqueteId = @id/, (i) => (i.id === 1 ? [{ AnoAlvo: 2028 }] : []));
  };
  test("sem sessão: 401", async () => { expect((await chamar({ query: { paraVotar: "1" } })).status).toBe(401); });
  test("só as abertas do público da pessoa, sem contagem, dizendo se já respondeu; \"todos os ativos\" conferido uma vez", async () => {
    abertas();
    const r = await chamar({ query: { paraVotar: "1" }, token: tokenDe(20, { via: "PIN" }) });
    expect(r.status).toBe(200);
    expect(r.body.enquetes.map((e) => e.enqueteId)).toEqual([1, 3]);
    expect(r.body.enquetes[0]).toMatchObject({ identidadeVisual: 2028, jaRespondeu: false });
    expect(r.body.enquetes[1]).toMatchObject({ identidadeVisual: null, jaRespondeu: true });
    expect(JSON.stringify(r.body)).not.toMatch(/votos|participantes|criadoPor/);
    expect(rodou(/AS apto/)).toHaveLength(1);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  test("quem não está apto não vê as de todos os ativos", async () => {
    abertas();
    mockRegras = mockRegras.filter(([p]) => !p.test("AS apto")); quando(/AS apto/, [{ apto: 0 }]);
    const r = await chamar({ query: { paraVotar: "1" }, token: tokenDe(33, { via: "PIN" }) });
    expect(r.body.enquetes).toEqual([]);
  });
});

describe("encerrarEnquete e a rotina", () => {
  test("(revisão) FECHA PRIMEIRO e só então conta: o UPDATE de ENCERRADA vem antes da contagem; a vinculante conta só os votos de antes do instante", async () => {
    const pool = await require("../db").getPool();
    quando(/SELECT Vinculante AS vinculante, QuorumTipo AS quorumTipo FROM Enquetes/, [{ vinculante: true, quorumTipo: "MAIORIA_SIMPLES" }]);
    quando(/FROM OpcoesEnquete o WHERE o\.PerguntaId/, [{ OpcaoId: 1, votos: 6 }, { OpcaoId: 2, votos: 2 }]);
    quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 1);
    const r = await enquetes.encerrarEnquete(pool, 7, { agendada: true });
    expect(r).toEqual({ encerrada: true, resultadoAprovado: true });
    const ordem = mockConsultas.map((c) => (/UPDATE Enquetes SET Status = 'ENCERRADA'/.test(c.sql) ? "fecha" : /FROM OpcoesEnquete o WHERE o\.PerguntaId/.test(c.sql) ? "conta" : /SET ResultadoAprovado/.test(c.sql) ? "grava" : null)).filter(Boolean);
    expect(ordem).toEqual(["fecha", "conta", "grava"]);
    expect(rodou(/FROM OpcoesEnquete o WHERE o\.PerguntaId/)[0].sql).toMatch(/r\.DataResposta < e\.DataFechamentoPrevista/);
    expect(rodou(/UPDATE Enquetes SET Status = 'ENCERRADA'/)[0].inputs).toMatchObject({ agendada: 1 });
    expect(rodou(/UPDATE Enquetes SET ResultadoAprovado/)[0].sql).toMatch(/ResultadoAprovado IS NULL/);
  });
  test("outra chamada já fechou (ou a hora do banco ainda não chegou): encerrada=false, nada contado nem auditado", async () => {
    const pool = await require("../db").getPool();
    const { registrarAuditoria } = require("../auditoria");
    registrarAuditoria.mockClear();
    quando(/SELECT Vinculante AS vinculante/, [{ vinculante: true, quorumTipo: "MAIORIA_SIMPLES" }]);
    quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 0);
    expect(await enquetes.encerrarEnquete(pool, 7, { agendada: true })).toEqual({ encerrada: false, resultadoAprovado: null });
    expect(rodou(/FROM OpcoesEnquete o/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a rotina fecha as vencidas (menos as da Identidade Visual) e (revisão) deixa a trilha como o encerramento manual", async () => {
    const pool = await require("../db").getPool();
    const { registrarAuditoria } = require("../auditoria");
    registrarAuditoria.mockClear();
    quando(/SELECT e\.EnqueteId FROM Enquetes e WHERE e\.Status = 'ABERTA'/, [{ EnqueteId: 7 }, { EnqueteId: 8 }]);
    quando(/SELECT Vinculante AS vinculante/, [{ vinculante: false, quorumTipo: null }]);
    quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 1);
    expect(await enquetes.encerrarVencidas(pool)).toEqual({ encerradas: 2 });
    expect(rodou(/SELECT e\.EnqueteId FROM Enquetes e/)[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM IdentidadeCiclos c WHERE c\.EnqueteId = e\.EnqueteId\)/);
    expect(registrarAuditoria.mock.calls.map((c) => [c[0].tabela, c[0].registroId, c[0].acao, c[0].usuarioId])).toEqual([
      ["Enquetes", 7, "Encerrou enquete (fechamento agendado)", null], ["Enquetes", 8, "Encerrou enquete (fechamento agendado)", null]]);
  });
  test("a vinculante encerrada sem resultado gravado (caiu entre os passos) tem o resultado refeito na leitura", async () => {
    const pool = await require("../db").getPool();
    quando(/FROM OpcoesEnquete o WHERE o\.PerguntaId/, [{ OpcaoId: 1, votos: 1 }, { OpcaoId: 2, votos: 3 }]);
    const e = await enquetes.recuperarResultado(pool, { enqueteId: 9, vinculante: true, status: "ENCERRADA", resultadoAprovado: null, quorumTipo: "MAIORIA_SIMPLES" });
    expect(e.resultadoAprovado).toBe(true);
    expect(rodou(/UPDATE Enquetes SET ResultadoAprovado/)).toHaveLength(1);
    mockConsultas = [];
    await enquetes.recuperarResultado(pool, { enqueteId: 9, vinculante: true, status: "ENCERRADA", resultadoAprovado: false, quorumTipo: "MAIORIA_SIMPLES" });
    expect(mockConsultas).toHaveLength(0);
  });
});
