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
// A marca de purga vai num lote só: liga, apaga, desliga — e desliga também no CATCH, antes do THROW (a conexão nunca volta ao pool com a marca ligada).
const lotesDePurga = () => mockConsultas.filter((c) => /sp_set_session_context/.test(c.sql));
function conferirLote(c) {
  expect(c.sql).toMatch(/BEGIN TRY\s+EXEC sp_set_session_context @key = N'cuidado_purga', @value = 1;[\s\S]*DELETE[\s\S]*EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL;\s+END TRY\s+BEGIN CATCH\s+EXEC sp_set_session_context @key = N'cuidado_purga', @value = NULL;\s+THROW;\s+END CATCH;/);
  expect(c.tx).toBe(true);
}
const TERRITORIO = [
  { EscopoTipo: "CONGREGACAO", membroId: 3001, nome: "Dirigente", email: "d@x", CargoMinisterial: "PRESBITERO" },
  { EscopoTipo: "AREA", membroId: 3003, nome: "Pastor de Área", email: "a@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "REGIAO", membroId: 8001, nome: "Superintendente", email: "s@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "GLOBAL", membroId: 1, nome: "Presidente", email: "p@x", CargoMinisterial: "PASTOR" },
  { EscopoTipo: "GLOBAL", membroId: 77, nome: "Membro que é da Diretoria", email: "m@x", CargoMinisterial: "MEMBRO" }
];
beforeEach(() => { mockRegras = []; mockConsultas = []; mockEventos = []; jest.clearAllMocks(); db.limparCaches(); });

