// FASE 10, Membros (23/11/2026) — A TRAVA DAS MATRÍCULAS. Decisão do responsável: "Ninguém vai ser cadastrado antes da importação. Não é para ninguém se
// cadastrar antes disso. Eu só vou liberar depois de importar." Enquanto não existir uma importação do sistema pago CONCLUÍDA (ImportacoesMembros, migração
// 185), o servidor recusa criar ficha NOVA por qualquer caminho: o "Cadastrar" (matrícula gerada ou digitada), o importador antigo, o aceite da fila, o
// lançar na fila e o "Quero me cadastrar" do site. Editar uma ficha que já existe continua livre; o importador novo não passa por aqui. E a importação que
// terminaria com ZERO pessoas importadas é recusada na confirmação (não pode virar CONCLUIDA, soltar a trava nem gastar a importação única).
// O banco é simulado pelo TEXTO da consulta; contra o SQL Server de verdade: tools/e2e-localdb/e2e-97-trava-matriculas.js.
process.env.PRE_CADASTRO_SITE_MIN_MS = "0";
let mockConsultas = [];
let mockRegras = [];
let mockLiberadas = false;
let mockTransacao = { begin: 0, commit: 0, rollback: 0 };
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    if (/FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA'/.test(texto)) return { recordset: [{ liberadas: mockLiberadas ? 1 : 0 }], rowsAffected: [0] };
    if (/sp_getapplock/.test(texto)) return { recordset: [{ rc: 0, resultado: 0 }], rowsAffected: [0] };
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { mockTransacao.begin++; } async commit() { mockTransacao.commit++; } async rollback() { mockTransacao.rollback++; } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request, MAX: -1 }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true),
  registrarAuditoriaEmLoteNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => true) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const matriculaNova = require("../matriculaNova");
const pdb = require("../preCadastroDb");
const regrasPre = require("../preCadastro");
const importacao = require("../importacaoMembrosDb");
const hPessoas = require("../../GestaoPessoas/index.js");
const hImportar = require("../../ImportarPessoas/index.js");
const hFila = require("../../PreCadastros/index.js");
const hSite = require("../../PreCadastroSite/index.js");

