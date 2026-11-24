// A2 (decisão dele de 24/11/2026, volta 5): a admissão no rol é quando a pessoa se torna membro. Quem se converteu na nossa igreja (o congregado, e quem
// está em arrolamento a completar) é admitido no BATISMO: a data de entrada passa a ser a data do batismo, também por cima de uma data anterior de
// congregado (a de antes fica na trilha). Quem já entrou por outro caminho (carta de mudança, aclamação, reconciliação) fica com a forma e a data dele.
// E o menor 6 do portão: a efetivação, a pendência do arrolamento, a trilha e o "BATIZADO" do candidato andam numa transação só.
const mockEventos = [];
const mockConsultas = [];
let mockResponder = () => [];
jest.mock("../db", () => {
  class Transaction { async begin() { mockEventos.push("begin"); } async commit() { mockEventos.push("commit"); } async rollback() { mockEventos.push("rollback"); } }
  function novaRequisicao(naTransacao) {
    const inputs = {};
    const req = {
      input: (nome, _tipo, valor) => { inputs[nome] = valor; return req; },
      query: async (texto) => {
        mockConsultas.push({ sql: texto, inputs: { ...inputs }, naTransacao });
        mockEventos.push(naTransacao ? "consulta-na-transacao" : "consulta");
        const r = mockResponder(texto, inputs);
        return { recordset: r, recordsets: [r], rowsAffected: [Array.isArray(r) ? r.length : 0] };
      }
    };
    return req;
  }
  class Request { constructor(t) { return novaRequisicao(!!t); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { sql, getPool: async () => ({}) };
});
const mockTrilha = [];
jest.mock("../auditoria", () => ({
  sha256: () => "x",
  registrarAuditoria: jest.fn(async () => true),
  registrarAuditoriaNaTransacao: jest.fn(async (t, registro) => { mockEventos.push("trilha-na-transacao"); mockTrilha.push(registro); })
}));

const batismo = require("../batismo");
const { registrarAuditoria } = require("../auditoria");
// o pool: as leituras de fora da transação (a turma e os aprovados)
const pool = { request: () => new (require("../db").sql.Request)() };

describe("A2: a data de entrada pelo batismo (a regra pura)", () => {
  const regra = batismo.entradaPeloBatismo;
  test.each([
    ["o congregado sem data", { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: null }, "BATISMO", "2026-10-03"],
    ["o congregado com uma data anterior (de quando chegou): a do batismo por cima", { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: "2006-03-01" }, "BATISMO", "2026-10-03"],
    ["em arrolamento a completar", { situacao: "ARROLAMENTO", formaAdmissao: null, dataAdmissao: null }, "BATISMO", "2026-10-03"],
    ["em arrolamento com a forma batismo e uma data que veio do sistema pago", { situacao: "ARROLAMENTO", formaAdmissao: "BATISMO", dataAdmissao: "2009-05-10" }, "BATISMO", "2026-10-03"],
    ["veio de outra igreja (carta de mudança, com a data da chegada): fica", { situacao: "EM_COMUNHAO", formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2015-02-01" }, "CARTA_MUDANCA", "2015-02-01"],
    ["veio de outra igreja por aclamação: fica", { situacao: "CONGREGADO", formaAdmissao: "ACLAMACAO", dataAdmissao: "2018-07-07" }, "ACLAMACAO", "2018-07-07"],
    ["voltou por reconciliação: fica", { situacao: "EM_COMUNHAO", formaAdmissao: "RECONCILIACAO", dataAdmissao: "2020-01-12" }, "RECONCILIACAO", "2020-01-12"],
    ["carta de mudança sem a data da chegada: a forma fica e a data continua vazia (a secretaria registra a chegada)", { situacao: "ARROLAMENTO", formaAdmissao: "CARTA_MUDANCA", dataAdmissao: null }, "CARTA_MUDANCA", null]
  ])("%s", (_nome, antes, forma, data) => {
    expect(regra(antes, "2026-10-03")).toEqual({ formaAdmissao: forma, dataAdmissao: data });
  });
});

describe("A2 e o menor 6: a efetivação da turma", () => {
  const FICHAS = {
    10: { SituacaoMembro: "ARROLAMENTO", FormaAdmissao: null, DataAdmissao: null },
    11: { SituacaoMembro: "CONGREGADO", FormaAdmissao: null, DataAdmissao: "2006-03-01" },
    12: { SituacaoMembro: "EM_COMUNHAO", FormaAdmissao: "CARTA_MUDANCA", DataAdmissao: "2015-02-01" }
  };
  beforeEach(() => {
    mockEventos.length = 0; mockConsultas.length = 0; mockTrilha.length = 0; registrarAuditoria.mockClear();
    mockResponder = (texto, inputs) => {
      if (/FROM TurmasBatismo/.test(texto)) return [{ DataBatismo: "2026-10-03" }];
      if (/FROM CandidatosBatismo/.test(texto)) return [{ CandidatoId: 1, MembroId: 10 }, { CandidatoId: 2, MembroId: 11 }, { CandidatoId: 3, MembroId: 12 }];
      if (/SELECT SituacaoMembro/.test(texto)) return [FICHAS[inputs.id]];
      if (/UPDATE FichasPendencias/.test(texto)) return [{ resolvidas: inputs.id === 10 ? 1 : 0 }];
      return [];
    };
  });

  test("cada candidato numa transação: lê a ficha com trava, grava a situação, a forma e a data de entrada, fecha a pendência, a trilha e o BATIZADO", async () => {
    expect(await batismo.efetivarTurma(pool, 5, 77)).toBe(3);
    // só os APROVADOS da turma (nunca os pendentes ou reprovados)
    expect(mockConsultas.find((c) => /FROM CandidatosBatismo/.test(c.sql)).sql).toMatch(/TurmaId = @turmaId AND Status = 'APROVADO'/);
    expect(mockEventos.filter((e) => e === "begin")).toHaveLength(3);
    expect(mockEventos.filter((e) => e === "commit")).toHaveLength(3);
    // tudo o que muda a ficha anda dentro da transação; fora dela só as duas leituras do começo (a turma e os aprovados)
    expect(mockEventos.filter((e) => e === "consulta")).toHaveLength(2);
    const leitura = mockConsultas.find((c) => /SELECT SituacaoMembro/.test(c.sql));
    expect(leitura.sql).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);
    const updates = mockConsultas.filter((c) => /UPDATE MembroReferencia/.test(c.sql));
    expect(updates.map((u) => [u.inputs.id, u.inputs.forma, u.inputs.dataAdmissao, u.inputs.dataBatismo])).toEqual([
      [10, "BATISMO", "2026-10-03", "2026-10-03"],
      [11, "BATISMO", "2026-10-03", "2026-10-03"],
      [12, "CARTA_MUDANCA", "2015-02-01", "2026-10-03"]
    ]);
    for (const u of updates) {
      expect(u.naTransacao).toBe(true);
      expect(u.sql).toMatch(/SituacaoMembro = 'EM_COMUNHAO'/);
      expect(u.sql).toMatch(/DataAdmissao = @dataAdmissao/);
      expect(u.sql).toMatch(/SET XACT_ABORT ON/);
    }
    // o candidato vira BATIZADO dentro da transação dele
    expect(mockConsultas.filter((c) => /UPDATE CandidatosBatismo SET Status = 'BATIZADO'/.test(c.sql)).every((c) => c.naTransacao)).toBe(true);
  });

  test("a trilha vai na transação, uma por candidato, com a forma e a data de antes (a data do congregado não se perde)", async () => {
    await batismo.efetivarTurma(pool, 5, 77);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(mockTrilha).toHaveLength(3);
    expect(mockTrilha[0]).toEqual(expect.objectContaining({ tabela: "MembroReferencia", registroId: 10, usuarioId: 77, acao: "O batismo completou o arrolamento" }));
    expect(mockTrilha[1]).toEqual(expect.objectContaining({ registroId: 11, acao: "O batismo admitiu o membro",
      dadosAntes: { situacaoMembro: "CONGREGADO", formaAdmissao: null, dataAdmissao: "2006-03-01" },
      dadosDepois: { situacaoMembro: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2026-10-03", turmaId: 5 } }));
    expect(mockTrilha[2]).toEqual(expect.objectContaining({ registroId: 12, dadosDepois: expect.objectContaining({ formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2015-02-01" }) }));
    // a ordem dentro da transação: a trilha antes do commit
    const i = mockEventos.indexOf("trilha-na-transacao");
    expect(i).toBeGreaterThan(mockEventos.indexOf("begin"));
    expect(i).toBeLessThan(mockEventos.indexOf("commit"));
  });

  test("a nota da pendência fechada pelo batismo diz que a data de entrada é a do batismo", async () => {
    await batismo.efetivarTurma(pool, 5, 77);
    const p = mockConsultas.find((c) => /UPDATE FichasPendencias/.test(c.sql));
    expect(p.sql).toMatch(/Resolucao = N'COMPLETADA'/);
    expect(p.sql).toMatch(/WHERE MembroId = @id AND Tipo = N'ARROLAMENTO' AND Situacao = N'ABERTA'/);
    expect(p.inputs.nota).toMatch(/data de entrada/);
    expect(p.inputs.nota).not.toMatch(/não muda/);
  });

  test("um erro no meio desfaz a transação daquele candidato (nada pela metade) e sobe", async () => {
    const antes = mockResponder;
    mockResponder = (texto, inputs) => { if (/UPDATE FichasPendencias/.test(texto) && inputs.id === 11) throw new Error("caiu"); return antes(texto, inputs); };
    await expect(batismo.efetivarTurma(pool, 5, 77)).rejects.toThrow("caiu");
    expect(mockEventos.filter((e) => e === "commit")).toHaveLength(1);
    expect(mockEventos).toContain("rollback");
  });
});
