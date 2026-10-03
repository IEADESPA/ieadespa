// Fecho dos itens em aberto (03/10/2026) — menor sem adesão ao Termo que VALHA (nunca dada, ou suspensa porque o último responsável ativo foi revogado)
// não é escalado nem aceita/confirma escala; adulto e quem não tem data de nascimento seguem como antes. Ver shared/adesaoMenor.js.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const { hojeBrasilia } = require("../dataBrasilia");
const adesaoMenor = require("../adesaoMenor");
const vol = require("../voluntariado");
const es = require("../escalas");
const hEsc = require("../../GestaoEscalas/index.js");

const HOJE = hojeBrasilia();
const nascidoHa = (anos) => { const [a, m, d] = HOJE.split("-").map(Number); return new Date(Date.UTC(a - anos, m - 1, d)); };
// Pessoas: 30 menor sem adesão; 31 menor com adesão suspensa; 32 menor com adesão que vale; 33 adulto sem adesão (a consulta nem o traz: só menores).
const LINHAS = {
  30: { MembroId: 30, DataNascimento: nascidoHa(14), AdesaoId: null, ResponsavelNome: null, SuspensaSemResponsavel: 0 },
  31: { MembroId: 31, DataNascimento: nascidoHa(15), AdesaoId: 7, ResponsavelNome: "Maria", SuspensaSemResponsavel: 1 },
  32: { MembroId: 32, DataNascimento: nascidoHa(16), AdesaoId: 8, ResponsavelNome: "José", SuspensaSemResponsavel: 0 }
};
const regraAdesao = () => mockRegras.push([/AS SuspensaSemResponsavel\s+FROM MembroReferencia m/, (i) => Object.keys(i).filter(k => /^m\d+$/.test(k)).map(k => LINHAS[i[k]]).filter(Boolean)]);
const token = (membroId) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], via: "PIN" });
async function chamar(acao, corpo, membroId) {
  const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hEsc(context, { method: "POST", query: {}, body: corpo, headers: { "x-auth-token": token(membroId) } });
  return context.res;
}

beforeEach(() => { mockRegras = []; mockConsultas = []; });

describe("menoresSemAdesaoVigente", () => {
  test("barra o menor sem adesão e o de adesão suspensa (com a mensagem certa); o de adesão que vale e o adulto passam", async () => {
    regraAdesao();
    const { getPool } = require("../db");
    const m = await adesaoMenor.menoresSemAdesaoVigente(await getPool(), [30, 31, 32, 33, 30], { hoje: HOJE });
    expect([...m.keys()].sort()).toEqual([30, 31]);
    expect(m.get(30)).toBe(adesaoMenor.MOTIVO_SEM_ADESAO);
    expect(m.get(31)).toBe(vol.MENSAGEM_ADESAO_SUSPENSA);
    const c = mockConsultas[0];
    expect(c.sql).toMatch(/m\.DataNascimento IS NOT NULL AND m\.DataNascimento > DATEADD\(YEAR, -18, @hoje\)/);   // só menores conhecidos
    expect(c.sql).toMatch(/rv\.RevogadoEm >= a\.AceitoEm/);                                                        // o cálculo da suspensão
    expect(Object.keys(c.inputs).filter(k => /^m\d+$/.test(k))).toHaveLength(4);                                 // sem repetidos
  });
  test("lista vazia não consulta o banco", async () => {
    const { getPool } = require("../db");
    expect((await adesaoMenor.menoresSemAdesaoVigente(await getPool(), [])).size).toBe(0);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o trecho de SQL da suspensão: só CLICK_RESP; revogação DEPOIS do aceite sem outro responsável ativo naquele instante", () => {
    const s = adesaoMenor.ADESAO_SUSPENSA_SQL("a");
    expect(s).toMatch(/a\.Forma = 'CLICK_RESP'/);
    expect(s).toMatch(/rc\.RegistradoEm <= rv\.RevogadoEm/);
    expect(s).toMatch(/rc\.RevogadoEm IS NULL OR rc\.RevogadoEm > rv\.RevogadoEm/);
  });
});

