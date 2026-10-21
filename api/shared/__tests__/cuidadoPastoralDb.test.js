// A camada de banco do cuidado pastoral (v7.11) com o banco SIMULADO pelo texto da consulta: a marca de purga das notas é sempre desligada (mesmo quando o DELETE falha), a
// exclusão LGPD roda inteira dentro da transação de quem a chama, o aviso de risco vai a toda a liderança do território menos a própria pessoa e nunca leva o texto, e o aviso de
// degrau não chega à pessoa acompanhada. O comportamento completo contra o SQL Server está em tools/e2e-localdb (e2e-23 a e2e-26).
let mockRegras = [];
let mockConsultas = [];
let mockEventos = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs, tx) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, tx });
    for (const [padrao, valor] of mockRegras) {
      if (padrao.test(texto)) {
        const rs = typeof valor === "function" ? valor(inputs) : valor;
        if (rs instanceof Error) throw rs;
        return { recordset: rs, rowsAffected: [1] };
      }
    }
    return { recordset: [], rowsAffected: [0] };
  };
  const novaRequisicao = (tx) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs, tx) }; return r; };
  class Transaction { async begin() { mockEventos.push("begin"); } async commit() { mockEventos.push("commit"); } async rollback() { mockEventos.push("rollback"); } }
  class Request { constructor(t) { return novaRequisicao(!!t); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: () => novaRequisicao(false) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ notificarAgora: jest.fn(async () => ({ criadas: 2, externas: 0 })), lerPrazoDias: jest.fn(async (_p, _s, padrao) => padrao) }));
jest.mock("../escopo", () => ({ ancestraisTerritoriais: jest.fn(async () => ({ congregacaoId: 1, areaId: 10, regiaoId: 20 })) }));
jest.mock("../financeiroSeguro", () => ({ obterTrava: jest.fn(async () => true) }));

