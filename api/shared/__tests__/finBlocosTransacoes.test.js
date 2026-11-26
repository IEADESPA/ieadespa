// Financeiro (revisão de 23/11/2026, I4; revisão de 24/11/2026, m1): a regra 7 do banco (api/CLAUDE.md) nas gravações dos blocos de recibo
// (shared/finBlocosDb.js).
// - Cada consulta da transação leva o SET XACT_ABORT ON no PRÓPRIO lote: o .query() do mssql vai por sp_executesql, e o SET feito ali vale para
//   aquela consulta e se desfaz quando ela volta. Nada de SET na conexão (.batch): quando o banco desfaz a transação, o mssql 12.7.2 devolve a
//   conexão ao pool na hora (lib/tedious/transaction.js, _abort), e um "desligar" no fim já não chegaria ao banco (a conexão voltaria ligada).
// - A conferência de escopo da exceção da folha usa a MESMA conexão da transação (nenhum pedido ao pool enquanto a trava do bloco está presa).
// O mssql de mentira daqui imita o de verdade nesses três pontos: o .batch muda a conexão; o SET dentro do .query vale só para ele; e o erro com o
// XACT_ABORT ligado desfaz a transação, solta a conexão e faz falhar tudo o que vier depois nela (o rollback também).
// O SQL de verdade é provado no LocalDB (tools/e2e-localdb/e2e-200 e e2e-201).
let mockLog = [];
let mockRegras = [];
let mockErros = [];
let mockConexao = { xactAbort: false };
jest.mock("../db", () => {
  let proximo = 0;
  const abortada = () => Object.assign(new Error("Transaction has been aborted."), { code: "EABORT" });
  class Transaction {
    constructor() { this.id = ++proximo; this.abortada = false; }
    async begin() { mockLog.push({ via: `tx${this.id}`, op: "begin" }); }
    async commit() { if (this.abortada) throw abortada(); mockLog.push({ via: `tx${this.id}`, op: "commit" }); }
    async rollback() { if (this.abortada) throw abortada(); mockLog.push({ via: `tx${this.id}`, op: "rollback" }); }
  }
  const SET_NO_LOTE = /^\s*SET XACT_ABORT ON\s*;/i;
  class Request {
    constructor(origem) { this.tx = origem instanceof Transaction ? origem : null; this.via = this.tx ? `tx${this.tx.id}` : "pool"; this.entradas = {}; }
    input(nome, _tipo, valor) { this.entradas[nome] = valor; return this; }
    // execSql (sp_executesql): o SET no começo do lote vale só durante ele
    async query(texto) { return this.rodar("query", texto, SET_NO_LOTE.test(texto)); }
    // execSqlBatch: o SET fica na conexão
    async batch(texto) {
      const r = await this.rodar("batch", texto, false);
      const m = /^\s*SET XACT_ABORT (ON|OFF)\s*;?\s*$/i.exec(texto);
      if (m) mockConexao.xactAbort = m[1].toUpperCase() === "ON";
      return r;
    }
    async rodar(op, texto, xactNoLote) {
      if (this.tx && this.tx.abortada) throw abortada();
      mockLog.push({ via: this.via, op, sql: texto, entradas: { ...this.entradas } });
      for (const padrao of mockErros) {
        if (padrao.test(texto)) {
          // o erro do banco com o XACT_ABORT ligado desfaz a transação inteira e o mssql devolve a conexão ao pool na hora
          if (this.tx && (xactNoLote || mockConexao.xactAbort)) this.tx.abortada = true;
          throw Object.assign(new Error("Violation of UNIQUE KEY constraint"), { number: 2627 });
        }
      }
      for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: valor, rowsAffected: [valor.length || 1] };
      return { recordset: [], rowsAffected: [0] };
    }
  }
  const pool = { request: () => new Request(null) };
  return { getPool: async () => pool, sql: new Proxy({ Transaction, Request, MAX: -1 }, { get: (alvo, p) => (p in alvo ? alvo[p] : () => undefined) }) };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../financeiroSeguro", () => ({ obterTrava: jest.fn(async () => true) }));

const { getPool } = require("../db");
const finDb = require("../finBlocosDb");

const LIDER_VILA_NOVA = { membroId: 1003, nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["financeiro"] };
const BLOCO_ENTREGUE = [{ BlocoId: 7, Numero: 1401, PrimeiraFolha: 70051, UltimaFolha: 70100, Situacao: "ENTREGUE", CongregacaoId: 2, Congregacao: "Vila Nova", SaidaDe: 70051,
  EntregueEm: new Date("2026-11-10T00:00:00Z"), DevolvidoEm: null, ChegouEm: new Date("2026-11-01T00:00:00Z") }];
const CAMINHO_DA_EXCECAO = () => [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]], [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, BLOCO_ENTREGUE],
  [/FROM Congregacoes/, [{ Nome: "Vila Nova", Ativa: true }]], [/INSERT INTO FinFolhas/, [{ FolhaId: 99 }]]];