const MSG = "As matrículas novas só começam depois da importação do sistema pago.";
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const ctx = (binding = {}) => ({ bindingData: binding, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) });
const cab = (extra = {}) => ({ "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", ...extra });
async function chamar(handler, { metodo = "POST", corpo = {}, token, binding = {}, headers = {} } = {}) {
  const c = ctx(binding);
  await handler(c, { method: metodo, query: {}, body: corpo, headers: cab({ ...(token ? { "x-auth-token": token } : {}), ...headers }) });
  return c.res;
}
const fator = () => ({ via: "CHAVE", em: Date.now() });
const tokenLocal = () => auth.reassinarSessao({ membroId: 5, via: "SENHA", fator: fator(), nivel: "CONGREGACAO", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"], termosPendentes: [] });
const tokenGeral = () => auth.reassinarSessao({ membroId: 7, via: "SENHA", fator: fator(), nivel: "GLOBAL", permissoes: ["pessoas"], escopoCongregacoes: "TODAS", termosPendentes: [] });
const linhaFicha = (id) => ({ membroId: id, nome: "Pessoa Teste", congregacao: "Vila Nova", congregacaoId: 2, extensao: null, status: "ATIVO", situacaoMembro: "EM_COMUNHAO",
  dataNascimento: "1990-03-14", fotoUrl: null, cargoMinisterial: null, cpfMascarado: null });
const existente = (id) => [{ MembroId: id, Status: "ATIVO", EmailAnterior: null, CpfAnterior: null, CargoAnterior: null, DizimistaAnterior: null, SexoAnterior: null,
  NascimentoAnterior: "1990-03-14", AdmissaoAnterior: null, EstadoCivilAnterior: null, EmProcessoDeCargo: 0, TemExclusao: 0, CongregacaoNome: "Vila Nova", ExtensaoNome: null,
  CongregacaoIdAnterior: 2 }];

beforeEach(() => {
  mockConsultas = []; mockRegras = []; mockLiberadas = false; mockTransacao = { begin: 0, commit: 0, rollback: 0 };
  delete process.env.CHAVE_SITE_SISTEMA;
});

describe("a trava em si (shared/matriculaNova.js)", () => {
  test("liberada só quando existe uma importação CONCLUIDA (a parada no meio, IMPORTANDO, não solta)", async () => {
    const pool = await require("../db").getPool();
    mockLiberadas = false;
    expect(await matriculaNova.matriculasLiberadas(() => pool.request())).toBe(false);
    mockLiberadas = true;
    expect(await matriculaNova.matriculasLiberadas(() => pool.request())).toBe(true);
    const c = rodou(/FROM ImportacoesMembros/);
    expect(c).toHaveLength(2);
    expect(c[0].sql).toMatch(/Situacao = N'CONCLUIDA'/);
    expect(c[0].sql).not.toMatch(/IMPORTANDO|PREVIA/);
    expect(matriculaNova.MSG_TRAVADA).toBe(MSG);
  });
  test("resposta vazia do banco conta como TRAVADA (falha fechada)", async () => {
    const vazio = () => ({ query: async () => ({ recordset: [] }) });
    expect(await matriculaNova.matriculasLiberadas(vazio)).toBe(false);
  });
});

describe("o \"Cadastrar\" (GestaoPessoas)", () => {
  const novo = (extra = {}) => ({ nome: "Pessoa Nova", congregacaoId: 2, status: "ATIVO", dataNascimento: "2000-01-01", gerarMatricula: true, ...extra });
  beforeEach(() => {
    quando(/SELECT TOP 1 Nome FROM Congregacoes/, [{ Nome: "Vila Nova" }]);
    quando(/AS cpfMascarado[\s\S]*WHERE m\.MembroId = @id/, (i) => [linhaFicha(i.id)]);
  });
  test("TRAVADA, matrícula gerada: 409 com a mensagem, sem gerar o número nem gravar", async () => {
    const r = await chamar(hPessoas, { corpo: novo(), token: tokenLocal() });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: MSG });
    expect(rodou(/FROM MatriculasLivres l/)).toHaveLength(0);
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("TRAVADA, matrícula DIGITADA de ficha que não existe (a tela antiga): 409, nada gravado", async () => {
    const r = await chamar(hPessoas, { corpo: novo({ gerarMatricula: undefined, membroId: "3" }), token: tokenLocal() });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: MSG });
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("TRAVADA, editar a ficha que JÁ existe: continua livre", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existente(700412));
    const r = await chamar(hPessoas, { corpo: novo({ gerarMatricula: undefined, membroId: 700412, nome: "Ana Renomeada" }), token: tokenLocal() });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE MembroReferencia SET Nome/)).toHaveLength(1);
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("TRAVADA, destino fora do escopo: o 403 de sempre vem antes (a trava não muda quem pode)", async () => {
    quando(/SELECT TOP 1 Nome FROM Congregacoes/, [{ Nome: "Outra Congregação" }]);
    mockRegras.reverse();   // a congregação de fora vence a regra do beforeEach
    const r = await chamar(hPessoas, { corpo: novo({ gerarMatricula: undefined, membroId: "3" }), token: tokenLocal() });
    expect(r.status).toBe(403);
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("LIBERADA: a matrícula gerada e a digitada voltam a gravar", async () => {
    mockLiberadas = true;
    quando(/FROM MatriculasLivres l/, [{ id: 700981 }]);
    const g = await chamar(hPessoas, { corpo: novo(), token: tokenLocal() });
    expect(g.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO MembroReferencia/)[0].inputs.id).toBe(700981);
    mockConsultas = [];
    const d = await chamar(hPessoas, { corpo: novo({ gerarMatricula: undefined, membroId: "700500" }), token: tokenLocal() });
    expect(d.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO MembroReferencia/)[0].inputs.id).toBe(700500);
  });
});

describe("o importador antigo (POST /api/pessoas/importar)", () => {
  beforeEach(() => {
    quando(/SELECT Sigla FROM SituacoesMembro/, [{ Sigla: "EM_COMUNHAO" }, { Sigla: "SEM_COMUNHAO" }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id === 101 ? [{ MembroId: 101 }] : []));
  });
  test("TRAVADA com uma linha NOVA na planilha: 409, desfaz tudo (nem a linha que só atualiza fica), nada criado", async () => {
    const linhas = [{ membroId: 101, nome: "Existente Renomeada", sobrescrever: true }, { membroId: 100, nome: "Pessoa Nova" }];
    const r = await chamar(hImportar, { corpo: { linhas }, token: tokenGeral() });
    expect(r.status).toBe(409);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toContain(MSG);
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
    expect(mockTransacao).toEqual({ begin: 1, commit: 0, rollback: 1 });
  });
  test("TRAVADA só com fichas que já existem (sobrescrever): continua livre", async () => {
    const r = await chamar(hImportar, { corpo: { linhas: [{ membroId: 101, nome: "Existente Renomeada", sobrescrever: true }] }, token: tokenGeral() });
    expect(r.status).toBe(200);
    expect(r.body.resumo).toEqual({ criados: 0, atualizados: 1, ignorados: 0 });
    expect(mockTransacao).toEqual({ begin: 1, commit: 1, rollback: 0 });
  });
  test("LIBERADA: a linha nova é criada", async () => {
    mockLiberadas = true;
    const r = await chamar(hImportar, { corpo: { linhas: [{ membroId: 100, nome: "Pessoa Nova" }] }, token: tokenGeral() });
    expect(r.status).toBe(200);
    expect(rodou(/INSERT INTO MembroReferencia/).map((c) => c.inputs.id)).toEqual([100]);
  });
});

