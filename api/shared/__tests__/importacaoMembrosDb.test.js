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
  // G2 (decisão dele de 24/11/2026): o prazo da importação parada é de 7 dias contados do ÚLTIMO LOTE, e não da confirmação. Cada lote gravado marca a hora,
  // na mesma transação (o lote desfeito, como o 409 de ninguém entrou, não marca nada)
  test("G2: cada lote gravado marca a hora do último lote (UltimoLoteEm), na transação dele; a importação já concluída não marca", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }) });
    await db.importarLote(POOL, QUEM, 7);
    const marca = mockConsultas.findIndex((c) => /UPDATE ImportacoesMembros SET UltimoLoteEm = SYSUTCDATETIME\(\) WHERE ImportacaoId = @id AND Situacao = N'IMPORTANDO'/.test(c.sql));
    expect(marca).toBeGreaterThan(mockConsultas.findIndex((c) => /FROM ImportacoesMembros WITH \(UPDLOCK\)/.test(c.sql)));
    expect(mockConsultas[marca].inputs.id).toBe(7);
    expect(mockTx).toEqual(["begin", "commit"]);
    mockConsultas = []; mockTx = [];
    cenario({ linhas: [], gravar: () => ({ ocupada: false, donoCpf: null }), situacao: "CONCLUIDA" });
    await db.importarLote(POOL, QUEM, 7);
    expect(mockConsultas.some((c) => /SET UltimoLoteEm/.test(c.sql))).toBe(false);
  });
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
    // os nomes das 5 (para a tela mostrar quais ficariam de fora: menor 10 da revisão de 24/11), lidos depois da transação desfeita, sem CPF nem contato
    mockRegras.push([/SELECT Linha, Nome FROM ImportacoesMembrosLinhas/, [2, 3, 4, 5, 6].map((n) => ({ Linha: n, Nome: `Pessoa ${n}` }))]);
    const { sql } = require("../db");
    const r = await db.importarLote({ request: () => new sql.Request() }, QUEM, 7);
    // A6 (revisão de 24/11): a tela ganha a saída (podeDeixarDeFora); as linhas (o número e o nome) vão só para mostrar, o servidor nunca as lê de volta
    expect(r).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RECUSADAS(2), podeDeixarDeFora: true,
      recusadas: [2, 3, 4, 5, 6].map((n) => ({ linha: n, nome: `Pessoa ${n}` })) });
    const leitura = mockConsultas.find((c) => /SELECT Linha, Nome FROM ImportacoesMembrosLinhas/.test(c.sql));
    expect(leitura.sql).toMatch(/WHERE ImportacaoId = @id AND Linha IN \(SELECT CAST\(\[value\] AS INT\) FROM OPENJSON\(@p\)\)/);
    expect(leitura.sql).not.toMatch(/Cpf|Telefone|Email|NomeMae|NomePai/);
    expect(JSON.parse(leitura.inputs.p)).toEqual([2, 3, 4, 5, 6]);
    expect(r.mensagem).toBe("O sistema não conseguiu gravar 5 linhas seguidas (a partir da linha 2 do arquivo): a importação parou sem deixar ninguém de fora. "
      + "Se o problema for dessas linhas, deixe-as de fora e continue; se voltar nas seguintes, avise o suporte.");
    expect(tentadas()).toEqual(["Pessoa 2", "Pessoa 3", "Pessoa 4", "Pessoa 5", "Pessoa 6"]);
    // (as marcas das tentativas ficaram em transações desfeitas: nenhum commit, ninguém de fora)
    expect(mockTx.filter((x) => x === "commit")).toHaveLength(0);
  });
  test("A6: 'deixar de fora e continuar' (a Geral confirma na tela): o servidor tenta de novo e deixa de fora SÓ as 5 que recusaram agora, sem gravar mais ninguém", async () => {
    const seis = [2, 3, 4, 5, 6, 7].map((n) => linha({ Linha: n, MatriculaArquivo: String(500 + n), Matricula: 500 + n, Nome: `Pessoa ${n}` }));
    cenarioRecusa({ linhas: seis, recusar: () => true });
    const r = await db.importarLote(POOL, QUEM, 7, { deixarDeFora: true });
    expect(r).toEqual({ sucesso: true, importacaoId: 7, importadas: 0, fora: 5, restantes: 5, concluida: false });
    expect(tentadas()).toEqual(["Pessoa 2", "Pessoa 3", "Pessoa 4", "Pessoa 5", "Pessoa 6"]);
    // só a última transação vale (as das tentativas foram desfeitas): ela marca as 5 e não grava ninguém (TOP 0); a 7 fica para o próximo lote
    expect(mockTx.filter((x) => x === "commit")).toHaveLength(1);
    expect(JSON.parse(marcas().pop().inputs.p)).toEqual([2, 3, 4, 5, 6]);
    expect(mockConsultas.filter((c) => /FROM ImportacoesMembrosLinhas WITH \(UPDLOCK\)/.test(c.sql)).pop().inputs.n).toBe(0);
    expect(mockTx.slice(-2)).toEqual(["begin", "commit"]);
    const { registrarAuditoriaNaTransacao } = require("../auditoria");
    // a trilha que vale é a da última transação (a que fez commit)
    const trilha = registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1]).filter((a) => /não conseguiu gravar/.test(a.acao)).pop();
    expect(trilha).toMatchObject({ usuarioId: 1, dadosDepois: { linhas: [2, 3, 4, 5, 6].map((l) => ({ linha: l, erro: 547 })), confirmadoNaTela: true } });
  });
  test("A6: com o 'deixar de fora', se as linhas agora entram (era passageiro), ninguém fica de fora", async () => {
    cenarioRecusa({ linhas: tres(), recusar: () => false });
    const r = await db.importarLote(POOL, QUEM, 7, { deixarDeFora: true });
    expect(r).toMatchObject({ sucesso: true, importadas: 3, fora: 0 });
    expect(marcas()).toHaveLength(0);
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

// O QUE FICA NAS LINHAS QUANDO A IMPORTAÇÃO TERMINA (24/11/2026, decisão da sessão a partir da regra dele — "a lista dos de fora: nome e motivo" — e da LGPD):
// a importada fica só com o necessário para a trilha (a linha, a matrícula, o nome e a situação, com as marcas que o resultado lê); o dado pessoal vive na
// ficha, onde a exclusão LGPD passa. A de fora fica SÓ com o nome e o motivo, pelos 90 dias. As colunas vêm da migração 185: uma coluna nova que não
// estiver numa das listas faz o teste falhar (não escapa calada).
describe("o que fica nas linhas quando a importação termina", () => {
  const fs = require("fs");
  const path = require("path");
  const T185 = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "185_importacao_membros.sql"), "utf8");
  const bloco = T185.slice(T185.indexOf("CREATE TABLE dbo.ImportacoesMembrosLinhas"), T185.indexOf("CONSTRAINT PK_ImportacoesMembrosLinhas"));
  const COLUNAS = [...bloco.matchAll(/^\s+(\w+)\s+(?:INT|NVARCHAR|BIT|NCHAR|CHAR|DATE)\b/gm)].map((m) => m[1]);
  const FICA_IMPORTADA = ["ImportacaoId", "Linha", "Acao", "Estado", "MatriculaArquivo", "Matricula", "NumeroNovo", "MotivoNumero", "MatriculaFinal", "RepetidaLinha",
    "RepetidaMembro", "Problemas", "Avisos", "Nome"];
  const FICA_FORA = ["ImportacaoId", "Linha", "Acao", "Estado", "Nome", "Problemas"];
  const apagadas = (texto) => [...texto.matchAll(/\b(\w+) = (?:NULL|0)\b/g)].map((m) => m[1]);
  const comandos = (texto) => texto.split(";").map((s) => s.trim()).filter((s) => /^UPDATE l\b/.test(s));
  function concluir() {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }) });
    mockRegras.unshift([/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 0 }]]);
    mockRegras.push([/AS importadasNoTotal/, [{ importadasNoTotal: 1 }]]);
    mockRegras.push([/SUM\(CASE WHEN Estado = N'IMPORTADA'/, [{ importadas: 1, fora: 1, numeroNovo: 0, possivelRepetida: 0, semCongregacao: 0 }]]);
  }

  test("as 28 colunas da migração 185, cada uma numa lista", () => {
    expect(COLUNAS).toHaveLength(28);
    expect(COLUNAS).toEqual(expect.arrayContaining([...FICA_IMPORTADA, "Cpf", "Telefone", "Email", "NomeMae", "NomePai", "DataNascimento"]));
  });
  test("a importada fica só com a linha, a matrícula, o nome e a situação (e as marcas do resultado): CPF, celular, e-mail, mãe, pai, nascimento e o resto saem", async () => {
    concluir();
    const r = await db.importarLote(POOL, QUEM, 7);
    expect(r).toMatchObject({ sucesso: true, concluida: true });
    const fim = mockConsultas.find((c) => /SET Situacao = N'CONCLUIDA'/.test(c.sql));
    const todas = comandos(fim.sql).find((s) => !/l\.Estado = N'FORA'/.test(s));
    expect(todas).toMatch(/WHERE l\.ImportacaoId = @id$/);
    expect(new Set(apagadas(todas))).toEqual(new Set(COLUNAS.filter((c) => !FICA_IMPORTADA.includes(c))));
  });
  test("a de fora fica SÓ com o nome e o motivo (a matrícula do arquivo, as marcas e os avisos também saem)", async () => {
    concluir();
    await db.importarLote(POOL, QUEM, 7);
    const fim = mockConsultas.find((c) => /SET Situacao = N'CONCLUIDA'/.test(c.sql));
    const [todas, fora] = [comandos(fim.sql).find((s) => !/l\.Estado = N'FORA'/.test(s)), comandos(fim.sql).find((s) => /l\.Estado = N'FORA'/.test(s))];
    expect(fora).toMatch(/WHERE l\.ImportacaoId = @id AND l\.Estado = N'FORA'$/);
    // a MatriculaFinal da de fora já é NULL pela regra da tabela (CK_ImportacoesMembrosLinhas_Final)
    expect(new Set([...apagadas(todas), ...apagadas(fora), "MatriculaFinal"])).toEqual(new Set(COLUNAS.filter((c) => !FICA_FORA.includes(c))));
    // o número novo e o motivo do número saem juntos (CK_ImportacoesMembrosLinhas_Numero)
    expect(fora).toMatch(/NumeroNovo = 0, MotivoNumero = NULL/);
  });
  test("a limpeza é a última coisa da conclusão: depois das pendências de repetida e das contas do resultado (o 'sem congregação' lê a congregação da linha)", async () => {
    concluir();
    await db.importarLote(POOL, QUEM, 7);
    const ordem = (re) => mockConsultas.findIndex((c) => re.test(c.sql));
    const iFim = ordem(/SET Situacao = N'CONCLUIDA'/);
    expect(iFim).toBeGreaterThan(ordem(/INSERT INTO FichasPendencias \(MembroId, Tipo, OutroMembroId/));
    expect(iFim).toBeGreaterThan(ordem(/SUM\(CASE WHEN Estado = N'IMPORTADA'/));
    const fim = mockConsultas[iFim].sql;
    expect(fim.indexOf("SET Situacao = N'CONCLUIDA'")).toBeLessThan(fim.indexOf("UPDATE l"));
    expect(mockTx).toEqual(["begin", "commit"]);
  });
});

