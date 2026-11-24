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
    expect(r).toEqual({ sucesso: true, importacaoId: 7, importadas: 1, fora: 0, restantes: 5, concluida: false });
    expect(mockConsultas.find((c) => /DECLARE @ocupada/.test(c.sql)).sql).toMatch(/N'ARROLAMENTO'/);
    expect(pendencias()).toEqual([expect.objectContaining({ tipo: "ARROLAMENTO", membro: 500, outro: null })]);
    expect(marcacao()).toEqual([expect.objectContaining({ m: 500, nn: false, mn: null, rm: null })]);
    expect(mockTx).toEqual(["begin", "commit"]);
    expect(registrarAuditoriaEmLoteNaTransacao.mock.calls[0][2]).toEqual([expect.objectContaining({ registroId: 500, acao: "Importou pessoa do sistema pago" })]);
  });
  test("a matrícula usada DEPOIS da prévia: a linha vira de número novo e vai para o FIM DA FILA (sem tomar a maior + 1 antes das outras do arquivo)", async () => {
    cenario({ linhas: [linha({ Cpf: "52998224725" }), linha({ Linha: 3, MatriculaArquivo: "501", Matricula: 501 })],
      gravar: (i) => ({ ocupada: i.id === 500, donoCpf: i.cpf ? 321 : null }) });
    const r = await db.importarLote(POOL, QUEM, 7);
    // a linha 2 não entrou neste lote: ficou pendente, de número novo, sem o CPF (gravado em outra ficha) e possível repetida dela; a 3 entrou com a dela
    const adiada = mockConsultas.find((c) => /SET NumeroNovo = 1, MotivoNumero = N'DE_OUTRA_FICHA'/.test(c.sql));
    expect(adiada.inputs).toMatchObject({ l: 2, cpf: null, rm: 321 });
    expect(mockConsultas.filter((c) => /FROM MatriculasLivres l/.test(c.sql))).toHaveLength(0);
    expect(marcacao()).toEqual([expect.objectContaining({ l: 3, m: 501, nn: false })]);
    expect(r).toMatchObject({ importadas: 1, concluida: false });
    // no lote seguinte ela vem como número novo: a próxima do sistema e a pendência NUMERO (DE_OUTRA_FICHA)
    mockConsultas = [];
    cenario({ linhas: [linha({ NumeroNovo: true, MotivoNumero: "DE_OUTRA_FICHA", RepetidaMembro: 321 })], gravar: () => ({ ocupada: false, donoCpf: null }) });
    await db.importarLote(POOL, QUEM, 7);
    expect(marcacao()).toEqual([expect.objectContaining({ m: 900, nn: true, mn: "DE_OUTRA_FICHA", rm: 321 })]);
    expect(pendencias().map((p) => p.tipo)).toEqual(["ARROLAMENTO", "NUMERO", "REPETIDA"]);
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
  test("o número novo sem lugar em 8 tentativas: o lote inteiro é desfeito (nada pela metade)", async () => {
    cenario({ linhas: [linha({ Matricula: null, MatriculaArquivo: "", NumeroNovo: true, MotivoNumero: "VAZIA" })], gravar: () => ({ ocupada: true, donoCpf: null }) });
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
    expect(await db.importarLote(POOL, QUEM, 7)).toEqual({ sucesso: true, importacaoId: 7, importadas: 0, fora: 0, restantes: 0, concluida: true });
    cenario({ linhas: [], gravar: () => ({}), situacao: null });
    expect((await db.importarLote(POOL, QUEM, 7)).status).toBe(404);
    expect((await db.importarLote(POOL, QUEM, "abc")).status).toBe(400);
    expect(mockConsultas.some((c) => /DECLARE @ocupada/.test(c.sql))).toBe(false);
  });
});