describe("escalas", () => {
  const alocacao = (membroId) => mockRegras.push([/FROM EscalasAlocacoes WHERE AlocacaoId = @id/, [{ alocacaoId: 50, servicoId: 9, equipeId: 3, membroId, status: "CONVIDADO", ordemConvite: 1 }]]);
  test.each([[30, /Menor de 18 anos sem adesão/], [31, /Adesão suspensa: sem responsável ativo/]])("menor %s NÃO aceita convite nem confirma (422) — e nada é gravado", async (membroId, msg) => {
    regraAdesao(); alocacao(membroId);
    const aceitar = await chamar("responder", { alocacaoId: 50, resposta: "ACEITO" }, membroId);
    expect(aceitar.status).toBe(422);
    expect(aceitar.body.mensagem).toMatch(msg);
    const confirmar = await chamar("confirmar", { alocacaoId: 50 }, membroId);
    expect(confirmar.status).toBe(422);
    expect(mockConsultas.filter(c => /UPDATE EscalasAlocacoes/.test(c.sql))).toHaveLength(0);
  });
  test("menor com adesão que vale aceita e confirma; recusar continua livre para quem não tem adesão", async () => {
    regraAdesao(); alocacao(32);
    expect((await chamar("responder", { alocacaoId: 50, resposta: "ACEITO" }, 32)).status).toBe(200);
    expect((await chamar("confirmar", { alocacaoId: 50 }, 32)).status).toBe(200);
    mockRegras = []; mockConsultas = [];
    regraAdesao(); alocacao(30);
    mockRegras.push([/FROM EscalasServicos WHERE ServicoId = @id/, [{ servicoId: 9, congregacaoId: 1, dataHora: new Date(), rodizioId: 4 }]]);
    expect((await chamar("responder", { alocacaoId: 50, resposta: "RECUSADO" }, 30)).status).toBe(200);
    expect(mockConsultas.some(c => /UPDATE EscalasAlocacoes SET Status = @status/.test(c.sql))).toBe(true);
  });
  test("a troca para um menor sem adesão que valha é recusada", async () => {
    regraAdesao(); alocacao(40);
    mockRegras.push([/FROM EscalasEquipeMembros WHERE EquipeId = @e AND MembroId = @m AND Ativo = 1/, [{ ok: 1 }]]);
    mockRegras.push([/FROM EscalasServicos WHERE ServicoId = @id/, [{ servicoId: 9, congregacaoId: 1, dataHora: new Date(Date.now() + 864e6) }]]);
    const r = await chamar("trocas", { alocacaoOrigemId: 50, membroDestinoId: 31 }, 40);
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/Adesão suspensa/);
    expect(mockConsultas.some(c => /INSERT INTO EscalasTrocas/.test(c.sql))).toBe(false);
  });
  test("o aviso de termo pendente e a Lista de Ouro (ADESAO_VIGENTE_SQL) também não contam a adesão suspensa", async () => {
    const vdb = require("../voluntariadoDb");
    const { getPool } = require("../db");
    await vdb.detectarTermosPendentes(await getPool(), { hoje: HOJE });
    expect(mockConsultas[0].sql).toMatch(/AND NOT \(a\.Forma = 'CLICK_RESP' AND EXISTS/);
  });
  test("habilitação: a etapa 'Termo assinado' só fecha com adesão que VALE (suspensa e 'renovar' recusam)", async () => {
    const vdb = require("../voluntariadoDb");
    const hv = require("../habilitacaoVoluntarios");
    const { getPool } = require("../db");
    const pool = await getPool();
    mockRegras.push([/SELECT \* FROM VoluntariosHabilitacao WHERE HabilitacaoId = @id/, [{ HabilitacaoId: 1, MembroId: 31, EtapaFichaInscricaoEm: new Date(), EtapaReferenciasEm: new Date(), EtapaEntrevistaEm: new Date(), EtapaAntecedentesEm: new Date(), EtapaTreinamentoEm: new Date() }]]);
    const espiao = jest.spyOn(vdb, "situacaoDoTermo");
    espiao.mockResolvedValueOnce({ adesao: { adesaoId: 7 }, aderiu: false, suspensa: true, mensagemSuspensa: vol.MENSAGEM_ADESAO_SUSPENSA });
    expect(await hv.concluirEtapa(pool, { habilitacaoId: 1, etapa: "TERMO", registradoPorMembroId: 5 })).toEqual({ sucesso: false, mensagem: vol.MENSAGEM_ADESAO_SUSPENSA });
    espiao.mockResolvedValueOnce({ adesao: { adesaoId: 7 }, aderiu: false, suspensa: false, renovar: true });
    expect((await hv.concluirEtapa(pool, { habilitacaoId: 1, etapa: "TERMO", registradoPorMembroId: 5 })).mensagem).toMatch(/já completou 18 anos/);
    expect(mockConsultas.some(c => /UPDATE VoluntariosHabilitacao/.test(c.sql))).toBe(false);
    espiao.mockResolvedValueOnce({ adesao: { adesaoId: 8 }, aderiu: true, suspensa: false });
    await hv.concluirEtapa(pool, { habilitacaoId: 1, etapa: "TERMO", registradoPorMembroId: 5 });
    expect(mockConsultas.some(c => /UPDATE VoluntariosHabilitacao/.test(c.sql))).toBe(true);
    espiao.mockRestore();
  });
  test("o auto-escalador e o convite em cadeia (buscarCandidatosDaEquipe) não trazem o menor sem adesão que valha", async () => {
    regraAdesao();
    mockRegras.push([/FROM EscalasEquipeMembros em\s+WHERE em\.EquipeId = @equipeId AND em\.Ativo = 1/, [{ membroId: 30, frequenciaPreferidaDias: 7 }, { membroId: 31, frequenciaPreferidaDias: 7 }, { membroId: 32, frequenciaPreferidaDias: 7 }, { membroId: 33, frequenciaPreferidaDias: 7 }]]);
    const { getPool } = require("../db");
    const candidatos = await es.buscarCandidatosDaEquipe(await getPool(), 3, new Date(Date.now() + 864e6));
    expect(candidatos.map(c => c.membroId)).toEqual([32, 33]);
  });
});