// G3 (decisão dele de 24/11/2026): sem congregação não há importação. A prévia de agora já põe a linha sem congregação como problema; a que foi feita antes da
// regra (com a linha "IEADESPA - GERAL" como NOVA, sem congregação) não deixa ninguém entrar sem congregação: a confirmação e o lote a deixam de fora, com o
// motivo, antes de gravar qualquer pessoa.
describe("G3: a linha sem congregação de uma prévia de antes da regra", () => {
  const MARCA = /UPDATE ImportacoesMembrosLinhas SET Acao = N'PROBLEMA', Estado = N'FORA', Problemas = N'SEM_CONGREGACAO'\s+WHERE ImportacaoId = @id AND Acao = N'NOVA' AND Estado = N'PENDENTE' AND CongregacaoId IS NULL/;
  test("a confirmação a deixa de fora antes de contar quem entra (e, se não sobrar ninguém, não confirma)", async () => {
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], [/FROM ImportacoesMembros WHERE Situacao IN/, [{ ImportacaoId: 7, Situacao: "PREVIA" }]],
      [/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 3 }]]];
    expect(await db.confirmar(POOL, QUEM, 7)).toMatchObject({ sucesso: true, restantes: 3 });
    const i = mockConsultas.findIndex((c) => MARCA.test(c.sql));
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(mockConsultas.findIndex((c) => /SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/.test(c.sql)));
    expect(i).toBeLessThan(mockConsultas.findIndex((c) => /SET Situacao = N'IMPORTANDO'/.test(c.sql)));
    mockConsultas = []; mockTx = [];
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], [/FROM ImportacoesMembros WHERE Situacao IN/, [{ ImportacaoId: 7, Situacao: "PREVIA" }]],
      [/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 0 }]]];
    expect(await db.confirmar(POOL, QUEM, 7)).toMatchObject({ sucesso: false, status: 409 });
    expect(mockTx).toEqual(["begin", "rollback"]);
  });
  test("o lote (a importação confirmada antes da regra) a deixa de fora antes de ler as linhas que vão entrar", async () => {
    cenario({ linhas: [linha()], gravar: () => ({ ocupada: false, donoCpf: null }) });
    await db.importarLote(POOL, QUEM, 7);
    const i = mockConsultas.findIndex((c) => MARCA.test(c.sql));
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(mockConsultas.findIndex((c) => /FROM ImportacoesMembrosLinhas WITH \(UPDLOCK\)/.test(c.sql)));
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
    // G3: nenhuma linha que entra fica sem congregação, então o detalhe não fala mais disso
    expect(r.itens[0].detalhe).toEqual({ motivoNumero: "REPETIDA_NO_ARQUIVO", dono: { linha: 2, nome: "Pessoa A", sexo: "F" }, repetidaDe: null,
      recebe: 30513, prevista: true });
    expect(mockConsultas.find((c) => /WITH ordem AS/.test(c.sql)).sql).toMatch(/AND a\.NumeroNovo = 1/);
  });
  test("depois de importada: o número de verdade; a possível repetida diz de quem (a linha ou a ficha); o filtro desconhecido vira 'todas'", async () => {
    mockRegras = [[/SELECT Resumo FROM ImportacoesMembros/, [{ Resumo: JSON.stringify({ proximaMatricula: 30524, numeroNovo: 12 }) }]],
      [/WITH ordem AS/, [linhaLista({ Estado: "IMPORTADA", MatriculaFinal: 30600, CongregacaoId: null }),
        linhaLista({ NumeroNovo: false, MotivoNumero: null, DonoLinha: null, OrdemNova: null, RepetidaMembro: 2, RepMembroNome: "Ficha Antiga" })]]];
    const r = await db.listar(POOL_REQ, 7, { filtro: "'; DROP TABLE x --" });
    expect(r.filtro).toBe("todas");
    expect(r.itens[0].detalhe).toMatchObject({ recebe: 30600, prevista: false });
    expect(r.itens[0].detalhe).not.toHaveProperty("semCongregacao");
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
  // G2 (decisão dele de 24/11/2026): a tela parada mostra "faltam N dias"; o prazo é de 7 dias (a política da prévia) contados do ÚLTIMO LOTE (sem lote, da
  // confirmação). A tela também precisa saber se já entrou alguém (a parada sem ninguém tem outra saída)
  test("G2: a importação parada leva o prazo para a tela: 7 dias do último lote (sem lote, da confirmação), os dias que faltam e quantas já entraram", async () => {
    const dia = 86400000, agora = Date.now();
    const imp = (extra) => [{ ImportacaoId: 9, Situacao: "IMPORTANDO", ConfirmadaEm: new Date(agora - 10 * dia), ConfirmadaPor: 1, Resumo: "{}", UltimoLoteEm: null, ...extra }];
    const contas = [/AS importadas,\s+SUM\(CASE WHEN Acao = N'NOVA' AND Estado = N'PENDENTE' THEN 1 ELSE 0 END\) AS restantes/, [{ importadas: 40, restantes: 12 }]];
    const ultimo = agora - 2 * dia - 3600000;
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ UltimoLoteEm: new Date(ultimo) })], contas];
    const r = await db.estado(POOL_REQ);
    expect(r).toMatchObject({ emAndamento: true, feita: false, restantes: 12, importadas: 40 });
    expect(r.prazo).toEqual({ dias: 7, venceEm: new Date(ultimo + 7 * dia).toISOString(), faltam: 5 });
    expect(mockConsultas.find((c) => /FROM ImportacoesMembros WHERE Situacao IN/.test(c.sql)).sql).toMatch(/UltimoLoteEm/);
    // sem nenhum lote gravado: da confirmação
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ ConfirmadaEm: new Date(agora - 3 * dia - 3600000) })], contas];
    expect((await db.estado(POOL_REQ)).prazo.faltam).toBe(4);
    // logo depois da confirmação: faltam 7 (o banco guarda o segundo arredondado, que pode ser meio segundo à frente: o e2e-102 viu "faltam 8")
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ ConfirmadaEm: new Date(agora + 500) })], contas];
    expect((await db.estado(POOL_REQ)).prazo.faltam).toBe(7);
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ UltimoLoteEm: new Date(agora + 500 - 6 * dia) })], contas];
    expect((await db.estado(POOL_REQ)).prazo.faltam).toBe(1);
    // passou do prazo e a rotina do dia ainda não rodou: 0 (nunca negativo)
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ UltimoLoteEm: new Date(agora - 8 * dia) })], contas];
    expect((await db.estado(POOL_REQ)).prazo.faltam).toBe(0);
    // o prazo ajustado na política da prévia vale também aqui
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, imp({ UltimoLoteEm: new Date(ultimo) })], contas,
      [/FROM PoliticasRetencao/, (i) => (i.c === db.POLITICA_PREVIA.categoria ? [{ DiasRetencao: 3 }] : [])]];
    expect((await db.estado(POOL_REQ)).prazo).toMatchObject({ dias: 3, faltam: 1 });
    // sem importação parada: sem prazo
    mockRegras = [[/FROM ImportacoesMembros WHERE Situacao IN/, []]];
    expect(await db.estado(POOL_REQ)).toMatchObject({ prazo: null, importadas: null });
  });
});