describe("a marca de purga das notas", () => {
  test("a regra dos 30 dias: um lote só dentro da transação, só de quem foi DESLIGADO com data de saída (licença não conta)", async () => {
    quando(/cuidado_purga/, [{ n: 3 }]);
    const n = await db.apagarNotasDeQuemSaiu(await getPool());
    expect(n).toBe(3);
    expect(lotesDePurga()).toHaveLength(1);
    conferirLote(lotesDePurga()[0]);
    expect(lotesDePurga()[0].sql).toMatch(/DELETE FROM NotasPastoraisLeituras[\s\S]*DELETE FROM NotasPastorais WHERE/);
    expect(lotesDePurga()[0].sql).toMatch(/m\.Status = 'DESLIGADO' AND m\.DataSaida IS NOT NULL AND m\.DataSaida <= @lim/);
    expect(lotesDePurga()[0].sql).not.toMatch(/ISNULL\(m\.DataSaida/);
    expect(mockEventos).toEqual(["begin", "commit"]);
  });
  test("se o lote falha, a transação é desfeita (e o próprio lote já desligou a marca no CATCH)", async () => {
    quando(/cuidado_purga/, new Error("gatilho"));
    await expect(db.apagarNotasDeQuemSaiu(await getPool())).rejects.toThrow("gatilho");
    expect(mockEventos).toEqual(["begin", "rollback"]);
  });
});

describe("a exclusão LGPD", () => {
  test("tudo pela requisição da transação de quem chama: notas apagadas com a marca, itens encerrados e anonimizados, pedidos anonimizados", async () => {
    quando(/SELECT ItemId FROM CuidadoItens WHERE MembroId = @m AND Status = 'ABERTO'/, [{ ItemId: 41 }]);
    quando(/cuidado_purga/, [{ n: 2 }]);
    quando(/UPDATE CuidadoItens SET MembroId = NULL/, [{ n: 1 }]);
    quando(/UPDATE PedidosOracao SET Texto = NULL/, [{ n: 4 }]);
    quando(/INSERT INTO CuidadoEventos/, [{ id: 900 }]);
    const { sql } = require("../db");
    const tx = new sql.Transaction();
    const r = () => new sql.Request(tx);
    expect(await db.exclusaoLgpd(r, 30)).toEqual({ notas: 2, itens: 1, pedidos: 4 });
    expect(mockConsultas.every((c) => c.tx === true)).toBe(true);
    expect(lotesDePurga()).toHaveLength(1);
    conferirLote(lotesDePurga()[0]);
    expect(mockConsultas.some((c) => /UPDATE CuidadoItens SET Status = 'CONCLUIDO', Desfecho = 'OUTRO'/.test(c.sql) && c.inputs.i === 41)).toBe(true);
    // (revisão) a anonimização não deixa matrícula: nem quem criou o item (o próprio titular, no pedido dele) nem quem agiu no histórico
    expect(mockConsultas.find((c) => /UPDATE CuidadoItens SET MembroId = NULL/.test(c.sql)).sql).toMatch(/CriadoPorMembroId = NULL/);
    expect(mockConsultas.find((c) => /UPDATE CuidadoEventos SET Observacao = NULL/.test(c.sql)).sql).toMatch(/MembroId = NULL, ResponsavelMembroId = NULL/);
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

describe("(revisão) quem acessa o item", () => {
  const ver = (over = {}) => ({ membroId: 9, gestao: true, geral: false, podeVerCongregacao: (n) => n === "Central", ...over });
  const item = (over = {}) => ({ ItemId: 1, MembroId: 50, CongregacaoId: 1, CongregacaoNome: "Central", MembroStatus: "ATIVO", MembroCongregacaoId: 1, MembroCongregacaoNome: "Central",
    Status: "ABERTO", ResponsavelMembroId: 7, SoNivelGeral: false, ...over });
  test("a liderança do território; nunca a pessoa acompanhada", () => {
    expect(db.acessoAoItem(ver(), item())).toBe("GESTAO");
    expect(db.acessoAoItem(ver({ membroId: 50 }), item())).toBeNull();
    expect(db.acessoAoItem(ver({ podeVerCongregacao: () => false }), item())).toBeNull();
  });
  test("quem MUDOU de congregação some da antiga na hora (Art. 132 §1º, II); a nova (ou o nível geral) vê", () => {
    const mudou = item({ MembroCongregacaoId: 2, MembroCongregacaoNome: "Vila" });
    expect(db.acessoAoItem(ver(), mudou)).toBeNull();
    expect(db.acessoAoItem(ver({ podeVerCongregacao: () => true }), mudou)).toBe("GESTAO");
    expect(db.acessoAoItem(ver({ geral: true }), mudou)).toBe("GESTAO");
    expect(db.acessoAoItem(ver({ membroId: 7, gestao: false }), mudou)).toBeNull();
    expect(db.acessoAoItem(ver({ podeVerCongregacao: () => true }), item({ MembroStatus: "DESLIGADO" }))).toBeNull();
  });
  test("o responsável voluntário só com o item ABERTO", () => {
    const resp = ver({ membroId: 7, gestao: false });
    expect(db.acessoAoItem(resp, item())).toBe("RESPONSAVEL");
    expect(db.acessoAoItem(resp, item({ Status: "CONCLUIDO" }))).toBeNull();
  });
  test("o caso \"só nível geral\": o Dirigente não vê; o nível geral e o responsável que ele nomeou, sim", () => {
    const so = item({ SoNivelGeral: true });
    expect(db.acessoAoItem(ver(), so)).toBeNull();
    expect(db.acessoAoItem(ver({ geral: true }), so)).toBe("GESTAO");
    expect(db.acessoAoItem(ver({ membroId: 7, gestao: false }), so)).toBe("RESPONSAVEL");
  });
});

describe("(revisão) violência que cita a liderança fica só com o nível geral", () => {
  test("o pedido \"o dirigente abusou de mim\": sem responsável, no topo, aviso só ao nível geral (e nunca ao Dirigente citado)", async () => {
    quando(/SELECT m\.MembroId, m\.Nome, m\.Email, m\.Telefone, m\.Status/, [{ MembroId: 8011, Nome: "Bento", Status: "ATIVO", CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT COUNT\(\*\) AS n FROM PedidosOracao/, [{ n: 99 }]);
    quando(/INSERT INTO PedidosOracao/, [{ id: 6 }]);
    quando(/INSERT INTO CuidadoItens/, [{ id: 61 }]);
    quando(/INSERT INTO CuidadoEventos/, [{ id: 701 }]);
    quando(/SELECT DISTINCT l\.EscopoTipo/, TERRITORIO);
    const r = await db.pedirOracao(await getPool(), { membroId: 8011, dados: { categoria: "OUTRO", texto: "o dirigente abusou de mim", podeBoletim: false } });
    expect(r).toMatchObject({ sucesso: true, risco: true, itemId: 61 });
    const ped = mockConsultas.find((c) => /INSERT INTO PedidosOracao/.test(c.sql));
    expect(ped.inputs.sg).toBe(1);
    const ins = mockConsultas.find((c) => /INSERT INTO CuidadoItens/.test(c.sql));
    expect([ins.inputs.sg, ins.inputs.nv, ins.inputs.r]).toEqual([1, "GERAL", null]);
    const aviso = notificarAgora.mock.calls.find((c) => c[1].regraChave === "CUIDADO_RISCO")[1];
    expect(aviso.destinatarios.map((d) => d.membroId).sort((a, b) => a - b)).toEqual([1, 77]);
    // o pedido com risco não esbarra no limite do dia (o socorro nunca é recusado por isso)
    expect(mockConsultas.some((c) => /SELECT COUNT\(\*\) AS n FROM PedidosOracao/.test(c.sql))).toBe(false);
  });
  test("citado pelo NOME (o Superintendente): sai dos avisos e o caso fica no nível geral", async () => {
    quando(/SELECT m\.MembroId, m\.Nome, m\.Email, m\.Telefone, m\.Status/, [{ MembroId: 8011, Nome: "Bento", Status: "ATIVO", CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/INSERT INTO PedidosOracao/, [{ id: 7 }]);
    quando(/INSERT INTO CuidadoItens/, [{ id: 62 }]);
    quando(/INSERT INTO CuidadoEventos/, [{ id: 702 }]);
    quando(/SELECT DISTINCT l\.EscopoTipo/, [...TERRITORIO, { EscopoTipo: "GLOBAL", membroId: 900, nome: "Carlos Superintendente Silva", email: "c@x", CargoMinisterial: "PASTOR" }]);
    await db.pedirOracao(await getPool(), { membroId: 8011, dados: { categoria: "OUTRO", texto: "o Carlos Silva me bateu", podeBoletim: false } });
    const aviso = notificarAgora.mock.calls.find((c) => c[1].regraChave === "CUIDADO_RISCO")[1];
    expect(aviso.destinatarios.map((d) => d.membroId)).not.toContain(900);
    expect(mockConsultas.find((c) => /INSERT INTO PedidosOracao/.test(c.sql)).inputs.sg).toBe(1);
  });
});

describe("(revisão) o pedido de socorro nunca se perde", () => {
  test("pedido de visita com risco quando já há um pedido de visita aberto: o aberto vira urgente, e o aviso sai", async () => {
    quando(/SELECT m\.MembroId, m\.Nome, m\.Email, m\.Telefone, m\.Status/, [{ MembroId: 8011, Nome: "Bento", Status: "ATIVO", CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/INSERT INTO PedidosOracao/, [{ id: 8 }]);
    quando(/SELECT TOP 1 m\.MembroId AS membroId, m\.Nome AS nome, m\.Email AS email FROM Lideranca/, [{ membroId: 3001, nome: "Dirigente", email: "d@x" }]);
    // o aberto é achado ANTES de gravar, com trava de faixa (nunca pelo erro do índice único dentro da transação)
    quando(/SELECT TOP 1 ItemId FROM CuidadoItens WITH \(UPDLOCK, HOLDLOCK\) WHERE MembroId = @m AND Tipo = @t AND Status = 'ABERTO'/, [{ ItemId: 33 }]);
    quando(/INSERT INTO CuidadoItens/, new Error("não devia tentar gravar outro"));
    quando(/INSERT INTO CuidadoEventos/, [{ id: 703 }]);
    quando(/SELECT DISTINCT l\.EscopoTipo/, TERRITORIO);
    const r = await db.pedirVisita(await getPool(), { membroId: 8011, dados: { motivo: "meu marido me bate todo dia, preciso de ajuda" } });
    expect(r).toMatchObject({ sucesso: true, risco: true, itemId: 33 });
    expect(mockConsultas.some((c) => /UPDATE CuidadoItens SET Urgente = 1/.test(c.sql) && c.inputs.i === 33)).toBe(true);
    expect(notificarAgora.mock.calls.some((c) => c[1].regraChave === "CUIDADO_RISCO" && c[1].referenciaId === 703)).toBe(true);
    expect(mockEventos).toEqual(["begin", "commit"]);
  });
});