describe("a fila: o aceite (preCadastroDb.processar)", () => {
  const preCadastro = (extra = {}) => ({ Cpf: "52998224725", Situacao: "PENDENTE", VersaoTexto: "1", Nome: "Maria Nova Teste", Email: "maria@example.org", Telefone: null,
    DataNascimento: new Date("1990-05-10T00:00:00Z"), Sexo: "F", EstadoCivil: "SOLTEIRO", CongregacaoId: 2, CriadoPor: null, Origem: "SECRETARIA", ResponsavelConfirmado: false,
    RepeticaoConferida: false, ...extra });
  beforeEach(() => {
    quando(/SELECT Cpf FROM PreCadastros/, [{ Cpf: "52998224725" }]);
    quando(/SELECT p\.\*/, [preCadastro()]);
  });
  test("TRAVADA, sem pendência: não cria a ficha; devolve a trava com a mensagem e desfaz", async () => {
    const pool = await require("../db").getPool();
    const r = await pdb.processar(pool, 501, { porQuem: 5, como: "LOCAL" });
    expect(r).toEqual({ sucesso: false, travada: true, mensagem: MSG });
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
    expect(rodou(/SET Situacao = N'ACEITO'/)).toHaveLength(0);
    expect(mockTransacao.rollback).toBe(1);
  });
  test("TRAVADA, com pendência: as pendências continuam gravadas como sempre (nada de número)", async () => {
    mockRegras = [];
    quando(/SELECT Cpf FROM PreCadastros/, [{ Cpf: "52998224725" }]);
    quando(/SELECT p\.\*/, [preCadastro({ Email: null })]);
    const pool = await require("../db").getPool();
    const r = await pdb.processar(pool, 501);
    expect(r).toMatchObject({ sucesso: true, situacao: "PENDENTE", pendencias: ["FALTA_EMAIL"] });
    expect(rodou(/UPDATE PreCadastros SET Situacao = @s/)).toHaveLength(1);
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("LIBERADA, sem pendência: entra sozinho, com a matrícula", async () => {
    mockLiberadas = true;
    quando(/FROM MatriculasLivres l/, [{ id: 700990 }]);
    const pool = await require("../db").getPool();
    const r = await pdb.processar(pool, 501);
    expect(r).toEqual({ sucesso: true, situacao: "ACEITO", matricula: 700990 });
    expect(rodou(/INSERT INTO MembroReferencia/)).toHaveLength(1);
  });
});

describe("a fila: a rota (lançar e aceitar)", () => {
  test("TRAVADA, lançar (o cadastro rápido, o líder): 409 com a mensagem, sem gravar o pré-cadastro", async () => {
    quando(/FROM Congregacoes/, [{ CongregacaoId: 2, Nome: "Vila Nova", AreaId: 1, Ativa: true }]);
    const r = await chamar(hFila, { corpo: { nome: "Pedro Novo Teste", congregacaoId: 2, consentimentoDaPessoa: true }, token: tokenLocal() });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: MSG });
    expect(rodou(/INSERT INTO PreCadastros/)).toHaveLength(0);
  });
  test("TRAVADA, quem não pode lançar continua recebendo o 403 de sempre", async () => {
    const membro = auth.reassinarSessao({ membroId: 9, via: "PIN", permissoes: [], escopoCongregacoes: [], termosPendentes: [] });
    quando(/FROM Congregacoes/, [{ CongregacaoId: 2, Nome: "Vila Nova", AreaId: 1, Ativa: true }]);
    quando(/AS pode/, [{ pode: 0 }]);
    const r = await chamar(hFila, { corpo: { nome: "Pedro Novo Teste", congregacaoId: 2, consentimentoDaPessoa: true }, token: membro });
    expect(r.status).toBe(403);
    expect(rodou(/INSERT INTO PreCadastros/)).toHaveLength(0);
  });
  test("TRAVADA, aceitar: 409 com a mensagem da trava (não a de 'ainda há pendências')", async () => {
    const linha = { PreCadastroId: 77, Origem: "SITE", CriadoPor: null, CongregacaoId: 2, CongregacaoNome: "Vila Nova", Nome: "Maria Nova Teste", CpfMascarado: "***.982.247-**",
      Email: "maria@example.org", Telefone: null, DataNascimento: "1990-05-10", Sexo: "F", EstadoCivil: "SOLTEIRO", Situacao: "PENDENTE", Pendencias: null, MembroIdResultado: null,
      MembroIdRepetido: null, PreCadastroRepetidoId: null, ResponsavelConfirmado: false, RepeticaoConferida: false, CriadoEm: new Date(), Versao: "1" };
    const original = pdb.lerPreCadastro;
    const originalProc = pdb.processar;
    pdb.lerPreCadastro = async () => linha;
    pdb.processar = async () => ({ sucesso: false, travada: true, mensagem: MSG });
    try {
      const r = await chamar(hFila, { corpo: {}, token: tokenLocal(), binding: { id: "77", acao: "aceitar" } });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ sucesso: false, mensagem: MSG });
    } finally { pdb.lerPreCadastro = original; pdb.processar = originalProc; }
  });
});