const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const db = require("../cuidadoPastoralDb");
const { getPool } = require("../db");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const marcas = () => mockConsultas.filter((c) => /sp_set_session_context/.test(c.sql)).map((c) => (/@value = 1/.test(c.sql) ? "liga" : "desliga"));
const TERRITORIO = [
  { EscopoTipo: "CONGREGACAO", membroId: 3001, nome: "Dirigente", email: "d@x", CargoMinisterial: "PRESBITERO" },
  { EscopoTipo: "AREA", membroId: 3003, nome: "Pastor de Área", email: "a@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "REGIAO", membroId: 8001, nome: "Superintendente", email: "s@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "GLOBAL", membroId: 1, nome: "Presidente", email: "p@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "GLOBAL", membroId: 77, nome: "Membro que é da Diretoria", email: "m@x", CargoMinisterial: "MEMBRO" }
];
beforeEach(() => { mockRegras = []; mockConsultas = []; mockEventos = []; jest.clearAllMocks(); db.limparCaches(); });

describe("a marca de purga das notas", () => {
  test("a regra dos 30 dias liga a marca, apaga leituras e notas DENTRO da transação, desliga a marca e confirma", async () => {
    quando(/DELETE FROM NotasPastorais WHERE/, [{ n: 3 }]);
    const n = await db.apagarNotasDeQuemSaiu(await getPool());
    expect(n).toBe(3);
    expect(marcas()).toEqual(["liga", "desliga"]);
    const escritas = mockConsultas.filter((c) => /sp_set_session_context|DELETE/.test(c.sql));
    expect(escritas.every((c) => c.tx === true)).toBe(true);
    expect(escritas.map((c) => (/Leituras/.test(c.sql) ? "leituras" : /DELETE/.test(c.sql) ? "notas" : "marca"))).toEqual(["marca", "leituras", "notas", "marca"]);
    expect(mockEventos).toEqual(["begin", "commit"]);
    const del = mockConsultas.find((c) => /DELETE FROM NotasPastorais WHERE/.test(c.sql));
    expect(del.sql).toMatch(/m\.Status <> 'ATIVO' AND ISNULL\(m\.DataSaida, '19000101'\) <= @lim/);
  });
  test("se o DELETE falha, a marca é DESLIGADA mesmo assim e a transação é desfeita", async () => {
    quando(/DELETE FROM NotasPastorais WHERE/, new Error("gatilho"));
    await expect(db.apagarNotasDeQuemSaiu(await getPool())).rejects.toThrow("gatilho");
    expect(marcas()).toEqual(["liga", "desliga"]);
    expect(mockEventos).toEqual(["begin", "rollback"]);
  });
});

describe("a exclusão LGPD", () => {
  test("tudo pela requisição da transação de quem chama: notas apagadas com a marca, itens encerrados e anonimizados, pedidos anonimizados", async () => {
    quando(/SELECT ItemId FROM CuidadoItens WHERE MembroId = @m AND Status = 'ABERTO'/, [{ ItemId: 41 }]);
    quando(/DELETE FROM NotasPastorais WHERE MembroId = @m/, [{ n: 2 }]);
    quando(/UPDATE CuidadoItens SET MembroId = NULL/, [{ n: 1 }]);
    quando(/UPDATE PedidosOracao SET Texto = NULL/, [{ n: 4 }]);
    quando(/INSERT INTO CuidadoEventos/, [{ id: 900 }]);
    const { sql } = require("../db");
    const tx = new sql.Transaction();
    const r = () => new sql.Request(tx);
    expect(await db.exclusaoLgpd(r, 30)).toEqual({ notas: 2, itens: 1, pedidos: 4 });
    expect(mockConsultas.every((c) => c.tx === true)).toBe(true);
    expect(marcas()).toEqual(["liga", "desliga"]);
    expect(mockConsultas.some((c) => /UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'OUTRO'/.test(c.sql) && c.inputs.i === 41)).toBe(true);
    const pedidos = mockConsultas.find((c) => /UPDATE PedidosOracao/.test(c.sql));
    expect(pedidos.sql).toMatch(/SolicitanteMembroId = NULL, RegistradoPorMembroId = NULL, SolicitanteNome = NULL, SolicitanteContato = NULL, TextoBoletim = NULL/);
    expect(mockEventos).toEqual([]);           // quem confirma é a exclusão (ExecutarExclusaoLGPD), não esta função
  });
  test("sem nada do cuidado pastoral, segue com zeros", async () => {
    const { sql } = require("../db");
    expect(await db.exclusaoLgpd(() => new sql.Request(new sql.Transaction()), 30)).toEqual({ notas: 0, itens: 0, pedidos: 0 });
  });
});

describe("o aviso de risco", () => {
  test("pedido com risco: item urgente e aviso a TODA a liderança do território menos a própria pessoa, sem o texto", async () => {
    quando(/SELECT m\.MembroId, m\.Nome, m\.Email, m\.Telefone, m\.Status/, [{ MembroId: 3003, Nome: "Pastor de Área", Status: "ATIVO", CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT COUNT\(\*\) AS n FROM PedidosOracao/, [{ n: 0 }]);
    quando(/INSERT INTO PedidosOracao/, [{ id: 5 }]);
    quando(/SELECT TOP 1 m\.MembroId AS membroId, m\.Nome AS nome, m\.Email AS email FROM Lideranca/, [{ membroId: 3001, nome: "Dirigente", email: "d@x" }]);
    quando(/INSERT INTO CuidadoItens/, [{ id: 60 }]);
    quando(/INSERT INTO CuidadoEventos/, [{ id: 700 }]);
    quando(/SELECT DISTINCT l\.EscopoTipo/, TERRITORIO);
    const r = await db.pedirOracao(await getPool(), { membroId: 3003, dados: { categoria: "OUTRO", texto: "não aguento mais viver segredo", podeBoletim: true } });
    expect(r).toMatchObject({ sucesso: true, risco: true, avisada: false, itemId: 60 });
    expect(r.ajuda.map((c) => c.numero)).toEqual(["188", "190", "180", "100"]);
    expect(r.mensagem).toMatch(/Não conseguimos avisar/);
    const aviso = notificarAgora.mock.calls.find((c) => c[1].regraChave === "CUIDADO_RISCO")[1];
    expect(aviso.destinatarios.map((d) => d.membroId).sort((a, b) => a - b)).toEqual([1, 77, 3001, 8001]);
    expect(aviso.mensagem).not.toMatch(/segredo|aguento/);
    expect(aviso.aguardarEntrega).toBe(false);
    const ins = mockConsultas.find((c) => /INSERT INTO CuidadoItens/.test(c.sql));
    expect(ins.inputs.u).toBe(1);
    expect(ins.inputs.mo).not.toMatch(/segredo/);
    expect(ins.inputs.r).toBe(3001);
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/segredo|risco/i);
  });
});

describe("o aviso de degrau", () => {
  test("vai a quem está no degrau novo, nunca à pessoa acompanhada", async () => {
    quando(/WHERE e\.Tipo IN \('ESCALONADO', 'LEMBRETE_GERAL'\)/, [{ EventoId: 9, NivelPara: "AREA", ItemId: 3, CongregacaoId: 1, MembroId: 3003, CongregacaoNome: "Central" },
      { EventoId: 10, NivelPara: "GERAL", ItemId: 4, CongregacaoId: 1, MembroId: null, CongregacaoNome: "Central" }]);
    quando(/SELECT DISTINCT l\.EscopoTipo/, TERRITORIO);
    const fatos = await db.detectarDegraus(await getPool());
    expect(fatos.map((f) => f.referenciaId)).toEqual([10]);           // o item 3 é SOBRE o Pastor de Área, o único do degrau: ninguém recebe
    expect(fatos[0].destinatarios.map((d) => d.membroId).sort((a, b) => a - b)).toEqual([1, 77]);
  });
});