// A GUARDA DOS DADOS DA IMPORTAÇÃO (respostas dele de 23/11/2026, LGPD): a prévia que não foi confirmada (com CPF, celular, mãe e pai) se apaga sozinha em 7
// dias; a lista dos que ficaram de fora (nome e motivo) fica 90 dias depois de a importação terminar e se apaga sozinha. Pela rotina diária (as retenções da
// NotificacoesAgendador), com o prazo ajustável em Proteção de Dados → Políticas de retenção como as outras. As datas de verdade: o roteiro e2e-100.
describe("a guarda dos dados da importação (a rotina diária)", () => {
  const { sql } = require("../db");
  const POOL_G = { request: () => new sql.Request() };
  const { registrarAuditoriaNaTransacao } = require("../auditoria");
  function cenarioGuarda({ previas = [], foraApagadas = [], limpas = [], politicas = {}, rc = 0, semTabela = false, sem187 = false, paradas = [], paradasDeFora = 0,
    ninguem = [] }) {
    mockRegras = [
      [/OBJECT_ID\(N'dbo\.ImportacoesMembros', N'U'\) AS id, COL_LENGTH\(N'dbo\.ImportacoesMembros', N'UltimoLoteEm'\) AS col/,
        [{ id: semTabela ? null : 1234, col: semTabela || sem187 ? null : 4 }]],
      [/FROM PoliticasRetencao/, (i) => (politicas[i.c] ? [{ DiasRetencao: politicas[i.c] }] : [])],
      [/sp_getapplock/, [{ rc }]],
      [/SELECT ImportacaoId FROM ImportacoesMembros WHERE Situacao = N'PREVIA'/, previas.map((id) => ({ ImportacaoId: id }))],
      [/NOT EXISTS \(SELECT 1 FROM ImportacoesMembrosLinhas l WHERE l\.ImportacaoId = i\.ImportacaoId AND l\.Estado = N'IMPORTADA'\)/, ninguem],
      [/WHERE i\.Situacao = N'IMPORTANDO'/, paradas],
      [/N'NAO_TERMINOU'/, [{ n: paradasDeFora }]],
      [/SUM\(CASE WHEN Estado = N'IMPORTADA'/, [{ importadas: 3, fora: paradasDeFora, numeroNovo: 0, possivelRepetida: 0, semCongregacao: 0 }]],
      [/DELETE l OUTPUT/, foraApagadas],
      [/DECLARE @limpas/, limpas]
    ];
  }
  const trilhas = () => registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1]);

  // G2 (revisão de 24/11/2026): a importação que começou a gravar e parou (IMPORTANDO) não tinha prazo, e as linhas que faltavam ficavam com CPF, celular,
  // mãe e pai. O prazo é o da prévia (a planilha com dado pessoal esperando: 7 dias da confirmação; a política "prévia" ajusta os dois).
  test("G2: a importação parada há mais que o prazo, com gente que já entrou: as que faltavam ficam de fora (só nome e motivo) e ela conclui", async () => {
    cenarioGuarda({ paradas: [{ ImportacaoId: 9, Resumo: "{\"total\":5}", importadas: 3 }], paradasDeFora: 2 });
    const r = await db.aplicarRetencao(POOL_G);
    expect(r).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    const sel = mockConsultas.find((c) => /WHERE i\.Situacao = N'IMPORTANDO'/.test(c.sql));
    // G2 (decisão dele de 24/11/2026): do ÚLTIMO LOTE; sem nenhum lote gravado, da confirmação
    expect(sel.sql).toMatch(/COALESCE\(i\.UltimoLoteEm, i\.ConfirmadaEm\) < DATEADD\(DAY, -@d, SYSUTCDATETIME\(\)\)/);
    expect(sel.sql).not.toMatch(/AND i\.ConfirmadaEm </);
    expect(sel.sql).toMatch(/l\.Estado = N'PENDENTE'/);
    expect(sel.inputs.d).toBe(7);
    const marca = mockConsultas.find((c) => /N'NAO_TERMINOU'/.test(c.sql));
    expect(marca.inputs.id).toBe(9);
    expect(marca.sql).toMatch(/SET Acao = N'PROBLEMA', Estado = N'FORA', Problemas = N'NAO_TERMINOU'/);
    expect(marca.sql).toMatch(/Cpf = NULL/);
    expect(marca.sql).toMatch(/NomeMae = NULL/);
    expect(marca.sql).toMatch(/MatriculaArquivo = NULL/);
    expect(marca.sql).toMatch(/WHERE ImportacaoId = @id AND Estado = N'PENDENTE'/);
    const conclui = mockConsultas.find((c) => /SET Situacao = N'CONCLUIDA'/.test(c.sql));
    expect(conclui.inputs.id).toBe(9);
    expect(trilhas()).toEqual([
      expect.objectContaining({ registroId: 9, usuarioId: null, acao: "A rotina encerrou a importação parada há 7 dias (as linhas que faltavam ficaram de fora)",
        dadosDepois: { linhasDeFora: 2, retencaoDias: 7 } }),
      expect.objectContaining({ registroId: 9, usuarioId: null, acao: "Concluiu a importação do sistema pago" })]);
    expect(mockTx).toEqual(["begin", "commit"]);
  });
  // G2 (decisão dele de 24/11/2026): o mesmo prazo vale para a parada SEM ninguém importado. Concluir com zero soltaria a trava das matrículas e gastaria a
  // importação única com uma planilha que não entrou (e tirar só as linhas a deixava sem saída: o defeito do 7902eca). Vencido o prazo, ela é DESCARTADA:
  // as linhas saem inteiras (com os dados pessoais), a data da confirmação fica, o resumo guarda o prazo (a tela diz por quê) e as matrículas continuam
  // travadas, à espera da importação de verdade. Leitura da sessão, no relatório: sem lote gravado, o prazo conta da confirmação.
  test("G2: a parada sem ninguém importado, vencido o prazo, é descartada: as linhas saem, a data da confirmação fica e nada conclui", async () => {
    cenarioGuarda({ ninguem: [{ ImportacaoId: 11 }], paradas: [] });
    expect(await db.aplicarRetencao(POOL_G)).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    const sel = mockConsultas.find((c) => /NOT EXISTS \(SELECT 1 FROM ImportacoesMembrosLinhas l WHERE l\.ImportacaoId = i\.ImportacaoId AND l\.Estado = N'IMPORTADA'\)/.test(c.sql));
    expect(sel.sql).toMatch(/i\.Situacao = N'IMPORTANDO' AND COALESCE\(i\.UltimoLoteEm, i\.ConfirmadaEm\) < DATEADD\(DAY, -@d, SYSUTCDATETIME\(\)\)/);
    expect(sel.inputs.d).toBe(7);
    const apaga = mockConsultas.find((c) => /DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND NOT EXISTS/.test(c.sql));
    expect(apaga.inputs).toMatchObject({ id: 11, dias: 7 });
    // nunca apaga as linhas de quem já entrou (a ficha existe e a linha é o registro dela), também se alguém entrou depois da consulta
    expect(apaga.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM ImportacoesMembrosLinhas x WHERE x\.ImportacaoId = @id AND x\.Estado = N'IMPORTADA'\)/);
    expect(apaga.sql).toMatch(/SET Situacao = N'DESCARTADA', DescartadaEm = SYSUTCDATETIME\(\)/);
    expect(apaga.sql).toMatch(/'\$\.descartadaPeloPrazo', @dias/);
    expect(apaga.sql).toMatch(/WHERE ImportacaoId = @id AND Situacao = N'IMPORTANDO'/);
    expect(apaga.sql).not.toMatch(/ConfirmadaEm = NULL/);
    expect(mockConsultas.some((c) => /SET Situacao = N'CONCLUIDA'|N'NAO_TERMINOU'/.test(c.sql))).toBe(false);
    expect(trilhas()).toEqual([expect.objectContaining({ tabela: "ImportacoesMembros", registroId: 11, usuarioId: null,
      acao: "A rotina descartou a importação parada há 7 dias, sem ninguém importado", dadosDepois: { retencaoDias: 7 } })]);
    expect(mockTx).toEqual(["begin", "commit"]);
  });
  test("G2: a trilha da parada descartada cabe em 100 também com o prazo mais longo", async () => {
    cenarioGuarda({ ninguem: [{ ImportacaoId: 11 }], politicas: { [db.POLITICA_PREVIA.categoria]: 36500 } });
    await db.aplicarRetencao(POOL_G);
    expect(trilhas()).toHaveLength(1);
    for (const t of trilhas()) expect(t.acao.length).toBeLessThanOrEqual(100);
  });
  test("G2: o motivo novo tem o texto para a lista e o CSV; os textos da trilha cabem em 100 (com o prazo de 36.500 dias)", async () => {
    expect(require("../importacaoMembros").textoDe("NAO_TERMINOU")).toBe("A importação parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora "
      + "(entra na importação das linhas que faltaram, que é uma vez só, ou se cadastra à mão)");
    for (const importadas of [3]) {
      jest.clearAllMocks();
      cenarioGuarda({ paradas: [{ ImportacaoId: 9, Resumo: "{}", importadas }], paradasDeFora: 1, politicas: { [db.POLITICA_PREVIA.categoria]: 36500 } });
      await db.aplicarRetencao(POOL_G);
      for (const t of trilhas()) expect(t.acao.length).toBeLessThanOrEqual(100);
    }
  });
  test("a prévia não confirmada passa de 7 dias: as linhas (com CPF, celular, mãe e pai) saem e ela fica DESCARTADA, com a trilha", async () => {
    cenarioGuarda({ previas: [12] });
    const r = await db.aplicarRetencao(POOL_G);
    expect(r).toEqual({ previasDescartadas: 1, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    const sel = mockConsultas.find((c) => /SELECT ImportacaoId FROM ImportacoesMembros WHERE Situacao = N'PREVIA'/.test(c.sql));
    expect(sel.sql).toMatch(/CriadaEm < DATEADD\(DAY, -@d, SYSUTCDATETIME\(\)\)/);
    expect(sel.inputs.d).toBe(7);
    const apaga = mockConsultas.find((c) => /DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id/.test(c.sql));
    expect(apaga.inputs.id).toBe(12);
    expect(apaga.sql).toMatch(/SET Situacao = N'DESCARTADA'/);
    expect(trilhas()).toEqual([expect.objectContaining({ tabela: "ImportacoesMembros", registroId: 12, usuarioId: null,
      acao: "A rotina descartou a prévia da importação que não foi confirmada em 7 dias" })]);
    expect(mockTx).toEqual(["begin", "commit"]);
  });
  test("a lista dos de fora passa de 90 dias depois de terminar: só as linhas de fora saem (as importadas ficam), o resumo guarda o dia e a trilha diz quantas", async () => {
    cenarioGuarda({ foraApagadas: [{ ImportacaoId: 7, n: 4 }] });
    const r = await db.aplicarRetencao(POOL_G);
    expect(r).toEqual({ previasDescartadas: 0, linhasForaApagadas: 4, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    const del = mockConsultas.find((c) => /DELETE l OUTPUT/.test(c.sql));
    expect(del.sql).toMatch(/i\.Situacao = N'CONCLUIDA'/);
    expect(del.sql).toMatch(/i\.ConcluidaEm < DATEADD\(DAY, -@d, SYSUTCDATETIME\(\)\)/);
    expect(del.sql).toMatch(/l\.Estado = N'FORA'/);
    expect(del.sql).not.toMatch(/IMPORTADA/);
    expect(del.inputs.d).toBe(90);
    const marca = mockConsultas.find((c) => /JSON_MODIFY/.test(c.sql));
    // em UTC, com o Z: a tela mostra no horário de Brasília
    expect(marca.sql).toMatch(/\$\.foraApagadaEm', CONVERT\(varchar\(19\), SYSUTCDATETIME\(\), 126\) \+ 'Z'\)/);
    // G4 (revisão de 24/11): o resumo guarda também o prazo que valeu no dia em que apagou (a tela não usa o prazo de hoje)
    expect(marca.sql).toMatch(/'\$\.foraDias', @d\)/);
    expect(marca.inputs.d).toBe(90);
    expect(marca.inputs.id).toBe(7);
    expect(trilhas()).toEqual([expect.objectContaining({ registroId: 7, usuarioId: null, acao: "A rotina apagou a lista dos que ficaram de fora da importação (90 dias depois do fim)",
      dadosDepois: { linhasApagadas: 4, retencaoDias: 90 } })]);
  });
  test("a importação que terminou antes desta versão: a rotina tira o que sobrou nas linhas (os dados pessoais; nas de fora, tudo menos o nome e o motivo), com a trilha", async () => {
    cenarioGuarda({ limpas: [{ ImportacaoId: 5, n: 12 }] });
    expect(await db.aplicarRetencao(POOL_G)).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 12, diasPrevia: 7, diasFora: 90 });
    const q = mockConsultas.find((c) => /DECLARE @limpas/.test(c.sql)).sql;
    const ups = q.split(";").map((s) => s.trim()).filter((s) => /^UPDATE l\b/.test(s));
    expect(ups).toHaveLength(2);
    for (const u of ups) expect(u).toMatch(/JOIN ImportacoesMembros i ON i\.ImportacaoId = l\.ImportacaoId WHERE i\.Situacao = N'CONCLUIDA' AND/);
    // só a linha que ainda tem alguma coisa: rodar de novo não mexe em nada nem escreve na trilha
    expect(ups[0]).toMatch(/l\.Cpf IS NOT NULL/);
    expect(ups[0]).toMatch(/l\.NomeMae IS NOT NULL/);
    expect(ups[1]).toMatch(/l\.Estado = N'FORA' AND \(l\.MatriculaArquivo IS NOT NULL OR/);
    expect(ups[1]).toMatch(/l\.NumeroNovo = 1/);
    expect(ups[1]).toMatch(/l\.Avisos IS NOT NULL/);
    // a mesma linha nas duas: conta uma vez
    expect(q).toMatch(/COUNT\(DISTINCT Linha\)/);
    expect(trilhas()).toEqual([expect.objectContaining({ tabela: "ImportacoesMembros", registroId: 5, usuarioId: null,
      acao: "A rotina limpou as linhas da importação (de quem ficou de fora, só o nome e o motivo)",
      dadosDepois: { linhasLimpas: 12 } })]);
  });
  test("cada texto da trilha da guarda cabe nos 100 caracteres da AuditLog.Acao (cortado, quebraria a cadeia de hashes), também com o prazo mais longo", async () => {
    cenarioGuarda({ previas: [12], foraApagadas: [{ ImportacaoId: 7, n: 1 }], limpas: [{ ImportacaoId: 5, n: 1 }],
      politicas: { [db.POLITICA_PREVIA.categoria]: 36500, [db.POLITICA_FORA.categoria]: 36500 } });
    await db.aplicarRetencao(POOL_G);
    expect(trilhas()).toHaveLength(3);
    for (const a of trilhas()) expect(a.acao.length).toBeLessThanOrEqual(100);
  });
  test("nada vencido: nada muda e nada vai para a trilha", async () => {
    cenarioGuarda({});
    expect(await db.aplicarRetencao(POOL_G)).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    expect(mockConsultas.some((c) => /DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id|JSON_MODIFY/.test(c.sql))).toBe(false);
    expect(trilhas()).toEqual([]);
  });
  test("o prazo ajustado pelo Encarregado (Políticas de retenção) vale; sem a política, 7 e 90", async () => {
    cenarioGuarda({ politicas: { [db.POLITICA_PREVIA.categoria]: 3, [db.POLITICA_FORA.categoria]: 30 } });
    expect(await db.aplicarRetencao(POOL_G)).toMatchObject({ diasPrevia: 3, diasFora: 30 });
    expect(mockConsultas.find((c) => /WHERE Situacao = N'PREVIA'/.test(c.sql)).inputs.d).toBe(3);
    expect(mockConsultas.find((c) => /DELETE l OUTPUT/.test(c.sql)).inputs.d).toBe(30);
    expect(db.POLITICA_PREVIA).toEqual({ categoria: "Membros — prévia da importação que não foi confirmada", padrao: 7 });
    expect(db.POLITICA_FORA).toEqual({ categoria: "Membros — lista dos que ficaram de fora da importação", padrao: 90 });
  });
  test("a importação ocupada (a Geral mexendo agora): a rotina não mexe em nada e falha, para a de amanhã repetir", async () => {
    cenarioGuarda({ previas: [12], rc: -1 });
    await expect(db.aplicarRetencao(POOL_G)).rejects.toThrow(/ocupada/);
    expect(mockConsultas.some((c) => /DELETE/.test(c.sql))).toBe(false);
  });
  test("a base sem a migração 185 (as bases antigas dos roteiros e2e): a rotina não faz nada e não falha", async () => {
    cenarioGuarda({ previas: [12], semTabela: true });
    expect(await db.aplicarRetencao(POOL_G)).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    expect(mockConsultas.some((c) => /sp_getapplock|DELETE/.test(c.sql))).toBe(false);
    expect(mockTx).toEqual([]);
  });
  test("a base com a 185 e sem a 187 (as bases dos roteiros de antes do G2): a rotina não faz nada e não falha", async () => {
    cenarioGuarda({ previas: [12], paradas: [{ ImportacaoId: 9, Resumo: "{}" }], sem187: true });
    expect(await db.aplicarRetencao(POOL_G)).toEqual({ previasDescartadas: 0, linhasForaApagadas: 0, linhasLimpas: 0, diasPrevia: 7, diasFora: 90 });
    expect(mockConsultas.some((c) => /sp_getapplock|DELETE|UltimoLoteEm </.test(c.sql))).toBe(false);
    expect(mockTx).toEqual([]);
  });
  test("o estado leva os prazos da guarda para a tela (a nota do \"Descartar\" e a do resultado dizem o prazo de verdade, também o ajustado)", async () => {
    cenarioGuarda({});
    expect((await db.estado(POOL_G)).guarda).toEqual({ diasPrevia: 7, diasFora: 90 });
    cenarioGuarda({ politicas: { [db.POLITICA_PREVIA.categoria]: 3, [db.POLITICA_FORA.categoria]: 30 } });
    expect((await db.estado(POOL_G)).guarda).toEqual({ diasPrevia: 3, diasFora: 30 });
  });
});

// G2 (decisão dele de 24/11/2026): a importação confirmada que parou sem ninguém importado ganha a saída "descartar a importação" (à mão, pela Secretaria
// Geral; a rota pede a confirmação recente). Só a que não gravou ninguém: a que já gravou alguém continua, ou o prazo a encerra com a lista dos que faltaram.
describe("G2: descartar a importação parada sem ninguém importado", () => {
  const { sql } = require("../db");
  const POOL_D = { request: () => new sql.Request() };
  const { registrarAuditoriaNaTransacao } = require("../auditoria");
  const situacao = (linhas) => [/FROM ImportacoesMembros WHERE Situacao IN/, linhas];
  const andamento = (id = 9) => ({ ImportacaoId: id, Situacao: "IMPORTANDO", ConfirmadaEm: new Date(), UltimoLoteEm: null, Resumo: "{}" });
  const contas = (importadas) => [/AS importadas,\s+SUM/, [{ importadas, restantes: 4 }]];
  test("sem ninguém importado: as linhas saem inteiras e ela fica DESCARTADA (a data da confirmação fica), com a trilha de quem descartou", async () => {
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([andamento()]), contas(0)];
    expect(await db.descartarParada(POOL_D, QUEM, "9")).toEqual({ sucesso: true });
    const apaga = mockConsultas.find((c) => /DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND NOT EXISTS/.test(c.sql));
    expect(apaga.inputs).toMatchObject({ id: 9, dias: null });
    expect(apaga.sql).toMatch(/WHERE ImportacaoId = @id AND Situacao = N'IMPORTANDO'/);
    expect(registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1])).toEqual([expect.objectContaining({ tabela: "ImportacoesMembros", registroId: 9, usuarioId: 1,
      acao: "Descartou a importação parada, sem ninguém importado" })]);
    expect(mockTx).toEqual(["begin", "commit"]);
  });
  test("a que já gravou alguém não se descarta (409, nada sai); a que não é a parada de agora, 409; sem a importação, 400; a trava ocupada, 409", async () => {
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([andamento()]), contas(3)];
    expect(await db.descartarParada(POOL_D, QUEM, 9)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.JA_ENTROU_ALGUEM });
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([andamento(9)]), contas(0)];
    expect(await db.descartarParada(POOL_D, QUEM, 10)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.NAO_ESTA_PARADA });
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([{ ImportacaoId: 9, Situacao: "PREVIA", Resumo: "{}" }]), contas(0)];
    expect(await db.descartarParada(POOL_D, QUEM, 9)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.NAO_ESTA_PARADA });
    expect(mockConsultas.some((c) => /DELETE/.test(c.sql))).toBe(false);
    expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
    mockConsultas = [];
    // (o e2e-102 achou: Number([9]) e Number(true) viravam 9 e 1; só o número, ou o texto só com dígitos, vale)
    for (const lixo of [null, "x", -1, 0, 1.5, "9; DROP TABLE x", 2147483647, [9], ["9"], true, { id: 9 }, "", " ", "0x9", "9e0", "+9"]) {
      expect(await db.descartarParada(POOL_D, QUEM, lixo)).toEqual({ sucesso: false, status: 400, mensagem: "Informe a importação." });
      expect(await db.confirmar(POOL_D, QUEM, lixo)).toEqual({ sucesso: false, status: 400, mensagem: "Informe a importação." });
    }
    expect(mockConsultas).toEqual([]);
    mockRegras = [[/sp_getapplock/, [{ rc: -1 }]]];
    expect(await db.descartarParada(POOL_D, QUEM, 9)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.OCUPADO });
  });
  test("o lote da importação descartada diz que ela foi descartada (e não que não foi confirmada)", async () => {
    cenario({ linhas: [], gravar: () => ({ ocupada: false, donoCpf: null }), situacao: "DESCARTADA" });
    expect(await db.importarLote(POOL, QUEM, 7)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.DESCARTADA });
  });
  test("a mensagem de quando ninguém entrou aponta a saída nova", () => {
    expect(db.MSG.NINGUEM_ENTROU).toBe("O sistema não conseguiu gravar nenhuma pessoa desta importação: ela parou sem deixar ninguém de fora. "
      + "Avise o suporte, ou descarte a importação e faça outra.");
  });
  // a parada descartada pelo prazo não pode sumir calada: a tela volta ao arquivo dizendo que a importação de tal dia foi descartada no fim do prazo
  test("o estado depois da descartada pelo prazo: a tela diz qual foi e quando (só se ela for a última e não houver outra)", async () => {
    const descartada = { ImportacaoId: 12, Situacao: "DESCARTADA", NomeArquivo: "membros.csv", ConfirmadaEm: new Date("2026-12-01T13:00:00Z"),
      DescartadaEm: new Date("2026-12-09T06:00:00Z"), Resumo: JSON.stringify({ total: 4, descartadaPeloPrazo: 7 }) };
    mockRegras = [situacao([descartada]), [/SELECT MAX\(ImportacaoId\) AS ultima FROM ImportacoesMembros/, [{ ultima: 12 }]]];
    const r = await db.estado(POOL_D);
    expect(r).toMatchObject({ feita: false, emAndamento: false, importacao: null });
    expect(r.descartadaPeloPrazo).toEqual({ importacaoId: 12, nomeArquivo: "membros.csv", confirmadaEm: descartada.ConfirmadaEm, descartadaEm: descartada.DescartadaEm, dias: 7 });
    expect(mockConsultas.find((c) => /FROM ImportacoesMembros WHERE Situacao IN/.test(c.sql)).sql)
      .toMatch(/OR \(Situacao = N'DESCARTADA' AND ConfirmadaEm IS NOT NULL\)/);
    // houve outra depois (uma prévia descartada): não mostra mais
    mockRegras = [situacao([descartada]), [/SELECT MAX\(ImportacaoId\) AS ultima FROM ImportacoesMembros/, [{ ultima: 13 }]]];
    expect((await db.estado(POOL_D)).descartadaPeloPrazo).toBeNull();
    // descartada à mão (sem o prazo no resumo): a tela não precisa explicar
    mockRegras = [situacao([{ ...descartada, Resumo: "{}" }]), [/SELECT MAX\(ImportacaoId\) AS ultima/, [{ ultima: 12 }]]];
    expect((await db.estado(POOL_D)).descartadaPeloPrazo).toBeNull();
    // com uma prévia aberta depois: a prévia é a de agora
    mockRegras = [situacao([descartada, { ImportacaoId: 14, Situacao: "PREVIA", Resumo: "{}" }]), [/SELECT MAX\(ImportacaoId\) AS ultima/, [{ ultima: 14 }]]];
    const comPrevia = await db.estado(POOL_D);
    expect(comPrevia.descartadaPeloPrazo).toBeNull();
    expect(comPrevia.importacao).toMatchObject({ importacaoId: 14, situacao: "PREVIA" });
  });
});