// revisão de 23/11 (a saída do IMPORTANDO): cada lote é uma transação própria e a tela continua de onde parou; mas a linha que o banco recusa SEMPRE (um erro de
// dado: CHECK, chave, tamanho, conversão) desfazia o lote inteiro a cada chamada, e a importação ficava presa (com as matrículas novas travadas no sistema todo).
// Regra: a linha recusada fica de fora COMO PROBLEMA (na lista e no CSV, ninguém some calado), provada sozinha (o lote refeito sem ela, com UMA linha depois dela
// entrando); o que não é erro de dado da própria linha sobe como antes; 5 recusadas seguidas é o banco, não a linha: para sem deixar ninguém de fora; e a
// importação nunca conclui com zero pessoas.
describe("a linha que o banco recusa (a saída do IMPORTANDO)", () => {
  const recusa = (numero = 547) => Object.assign(new Error("The INSERT statement conflicted with the CHECK constraint \"CK_Teste\". Valor: Pessoa Secreta"), { number: numero, code: "EREQUEST" });
  const tres = () => [linha({ Nome: "Pessoa 2" }), linha({ Linha: 3, MatriculaArquivo: "501", Matricula: 501, Nome: "Recusada" }), linha({ Linha: 4, MatriculaArquivo: "502", Matricula: 502, Nome: "Pessoa 4" })];
  // o lote respeita o TOP (@n) e as linhas já marcadas de fora no começo da transação
  function cenarioRecusa({ linhas, recusar, restantes = 5, importadasNoTotal = 3 }) {
    let marcadas = [];
    cenario({ linhas: [], gravar: (i) => { if (recusar(i)) throw recusa(); return { ocupada: false, donoCpf: null }; } });
    mockRegras.unshift([/ERRO_AO_GRAVAR/, (i) => { marcadas = JSON.parse(i.p); return []; }]);
    mockRegras = mockRegras.map(([p, v]) => (String(p) === String(/FROM ImportacoesMembrosLinhas WITH \(UPDLOCK\)/)
      ? [p, (i) => linhas.filter((l) => !marcadas.includes(l.Linha)).slice(0, i.n)]
      : String(p).includes("COUNT") ? [p, [{ n: restantes }]] : [p, v]));
    mockRegras.push([/AS importadasNoTotal/, [{ importadasNoTotal }]]);
    mockRegras.push([/SUM\(CASE WHEN Estado = N'IMPORTADA'/, [{ importadas: importadasNoTotal, fora: 1, numeroNovo: 0, possivelRepetida: 0, semCongregacao: 0 }]]);
  }
  const tentadas = () => mockConsultas.filter((c) => /DECLARE @ocupada/.test(c.sql)).map((c) => c.inputs.nome);
  const marcas = () => mockConsultas.filter((c) => /ERRO_AO_GRAVAR/.test(c.sql));

  test("a recusada no meio fica de fora como problema; o lote é refeito sem ela, na mesma ordem, até UMA linha depois dela (a prova), e entra", async () => {
    cenarioRecusa({ linhas: tres(), recusar: (i) => i.nome === "Recusada" });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toEqual({ sucesso: true, importacaoId: 7, importadas: 2, fora: 1, restantes: 5, concluida: false });
    expect(tentadas()).toEqual(["Pessoa 2", "Recusada", "Pessoa 2", "Pessoa 4"]);
    expect(mockTx).toEqual(["begin", "rollback", "begin", "commit"]);
    const m = marcas();
    expect(m).toHaveLength(1);
    expect(JSON.parse(m[0].inputs.p)).toEqual([3]);
    expect(m[0].sql).toMatch(/Acao = N'PROBLEMA', Estado = N'FORA'/);
    expect(m[0].sql).toMatch(/Estado = N'PENDENTE'/);
    // a trilha diz a linha e o número do erro; nunca a mensagem do banco (pode trazer o valor da linha)
    const { registrarAuditoriaNaTransacao } = require("../auditoria");
    const trilha = registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1]).find((a) => /não conseguiu gravar/.test(a.acao));
    expect(trilha).toMatchObject({ tabela: "ImportacoesMembros", registroId: 7, dadosDepois: { linhas: [{ linha: 3, erro: 547 }] } });
    expect(JSON.stringify(trilha)).not.toMatch(/Secreta|CK_Teste/);
    expect(require("../importacaoMembros").textoDe("ERRO_AO_GRAVAR")).toMatch(/não conseguiu gravar esta linha/);
  });
  test("o que não é erro de dado da própria linha sobe como antes, sem ninguém de fora: a trava do banco (1205), o tempo esgotado, o defeito do código e a trilha", async () => {
    for (const erro of [recusa(1205), Object.assign(new Error("Timeout"), { code: "ETIMEOUT" }), new TypeError("x is undefined")]) {
      mockConsultas = []; mockTx = [];
      cenario({ linhas: tres(), gravar: (i) => { if (i.nome === "Recusada") throw erro; return { ocupada: false, donoCpf: null }; } });
      await expect(db.importarLote(POOL, QUEM, 7)).rejects.toBe(erro);
      expect(marcas()).toHaveLength(0);
      expect(mockTx).not.toContain("commit");
    }
    // o erro de dado FORA das linhas (a trilha do lote) não é da linha: sobe
    mockConsultas = []; mockTx = [];
    cenario({ linhas: tres(), gravar: () => ({ ocupada: false, donoCpf: null }) });
    registrarAuditoriaEmLoteNaTransacao.mockImplementationOnce(async () => { throw recusa(8152); });
    await expect(db.importarLote(POOL, QUEM, 7)).rejects.toMatchObject({ number: 8152 });
    expect(marcas()).toHaveLength(0);
    expect(mockTx).toEqual(["begin", "rollback"]);
  });
  test("5 recusadas seguidas é o banco, não a linha: 409 com a primeira, nada gravado e ninguém de fora", async () => {
    const seis = [2, 3, 4, 5, 6, 7].map((n) => linha({ Linha: n, MatriculaArquivo: String(500 + n), Matricula: 500 + n, Nome: `Pessoa ${n}` }));
    cenarioRecusa({ linhas: seis, recusar: () => true });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RECUSADAS(2) });
    expect(r.mensagem).toBe("O sistema não conseguiu gravar 5 linhas seguidas (a partir da linha 2 do arquivo): a importação parou sem deixar ninguém de fora. Avise o suporte.");
    expect(tentadas()).toEqual(["Pessoa 2", "Pessoa 3", "Pessoa 4", "Pessoa 5", "Pessoa 6"]);
    expect(mockTx.filter((x) => x === "commit")).toHaveLength(0);
  });
  test("a última recusada e ninguém importado na importação toda: não conclui com zero (409, fica em andamento, nada perdido)", async () => {
    cenarioRecusa({ linhas: [linha({ Nome: "Recusada" })], recusar: () => true, restantes: 0, importadasNoTotal: 0 });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.NINGUEM_ENTROU });
    expect(mockConsultas.some((c) => /SET Situacao = N'CONCLUIDA'/.test(c.sql))).toBe(false);
    expect(mockTx).toEqual(["begin", "rollback", "begin", "rollback"]);
  });
  test("a última recusada com outras já importadas: fica de fora e a importação conclui", async () => {
    cenarioRecusa({ linhas: [linha({ Nome: "Recusada" })], recusar: () => true, restantes: 0, importadasNoTotal: 3 });
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toMatchObject({ sucesso: true, importadas: 0, fora: 1, restantes: 0, concluida: true, resultado: expect.objectContaining({ importadas: 3, fora: 1 }) });
    expect(mockConsultas.some((c) => /SET Situacao = N'CONCLUIDA'/.test(c.sql))).toBe(true);
    expect(mockTx).toEqual(["begin", "rollback", "begin", "commit"]);
  });
});

