// Segunda leva de correções da revisão adversarial da v7.7 — o que se prende aqui (o banco é simulado pelo TEXTO da consulta; o comportamento contra o SQL Server de verdade
// está nos roteiros ponta a ponta em tools/e2e-localdb):
//  - trocas em sala com menores: quem é adulto só troca com outro adulto;
//  - a foto de menor sem a autorização vigente do responsável é apagada pela faxina (e só a de menor de 18 anos).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
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
jest.mock("../storage", () => ({ excluirFoto: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), listarRequisitos: jest.fn(async () => []) }));

const { getPool } = require("../db");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const db = require("../ministerioMenoresDb");
const mcDb = require("../menoresConsentimentoDb");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const HOJE = "2026-10-09";
let pool;
beforeEach(async () => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); pool = await getPool(); });

const pessoa = (id, nasc) => ({ MembroId: id, DataNascimento: new Date(nasc), DataAdmissao: new Date("2016-01-01"), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO" });

describe("troca em sala com menores: adulto só troca com adulto", () => {
  test("equipe sem a marca de menores: qualquer troca (uma única consulta)", async () => {
    quando(/SELECT ContatoComMenores FROM EscalasEquipes/, [{ ContatoComMenores: 0 }]);
    expect(await db.trocaPreservaAdultos(pool, { equipeId: 4, origemId: 1, destinoId: 2, hoje: HOJE })).toEqual({ ok: true });
    expect(mockConsultas).toHaveLength(1);
  });
  test("equipe com a marca: adulto → adolescente é recusado; adulto → adulto e adolescente → adulto passam", async () => {
    quando(/SELECT ContatoComMenores FROM EscalasEquipes/, [{ ContatoComMenores: 1 }]);
    const todos = [pessoa(1, "1985-03-01"), pessoa(2, "1990-05-05"), pessoa(3, "2010-02-02")];
    quando(/SELECT MembroId, DataNascimento, DataAdmissao, Status, SituacaoMembro FROM MembroReferencia/, (i) => todos.filter((p) => Object.values(i).includes(p.MembroId)));
    const recusa = await db.trocaPreservaAdultos(pool, { equipeId: 4, origemId: 1, destinoId: 3, hoje: HOJE });
    expect(recusa.ok).toBe(false);
    expect(recusa.mensagem).toMatch(/só troca com outro adulto/);
    expect(recusa.mensagem).not.toMatch(/restri|vistoria|certid|treinamento/i);          // nada do motivo de habilitação
    expect((await db.trocaPreservaAdultos(pool, { equipeId: 4, origemId: 1, destinoId: 2, hoje: HOJE })).ok).toBe(true);
    expect((await db.trocaPreservaAdultos(pool, { equipeId: 4, origemId: 3, destinoId: 1, hoje: HOJE })).ok).toBe(true);
  });
});

describe("a faxina das fotos de menor sem autorização do responsável", () => {
  const alvo = { MembroId: 30, FotoUrl: "https://armazem/fotos-membros/membro-30" };
  const BUSCA = /SELECT m\.MembroId, m\.FotoUrl FROM MembroReferencia m WHERE m\.FotoUrl IS NOT NULL/;
  const VIGENTE = /SELECT TOP 1 c\.Concedido/;
  test("só olha menor de 18 anos com foto (idade desconhecida não é menor) e apaga a que não tem consentimento vigente", async () => {
    quando(BUSCA, [alvo]);
    quando(VIGENTE, []);          // nenhuma linha de consentimento: não vigente
    const r = await mcDb.apagarFotosDeMenoresSemConsentimento(pool, { hoje: HOJE });
    expect(r.apagadas).toBe(1);
    expect(mockConsultas[0].sql).toMatch(/m\.DataNascimento IS NOT NULL AND m\.DataNascimento > DATEADD\(YEAR, -18, @hoje\)/);
    expect(mockConsultas.some((c) => /UPDATE MembroReferencia SET FotoUrl = NULL/.test(c.sql) && c.inputs.id === 30)).toBe(true);
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "MembroReferencia", registroId: 30 }));
  });
  test("a foto com a autorização vigente do responsável fica", async () => {
    quando(BUSCA, [alvo]);
    quando(VIGENTE, [{ Concedido: 1, DataNascimento: new Date("2015-04-04"), ResponsavelAtivo: 1 }]);
    const r = await mcDb.apagarFotosDeMenoresSemConsentimento(pool, { hoje: HOJE });
    expect(r.apagadas).toBe(0);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("o responsável que saiu: o consentimento dele deixa de valer e a foto é apagada; com menorId a busca se limita àquele menor", async () => {
    quando(BUSCA, [alvo]);
    quando(VIGENTE, [{ Concedido: 1, DataNascimento: new Date("2015-04-04"), ResponsavelAtivo: 0 }]);
    const r = await mcDb.apagarFotosDeMenoresSemConsentimento(pool, { menorId: 30, hoje: HOJE });
    expect(r.apagadas).toBe(1);
    expect(mockConsultas[0].sql).toMatch(/AND m\.MembroId = @m/);
    expect(mockConsultas[0].inputs.m).toBe(30);
  });
});
