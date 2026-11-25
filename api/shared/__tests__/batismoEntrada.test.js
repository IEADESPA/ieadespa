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
    ["carta de mudança sem a data da chegada: a forma fica e a data continua vazia (a secretaria registra a chegada)", { situacao: "ARROLAMENTO", formaAdmissao: "CARTA_MUDANCA", dataAdmissao: null }, "CARTA_MUDANCA", null],
    // menor 4 do portão da volta 5: quem JÁ é membro (em comunhão ou sem comunhão) com a data de entrada não perde a data (nem os 90 dias)
    ["já é membro em comunhão, com a forma em branco e a data de entrada: a forma e a data ficam", { situacao: "EM_COMUNHAO", formaAdmissao: null, dataAdmissao: "2015-01-01" }, null, "2015-01-01"],
    ["já é membro com a forma batismo e a data de entrada (batizado de novo): ficam", { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2012-04-04" }, "BATISMO", "2012-04-04"],
    ["membro sem comunhão com a data de entrada: fica", { situacao: "SEM_COMUNHAO", formaAdmissao: null, dataAdmissao: "2011-06-30" }, null, "2011-06-30"],
    // não decidido (pergunta aberta da volta 6): o membro sem data nenhuma continua como antes (o batismo e a data dele)
    ["já é membro sem data de entrada nenhuma: como antes (a forma batismo e a data do batismo)", { situacao: "EM_COMUNHAO", formaAdmissao: null, dataAdmissao: null }, "BATISMO", "2026-10-03"]
  ])("%s", (_nome, antes, forma, data) => {
    expect(regra(antes, "2026-10-03")).toEqual({ formaAdmissao: forma, dataAdmissao: data });
  });
});

