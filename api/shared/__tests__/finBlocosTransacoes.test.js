// Financeiro (revisão de 23/11/2026, I4): a regra 7 do banco (api/CLAUDE.md) nas gravações dos blocos de recibo (shared/finBlocosDb.js).
// - Toda transação liga o SET XACT_ABORT ON logo depois de abrir, por LOTE (.batch): o .query() do mssql vai por sp_executesql, e o SET feito
//   ali se desfaz quando a chamada volta. Antes de fechar (commit ou rollback), desliga de novo: o mssql devolve a conexão ao pool sem reiniciá-la.
// - A conferência de escopo da exceção da folha usa a MESMA conexão da transação (nenhum pedido ao pool enquanto a trava do bloco está presa).
// O SQL de verdade é provado no LocalDB (tools/e2e-localdb/e2e-200 e e2e-201).
let mockLog = [];
let mockRegras = [];
jest.mock("../db", () => {
  let proximo = 0;
  class Transaction {
    constructor() { this.id = ++proximo; }
    async begin() { mockLog.push({ via: `tx${this.id}`, op: "begin" }); }
    async commit() { mockLog.push({ via: `tx${this.id}`, op: "commit" }); }
    async rollback() { mockLog.push({ via: `tx${this.id}`, op: "rollback" }); }
  }
  class Request {
    constructor(origem) { this.via = origem instanceof Transaction ? `tx${origem.id}` : "pool"; }
    input() { return this; }
    async query(texto) { return this.rodar("query", texto); }
    async batch(texto) { return this.rodar("batch", texto); }
    async rodar(op, texto) {
      mockLog.push({ via: this.via, op, sql: texto });
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

// as operações de uma transação, na ordem
const daTransacao = () => {
  const tx = (mockLog.find((x) => x.op === "begin") || {}).via;
  return { tx, ops: mockLog.filter((x) => x.via === tx) };
};
const ehSet = (o, valor) => o.op === "batch" && new RegExp(`^\\s*SET XACT_ABORT ${valor}\\s*;?\\s*$`, "i").test(o.sql);

beforeEach(() => { mockLog = []; mockRegras = []; });

// cada gravação com o mínimo para abrir a transação (o resto do caminho pode recusar: o que importa é como ela abre e fecha)
const GRAVACOES = {
  cadastrarLote: (pool) => finDb.cadastrarLote(pool, { dados: { serie: 2026, primeiraFolha: 70001, totalFolhas: 100 }, por: 1002 }),
  registrarChegada: (pool) => finDb.registrarChegada(pool, { loteId: 1, ateFolha: 70100, por: 1002 }),
  entregar: (pool) => finDb.entregar(pool, { primeiraFolha: 70051, congregacaoId: 2, pessoa: { nome: "Rute Santos" }, por: 1002 }),
  registrarFolha: (pool) => finDb.registrarFolha(pool, LIDER_VILA_NOVA, { geral: false, dados: { folha: 70090, oQueAconteceu: "cancelada", observacao: "Rasgou" }, por: 1003 }),
  devolver: (pool) => finDb.devolver(pool, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, por: 1002 }),
  desfazerFolha: (pool) => finDb.desfazerFolha(pool, { dados: { folha: 70090, motivo: "Marcada na folha errada" }, por: 1002 })
};

describe("as transações dos blocos de recibo: SET XACT_ABORT ON por lote (regra 7 do banco)", () => {
  for (const [nome, gravar] of Object.entries(GRAVACOES)) {
    test(`${nome}: liga o XACT_ABORT por lote logo depois de abrir e desliga antes de fechar`, async () => {
      await gravar(await getPool()).catch(() => undefined);
      const { tx, ops } = daTransacao();
      expect(tx).toBeTruthy();
      expect(ops[0].op).toBe("begin");
      expect(ehSet(ops[1], "ON")).toBe(true);
      const fim = ops.findIndex((o) => o.op === "commit" || o.op === "rollback");
      expect(fim).toBeGreaterThan(1);
      expect(ehSet(ops[fim - 1], "OFF")).toBe(true);
    });
  }

  test("com tudo certo, a gravação vai até o commit (o desligar vem antes dele)", async () => {
    mockRegras = [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]], [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, BLOCO_ENTREGUE], [/FROM Congregacoes/, [{ Nome: "Vila Nova", Ativa: true }]], [/INSERT INTO FinFolhas/, [{ FolhaId: 99 }]]];
    const r = await GRAVACOES.registrarFolha(await getPool());
    expect(r.sucesso).toBe(true);
    const { ops } = daTransacao();
    expect(ops.map((o) => o.op).slice(-2)).toEqual(["batch", "commit"]);
  });
});

describe("a exceção da folha confere o escopo na mesma conexão da transação", () => {
  test("a congregação no escopo: nenhum pedido ao pool entre o abrir e o fechar da transação", async () => {
    mockRegras = [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]], [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, BLOCO_ENTREGUE], [/FROM Congregacoes/, [{ Nome: "Vila Nova", Ativa: true }]], [/INSERT INTO FinFolhas/, [{ FolhaId: 99 }]]];
    const r = await GRAVACOES.registrarFolha(await getPool());
    expect(r.sucesso).toBe(true);
    const inicio = mockLog.findIndex((x) => x.op === "begin");
    const fim = mockLog.findIndex((x) => x.op === "commit" || x.op === "rollback");
    expect(mockLog.slice(inicio, fim).filter((x) => x.via === "pool")).toEqual([]);
  });

  test("o bloco de outra congregação: a mesma resposta de \"não existe\", também sem pedido ao pool", async () => {
    mockRegras = [[/SELECT TOP 1 BlocoId FROM FinBlocos/, [{ BlocoId: 7 }]], [/FROM FinBlocos (b )?WITH \(UPDLOCK, ROWLOCK\)/, [{ ...BLOCO_ENTREGUE[0], CongregacaoId: 3, Congregacao: "Beta" }]], [/FROM Congregacoes/, [{ Nome: "Beta", Ativa: true }]]];
    const r = await GRAVACOES.registrarFolha(await getPool());
    expect(r).toEqual({ sucesso: false, naoExiste: true });
    const inicio = mockLog.findIndex((x) => x.op === "begin");
    const fim = mockLog.findIndex((x) => x.op === "commit" || x.op === "rollback");
    expect(mockLog.slice(inicio, fim).filter((x) => x.via === "pool")).toEqual([]);
    expect(mockLog.filter((x) => /INSERT/.test(x.sql || ""))).toEqual([]);
  });
});
