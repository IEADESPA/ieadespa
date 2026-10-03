// scripts/executar-migracoes.js — o executor de migrações do deploy. Desde as migrações 127 a 130 elas AVISAM (PRINT "AVISO migração N: índice ... NÃO criado") em vez de falhar
// quando há dado repetido; o executor tem de OUVIR essas mensagens, senão o aviso se perde em silêncio e ninguém fica sabendo que um índice de segurança não foi criado.
// Aqui o banco é um pool falso: cada lote (batch) pode "imprimir" mensagens como o SQL Server faz.
const { EventEmitter } = require("events");

jest.mock("mssql", () => ({ connect: jest.fn() }));
const sql = require("mssql");
const { dividirEmBatches, executarBatch, anotacaoDeAviso, main } = require("../../scripts/executar-migracoes.js");

// pool falso: `imprimir(batch)` devolve as mensagens (PRINT) que aquele lote emite
function poolFalso(imprimir = () => []) {
  const lotes = [];
  const pool = {
    request: () => {
      const requisicao = new EventEmitter();
      requisicao.query = async (batch) => {
        lotes.push(batch);
        for (const mensagem of imprimir(batch)) requisicao.emit("info", { message: mensagem, number: 0 });
        return { recordset: [] };
      };
      return requisicao;
    },
    close: jest.fn(async () => {})
  };
  return { pool, lotes };
}

describe("dividirEmBatches", () => {
  test("separa nas linhas GO isoladas (com CRLF também), descarta lote vazio e não corta GO no meio de texto", () => {
    const texto = "SELECT 1;\r\nGO\r\n  go  \r\nSELECT 2;\nGO\n\nPRINT 'GO ainda';\nSELECT 'GOLDEN';\nGO";
    expect(dividirEmBatches(texto)).toEqual(["SELECT 1;", "SELECT 2;", "PRINT 'GO ainda';\nSELECT 'GOLDEN';"]);
  });
});

describe("executarBatch", () => {
  test("entrega ao chamador cada mensagem PRINT do lote, na ordem, e devolve o resultado da consulta", async () => {
    const { pool, lotes } = poolFalso(() => ["primeira", "AVISO migração 127: índice UX_Orgaos_Sigla NÃO criado — há 1 sigla(s)"]);
    const recebidas = [];
    const r = await executarBatch(pool, "SELECT 1", (m) => recebidas.push(m));
    expect(recebidas).toEqual(["primeira", "AVISO migração 127: índice UX_Orgaos_Sigla NÃO criado — há 1 sigla(s)"]);
    expect(lotes).toEqual(["SELECT 1"]);
    expect(r).toEqual({ recordset: [] });
  });
  test("lote que não imprime nada não chama o ouvinte", async () => {
    const { pool } = poolFalso();
    const ouvinte = jest.fn();
    await executarBatch(pool, "SELECT 1", ouvinte);
    expect(ouvinte).not.toHaveBeenCalled();
  });
  test("mensagem sem texto vira texto vazio (nunca 'undefined'); o erro do lote continua subindo", async () => {
    const pool = { request: () => { const r = new EventEmitter(); r.query = async () => { r.emit("info", {}); r.emit("info", undefined); throw new Error("falhou"); }; return r; } };
    const recebidas = [];
    await expect(executarBatch(pool, "X", (m) => recebidas.push(m))).rejects.toThrow("falhou");
    expect(recebidas).toEqual(["", ""]);
  });
});

describe("anotacaoDeAviso", () => {
  test("é um comando de workflow do GitHub (::warning) e escapa %, CR e LF do texto", () => {
    expect(anotacaoDeAviso("AVISO migração 127: 50% ok")).toBe("::warning title=Migração do banco::AVISO migração 127: 50%25 ok");
    expect(anotacaoDeAviso("linha1\r\nlinha2")).toBe("::warning title=Migração do banco::linha1%0D%0Alinha2");
  });
});

describe("main — roda todas as migrações numa conexão e mostra os avisos", () => {
  let linhas;
  let logOriginal;
  const ambienteOriginal = { ...process.env };
  beforeEach(() => {
    linhas = [];
    logOriginal = console.log;
    console.log = (...args) => linhas.push(args.join(" "));
    process.env.SQL_CONNECTION_STRING = "Server=falso";
    delete process.env.GITHUB_ACTIONS;
  });
  afterEach(() => {
    console.log = logOriginal;
    process.env = { ...ambienteOriginal };
    jest.clearAllMocks();
  });
  const AVISO = "AVISO migração 127: índice UX_Orgaos_Sigla NÃO criado — há 2 sigla(s) de órgão repetida(s) em Orgaos.";

  test("o aviso de uma migração aparece no log, sem falhar o deploy, e entra no resumo do fim; as demais mensagens aparecem sem virar aviso", async () => {
    const { pool, lotes } = poolFalso((batch) => (batch.includes("UX_Orgaos_Sigla") ? [AVISO, "outra informação"] : []));
    sql.connect.mockResolvedValue(pool);
    await main();
    expect(lotes.length).toBeGreaterThan(100);                                 // as migrações do repositório todas, lote a lote
    expect(linhas).toContain(`   ${AVISO}`);
    expect(linhas).toContain("   outra informação");
    expect(linhas.some(l => /^✅ \d+ migração\(ões\) executada\(s\) com sucesso\.$/.test(l))).toBe(true);
    expect(linhas.some(l => /^⚠️ 1 aviso\(s\) de migração/.test(l))).toBe(true);
    expect(linhas).toContain(`   - ${AVISO}`);
    expect(linhas.filter(l => l.startsWith("::warning"))).toEqual([]);          // fora do GitHub Actions não há anotação
    expect(pool.close).toHaveBeenCalledTimes(1);
  });
  test("no GitHub Actions o aviso vira anotação (::warning) além da linha de log", async () => {
    process.env.GITHUB_ACTIONS = "true";
    const { pool } = poolFalso((batch) => (batch.includes("UX_Orgaos_Sigla") ? [AVISO] : []));
    sql.connect.mockResolvedValue(pool);
    await main();
    expect(linhas).toContain(`::warning title=Migração do banco::${AVISO}`);
  });
  test("sem nenhum aviso não há resumo de aviso", async () => {
    const { pool } = poolFalso(() => []);
    sql.connect.mockResolvedValue(pool);
    await main();
    expect(linhas.some(l => l.includes("aviso(s) de migração"))).toBe(false);
  });
  test("lote que falha de verdade derruba o deploy (a conexão é fechada e o erro sobe)", async () => {
    const { pool } = poolFalso();
    pool.request = () => { const r = new EventEmitter(); r.query = async () => { throw new Error("Invalid object name"); }; return r; };
    sql.connect.mockResolvedValue(pool);
    await expect(main()).rejects.toThrow("Invalid object name");
    expect(pool.close).toHaveBeenCalledTimes(1);
  });
  test("mensagem que não começa com AVISO é só informação: aparece no log e fica fora do resumo", async () => {
    const { pool } = poolFalso((batch) => (batch.includes("UX_Orgaos_Sigla") ? ["Warning: Null value is eliminated by an aggregate or other SET operation."] : []));
    sql.connect.mockResolvedValue(pool);
    await main();
    expect(linhas).toContain("   Warning: Null value is eliminated by an aggregate or other SET operation.");
    expect(linhas.some(l => l.includes("aviso(s) de migração"))).toBe(false);
  });
});
