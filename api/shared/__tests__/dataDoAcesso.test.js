// A data do fim do acesso da liderança (Lideranca.AtivoAte) segue o calendário de Brasília, a mesma regra do login (sessaoLideranca.suspensa com
// hojeBrasilia) e das concessões da sessão (auth.concessaoVigente). Quem encerra o acesso "a partir de hoje" grava a VÉSPERA de Brasília; o login
// confere "AtivoAte < hoje de Brasília". O relógio aqui fica às 21h30 de Brasília (00h30 UTC do dia seguinte), a hora em que os dois calendários já
// mostram dias diferentes. O banco é simulado pelo texto da consulta (como em escopoFichas.test.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() {} async commit() {} async rollback() {} }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const { sql } = require("../db");
const vacancia = require("../vacancia");
const psc = require("../psc");
const hCautelares = require("../../GestaoMedidasCautelares/index.js");

const NOITE_DE_BRASILIA = new Date("2026-11-25T00:30:00Z");          // 24/11/2026, 21h30 em Brasília
const HOJE_BRASILIA = "2026-11-24";
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
// Só o relógio (Date) para; os temporizadores e as promessas seguem normais.
const pararRelogio = (agora) => jest.useFakeTimers({ now: agora, doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout", "queueMicrotask", "hrtime", "performance"] });

beforeEach(() => { mockRegras = []; mockConsultas = []; pararRelogio(NOITE_DE_BRASILIA); });
afterEach(() => { jest.useRealTimers(); });

// O fim do acesso: a gravação usa o dia de Brasília vindo do Node (@h) e grava a véspera dele; nada de data UTC do banco nessa conta.
function conferirFimDoAcesso(consulta) {
  expect(consulta).toBeDefined();
  expect(consulta.inputs.h).toBe(HOJE_BRASILIA);
  expect(consulta.sql).toMatch(/AtivoAte\s*=\s*DATEADD\(\s*day\s*,\s*-1\s*,\s*@h\s*\)/i);
  expect(consulta.sql).not.toMatch(/SYSUTCDATETIME|GETDATE|GETUTCDATE/i);
}

describe("medida cautelar com suspensão do acesso (Art. 45 §1º, I)", () => {
  const GERAL = () => auth.reassinarSessao({ membroId: 1, termosPendentes: [], via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] });
  async function aplicar(corpo) {
    const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await hCautelares(context, { method: "POST", query: {}, body: corpo, headers: { "x-auth-token": GERAL() } });
    return context.res;
  }
  test("à noite em Brasília, a suspensão grava a véspera de Brasília: vale já no dia de hoje", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20 }]);
    quando(/COUNT\(\*\) AS total\s+FROM Lideranca/, [{ total: 1 }]);
    quando(/INSERT INTO MedidasCautelares/, [{ MedidaId: 7 }]);
    quando(/FROM MedidasCautelares mc/, [{ medidaId: 7 }]);
    const r = await aplicar({ membroId: 20, motivo: "Auditoria do caixa", suspenderAcessoSistema: true });
    expect(r.status).toBe(201);
    conferirFimDoAcesso(rodou(/UPDATE Lideranca SET AtivoAte/)[0]);
  });
  test("a conferência de 'outro com a permissão de acesso ainda vigente' usa o mesmo dia de Brasília", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20 }]);
    quando(/SELECT 1 FROM Lideranca l JOIN Papeis p[\s\S]*permissoes/, [{ x: 1 }]);
    quando(/COUNT\(\*\) AS total\s+FROM Lideranca/, [{ total: 1 }]);
    quando(/INSERT INTO MedidasCautelares/, [{ MedidaId: 7 }]);
    quando(/FROM MedidasCautelares mc/, [{ medidaId: 7 }]);
    await aplicar({ membroId: 20, motivo: "Auditoria do caixa", suspenderAcessoSistema: true });
    const contagem = rodou(/COUNT\(\*\) AS total\s+FROM Lideranca/)[0];
    expect(contagem).toBeDefined();
    expect(contagem.inputs.hoje).toBe(HOJE_BRASILIA);
  });
});

describe("saída do rol de membros (vacância)", () => {
  test("à noite em Brasília, o acesso encerra na véspera de Brasília e só as linhas ainda vigentes no dia de Brasília mudam", async () => {
    await vacancia.encerrarVinculos({ request: () => new sql.Request() }, sql, 42, "DESLIGAMENTO");
    const fim = rodou(/UPDATE Lideranca SET AtivoAte/)[0];
    conferirFimDoAcesso(fim);
    expect(fim.sql).toMatch(/AtivoAte\s*>=\s*@h/);
  });
});

describe("congregação rebaixada a Extensão: a diretoria dissolvida", () => {
  test("à noite em Brasília, os mandatos locais encerram na véspera de Brasília", async () => {
    quando(/FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 4, Nome: "Vila Esperança", Ativa: true, Categoria: "CONGREGACAO", TutelaCongregacaoMaeId: null, PercentualRetencaoLocal: 40 }]);
    quando(/SELECT MembroId, Nome, Status, SituacaoMembro FROM MembroReferencia/, [{ MembroId: 9, Nome: "Fulano de Tal", Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO" }]);
    quando(/UPDATE Congregacoes SET Categoria = 'EXTENSAO_TENDA'/, [], 1);
    quando(/UPDATE Lideranca SET AtivoAte/, [{ MembroId: 31 }, { MembroId: 32 }], 2);
    quando(/UPDATE PscReclassificacoes SET Status = 'DECRETADA'/, [], 1);
    quando(/AS total/, [{ total: 0 }]);                                  // o saldo local (tesouraria): zero
    quando(/OUTPUT inserted\.SessaoId|FROM SessoesAtivas/, []);
    const r = await psc.decretarReclassificacao({ request: () => new sql.Request() }, {
      reclassificacao: { reclassificacaoId: 1, congregacaoId: 4, status: "PROPOSTA" },
      dados: { resolucao: "Res. CLI 1/2027", encarregadoMembroId: 9, congregacaoMaeId: null }, membroId: 1
    });
    expect(r.sucesso).toBe(true);
    const fim = rodou(/UPDATE Lideranca SET AtivoAte/)[0];
    conferirFimDoAcesso(fim);
    expect(fim.sql).toMatch(/AtivoAte\s*>=\s*@h/);
    // e a conferência de "o encarregado não é da diretoria que cai" olha o mesmo dia
    const naDiretoria = rodou(/SELECT TOP 1 LiderancaId FROM Lideranca/)[0];
    expect(naDiretoria.inputs.h).toBe(HOJE_BRASILIA);
    expect(naDiretoria.sql).not.toMatch(/SYSUTCDATETIME/);
  });
});

describe("o login confere com a mesma régua", () => {
  const { suspensa } = require("../sessaoLideranca");
  const { hojeBrasilia } = require("../dataBrasilia");
  test("às 21h30 de Brasília, o fim gravado na véspera de Brasília já é suspensão; o fim gravado hoje ainda vale até a meia-noite", () => {
    expect(hojeBrasilia()).toBe(HOJE_BRASILIA);
    expect(suspensa({ ativoAte: "2026-11-23" }, hojeBrasilia())).toBe(true);
    expect(suspensa({ ativoAte: "2026-11-24" }, hojeBrasilia())).toBe(false);
  });
});
