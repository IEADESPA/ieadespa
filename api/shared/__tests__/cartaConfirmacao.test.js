// A confirmação da Carta de Mudança pelo próprio membro (SolicitarCarta, confirmar=true). Regra do responsável ("A movimentação", 23/11/2026): o membro sai
// sozinho, pelo aplicativo, seja qual for o cargo; ninguém confirma por ele e não se prende membro. Quando quem confirma é a ÚLTIMA pessoa que administra os
// acessos (permissão "permissoes"), a confirmação vale do mesmo jeito, mas a Geral é avisada NA HORA (não no processamento, 30 dias depois, quando já não
// haveria quem concedesse acesso), e a trilha registra quem confirmou e o aviso. O banco é simulado pelo TEXTO da consulta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const novoRequest = () => {
    const inputs = {};
    const r = {
      input: (n, _t, v) => { inputs[n] = v; return r; },
      query: async (texto) => {
        mockConsultas.push({ sql: texto, inputs: { ...inputs } });
        for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
        return { recordset: [], rowsAffected: [0] };
      }
    };
    return r;
  };
  return { getPool: async () => ({ request: novoRequest }), sql: new Proxy({}, { get: () => () => undefined }) };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../directusContas", () => ({ garantirContaSite: jest.fn(async () => true) }));
jest.mock("../notificacoes", () => ({
  resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 900, email: "secretaria@exemplo.org" }, { membroId: 901, email: null }, { membroId: 10, email: "proprio@exemplo.org" }]),
  criarNotificacao: jest.fn(async (_p, d) => ({ criada: true, notificacaoId: 7000 + d.destinatarioMembroId }))
}));
jest.mock("../notificacaoMotor", () => ({ enviarCanaisNotificacao: jest.fn(async () => ({ emailEnviado: true, pushEnviados: 0 })) }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const notificacoes = require("../notificacoes");
const motor = require("../notificacaoMotor");
const hCarta = require("../../SolicitarCarta/index.js");

const sessaoDoMembro = (membroId = 10) => auth.reassinarSessao({ membroId, via: "PIN", permissoes: [], escopoCongregacoes: [], termosPendentes: [] });
async function confirmar(tipo = "MUDANCA", membroId = 10) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hCarta(context, { method: "POST", query: {}, body: { matricula: membroId, tipo, confirmar: true }, headers: { "x-auth-token": sessaoDoMembro(membroId) } });
  return context.res;
}
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
let situacao;

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  situacao = { TemCargoVigente: 1, AlvoAdministra: 1, Outros: 0 };
  registrarAuditoria.mockClear();
  notificacoes.resolverDestinatariosPorPermissao.mockClear();
  notificacoes.criarNotificacao.mockClear();
  motor.enviarCanaisNotificacao.mockClear();
  // a leitura da ficha traz também a situação no rol (a ficha em arrolamento não emite na hora; volta 10 do Membros, na mescla de 26/11/2026)
  quando(/SELECT MembroId, Nome, Email, SituacaoMembro FROM MembroReferencia/, [{ MembroId: 10, Nome: "Pastor de Teste", Email: "pastor@exemplo.org", SituacaoMembro: "EM_COMUNHAO" }]);
  quando(/SELECT TOP 1 CartaId, Status FROM CartasTransito/, [{ CartaId: 55, Status: "SOLICITADA" }]);
  quando(/AlvoAdministra/, () => [situacao]);
});
const trilha = () => registrarAuditoria.mock.calls.map((c) => c[0]).find((a) => /Confirmou solicitação de carta/.test(a.acao));

describe("a confirmação da Carta de Mudança pelo último que administra os acessos", () => {
  test("a confirmação vale (não se prende membro) e a Geral é avisada na hora, sem a própria pessoa", async () => {
    const r = await confirmar();
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE CartasTransito SET Status = 'CONFIRMADA'/)).toHaveLength(1);
    expect(notificacoes.resolverDestinatariosPorPermissao).toHaveBeenCalledWith(expect.anything(), { permissao: "pessoas", nivel: "GLOBAL" });
    const avisados = notificacoes.criarNotificacao.mock.calls.map((c) => c[1]);
    expect(avisados.map((a) => a.destinatarioMembroId)).toEqual([900, 901]);
    expect(avisados[0]).toMatchObject({ regraChave: "ACESSO_ULTIMO_ADMIN_SAINDO", referenciaTabela: "CartasTransito", referenciaId: 55 });
    expect(avisados[0].mensagem).toMatch(/permissoes/);
    expect(avisados[0].mensagem).not.toMatch(/Pastor de Teste/);   // o aviso não leva o nome (vai também por e-mail)
    expect(motor.enviarCanaisNotificacao).toHaveBeenCalledTimes(2);
    expect(motor.enviarCanaisNotificacao.mock.calls[0][1]).toMatchObject({ regraChave: "ACESSO_ULTIMO_ADMIN_SAINDO", destinatarioMembroId: 900, aguardarEntrega: false });
  });
  test("a trilha registra quem confirmou (a própria pessoa, pela sessão dela), que era a última que administra os acessos e quantos da Geral foram avisados", async () => {
    await confirmar();
    expect(trilha().usuarioId).toBe(10);
    expect(trilha().dadosDepois).toMatchObject({ confirmadoPor: 10, via: "PIN", ultimoAdministrador: true, avisoGeral: { avisados: 2 } });
  });
  test("a situação do cargo é lida antes de gravar a confirmação (o cargo ainda vigente)", async () => {
    await confirmar();
    const ordem = mockConsultas.map((c) => (/AlvoAdministra/.test(c.sql) ? "situacao" : /UPDATE CartasTransito SET Status = 'CONFIRMADA'/.test(c.sql) ? "confirma" : null)).filter(Boolean);
    expect(ordem).toEqual(["situacao", "confirma"]);
  });
  test("o aviso que falha não desfaz a confirmação: a trilha diz que falhou", async () => {
    notificacoes.criarNotificacao.mockImplementationOnce(async () => { throw new Error("falha simulada"); });
    const r = await confirmar();
    expect(r.body.sucesso).toBe(true);
    expect(trilha().dadosDepois).toMatchObject({ ultimoAdministrador: true, avisoGeral: { avisados: 1, falhas: 1 } });
  });
});

describe("as outras confirmações", () => {
  test("quem não é o último que administra os acessos: confirma sem aviso, e a trilha leva só quem confirmou", async () => {
    situacao = { TemCargoVigente: 1, AlvoAdministra: 1, Outros: 3 };
    const r = await confirmar();
    expect(r.body.sucesso).toBe(true);
    expect(notificacoes.criarNotificacao).not.toHaveBeenCalled();
    expect(trilha().dadosDepois).toMatchObject({ confirmadoPor: 10, via: "PIN" });
    expect(trilha().dadosDepois).not.toHaveProperty("ultimoAdministrador");
  });
  test("a confirmação de outra carta (não é desligamento): nem consulta a situação do cargo", async () => {
    const r = await confirmar("RECOMENDACAO");
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/AlvoAdministra/)).toHaveLength(0);
    expect(notificacoes.criarNotificacao).not.toHaveBeenCalled();
  });
});
