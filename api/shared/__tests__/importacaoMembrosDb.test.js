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
    // A6 (revisão de 24/11): a tela ganha a saída (podeDeixarDeFora); os números das linhas vão só para mostrar, o servidor nunca os lê de volta
    expect(r).toEqual({ sucesso: false, status: 409, mensagem: db.MSG.RECUSADAS(2), podeDeixarDeFora: true, recusadas: [2, 3, 4, 5, 6] });
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

// A GUARDA DOS DADOS DA IMPORTAÇÃO (respostas dele de 23/11/2026, LGPD): a prévia que não foi confirmada (com CPF, celular, mãe e pai) se apaga sozinha em 7
// dias; a lista dos que ficaram de fora (nome e motivo) fica 90 dias depois de a importação terminar e se apaga sozinha. Pela rotina diária (as retenções da
// NotificacoesAgendador), com o prazo ajustável em Proteção de Dados → Políticas de retenção como as outras. As datas de verdade: o roteiro e2e-100.
describe("a guarda dos dados da importação (a rotina diária)", () => {
  const { sql } = require("../db");
  const POOL_G = { request: () => new sql.Request() };
  const { registrarAuditoriaNaTransacao } = require("../auditoria");
  function cenarioGuarda({ previas = [], foraApagadas = [], limpas = [], politicas = {}, rc = 0, semTabela = false }) {
    mockRegras = [
      [/OBJECT_ID\(N'dbo\.ImportacoesMembros', N'U'\)/, [{ id: semTabela ? null : 1234 }]],
      [/FROM PoliticasRetencao/, (i) => (politicas[i.c] ? [{ DiasRetencao: politicas[i.c] }] : [])],
      [/sp_getapplock/, [{ rc }]],
      [/SELECT ImportacaoId FROM ImportacoesMembros WHERE Situacao = N'PREVIA'/, previas.map((id) => ({ ImportacaoId: id }))],
      [/DELETE l OUTPUT/, foraApagadas],
      [/DECLARE @limpas/, limpas]
    ];
  }
  const trilhas = () => registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1]);

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
  test("o estado leva os prazos da guarda para a tela (a nota do \"Descartar\" e a do resultado dizem o prazo de verdade, também o ajustado)", async () => {
    cenarioGuarda({});
    expect((await db.estado(POOL_G)).guarda).toEqual({ diasPrevia: 7, diasFora: 90 });
    cenarioGuarda({ politicas: { [db.POLITICA_PREVIA.categoria]: 3, [db.POLITICA_FORA.categoria]: 30 } });
    expect((await db.estado(POOL_G)).guarda).toEqual({ diasPrevia: 3, diasFora: 30 });
  });
});