// as operações de uma transação, na ordem
const daTransacao = () => {
  const tx = (mockLog.find((x) => x.op === "begin") || {}).via;
  return { tx, ops: mockLog.filter((x) => x.via === tx) };
};

beforeEach(() => { mockLog = []; mockRegras = []; mockErros = []; mockConexao = { xactAbort: false }; });

// cada gravação com o mínimo para abrir a transação (o resto do caminho pode recusar: o que importa é como ela abre e fecha)
const GRAVACOES = {
  cadastrarLote: (pool) => finDb.cadastrarLote(pool, { dados: { serie: 2026, primeiraFolha: 70001, totalFolhas: 100 }, por: 1002 }),
  registrarChegada: (pool) => finDb.registrarChegada(pool, { loteId: 1, ateFolha: 70100, por: 1002 }),
  entregar: (pool) => finDb.entregar(pool, { primeiraFolha: 70051, congregacaoId: 2, pessoa: { nome: "Rute Santos" }, por: 1002 }),
  registrarFolha: (pool) => finDb.registrarFolha(pool, LIDER_VILA_NOVA, { geral: false, dados: { folha: 70090, oQueAconteceu: "cancelada", observacao: "Rasgou" }, por: 1003 }),
  devolver: (pool) => finDb.devolver(pool, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, por: 1002 }),
  desfazerFolha: (pool) => finDb.desfazerFolha(pool, { dados: { folha: 70090, motivo: "Marcada na folha errada" }, por: 1002 })
};

describe("as transações dos blocos de recibo: SET XACT_ABORT ON dentro de cada consulta (regra 7 do banco; revisão m1)", () => {
  for (const [nome, gravar] of Object.entries(GRAVACOES)) {
    test(`${nome}: toda consulta da transação leva o SET no próprio lote, e nenhum SET vai para a conexão`, async () => {
      await gravar(await getPool()).catch(() => undefined);
      const { tx, ops } = daTransacao();
      expect(tx).toBeTruthy();
      expect(ops[0].op).toBe("begin");
      const consultas = ops.filter((o) => o.op === "query");
      expect(consultas.length).toBeGreaterThan(0);
      for (const o of consultas) expect(o.sql).toMatch(/^SET XACT_ABORT ON;\n/);
      expect(mockLog.filter((o) => o.op === "batch")).toEqual([]);
      expect(ops.some((o) => o.op === "commit" || o.op === "rollback")).toBe(true);
      expect(mockConexao.xactAbort).toBe(false);
    });
  }

  test("com tudo certo, a gravação vai até o commit, e a conexão volta ao pool com o XACT_ABORT desligado", async () => {
    mockRegras = CAMINHO_DA_EXCECAO();
    const r = await GRAVACOES.registrarFolha(await getPool());
    expect(r.sucesso).toBe(true);
    expect(daTransacao().ops.map((o) => o.op).slice(-1)).toEqual(["commit"]);
    expect(mockConexao.xactAbort).toBe(false);
  });

  test("quando o banco desfaz a transação (o erro com o XACT_ABORT ligado), a conexão também volta desligada ao pool", async () => {
    mockRegras = CAMINHO_DA_EXCECAO();
    mockErros = [/INSERT INTO FinFolhas/];
    await expect(GRAVACOES.registrarFolha(await getPool())).rejects.toThrow(/UNIQUE KEY/);
    expect(mockConexao.xactAbort).toBe(false);
  });
});

describe("a devolução do bloco que está na Geral", () => {
  const NA_GERAL = { ...BLOCO_ENTREGUE[0], Situacao: "NA_GERAL", CongregacaoId: null, Congregacao: null, EntregueEm: null };
  const ACHA = [/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]];

  test("que nunca saiu: \"não saiu para voltar\"", async () => {
    mockRegras = [ACHA, [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [NA_GERAL]]];
    const r = await GRAVACOES.devolver(await getPool());
    expect(r).toEqual({ sucesso: false, mensagem: "O bloco 1.401 ainda está na Tesouraria Geral: não saiu para voltar." });
    expect(mockLog.filter((x) => /INSERT|UPDATE/.test(x.sql || ""))).toEqual([]);
  });

  test("que já voltou em parte (revisão m3): diz quando voltou e quais folhas estão livres, sem gravar nada", async () => {
    mockRegras = [ACHA, [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [NA_GERAL]],
      [/Tipo = 'SAIDA' AND BlocoId = @b/, [{ RegistroId: 40, PrimeiraFolha: 70051 }]],
      [/Tipo = 'ENTRADA' AND BlocoId = @b/, [{ DataRegistro: new Date("2026-11-20T00:00:00Z"), PrimeiraFolha: 70081, UltimaFolha: 70100 }]]];
    const r = await GRAVACOES.devolver(await getPool());
    expect(r).toEqual({ sucesso: false, mensagem: "O bloco 1.401 já voltou, parcial, em 20/11/2026: as folhas 70.081 a 70.100 estão livres na Tesouraria Geral para outra entrega." });
    expect(mockLog.filter((x) => /INSERT|UPDATE/.test(x.sql || ""))).toEqual([]);
  });
});

