// FASE 10, v10.1e, passo 9 de Membros (22/11/2026) — a camada do banco da importação (shared/importacaoMembrosDb.js), com o SQL simulado: as decisões do LOTE
// (a matrícula usada depois da prévia vira número novo com a pendência NUMERO; o CPF gravado depois entra sem ele, com a REPETIDA; quem não acha lugar em 8
// tentativas desfaz o lote inteiro), a trava ocupada e a importação que não foi confirmada. O caminho no banco de verdade: o roteiro e2e-96.
let mockRegras = [];
let mockConsultas = [];
let mockTx = [];
jest.mock("../db", () => {
  class Transaction {
    constructor() { this.id = Symbol("tx"); }
    async begin() { mockTx.push("begin"); }
    async commit() { mockTx.push("commit"); }
    async rollback() { mockTx.push("rollback"); }
  }
  class Request {
    constructor() { this.inputs = {}; }
    input(n, _t, v) { this.inputs[n] = v; return this; }
    async query(texto) {
      mockConsultas.push({ sql: texto, inputs: { ...this.inputs } });
      for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(this.inputs) : valor, rowsAffected: [1] };
      return { recordset: [], rowsAffected: [0] };
    }
  }
  const tipo = () => tipo;
  return { getPool: async () => ({ request: () => new Request() }), sql: { Transaction, Request, Int: tipo, Bit: tipo, Date: tipo, NVarChar: tipo, NChar: tipo, Char: tipo, MAX: -1 } };
});
jest.mock("../auditoria", () => ({ registrarAuditoriaNaTransacao: jest.fn(async () => true), registrarAuditoriaEmLoteNaTransacao: jest.fn(async () => true) }));

const db = require("../importacaoMembrosDb");
const { registrarAuditoriaEmLoteNaTransacao } = require("../auditoria");
const POOL = {};
const QUEM = { membroId: 1 };

const linha = (extra = {}) => ({ Linha: 2, MatriculaArquivo: "500", Matricula: 500, NumeroNovo: false, MotivoNumero: null, RepetidaMembro: null, Nome: "Pessoa de Teste",
  CongregacaoId: 3, Sexo: "F", DataNascimento: "1990-01-01", EstadoCivil: null, Email: null, Telefone: null, NomeMae: null, NomePai: null, Cpf: null, DataAdmissao: null,
  FormaAdmissao: null, DataBatismo: null, Escolaridade: null, ...extra });
// o cenário de um lote: a trava vem, a importação está IMPORTANDO, as linhas dadas; `gravar(inputs)` decide o que o comando da ficha devolve
function cenario({ linhas, gravar, rc = 0, situacao = "IMPORTANDO", proxima = [900, 901, 902, 903, 904, 905, 906, 907, 908] }) {
  const fila = [...proxima];
  mockRegras = [
    [/sp_getapplock/, [{ rc }]],
    [/FROM ImportacoesMembros WITH \(UPDLOCK\)/, situacao ? [{ ImportacaoId: 7, Situacao: situacao, Resumo: "{}" }] : []],
    [/FROM ImportacoesMembrosLinhas WITH \(UPDLOCK\)/, linhas],
    [/FROM MatriculasLivres l/, () => [{ id: fila.shift() }]],
    [/DECLARE @ocupada/, (i) => [gravar(i)]],
    [/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 5 }]]   // ainda faltam: o lote não conclui
  ];
}
const pendencias = () => mockConsultas.filter((c) => /INSERT INTO FichasPendencias/.test(c.sql)).map((c) => ({ tipo: c.inputs.t, membro: c.inputs.m, outro: c.inputs.o, detalhe: c.inputs.d }));
const marcacao = () => mockConsultas.filter((c) => /SET Estado = N'IMPORTADA'/.test(c.sql)).map((c) => c.inputs);
beforeEach(() => { mockRegras = []; mockConsultas = []; mockTx = []; jest.clearAllMocks(); });