// As duas datas (resposta dele de 25/11/2026, volta 6): a admissão é a do batismo; a data de antes do congregado (desde quando é congregado) fica como a
// data da CONVERSÃO, só para a caminhada (a ficha 360 lê o marco CONVERSAO), sem contar para o rol nem para o voto. Só do congregado: a data que veio do
// sistema pago para quem está em arrolamento tem sentido desconhecido (pergunta aberta). Nunca por cima de uma conversão já registrada.
describe("as duas datas: a data de antes do congregado vira a data da conversão (a regra pura)", () => {
  const regra = batismo.conversaoPeloBatismo;
  test.each([
    ["o congregado com a data de quando chegou (2006), batizado em 2026: a conversão é 2006", { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: "2006-03-01" }, "2006-03-01"],
    ["o congregado sem data: nada", { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: null }, null],
    ["o congregado com a data igual à do batismo: nada (não houve troca)", { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: "2026-10-03" }, null],
    ["em arrolamento com uma data do sistema pago: nada (o sentido dela é desconhecido)", { situacao: "ARROLAMENTO", formaAdmissao: "BATISMO", dataAdmissao: "2009-05-10" }, null],
    ["o congregado que veio por aclamação (a data fica como entrada): nada", { situacao: "CONGREGADO", formaAdmissao: "ACLAMACAO", dataAdmissao: "2018-07-07" }, null],
    ["quem já é membro (a data fica como entrada): nada", { situacao: "EM_COMUNHAO", formaAdmissao: null, dataAdmissao: "2015-01-01" }, null]
  ])("%s", (_nome, antes, data) => {
    expect(regra(antes, batismo.entradaPeloBatismo(antes, "2026-10-03"), "2026-10-03", "2026-11-25")).toBe(data);
  });
  // menor 2 do portão da volta 7: a conversão (desde quando é congregado) vem antes do batismo e nunca no futuro (o dia de Brasília). A data errada da ficha
  // não vira conversão: a regra devolve nada (o batismo segue; a data de antes fica na trilha)
  test.each([
    ["a data de antes DEPOIS do batismo (10/11, batismo em 03/10): nada", "2026-11-10", "2026-10-03", "2026-11-25", null],
    ["a data de antes no futuro (2031): nada", "2031-01-01", "2026-10-03", "2026-11-25", null],
    ["a turma lançada com data futura e a data de antes também no futuro (antes do batismo, mas depois de hoje): nada", "2026-12-01", "2026-12-20", "2026-11-25", null],
    ["a data de antes de hoje mesmo, com o batismo depois: vale", "2026-11-25", "2026-12-20", "2026-11-25", "2026-11-25"],
    ["a véspera do batismo: vale", "2026-10-02", "2026-10-03", "2026-11-25", "2026-10-02"],
    ["sem a data do batismo, não há como conferir: nada", "2006-03-01", null, "2026-11-25", null]
  ])("%s", (_nome, dataAntes, dataBatismo, hoje, esperado) => {
    const antes = { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: dataAntes };
    expect(regra(antes, batismo.entradaPeloBatismo(antes, dataBatismo || "2026-10-03"), dataBatismo, hoje)).toBe(esperado);
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
      if (/INSERT INTO MarcosMembro/.test(texto)) return [{ gravado: 1 }];
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
      dadosDepois: { situacaoMembro: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2026-10-03", turmaId: 5, conversao: "2006-03-01" } }));
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

  // a nota diz o que aconteceu de verdade com aquela ficha: quem entrou por outro caminho (carta, aclamação, reconciliação) fica com a forma e a data dele, e a
  // nota não pode dizer "a forma batismo e a data igual à do batismo" (o conselheiro, na volta 5)
  test("a nota de cada pendência diz a forma e a data que ficaram (a do batismo ou a de antes)", async () => {
    await batismo.efetivarTurma(pool, 5, 77);
    const notas = mockConsultas.filter((c) => /UPDATE FichasPendencias/.test(c.sql)).map((c) => [c.inputs.id, c.inputs.nota]);
    expect(notas[0]).toEqual([10, "Completada pelo batismo: em comunhão, a forma batismo e a data de entrada igual à do batismo."]);
    expect(notas[2]).toEqual([12, "Completada pelo batismo: em comunhão; a forma de entrada (carta de mudança) e a data de entrada de antes ficam."]);
  });
  test("as duas datas: a conversão do congregado entra na transação dele, como marco CONVERSAO, só se ainda não houver um (com trava)", async () => {
    await batismo.efetivarTurma(pool, 5, 77);
    const marcos = mockConsultas.filter((c) => /INSERT INTO MarcosMembro/.test(c.sql));
    expect(marcos.map((c) => [c.inputs.id, c.inputs.data])).toEqual([[11, "2006-03-01"]]);
    const m = marcos[0];
    expect(m.naTransacao).toBe(true);
    expect(m.sql).toMatch(/SET XACT_ABORT ON/);
    expect(m.sql).toMatch(/SELECT @id, N'CONVERSAO', @descricao, @data, 0, @por/);
    expect(m.sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM MarcosMembro WITH \(UPDLOCK, HOLDLOCK\) WHERE MembroId = @id AND Tipo = N'CONVERSAO'\)/);
    expect(m.inputs.por).toBe(77);
    expect(m.inputs.descricao).toMatch(/congregado desde/i);
    // a trilha do arrolamento (10) e a da carta (12) não levam conversão
    expect(mockTrilha[0].dadosDepois.conversao).toBeUndefined();
    expect(mockTrilha[2].dadosDepois.conversao).toBeUndefined();
  });
  test("menor 2 do portão v7: a data de antes depois do batismo, ou no futuro, não vira conversão (o batismo segue, a data fica na trilha)", async () => {
    FICHAS[14] = { SituacaoMembro: "CONGREGADO", FormaAdmissao: null, DataAdmissao: "2026-11-10" };   // depois do batismo de 03/10/2026
    FICHAS[15] = { SituacaoMembro: "CONGREGADO", FormaAdmissao: null, DataAdmissao: "2099-01-01" };   // antes da turma de 2099, mas no futuro
    const antes = mockResponder;
    let turma = "2026-10-03", candidato = 14;
    mockResponder = (texto, inputs) => (/FROM TurmasBatismo/.test(texto) ? [{ DataBatismo: turma }]
      : /FROM CandidatosBatismo/.test(texto) ? [{ CandidatoId: candidato, MembroId: candidato }] : antes(texto, inputs));
    try {
      expect(await batismo.efetivarTurma(pool, 5, 77)).toBe(1);
      turma = "2099-12-20"; candidato = 15;
      expect(await batismo.efetivarTurma(pool, 5, 77)).toBe(1);
      expect(mockConsultas.filter((c) => /INSERT INTO MarcosMembro/.test(c.sql))).toHaveLength(0);
      // a ficha vira membro mesmo assim, e a data de antes fica na trilha
      expect(mockConsultas.filter((c) => /UPDATE MembroReferencia/.test(c.sql)).map((c) => c.inputs.id)).toEqual([14, 15]);
      expect(mockTrilha.map((t) => t.dadosAntes.dataAdmissao)).toEqual(["2026-11-10", "2099-01-01"]);
      expect(mockTrilha.every((t) => t.dadosDepois.conversao === undefined)).toBe(true);
    } finally {
      delete FICHAS[14]; delete FICHAS[15];
    }
  });
  test("menor 4: quem já era membro e é batizado fica com a data de entrada; a trilha não diz que o batismo o admitiu", async () => {
    FICHAS[13] = { SituacaoMembro: "EM_COMUNHAO", FormaAdmissao: null, DataAdmissao: "2015-01-01" };
    const antes = mockResponder;
    mockResponder = (texto, inputs) => (/FROM CandidatosBatismo/.test(texto) ? [{ CandidatoId: 4, MembroId: 13 }] : antes(texto, inputs));
    try {
      expect(await batismo.efetivarTurma(pool, 5, 77)).toBe(1);
      const u = mockConsultas.find((c) => /UPDATE MembroReferencia/.test(c.sql));
      expect([u.inputs.forma, u.inputs.dataAdmissao, u.inputs.dataBatismo]).toEqual([null, "2015-01-01", "2026-10-03"]);
      expect(mockTrilha[0]).toEqual(expect.objectContaining({ registroId: 13, acao: "O batismo foi registrado na ficha de quem já era membro",
        dadosDepois: { situacaoMembro: "EM_COMUNHAO", formaAdmissao: null, dataAdmissao: "2015-01-01", turmaId: 5 } }));
      // a nota (se houvesse a pendência) não pode dizer "a data de entrada igual à do batismo"
      expect(mockConsultas.find((c) => /UPDATE FichasPendencias/.test(c.sql)).inputs.nota).not.toMatch(/igual à do batismo/);
    } finally {
      delete FICHAS[13];
    }
  });
  test("a nota pura: quem ficou com a data de antes (sem forma de outro caminho) não lê 'igual à do batismo'", () => {
    expect(batismo.notaDoBatismo({ formaAdmissao: null, dataAdmissao: "2015-01-01" }, "2026-10-03")).toBe("Completada pelo batismo: em comunhão; a data de entrada de antes fica.");
    expect(batismo.notaDoBatismo({ formaAdmissao: "BATISMO", dataAdmissao: "2012-04-04" }, "2026-10-03")).toBe("Completada pelo batismo: em comunhão; a forma de entrada (batismo) e a data de entrada de antes ficam.");
    expect(batismo.notaDoBatismo({ formaAdmissao: "BATISMO", dataAdmissao: "2026-10-03" }, "2026-10-03")).toBe("Completada pelo batismo: em comunhão, a forma batismo e a data de entrada igual à do batismo.");
  });
  test("a nota pura: cada forma de outro caminho com o nome dela; sem data de entrada, a nota avisa que a data está em branco", () => {
    expect(batismo.notaDoBatismo({ formaAdmissao: "BATISMO", dataAdmissao: "2026-10-03" })).toBe("Completada pelo batismo: em comunhão, a forma batismo e a data de entrada igual à do batismo.");
    expect(batismo.notaDoBatismo({ formaAdmissao: "ACLAMACAO", dataAdmissao: "2019-05-04" })).toBe("Completada pelo batismo: em comunhão; a forma de entrada (aclamação) e a data de entrada de antes ficam.");
    expect(batismo.notaDoBatismo({ formaAdmissao: "RECONCILIACAO", dataAdmissao: "2021-01-10" })).toBe("Completada pelo batismo: em comunhão; a forma de entrada (reconciliação) e a data de entrada de antes ficam.");
    expect(batismo.notaDoBatismo({ formaAdmissao: "CARTA_MUDANCA", dataAdmissao: null })).toBe("Completada pelo batismo: em comunhão; a forma de entrada (carta de mudança) fica, e a data de entrada está em branco: registre na ficha a data de entrada.");
  });

  test("um erro no meio desfaz a transação daquele candidato (nada pela metade) e sobe", async () => {
    const antes = mockResponder;
    mockResponder = (texto, inputs) => { if (/UPDATE FichasPendencias/.test(texto) && inputs.id === 11) throw new Error("caiu"); return antes(texto, inputs); };
    await expect(batismo.efetivarTurma(pool, 5, 77)).rejects.toThrow("caiu");
    expect(mockEventos.filter((e) => e === "commit")).toHaveLength(1);
    expect(mockEventos).toContain("rollback");
  });
});