describe("o \"Quero me cadastrar\" do site", () => {
  const ENVIO = "0123456789abcdef0123456789abcdef";
  const corpo = () => ({ nome: "Maria Nova Teste", cpf: "529.982.247-25", email: "maria@example.org", telefone: "(00) 98888-7777", dataNascimento: "1990-05-10", sexo: "F",
    estadoCivil: "SOLTEIRO", congregacaoId: 2, consentimento: { aceito: true, versao: regrasPre.CONSENTIMENTO.versao }, origemVisitante: "visitante-1", envioId: ENVIO });
  const chave = () => { process.env.CHAVE_SITE_SISTEMA = "chave-do-site-teste"; return { "x-site-key": "chave-do-site-teste" }; };
  test("TRAVADA: 409 com a mensagem, sem gravar o pré-cadastro (nada fica numa fila)", async () => {
    quando(/FROM Congregacoes/, [{ CongregacaoId: 2, Nome: "Vila Nova", AreaId: 1, Ativa: true }]);
    const r = await chamar(hSite, { corpo: corpo(), headers: chave() });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: MSG });
    expect(rodou(/INSERT INTO PreCadastros/)).toHaveLength(0);
  });
  test("TRAVADA: a chave errada continua 401 (a trava não aparece para quem não é o site)", async () => {
    chave();
    const r = await chamar(hSite, { corpo: corpo(), headers: { "x-site-key": "errada" } });
    expect(r.status).toBe(401);
    expect(rodou(/FROM ImportacoesMembros/)).toHaveLength(0);
  });
});

describe("a importação que terminaria com ZERO pessoas (confirmar)", () => {
  const previa = [{ ImportacaoId: 7, Situacao: "PREVIA", NomeArquivo: "x.csv", HashArquivo: "a".repeat(64), CriadaEm: new Date(), CriadaPor: 7, ConfirmadaEm: null,
    ConfirmadaPor: null, ConcluidaEm: null, Resumo: "{}" }];
  test("nenhuma linha entra (todas de fora): recusada; continua prévia; não vira IMPORTANDO", async () => {
    quando(/FROM ImportacoesMembros WHERE Situacao IN/, previa);
    quando(/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 0 }]);
    const pool = await require("../db").getPool();
    const r = await importacao.confirmar(pool, { membroId: 7 }, 7);
    expect(r.sucesso).toBe(false);
    expect(r.status).toBe(409);
    expect(r.mensagem).toMatch(/nenhuma pessoa/i);
    expect(rodou(/SET Situacao = N'IMPORTANDO'/)).toHaveLength(0);
    expect(mockTransacao.commit).toBe(0);
  });
  test("com pelo menos uma pessoa para entrar: confirma como antes", async () => {
    quando(/FROM ImportacoesMembros WHERE Situacao IN/, previa);
    quando(/SELECT COUNT\(\*\) AS n FROM ImportacoesMembrosLinhas/, [{ n: 3 }]);
    const pool = await require("../db").getPool();
    const r = await importacao.confirmar(pool, { membroId: 7 }, 7);
    expect(r).toEqual({ sucesso: true, importacaoId: 7, restantes: 3 });
    expect(rodou(/SET Situacao = N'IMPORTANDO'/)).toHaveLength(1);
  });
});