describe("o lote", () => {
  test("a linha comum entra com a matrícula do arquivo, em ARROLAMENTO, com a pendência ARROLAMENTO (e mais nada)", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }) });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toEqual({ sucesso: true, importacaoId: 7, importadas: 1, restantes: 5, concluida: false });
    expect(mockConsultas.find((c) => /DECLARE @ocupada/.test(c.sql)).sql).toMatch(/N'ARROLAMENTO'/);
    expect(pendencias()).toEqual([expect.objectContaining({ tipo: "ARROLAMENTO", membro: 500, outro: null })]);
    expect(marcacao()).toEqual([expect.objectContaining({ m: 500, nn: false, mn: null, rm: null })]);
    expect(mockTx).toEqual(["begin", "commit"]);
    expect(registrarAuditoriaEmLoteNaTransacao.mock.calls[0][2]).toEqual([expect.objectContaining({ registroId: 500, acao: "Importou pessoa do sistema pago" })]);
  });
  test("a matrícula usada DEPOIS da prévia: a próxima do sistema e a pendência NUMERO (DE_OUTRA_FICHA)", async () => {
    cenario({ linhas: [linha()], gravar: (i) => ({ ocupada: i.id === 500, donoCpf: null }) });
    await db.importarLote(POOL, QUEM, 7);
    expect(marcacao()).toEqual([expect.objectContaining({ m: 900, nn: true, mn: "DE_OUTRA_FICHA" })]);
    expect(pendencias().map((p) => p.tipo)).toEqual(["ARROLAMENTO", "NUMERO"]);
    expect(pendencias()[1]).toMatchObject({ membro: 900, detalhe: expect.stringMatching(/500 do sistema pago já era de outra ficha/) });
  });
  test("o CPF gravado DEPOIS da prévia: entra sem ele, com a REPETIDA da ficha que tem o CPF (e a trilha sem o CPF)", async () => {
    cenario({ linhas: [linha({ Cpf: "52998224725" })], gravar: (i) => ({ ocupada: false, donoCpf: i.cpf ? 321 : null }) });
    await db.importarLote(POOL, QUEM, 7);
    const comandos = mockConsultas.filter((c) => /DECLARE @ocupada/.test(c.sql)).map((c) => c.inputs.cpf);
    expect(comandos).toEqual(["52998224725", null]);
    expect(pendencias()).toEqual([expect.objectContaining({ tipo: "ARROLAMENTO", membro: 500 }), expect.objectContaining({ tipo: "REPETIDA", membro: 500, outro: 321 })]);
    expect(marcacao()[0]).toMatchObject({ m: 500, rm: 321 });
    expect(JSON.stringify(registrarAuditoriaEmLoteNaTransacao.mock.calls[0][2])).not.toContain("52998224725");
  });
  test("a linha de número novo já vem com a pendência NUMERO do motivo da prévia", async () => {
    cenario({ linhas: [linha({ Matricula: null, MatriculaArquivo: "0", NumeroNovo: true, MotivoNumero: "ZERO", RepetidaMembro: 44 })], gravar: () => ({ ocupada: false, donoCpf: null }) });
    await db.importarLote(POOL, QUEM, 7);
    expect(pendencias().map((p) => [p.tipo, p.membro, p.outro])).toEqual([["ARROLAMENTO", 900, null], ["NUMERO", 900, null], ["REPETIDA", 900, 44]]);
    expect(pendencias()[1].detalhe).toMatch(/matrícula 0/);
  });
  test("sem lugar em 8 tentativas: o lote inteiro é desfeito (nada pela metade)", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: true, donoCpf: null }) });
    await expect(db.importarLote(POOL, QUEM, 7)).rejects.toThrow(/linha 2/);
    expect(mockTx).toEqual(["begin", "rollback"]);
    expect(mockConsultas.filter((c) => /DECLARE @ocupada/.test(c.sql))).toHaveLength(8);
  });
  test("a trava ocupada (outra aba importando): 409 sem mexer em nada", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }), rc: -1 });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.OCUPADO });
    expect(mockTx).toEqual(["begin", "rollback"]);
    expect(mockConsultas.some((c) => /DECLARE @ocupada/.test(c.sql))).toBe(false);
  });
  test("a importação não confirmada: 409; a concluída: nada entra (a tela que chamou de novo); a que não existe: 404; o id inválido: 400", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }), situacao: "PREVIA" });
    expect((await db.importarLote(POOL, QUEM, 7)).status).toBe(409);
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }), situacao: "CONCLUIDA" });
    expect(await db.importarLote(POOL, QUEM, 7)).toEqual({ sucesso: true, importacaoId: 7, importadas: 0, restantes: 0, concluida: true });
    cenario({ linhas: [], gravar: () => ({}), situacao: null });
    expect((await db.importarLote(POOL, QUEM, 7)).status).toBe(404);
    expect((await db.importarLote(POOL, QUEM, "abc")).status).toBe(400);
    expect(mockConsultas.some((c) => /DECLARE @ocupada/.test(c.sql))).toBe(false);
  });
});