// revisão m2 (migração 202): a saída e a entrada parcial gravam a primeira folha do bloco junto com a faixa (o banco confere a faixa contra o bloco)
describe("a faixa no livro leva a primeira folha do bloco (migração 202)", () => {
  const ACHA = [/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]];
  const gravacaoNoLivro = () => mockLog.find((x) => /INSERT INTO FinLivroBlocos/.test(x.sql || ""));

  test("a entrega: a faixa do bloco inteiro, com a primeira folha do bloco", async () => {
    mockRegras = [ACHA, [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [{ ...BLOCO_ENTREGUE[0], Situacao: "NA_GERAL", CongregacaoId: null, Congregacao: null, EntregueEm: null }]],
      [/FROM Congregacoes/, [{ Nome: "Vila Nova", Ativa: true }]], [/INSERT INTO FinLivroBlocos/, [{ RegistroId: 50 }]]];
    const r = await GRAVACOES.entregar(await getPool());
    expect(r.sucesso).toBe(true);
    const g = gravacaoNoLivro();
    expect(g.sql).toMatch(/PrimeiraFolha, UltimaFolha, BlocoPrimeiraFolha\)/);
    expect(g.entradas).toMatchObject({ de: 70051, ate: 70100, bp: 70051 });
  });

  test("a devolução parcial: a faixa que voltou livre, com a primeira folha do bloco; a completa, sem faixa nenhuma", async () => {
    const caminho = () => [ACHA, [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, BLOCO_ENTREGUE],
      [/Tipo = 'SAIDA' AND BlocoId = @b/, [{ RegistroId: 40, PrimeiraFolha: 70051 }]], [/SELECT MAX\(Folha\)/, [{ Ultima: null }]],
      [/UPDATE FinBlocos/, []], [/INSERT INTO FinLivroBlocos/, [{ RegistroId: 60 }]]];
    mockRegras = caminho();
    const parcial = await finDb.devolver(await getPool(), { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: true, primeiraEmBranco: 70081, por: 1002 });
    expect(parcial.sucesso).toBe(true);
    let g = gravacaoNoLivro();
    expect(g.sql).toMatch(/PrimeiraFolha, UltimaFolha, BlocoPrimeiraFolha\)/);
    expect(g.entradas).toMatchObject({ saida: 40, parcial: true, de: 70081, ate: 70100, bp: 70051 });
    mockLog = []; mockRegras = caminho();
    const completa = await GRAVACOES.devolver(await getPool());
    expect(completa.sucesso).toBe(true);
    g = gravacaoNoLivro();
    expect(g.entradas).toMatchObject({ saida: 40, parcial: false, de: null, ate: null, bp: null });
  });
});

describe("a exceção da folha confere o escopo na mesma conexão da transação", () => {
  test("a congregação no escopo: nenhum pedido ao pool entre o abrir e o fechar da transação", async () => {
    mockRegras = CAMINHO_DA_EXCECAO();
    const r = await GRAVACOES.registrarFolha(await getPool());
    expect(r.sucesso).toBe(true);
    const inicio = mockLog.findIndex((x) => x.op === "begin");
    const fim = mockLog.findIndex((x) => x.op === "commit" || x.op === "rollback");
    expect(mockLog.slice(inicio, fim).filter((x) => x.via === "pool")).toEqual([]);
  });

  test("o bloco de outra congregação: a mesma resposta de \"não existe\", também sem pedido ao pool (revisão M9: o escopo também no jest)", async () => {
    mockRegras = [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]], [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [{ ...BLOCO_ENTREGUE[0], CongregacaoId: 3, Congregacao: "Beta" }]], [/FROM Congregacoes/, [{ Nome: "Beta", Ativa: true }]]];
    const fora = await GRAVACOES.registrarFolha(await getPool());
    expect(fora).toEqual({ sucesso: false, naoExiste: true });
    const inicio = mockLog.findIndex((x) => x.op === "begin");
    const fim = mockLog.findIndex((x) => x.op === "commit" || x.op === "rollback");
    expect(mockLog.slice(inicio, fim).filter((x) => x.via === "pool")).toEqual([]);
    expect(mockLog.filter((x) => /INSERT/.test(x.sql || ""))).toEqual([]);
    mockLog = []; mockRegras = [];
    const nao = await GRAVACOES.registrarFolha(await getPool());
    expect(nao).toEqual(fora);
  });

  test("o bloco que ainda está na Geral: para a congregação, também \"não existe\"", async () => {
    mockRegras = [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]],
      [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [{ ...BLOCO_ENTREGUE[0], Situacao: "NA_GERAL", CongregacaoId: null, Congregacao: null, EntregueEm: null }]]];
    expect(await GRAVACOES.registrarFolha(await getPool())).toEqual({ sucesso: false, naoExiste: true });
    expect(mockLog.filter((x) => /INSERT/.test(x.sql || ""))).toEqual([]);
  });
});