describe("a lista e o estado da tela (r27, 23/11/2026)", () => {
  const { sql } = require("../db");
  const POOL_REQ = { request: () => new sql.Request() };
  const linhaLista = (extra = {}) => ({ Total: 2, Linha: 5, MatriculaArquivo: "4318", Nome: "Pessoa B", Acao: "NOVA", Estado: "PENDENTE", MatriculaFinal: null,
    Problemas: null, Avisos: "MATRICULA_REPETIDA_NO_ARQUIVO", NumeroNovo: true, MotivoNumero: "REPETIDA_NO_ARQUIVO", CongregacaoId: 3, RepetidaLinha: null,
    RepLinhaNome: null, RepetidaMembro: null, RepMembroNome: null, DonoLinha: 2, DonoNome: "Pessoa A", DonoSexo: "F", OrdemNova: 2, ...extra });
  test("a matrícula a acertar: quem ficou com o número (a linha de antes) e o número PREVISTO pela ordem (a primeira nova da prévia + a ordem - 1)", async () => {
    mockRegras = [[/SELECT Resumo FROM ImportacoesMembros/, [{ Resumo: JSON.stringify({ primeiraMatriculaNova: 30512 }) }]], [/WITH ordem AS/, [linhaLista()]]];
    const r = await db.listar(POOL_REQ, "7", { filtro: "acertar" });
    expect(r).toMatchObject({ sucesso: true, filtro: "acertar", total: 2 });
    expect(r.itens[0].detalhe).toEqual({ motivoNumero: "REPETIDA_NO_ARQUIVO", semCongregacao: false, dono: { linha: 2, nome: "Pessoa A", sexo: "F" }, repetidaDe: null,
      recebe: 30513, prevista: true });
    expect(mockConsultas.find((c) => /WITH ordem AS/.test(c.sql)).sql).toMatch(/AND a\.NumeroNovo = 1/);
  });
  test("depois de importada: o número de verdade; a possível repetida diz de quem (a linha ou a ficha); o filtro desconhecido vira 'todas'", async () => {
    mockRegras = [[/SELECT Resumo FROM ImportacoesMembros/, [{ Resumo: JSON.stringify({ proximaMatricula: 30524, numeroNovo: 12 }) }]],
      [/WITH ordem AS/, [linhaLista({ Estado: "IMPORTADA", MatriculaFinal: 30600, CongregacaoId: null }),
        linhaLista({ NumeroNovo: false, MotivoNumero: null, DonoLinha: null, OrdemNova: null, RepetidaMembro: 2, RepMembroNome: "Ficha Antiga" })]]];
    const r = await db.listar(POOL_REQ, 7, { filtro: "'; DROP TABLE x --" });
    expect(r.filtro).toBe("todas");
    expect(r.itens[0].detalhe).toMatchObject({ recebe: 30600, prevista: false, semCongregacao: null });
    expect(r.itens[1].detalhe).toMatchObject({ motivoNumero: null, recebe: null, prevista: false, repetidaDe: { linha: null, matricula: 2, nome: "Ficha Antiga" } });
    expect(mockConsultas.find((c) => /WITH ordem AS/.test(c.sql)).sql).not.toMatch(/DROP/);
  });
  test("o estado: o catálogo das colunas sempre; feita, o retrato (quem importou, as matrículas novas e as fichas por área, com a sem congregação)", async () => {
    mockRegras = [
      [/FROM ImportacoesMembros WHERE Situacao IN/, [{ ImportacaoId: 7, Situacao: "CONCLUIDA", ConfirmadaPor: 4242, Resumo: "{}" }]],
      [/GROUP BY a\.AreaId/, [{ AreaId: 1, Area: "Área 1", SemCongregacao: 0, Congregacoes: 10, Fichas: 1096, Completas: 0 },
        { AreaId: null, Area: null, SemCongregacao: 1, Congregacoes: 0, Fichas: 1, Completas: 0 }]],
      [/MIN\(CASE WHEN NumeroNovo = 1/, [{ de: 30512, ate: 30523, n: 12, repetidas: 173, comMatricula: 4862 }]],
      [/SELECT Nome FROM MembroReferencia/, [{ Nome: "Secretária de Teste" }]]
    ];
    const r = await db.estado(POOL_REQ);
    expect(r).toMatchObject({ feita: true, emAndamento: false, restantes: null });
    expect(r.campos.find((c) => c.campo === "cpf")).toEqual({ campo: "cpf", rotulo: "CPF", padrao: true });
    expect(r.retrato).toEqual({ confirmadaPor: "Secretária de Teste", matriculasNovas: { total: 12, de: 30512, ate: 30523 },
      quadros: { comMatricula: 4862, acertar: 12, repetidas: 173 }, porArea: [
      { area: "Área 1", semCongregacao: false, congregacoes: 10, fichas: 1096, completas: 0 }, { area: null, semCongregacao: true, congregacoes: 0, fichas: 1, completas: 0 }] });
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, []]];
    expect((await db.estado(POOL_REQ)).retrato).toBeNull();
  });
});