// G2 (decisão dele de 24/11/2026): com a lista de QUAIS linhas faltaram (a linha e o nome), a Secretaria Geral faz UMA importação nova só com elas — a exceção
// ao "uma vez só" (MSG.JA_IMPORTADO), só para o resto daquela importação. O caminho no banco de verdade: o roteiro e2e-102.
describe("G2: a importação só das linhas que faltaram (o resto)", () => {
  const { sql } = require("../db");
  const POOL_R = { request: () => new sql.Request() };
  const { registrarAuditoriaNaTransacao } = require("../auditoria");
  const regras = require("../importacaoMembros");
  const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
  const ARQUIVO = [CAB, "70100;Ana Já Entrou;IEADESPA - Vila Nova", "70101;Bia Já Entrou;IEADESPA - Vila Nova", "70102;Paulo Henrique Dias;IEADESPA - Vila Nova",
    "70103;Raquel Monteiro;IEADESPA - Vila Nova"].join("\r\n");
  const concluida = (extra = {}) => ({ ImportacaoId: 7, Situacao: "CONCLUIDA", RestoDe: null, NomeArquivo: "membros.csv", ConcluidaEm: new Date("2026-12-20T09:00:00Z"),
    ConfirmadaEm: new Date("2026-12-01T09:00:00Z"), ConfirmadaPor: 1, Resumo: JSON.stringify({ resultado: { importadas: 2, fora: 2 } }), ...extra });
  const situacao = (linhas) => [/FROM ImportacoesMembros WHERE Situacao IN/, linhas];
  const faltaram = (linhas) => [/SELECT Linha, Nome FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND Estado = N'FORA' AND Problemas = N'NAO_TERMINOU' ORDER BY Linha/, linhas];
  const FALTARAM = [{ Linha: 4, Nome: "Paulo Henrique Dias" }, { Linha: 5, Nome: "Raquel Monteiro" }];
  const basePrevia = (sit, falta = FALTARAM) => [[/sp_getapplock/, [{ rc: 0 }]], situacao(sit), faltaram(falta),
    [/FROM Congregacoes/, [{ CongregacaoId: 1, Nome: "Vila Nova", Ativa: true }]],
    // a 70103 foi tomada depois da importação de antes (um cadastro novo): a linha entra com a próxima do sistema
    [/JOIN MembroReferencia m ON m\.MembroId = j\.v/, (i) => (JSON.parse(i.j).includes(70103) ? [{ MembroId: 70103, Nome: "Fulano Cadastrado Depois", Cpf: null }] : [])],
    [/ISNULL\(MAX\(MembroId\), 0\)/, [{ m: 70200 }]],
    [/INSERT INTO ImportacoesMembros \(/, [{ ImportacaoId: 8 }]]];
  test("a prévia do resto: do MESMO arquivo, só as linhas que faltaram; a matrícula tomada depois vira número novo; grava de qual importação é o resto", async () => {
    mockRegras = basePrevia([concluida()]);
    const r = await db.criarPrevia(POOL_R, QUEM, { nomeArquivo: "membros.csv", texto: ARQUIVO, resto: true });
    expect(r).toMatchObject({ sucesso: true, importacaoId: 8 });
    expect(r.resumo).toMatchObject({ total: 2, novas: 2, numeroNovo: 1, problemas: 0,
      resto: { de: 7, faltaram: 2, achadas: 2, naoAchadas: 0, ambiguas: 0, foraDaLista: 2, listaNaoAchadas: [] } });
    expect(r.resumo.avisosGerais.map((a) => a.codigo)).not.toContain("RESTO_NAO_ACHADAS");
    // só as matrículas das linhas achadas vão ao banco (as das que já entraram, não)
    expect(JSON.parse(mockConsultas.find((c) => /JOIN MembroReferencia m ON m\.MembroId = j\.v/.test(c.sql)).inputs.j)).toEqual([70102, 70103]);
    expect(mockConsultas.find((c) => /Problemas = N'NAO_TERMINOU' ORDER BY Linha/.test(c.sql)).inputs.id).toBe(7);
    const cab = mockConsultas.find((c) => /INSERT INTO ImportacoesMembros \(/.test(c.sql));
    expect(cab.sql).toMatch(/RestoDe/);
    expect(cab.inputs.resto).toBe(7);
    const ls = JSON.parse(mockConsultas.find((c) => /INSERT INTO ImportacoesMembrosLinhas/.test(c.sql)).inputs.j);
    expect(ls.map((l) => [l.l, l.n, l.a, l.m, l.nn, l.mn])).toEqual([[4, "Paulo Henrique Dias", "NOVA", 70102, 0, null], [5, "Raquel Monteiro", "NOVA", null, 1, "DE_OUTRA_FICHA"]]);
    expect(registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1])).toEqual([expect.objectContaining({ registroId: 8, acao: "Fez a prévia da importação das linhas que faltaram",
      dadosDepois: expect.objectContaining({ restoDe: 7, total: 2, naoAchadas: 0 }) })]);
    expect(mockTx).toEqual(["begin", "commit"]);
  });
  test("a linha que faltou e não está no arquivo: a prévia avisa (não passa calada); nenhuma achada: 409 e nada se grava", async () => {
    mockRegras = basePrevia([concluida()], [...FALTARAM, { Linha: 9, Nome: "Samuel Brito" }]);
    const r = await db.criarPrevia(POOL_R, QUEM, { texto: ARQUIVO, resto: true });
    expect(r.resumo.resto).toMatchObject({ faltaram: 3, achadas: 2, naoAchadas: 1, listaNaoAchadas: [{ linha: 9, nome: "Samuel Brito" }] });
    expect(r.resumo.avisosGerais[0]).toMatchObject({ codigo: "RESTO_NAO_ACHADAS" });
    mockConsultas = [];
    mockRegras = basePrevia([concluida()], [{ Linha: 9, Nome: "Samuel Brito" }]);
    expect(await db.criarPrevia(POOL_R, QUEM, { texto: ARQUIVO, resto: true })).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RESTO_NADA_ACHADO });
    expect(mockConsultas.some((c) => /INSERT/.test(c.sql))).toBe(false);
  });
  test("o resto só existe uma vez e só depois da importação concluída: cada recusa vem antes de ler o arquivo, e de novo debaixo da trava", async () => {
    const tenta = () => db.criarPrevia(POOL_R, QUEM, { texto: ARQUIVO, resto: true });
    mockRegras = basePrevia([]);
    expect(await tenta()).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RESTO_SEM_IMPORTACAO });
    mockRegras = basePrevia([concluida(), { ImportacaoId: 8, Situacao: "IMPORTANDO", RestoDe: 7, Resumo: "{}" }]);
    expect(await tenta()).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.EM_ANDAMENTO });
    mockRegras = basePrevia([concluida(), concluida({ ImportacaoId: 8, RestoDe: 7 })]);
    expect(await tenta()).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RESTO_JA_FEITO });
    mockRegras = basePrevia([concluida()], []);
    expect(await tenta()).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.SEM_RESTO });
    expect(mockConsultas.some((c) => /INSERT|FROM Congregacoes/.test(c.sql))).toBe(false);
    // de novo debaixo da trava: outra aba concluiu o resto entre a leitura e a gravação
    let leituras = 0;
    mockConsultas = [];
    mockRegras = basePrevia([]);
    mockRegras.splice(1, 1, situacao(() => (++leituras === 1 ? [concluida()] : [concluida(), concluida({ ImportacaoId: 8, RestoDe: 7 })])));
    expect(await tenta()).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RESTO_JA_FEITO });
    expect(mockConsultas.some((c) => /INSERT/.test(c.sql))).toBe(false);
  });
  test("o resto que não é exatamente true é a prévia de sempre: com a importação concluída, uma vez só (JA_IMPORTADO)", async () => {
    for (const lixo of ["true", 1, [true], { sim: true }, null, undefined]) {
      mockRegras = basePrevia([concluida()]);
      expect(await db.criarPrevia(POOL_R, QUEM, { texto: ARQUIVO, resto: lixo })).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.JA_IMPORTADO });
    }
  });
  test("confirmar o resto: a exceção ao 'uma vez só' vale só para a prévia do resto da importação concluída, e uma vez", async () => {
    const previaResto = (extra = {}) => ({ ImportacaoId: 8, Situacao: "PREVIA", RestoDe: 7, Resumo: "{}", ...extra });
    const contar = [/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 2 }]];
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), previaResto()]), contar];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: true, importacaoId: 8, restantes: 2 });
    expect(registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1].acao)).toEqual(["Confirmou a importação das linhas que faltaram"]);
    // a prévia comum, com a importação concluída: uma vez só
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), previaResto({ RestoDe: null })]), contar];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.JA_IMPORTADO });
    // o resto de outra importação (não a concluída de agora): não vale
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), previaResto({ RestoDe: 6 })]), contar];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.PREVIA_MUDOU });
    // o resto já feito: não há segundo
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), concluida({ ImportacaoId: 9, RestoDe: 7 }), previaResto()]), contar];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RESTO_JA_FEITO });
    // a prévia do resto que foi substituída por outra (ou descartada): "não é mais a atual", e não "já foi feita" (o e2e-102 achou)
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), previaResto({ ImportacaoId: 10 })]), contar,
      [/SELECT RestoDe FROM ImportacoesMembros WHERE ImportacaoId = @id/, (i) => (i.id === 8 ? [{ RestoDe: 7 }] : [])]];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.PREVIA_MUDOU });
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida()]), contar, [/SELECT RestoDe FROM ImportacoesMembros WHERE ImportacaoId = @id/, [{ RestoDe: 7 }]]];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.PREVIA_MUDOU });
    // o resto confirmado e em andamento: confirmar de novo é o "continue"
    mockRegras = [[/sp_getapplock/, [{ rc: 0 }]], situacao([concluida(), previaResto({ Situacao: "IMPORTANDO" })]), contar];
    expect(await db.confirmar(POOL_R, QUEM, 8)).toEqual({ sucesso: true, importacaoId: 8, jaConfirmada: true, restantes: 2 });
  });
  test("o estado com o resto: o que faltou (quantas e as 10 primeiras, só linha e nome), se pode, se está aberto e o que foi feito", async () => {
    const lista = [/SELECT TOP \(10\) Linha, Nome, COUNT\(\*\) OVER \(\) AS Total FROM ImportacoesMembrosLinhas/, [{ Linha: 4, Nome: "Paulo Henrique Dias", Total: 2 },
      { Linha: 5, Nome: "Raquel Monteiro", Total: 2 }]];
    mockRegras = [situacao([concluida()]), lista];
    let r = await db.estado(POOL_R);
    expect(r).toMatchObject({ feita: true, emAndamento: false, importacao: { importacaoId: 7, situacao: "CONCLUIDA", restoDe: null } });
    expect(r.resto).toEqual({ de: 7, faltaram: 2, linhas: [{ linha: 4, nome: "Paulo Henrique Dias" }, { linha: 5, nome: "Raquel Monteiro" }], possivel: true, aberto: false,
      feito: null });
    expect(mockConsultas.find((c) => /SELECT TOP \(10\) Linha, Nome/.test(c.sql)).inputs.id).toBe(7);
    expect(mockConsultas.find((c) => /SELECT TOP \(10\) Linha, Nome/.test(c.sql)).sql).toMatch(/Estado = N'FORA' AND Problemas = N'NAO_TERMINOU'/);
    expect(mockConsultas.find((c) => /FROM ImportacoesMembros WHERE Situacao IN/.test(c.sql)).sql).toMatch(/RestoDe/);
    // a prévia do resto aberta: ela é a importação de agora (a tela abre nos números)
    mockRegras = [situacao([concluida(), { ImportacaoId: 8, Situacao: "PREVIA", RestoDe: 7, Resumo: "{}" }]), lista];
    r = await db.estado(POOL_R);
    expect(r).toMatchObject({ feita: true, importacao: { importacaoId: 8, situacao: "PREVIA", restoDe: 7 }, resto: { possivel: false, aberto: true, feito: null } });
    // em andamento: o prazo da parada vale para ele também
    mockRegras = [situacao([concluida(), { ImportacaoId: 8, Situacao: "IMPORTANDO", RestoDe: 7, ConfirmadaEm: new Date(), UltimoLoteEm: null, Resumo: "{}" }]), lista,
      [/AS importadas,\s+SUM/, [{ importadas: 0, restantes: 2 }]]];
    r = await db.estado(POOL_R);
    expect(r).toMatchObject({ emAndamento: true, restantes: 2, importadas: 0, importacao: { importacaoId: 8, restoDe: 7 }, prazo: { dias: 7, faltam: 7 },
      resto: { possivel: false, aberto: true } });
    // feito: a tela volta ao resultado da importação de antes, com o que o resto fez; o retrato é o da importação de antes
    mockConsultas = [];
    const fim = new Date("2026-12-22T10:00:00Z");
    mockRegras = [situacao([concluida(), concluida({ ImportacaoId: 8, RestoDe: 7, ConcluidaEm: fim, Resumo: JSON.stringify({ resultado: { importadas: 1, fora: 1 } }) })]), lista];
    r = await db.estado(POOL_R);
    expect(r.importacao).toMatchObject({ importacaoId: 7 });
    expect(r.resto).toMatchObject({ possivel: false, aberto: false, feito: { importacaoId: 8, concluidaEm: fim, importadas: 1, fora: 1 } });
    expect(mockConsultas.filter((c) => /GROUP BY a\.AreaId/.test(c.sql)).map((c) => c.inputs.id)).toEqual([7]);
    // nada faltou (ou a lista já se apagou) e nenhum resto: nada a mostrar
    mockRegras = [situacao([concluida()])];
    expect((await db.estado(POOL_R)).resto).toBeNull();
    // sem importação concluída: sem resto
    mockRegras = [situacao([]), lista];
    expect((await db.estado(POOL_R)).resto).toBeNull();
  });
  test("o resto parado sem ninguém que a rotina descartou: a tela do resultado diz qual foi (e o resto volta a ser possível)", async () => {
    const lista = [/SELECT TOP \(10\) Linha, Nome/, [{ Linha: 4, Nome: "Paulo Henrique Dias", Total: 1 }]];
    const descartada = { ImportacaoId: 8, Situacao: "DESCARTADA", RestoDe: 7, NomeArquivo: "membros.csv", ConfirmadaEm: new Date("2026-12-21T09:00:00Z"),
      DescartadaEm: new Date("2026-12-29T06:00:00Z"), Resumo: JSON.stringify({ descartadaPeloPrazo: 7 }) };
    mockRegras = [situacao([concluida(), descartada]), lista, [/SELECT MAX\(ImportacaoId\) AS ultima/, [{ ultima: 8 }]]];
    const r = await db.estado(POOL_R);
    expect(r.importacao).toMatchObject({ importacaoId: 7 });
    expect(r.descartadaPeloPrazo).toMatchObject({ importacaoId: 8, dias: 7 });
    expect(r.resto).toMatchObject({ possivel: true, aberto: false, feito: null });
  });
  test("a lista e o CSV da importação de antes: depois do resto feito, o motivo de quem faltou diz que o resto já foi feito", async () => {
    const linhaFora = { Total: 1, Linha: 4, MatriculaArquivo: null, Nome: "Paulo Henrique Dias", Acao: "PROBLEMA", Estado: "FORA", MatriculaFinal: null, Problemas: "NAO_TERMINOU",
      Avisos: null, NumeroNovo: false, MotivoNumero: null };
    const cenarioLista = (feito) => [[/SELECT Resumo FROM ImportacoesMembros/, [{ Resumo: "{}" }]], [/WITH ordem AS/, [linhaFora]],
      [/FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND \(Acao = N'PROBLEMA'/, [linhaFora]],
      [/WHERE RestoDe = @id AND Situacao = N'CONCLUIDA'/, feito ? [{ ImportacaoId: 8 }] : []]];
    mockRegras = cenarioLista(false);
    expect((await db.listar(POOL_R, 7)).itens[0].motivos).toEqual([regras.PROBLEMAS.NAO_TERMINOU]);
    expect(await db.csv(POOL_R, 7)).toContain(regras.PROBLEMAS.NAO_TERMINOU);
    mockRegras = cenarioLista(true);
    expect((await db.listar(POOL_R, 7)).itens[0].motivos).toEqual([regras.PROBLEMAS.NAO_TERMINOU_RESTO_FEITO]);
    expect(await db.csv(POOL_R, 7)).toContain(regras.PROBLEMAS.NAO_TERMINOU_RESTO_FEITO);
    expect(mockConsultas.find((c) => /WHERE RestoDe = @id AND Situacao = N'CONCLUIDA'/.test(c.sql)).inputs.id).toBe(7);
  });
  test("o painel do arrolamento diz o dia em que vieram pela importação de antes (o resto, depois, não muda a data)", () => {
    const f = require("fs").readFileSync(require("path").join(__dirname, "..", "arrolamentoDb.js"), "utf8");
    expect(f).toMatch(/SELECT MIN\(ConcluidaEm\) AS veio FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA'/);
  });
});
