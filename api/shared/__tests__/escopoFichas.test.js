// Escopo territorial das rotas de FICHAS E DADOS DE PESSOAS (auditoria de 02/10/2026): quem tem login de liderança só vê e só altera o que está dentro do seu escopo —
// dirigente da congregação A: a congregação A; pastor da área B: as congregações da área B; o GERAL vê tudo. Fora do escopo vale a MESMA resposta de "não existe".
// Os handlers são os de verdade; o banco é simulado pelo TEXTO da consulta (como em revisaoV75.test.js). Cada grupo prende: sem sessão (401), sessão de PIN (recusada),
// fora do escopo (recusa igual à de "não existe" e NADA gravado), dentro do escopo (funciona e grava), geral (funciona) e, nas rotas institucionais, o 403 ANTES de tocar o banco.
let mockRegras = [];
let mockConsultas = [];
let mockTransacao = { begin: 0, commit: 0, rollback: 0 };
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    // Sem regra própria: UPDATE/DELETE "deu certo" (1 linha); consultas voltam vazias.
    return { recordset: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { mockTransacao.begin++; } async commit() { mockTransacao.commit++; } async rollback() { mockTransacao.rollback++; } }
  class Request { constructor() { return novaRequisicao(); } }
  // Os tipos do driver (Int, NVarChar, Date...) só precisam existir; o resto (then, asymmetricMatch, símbolos) fica indefinido.
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../minimizacaoLgpd", () => ({ diasMinimizacaoExMembro: jest.fn(async () => 30), minimizarCamposExMembro: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, salvarFoto: jest.fn(async (id) => `https://armazem/fotos/membro-${id}`), excluirFoto: jest.fn(async () => {}) }));
jest.mock("../protocolo", () => ({ gerarProtocolo: jest.fn(async () => "APR-2026-0001") }));
jest.mock("../pdfInstitucional", () => {
  const doc = new Proxy({ page: { margins: { left: 50, right: 50 }, width: 600 }, y: 100 }, { get: (t, p) => (p in t ? t[p] : () => doc) });
  return { novoDocumento: () => doc, cabecalhoInstitucional: () => {}, rodapeInstitucional: () => {}, gerarBuffer: async () => Buffer.from("%PDF-falso") };
});

process.env.DIRECTUS_URL = "https://directus.exemplo.org";
process.env.DIRECTUS_ADMIN_TOKEN = "token-de-teste-sem-valor";

const auth = require("../auth");
const er = require("../escopoRotas");
const { registrarAuditoria } = require("../auditoria");
const vacancia = require("../vacancia");
const minimizacao = require("../minimizacaoLgpd");
const storage = require("../storage");

const hPdfApresentacao = require("../../ApresentacaoCriancaPdf/index.js");
const hEditarMarco = require("../../EditarMarcoMembro/index.js");
const hCei = require("../../ElegibilidadeCEI/index.js");
const hExecutarLgpd = require("../../ExecutarExclusaoLGPD/index.js");
const hExportar = require("../../ExportarPessoas/index.js");
const hApresentacoes = require("../../GestaoApresentacaoCriancas/index.js");
const hCartas = require("../../GestaoCartas/index.js");
const hCasamentos = require("../../GestaoCasamentos/index.js");
const hFila = require("../../GestaoFilaAprovacoes/index.js");
const hFuncoes = require("../../GestaoFuncoes/index.js");
const hLicencas = require("../../GestaoLicencasCandidatura/index.js");
const hCautelares = require("../../GestaoMedidasCautelares/index.js");
const hVinculos = require("../../GestaoVinculosFamiliares/index.js");
const hHistorico = require("../../HistoricoMembro/index.js");
const hHistoricoSite = require("../../HistoricoSiteMembro/index.js");
const hImportar = require("../../ImportarPessoas/index.js");
const hListarMarcos = require("../../ListarMarcosMembro/index.js");
const hRegistrarMarco = require("../../RegistrarMarcoMembro/index.js");
const hFoto = require("../../UploadFotoMembro/index.js");
const hListarLgpd = require("../../ListarSolicitacoesLGPD/index.js");
const hResponderLgpd = require("../../ResponderSolicitacaoLGPD/index.js");

// ---- infraestrutura do teste ----
async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
// Geral: papel GLOBAL + escopo TODAS. Local: dirigente (membro 5) da congregação Central, a menos que se diga outro escopo.
const GERAL = (permissoes = ["pessoas"]) => tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes = ["pessoas"], escopo = ["Central"], extra = {}) => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes, ...extra });
const MEMBRO_PIN = tokenDe(10, { via: "PIN" });

const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// As pessoas do cenário: Central é a congregação do dirigente; Vila Nova é de fora; 30 não tem congregação; 40 saiu do rol.
const PESSOAS = {
  5: { Nome: "Dirigente Central", Status: "ATIVO", CongregacaoNome: "Central" },
  10: { Nome: "Ana", Status: "ATIVO", CongregacaoNome: "Central" },
  11: { Nome: "Bia", Status: "ATIVO", CongregacaoNome: "Central" },
  20: { Nome: "Beto", Status: "ATIVO", CongregacaoNome: "Vila Nova" },
  21: { Nome: "Caio", Status: "ATIVO", CongregacaoNome: "Vila Nova" },
  30: { Nome: "Sem Congregação", Status: "ATIVO", CongregacaoNome: null },
  40: { Nome: "Saiu", Status: "DESLIGADO", CongregacaoNome: "Central" }
};
const pessoasNoBanco = () => quando(/SELECT m\.MembroId, m\.Nome, m\.Status, c\.Nome AS CongregacaoNome/, (i) => (PESSOAS[i.id] ? [{ MembroId: i.id, ExtensaoNome: null, ...PESSOAS[i.id] }] : []));

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  mockTransacao = { begin: 0, commit: 0, rollback: 0 };
  registrarAuditoria.mockClear();
  vacancia.encerrarVinculos.mockClear();
  minimizacao.minimizarCamposExMembro.mockClear();
  storage.salvarFoto.mockClear();
  storage.excluirFoto.mockClear();
  global.fetch = jest.fn();
  pessoasNoBanco();
});

// ---- porta de entrada de TODAS as rotas do grupo ----
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");
const ROTAS = [
  ["ApresentacaoCriancaPdf", hPdfApresentacao, { metodo: "GET", ligado: { id: "1" } }],
  ["EditarMarcoMembro", hEditarMarco, { metodo: "POST", ligado: { marcoId: "1" }, corpo: { justificativa: "erro de digitação" } }],
  ["ElegibilidadeCEI", hCei, { metodo: "GET", ligado: { membroId: "10" } }],
  ["ExecutarExclusaoLGPD", hExecutarLgpd, { metodo: "POST", ligado: { id: "1" } }],
  ["ExportarPessoas", hExportar, { metodo: "POST", corpo: { colunas: ["nome"] } }],
  ["GestaoApresentacaoCriancas", hApresentacoes, { metodo: "GET" }],
  ["GestaoCartas", hCartas, { metodo: "GET" }],
  ["GestaoCasamentos", hCasamentos, { metodo: "GET" }],
  ["GestaoFilaAprovacoes", hFila, { metodo: "GET" }],
  ["GestaoFuncoes", hFuncoes, { metodo: "GET" }],
  ["GestaoLicencasCandidatura", hLicencas, { metodo: "GET" }],
  ["GestaoMedidasCautelares", hCautelares, { metodo: "GET" }],
  ["GestaoVinculosFamiliares", hVinculos, { metodo: "GET" }],
  ["HistoricoMembro", hHistorico, { metodo: "GET", ligado: { membroId: "10" } }],
  ["HistoricoSiteMembro", hHistoricoSite, { metodo: "GET", query: { matricula: "10" } }],
  ["ImportarPessoas", hImportar, { metodo: "POST", corpo: { linhas: [{ membroId: 100, nome: "Nova" }] } }],
  ["ListarMarcosMembro", hListarMarcos, { metodo: "GET", query: { membroId: "10" } }],
  ["RegistrarMarcoMembro", hRegistrarMarco, { metodo: "POST", corpo: { membroId: 10, tipo: "OUTRO", descricao: "x" } }],
  ["UploadFotoMembro", hFoto, { metodo: "POST", ligado: { membroId: "10" }, corpo: { fotoBase64: JPEG_BASE64, mimeType: "image/jpeg" } }],
  ["ListarSolicitacoesLGPD", hListarLgpd, { metodo: "GET" }],
  ["ResponderSolicitacaoLGPD", hResponderLgpd, { metodo: "POST", ligado: { id: "1" }, corpo: { status: "NEGADA" } }]
];

describe.each(ROTAS)("porta de entrada de %s", (_nome, handler, args) => {
  test("sem sessão: 401, sem tocar o banco", async () => {
    const r = await chamar(handler, args);
    expect(r.status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (membro, permissoes vazias): recusada, sem tocar o banco", async () => {
    const r = await chamar(handler, { ...args, token: MEMBRO_PIN });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
});

// ================== rotas INSTITUCIONAIS (só o GERAL) ==================

describe("GestaoMedidasCautelares: Art. 45 é da igreja inteira, só o GERAL", () => {
  const casos = [
    ["GET", { metodo: "GET" }],
    ["POST (aplicar)", { metodo: "POST", corpo: { membroId: 20, motivo: "motivo", suspenderAcessoSistema: true } }],
    ["POST (concluir relatório)", { metodo: "POST", ligado: { id: "7", acao: "concluir-relatorio" } }]
  ];
  const naoGerais = [
    ["dirigente local com pessoas", () => LOCAL(["pessoas"])],
    ["papel GLOBAL com escopo de uma lista", () => tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] })],
    ["papel local com escopo TODAS", () => tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] })],
    ["Líder Geral de Departamento (TODAS, mas não GLOBAL)", () => tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] })]
  ];
  describe.each(naoGerais)("%s", (_q, token) => {
    test.each(casos)("%s: 403 ANTES de tocar o banco, nada gravado", async (_c, args) => {
      const r = await chamar(hCautelares, { ...args, token: token() });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(er.MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
  });
  test("geral sem a permissão pessoas: 403 da permissão", async () => {
    expect((await chamar(hCautelares, { token: GERAL(["financeiro"]) })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral: lista as medidas", async () => {
    quando(/FROM MedidasCautelares mc/, [{ medidaId: 7, membroId: 20, nome: "Beto", motivo: "x", dataAplicacao: diasAtras(3), dataConclusaoRelatorio: null }]);
    const r = await chamar(hCautelares, { token: GERAL() });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });
  test("geral: aplica medida com suspensão do acesso (insere e suspende o login)", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20 }]);
    quando(/COUNT\(\*\) AS total\s+FROM Lideranca/, [{ total: 1 }]);
    quando(/INSERT INTO MedidasCautelares/, [{ MedidaId: 7 }]);
    quando(/FROM MedidasCautelares mc/, [{ medidaId: 7 }]);
    const r = await chamar(hCautelares, { metodo: "POST", token: GERAL(), corpo: { membroId: 20, motivo: "  desvio  ", suspenderAcessoSistema: true } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO MedidasCautelares/)[0].inputs.motivo).toBe("desvio");
    expect(rodou(/UPDATE Lideranca SET AtivoAte/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("geral: um id na rota que não é matrícula canônica nunca vira 'criar medida nova'", async () => {
    // O banco aceitaria a criação (a pessoa existe, há outro com 'permissoes'): se o ramo de criar fosse alcançado, gravaria.
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20 }]);
    quando(/COUNT\(\*\) AS total\s+FROM Lideranca/, [{ total: 1 }]);
    quando(/INSERT INTO MedidasCautelares/, [{ MedidaId: 7 }]);
    quando(/FROM MedidasCautelares mc/, [{ medidaId: 7 }]);
    for (const id of ["abc", "0x7", "7.5"]) {
      const r = await chamar(hCautelares, { metodo: "POST", token: GERAL(), ligado: { id, acao: "concluir-relatorio" }, corpo: { membroId: 20, motivo: "x", suspenderAcessoSistema: true } });
      expect(r.body.sucesso).toBe(false);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("geral: concluir relatório grava a data", async () => {
    quando(/SELECT \* FROM MedidasCautelares WHERE MedidaId = @id/, [{ MedidaId: 7, DataConclusaoRelatorio: null }]);
    const r = await chamar(hCautelares, { metodo: "POST", token: GERAL(), ligado: { id: "7", acao: "concluir-relatorio" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE MedidasCautelares SET DataConclusaoRelatorio/)).toHaveLength(1);
  });
});

describe("ImportarPessoas: importação do rol é do GERAL, com teto e transação", () => {
  const corpo = { linhas: [{ membroId: 100, nome: "Nova" }] };
  test("dirigente local com pessoas: 403 antes de tocar o banco", async () => {
    const r = await chamar(hImportar, { metodo: "POST", token: LOCAL(), corpo });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(er.MSG_GERAL);
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel GLOBAL com escopo de lista e papel local com escopo TODAS: 403", async () => {
    for (const claims of [{ nivel: "GLOBAL", escopoCongregacoes: ["Central"] }, { nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" }]) {
      const r = await chamar(hImportar, { metodo: "POST", token: tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, permissoes: ["pessoas"], ...claims }), corpo });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral: cria o novo, atualiza o existente com sobrescrever, ignora o repetido e as matrículas fora do formato — numa transação", async () => {
    quando(/SELECT Sigla FROM SituacoesMembro/, [{ Sigla: "EM_COMUNHAO" }, { Sigla: "SEM_COMUNHAO" }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id === 101 || i.id === 102 ? [{ MembroId: i.id }] : []));
    const linhas = [
      { membroId: 100, nome: "Nova Pessoa" },
      { membroId: 101, nome: "Existente Renomeada", situacaoMembro: "SEM_COMUNHAO", sobrescrever: true },
      { membroId: 102, nome: "Existente Mantida" },                       // existe e não pede para sobrescrever: ignorada
      { membroId: 100, nome: "Repetida na planilha" },                     // mesma matrícula duas vezes: vale a primeira
      { membroId: "0x10", nome: "Matrícula em hexadecimal" },              // não é a grafia canônica
      { membroId: 1.5, nome: "Matrícula quebrada" },
      { membroId: 103, nome: "   " }
    ];
    const r = await chamar(hImportar, { metodo: "POST", token: GERAL(), corpo: { linhas } });
    expect(r.status).toBe(200);
    expect(r.body.resumo).toEqual({ criados: 1, atualizados: 1, ignorados: 2 });
    expect(rodou(/INSERT INTO MembroReferencia/).map((c) => c.inputs.id)).toEqual([100]);
    const upd = rodou(/UPDATE MembroReferencia SET Nome/);
    expect(upd).toHaveLength(1);
    expect(upd[0].inputs).toMatchObject({ id: 101, nome: "Existente Renomeada", situacaoMembro: "SEM_COMUNHAO" });
    expect(mockTransacao).toEqual({ begin: 1, commit: 1, rollback: 0 });
  });
  test("falha no meio da planilha: desfaz tudo (rollback), não commita e não vaza o texto do erro", async () => {
    quando(/SELECT Sigla FROM SituacoesMembro/, [{ Sigla: "EM_COMUNHAO" }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id === 101 ? [{ MembroId: 101 }] : []));
    quando(/UPDATE MembroReferencia SET Nome/, () => { throw new Error("chave estrangeira FK_segredo violada"); });
    const r = await chamar(hImportar, { metodo: "POST", token: GERAL(), corpo: { linhas: [{ membroId: 100, nome: "A" }, { membroId: 101, nome: "B", sobrescrever: true }] } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/FK_segredo/);
    expect(mockTransacao).toEqual({ begin: 1, commit: 0, rollback: 1 });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("mais de 2000 linhas: 400 sem tocar o banco; lista vazia ou não-lista: 400", async () => {
    const muitas = Array.from({ length: 2001 }, (_, i) => ({ membroId: i + 1, nome: `P${i}` }));
    expect((await chamar(hImportar, { metodo: "POST", token: GERAL(), corpo: { linhas: muitas } })).status).toBe(400);
    expect((await chamar(hImportar, { metodo: "POST", token: GERAL(), corpo: { linhas: [] } })).status).toBe(400);
    expect((await chamar(hImportar, { metodo: "POST", token: GERAL(), corpo: { linhas: "x" } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("GestaoFuncoes: ler vale para quem tem pessoas, escrever é do GERAL", () => {
  test("dirigente local lê o catálogo", async () => {
    quando(/FROM Funcoes ORDER BY Nome/, [{ funcaoId: 1, nome: "Presbítero", ativa: true }]);
    const r = await chamar(hFuncoes, { token: LOCAL() });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });
  test.each([
    ["POST", { metodo: "POST", corpo: { nome: "Nova" } }],
    ["POST renomear", { metodo: "POST", corpo: { funcaoId: 1, nome: "Outro nome" } }],
    ["PUT", { metodo: "PUT", ligado: { funcaoId: "1" }, corpo: { ativa: false } }],
    ["DELETE", { metodo: "DELETE", ligado: { funcaoId: "1" } }]
  ])("dirigente local, %s: 403 antes de tocar o banco", async (_m, args) => {
    const r = await chamar(hFuncoes, { ...args, token: LOCAL() });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(er.MSG_GERAL);
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel GLOBAL com escopo de lista também é recusado nas escritas", async () => {
    const token = tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] });
    expect((await chamar(hFuncoes, { metodo: "POST", token, corpo: { nome: "X" } })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral: cria, desativa e exclui; id malformado vira 'não encontrada'", async () => {
    quando(/SELECT TOP 1 FuncaoId AS funcaoId/, [{ funcaoId: 3, nome: "Nova", ativa: true }]);
    quando(/SELECT Nome FROM Funcoes WHERE FuncaoId = @id/, [{ Nome: "Nova" }]);
    quando(/SELECT COUNT\(\*\) AS Total FROM MembroReferencia WHERE Funcao/, [{ Total: 0 }]);
    expect((await chamar(hFuncoes, { metodo: "POST", token: GERAL(), corpo: { nome: "Nova" } })).body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO Funcoes/)).toHaveLength(1);
    expect((await chamar(hFuncoes, { metodo: "PUT", token: GERAL(), ligado: { funcaoId: "3" }, corpo: { ativa: false } })).body.sucesso).toBe(true);
    expect((await chamar(hFuncoes, { metodo: "DELETE", token: GERAL(), ligado: { funcaoId: "3" } })).body.sucesso).toBe(true);
    expect(rodou(/DELETE FROM Funcoes/)).toHaveLength(1);
    mockConsultas = [];
    expect((await chamar(hFuncoes, { metodo: "DELETE", token: GERAL(), ligado: { funcaoId: "0x3" } })).body.mensagem).toBe("Função não encontrada.");
    expect(escritas()).toHaveLength(0);
  });
});

describe("LGPD do Encarregado: permissão protecaodedados E nível GERAL", () => {
  const LGPD = [
    ["ListarSolicitacoesLGPD", hListarLgpd, { metodo: "GET" }],
    ["ResponderSolicitacaoLGPD", hResponderLgpd, { metodo: "POST", ligado: { id: "1" }, corpo: { status: "NEGADA" } }],
    ["ExecutarExclusaoLGPD", hExecutarLgpd, { metodo: "POST", ligado: { id: "1" } }]
  ];
  describe.each(LGPD)("%s", (_nome, handler, args) => {
    test.each([
      ["papel local com a permissão", () => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["protecaodedados"] })],
      ["papel GLOBAL com escopo de lista", () => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: ["Central"], permissoes: ["protecaodedados"] })],
      ["papel local com escopo TODAS", () => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: "TODAS", permissoes: ["protecaodedados"] })]
    ])("%s: 403 antes de tocar o banco", async (_q, token) => {
      const r = await chamar(handler, { ...args, token: token() });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(er.MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("geral sem a permissão protecaodedados: 403 da permissão", async () => {
      expect((await chamar(handler, { ...args, token: GERAL(["pessoas"]) })).status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
  });
  const dpo = () => GERAL(["protecaodedados", "auditoria"]);

  test("Listar: o geral lê as solicitações", async () => {
    quando(/FROM SolicitacoesTitularLGPD s/, [{ solicitacaoId: 1, membroId: 10, nome: "Ana", tipo: "EXCLUSAO" }]);
    const r = await chamar(hListarLgpd, { token: dpo(), query: { status: "PENDENTE" } });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });
  test("Responder: o geral nega; exclusão já executada não é reaberta; id malformado = não encontrada", async () => {
    quando(/SELECT \* FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id/, (i) => (i.id === 1 ? [{ SolicitacaoId: 1, Tipo: "ACESSO", Status: "PENDENTE" }] : [{ SolicitacaoId: 2, Tipo: "EXCLUSAO", Status: "ATENDIDA" }]));
    const ok = await chamar(hResponderLgpd, { metodo: "POST", token: dpo(), ligado: { id: "1" }, corpo: { status: "NEGADA", respostaTexto: "base legal" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/UPDATE SolicitacoesTitularLGPD SET Status/)).toHaveLength(1);
    mockConsultas = [];
    const reaberta = await chamar(hResponderLgpd, { metodo: "POST", token: dpo(), ligado: { id: "2" }, corpo: { status: "EM_ANALISE" } });
    expect(reaberta.body.sucesso).toBe(false);
    expect(reaberta.body.mensagem).toMatch(/já foi executada/);
    const mal = await chamar(hResponderLgpd, { metodo: "POST", token: dpo(), ligado: { id: "0x1" }, corpo: { status: "NEGADA" } });
    expect(mal.body.mensagem).toBe("Solicitação não encontrada.");
    expect(escritas()).toHaveLength(0);
  });
  test("Responder: exclusão não vira ATENDIDA por aqui", async () => {
    quando(/SELECT \* FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id/, [{ SolicitacaoId: 1, Tipo: "EXCLUSAO", Status: "PENDENTE" }]);
    const r = await chamar(hResponderLgpd, { metodo: "POST", token: dpo(), ligado: { id: "1" }, corpo: { status: "ATENDIDA" } });
    expect(r.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
  });

  describe("ExecutarExclusaoLGPD", () => {
    const solicitacao = (extra = {}) => quando(/SELECT \* FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id/, [{ SolicitacaoId: 1, MembroId: 10, Tipo: "EXCLUSAO", Status: "PENDENTE", ...extra }]);
    const base = () => {
      quando(/SELECT Telefone, Email, Endereco, FotoUrl FROM MembroReferencia/, [{ Telefone: "9999", Email: "a@b.org", Endereco: "Rua", FotoUrl: "https://armazem/fotos/membro-10" }]);
    };
    test.each(["PENDENTE", "EM_ANALISE"])("solicitação %s: anonimiza, revoga os consentimentos, fecha a solicitação — tudo numa transação; apaga a foto e audita sem o dado apagado", async (status) => {
      solicitacao({ Status: status });
      base();
      const r = await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "1" } });
      expect(r.body.sucesso).toBe(true);
      expect(mockTransacao).toEqual({ begin: 1, commit: 1, rollback: 0 });
      expect(rodou(/UPDATE MembroReferencia SET Telefone = NULL/)).toHaveLength(1);
      expect(rodou(/INSERT INTO ConsentimentosLGPD/)).toHaveLength(2);
      expect(rodou(/UPDATE SolicitacoesTitularLGPD SET Status = 'ATENDIDA'[\s\S]*Status IN \('PENDENTE','EM_ANALISE'\)/)).toHaveLength(1);
      expect(storage.excluirFoto).toHaveBeenCalledWith(10);
      expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/9999|a@b\.org|Rua/);
    });
    test.each(["NEGADA", "ATENDIDA"])("solicitação %s: não executa (nada gravado, nenhuma foto apagada)", async (status) => {
      solicitacao({ Status: status });
      base();
      const r = await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "1" } });
      expect(r.body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
      expect(storage.excluirFoto).not.toHaveBeenCalled();
      expect(mockTransacao.begin).toBe(0);
    });
    test("outro tipo de solicitação, inexistente e id malformado: não executa", async () => {
      solicitacao({ Tipo: "ACESSO" });
      expect((await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "1" } })).body.sucesso).toBe(false);
      mockRegras = [];
      expect((await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "9" } })).body.mensagem).toBe("Solicitação não encontrada.");
      expect((await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "0x1" } })).body.mensagem).toBe("Solicitação não encontrada.");
      expect(escritas()).toHaveLength(0);
    });
    test("duas execuções ao mesmo tempo: quem perde a corrida desfaz tudo e não anonimiza de novo", async () => {
      solicitacao();
      base();
      quando(/UPDATE SolicitacoesTitularLGPD SET Status = 'ATENDIDA'/, [], 0);
      const r = await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "1" } });
      expect(r.body.sucesso).toBe(false);
      expect(mockTransacao).toEqual({ begin: 1, commit: 0, rollback: 1 });
      expect(rodou(/UPDATE MembroReferencia SET Telefone = NULL/)).toHaveLength(0);
      expect(storage.excluirFoto).not.toHaveBeenCalled();
    });
    test("falha no meio: rollback, 500 sem o texto do erro, sem apagar a foto", async () => {
      solicitacao();
      base();
      quando(/UPDATE MembroReferencia SET Telefone = NULL/, () => { throw new Error("tabela interna X quebrou"); });
      const r = await chamar(hExecutarLgpd, { metodo: "POST", token: GERAL(["protecaodedados"]), ligado: { id: "1" } });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/tabela interna/);
      expect(mockTransacao).toEqual({ begin: 1, commit: 0, rollback: 1 });
      expect(storage.excluirFoto).not.toHaveBeenCalled();
    });
  });
});

describe("EditarMarcoMembro: corrigir marco de qualquer pessoa é do GERAL", () => {
  const corpo = { justificativa: "data errada", descricao: "Conversão", dataMarco: "2001-05-06" };
  test.each([
    ["papel GLOBAL com escopo de lista", { nivel: "GLOBAL", escopoCongregacoes: ["Central"] }],
    ["papel local com escopo TODAS", { nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" }],
    ["dirigente local", { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"] }]
  ])("%s: 403 antes de tocar o banco", async (_q, claims) => {
    const r = await chamar(hEditarMarco, { metodo: "POST", token: tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, permissoes: ["pessoas"], ...claims }), ligado: { marcoId: "1" }, corpo });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(er.MSG_GERAL);
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral: corrige o marco e audita antes/depois (não exige permissão de lista)", async () => {
    quando(/SELECT \* FROM MarcosMembro WHERE MarcoId = @id/, [{ MarcoId: 1, Descricao: "velha", DataMarco: null, DataAproximada: false }]);
    const r = await chamar(hEditarMarco, { metodo: "POST", token: GERAL([]), ligado: { marcoId: "1" }, corpo });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE MarcosMembro SET Descricao/)).toHaveLength(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "MarcosMembro", registroId: 1, dadosAntes: { descricao: "velha" } });
  });
  test("geral: marco inexistente, id malformado e data inválida não gravam nada", async () => {
    expect((await chamar(hEditarMarco, { metodo: "POST", token: GERAL([]), ligado: { marcoId: "9" }, corpo })).body.mensagem).toBe("Marco não encontrado.");
    expect((await chamar(hEditarMarco, { metodo: "POST", token: GERAL([]), ligado: { marcoId: "0x1" }, corpo })).body.mensagem).toBe("Marco não encontrado.");
    expect((await chamar(hEditarMarco, { metodo: "POST", token: GERAL([]), ligado: { marcoId: "1" }, corpo: { ...corpo, dataMarco: "2026-02-30" } })).status).toBe(400);
    expect(escritas()).toHaveLength(0);
  });
});

describe("ExportarPessoas: valida as colunas e a quantidade, e a trilha cabe na coluna", () => {
  test("coluna desconhecida ou que não é texto: 400 e nada na trilha", async () => {
    for (const colunas of [["nome", "senhaHash"], [{ x: 1 }], ["nome".repeat(50)], "nome", []]) {
      expect((await chamar(hExportar, { metodo: "POST", token: LOCAL(), corpo: { colunas } })).status).toBe(400);
    }
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("coluna sensível exige nível Global", async () => {
    const r = await chamar(hExportar, { metodo: "POST", token: LOCAL(), corpo: { colunas: ["nome", "telefone"] } });
    expect(r.status).toBe(403);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect((await chamar(hExportar, { metodo: "POST", token: GERAL(), corpo: { colunas: ["nome", "telefone"], quantidade: 3 } })).body.sucesso).toBe(true);
  });
  test("o título da trilha nunca passa de 100 caracteres (coluna Acao é NVARCHAR(100)); a lista completa vai no corpo", async () => {
    const todas = ["membroId", "nome", "idade", "categoria", "formaAdmissao", "funcao", "cargoMinisterial", "congregacao", "status", "situacaoMembro", "telefone", "email", "endereco", "dataNascimento", "dataAdmissao"];
    const r = await chamar(hExportar, { metodo: "POST", token: GERAL(), corpo: { colunas: [...todas, ...todas], quantidade: 123456 } });
    expect(r.body.sucesso).toBe(true);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud.acao.length).toBeLessThanOrEqual(100);
    expect(aud.acao).toMatch(/^Exportou rol de membros \(123456 linha/);
    expect(aud.dadosDepois.colunas).toEqual(todas);
    expect(aud.dadosDepois.quantidade).toBe(123456);
  });
  test("quantidade fora do formato vira '?' (não entra texto do cliente na trilha)", async () => {
    for (const quantidade of ["999 linhas; apaguei tudo", -1, 1.5, 1e12, null, undefined, {}]) {
      registrarAuditoria.mockClear();
      await chamar(hExportar, { metodo: "POST", token: GERAL(), corpo: { colunas: ["nome"], quantidade } });
      const aud = registrarAuditoria.mock.calls[0][0];
      expect(aud.acao).toMatch(/^Exportou rol de membros \(\? linha/);
      expect(aud.dadosDepois.quantidade).toBeNull();
    }
  });
});

// ================== rotas de PESSOA (escopo da congregação da pessoa) ==================

describe("GestaoLicencasCandidatura", () => {
  const linhasLicencas = () => quando(/FROM LicencasCandidatura l/, [
    { licencaId: 1, membroId: 10, nome: "Ana", status: "EM_LICENCA", congregacaoNome: "Central", extensaoNome: null },
    { licencaId: 2, membroId: 20, nome: "Beto", status: "EM_LICENCA", congregacaoNome: "Vila Nova", extensaoNome: null },
    { licencaId: 3, membroId: 30, nome: "Sem Congregação", status: "EM_LICENCA", congregacaoNome: null, extensaoNome: null }
  ]);
  test("lista: o dirigente vê só a licença da sua congregação; o geral vê todas; as colunas internas não saem", async () => {
    linhasLicencas();
    const local = await chamar(hLicencas, { token: LOCAL() });
    expect(local.body.map((l) => l.licencaId)).toEqual([1]);
    expect(local.body[0]).not.toHaveProperty("congregacaoNome");
    const geral = await chamar(hLicencas, { token: GERAL() });
    expect(geral.body.map((l) => l.licencaId)).toEqual([1, 2, 3]);
  });
  test("lista de uma pessoa de fora, inexistente ou malformada: [] sem consultar as licenças", async () => {
    linhasLicencas();
    for (const membroId of ["20", "99", "0x14", "abc"]) {
      const r = await chamar(hLicencas, { token: LOCAL(), query: { membroId } });
      expect(r.body).toEqual([]);
    }
    expect(rodou(/FROM LicencasCandidatura l/)).toHaveLength(0);
    const dentro = await chamar(hLicencas, { token: LOCAL(), query: { membroId: "10" } });
    expect(dentro.body.map((l) => l.licencaId)).toEqual([1]);
  });
  describe("criar", () => {
    const criar = (membroId, token = LOCAL(), dataPleito = "2026-10-04") => chamar(hLicencas, { metodo: "POST", token, corpo: { membroId, dataPleito } });
    beforeEach(() => quando(/INSERT INTO LicencasCandidatura/, [{ LicencaId: 5 }]));
    test("pessoa da congregação: grava a licença, muda o status e faz a vacância", async () => {
      const r = await criar(10);
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO LicencasCandidatura/)[0].inputs).toMatchObject({ membroId: 10, dataPleito: "2026-10-04" });
      expect(rodou(/UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA'/)).toHaveLength(1);
      expect(vacancia.encerrarVinculos.mock.calls).toHaveLength(1);
      expect(vacancia.encerrarVinculos.mock.calls[0].slice(2)).toEqual([10, "LICENCA_CANDIDATURA"]);
    });
    test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente, nada gravado, ninguém perde vínculo", async () => {
      const fora = await criar(20);
      const inexistente = await criar(99);
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
      expect(escritas()).toHaveLength(0);
      expect(vacancia.encerrarVinculos).not.toHaveBeenCalled();
    });
    test("pessoa sem congregação só para o geral; pessoa que saiu do rol é recusada; matrícula malformada = não encontrada", async () => {
      expect((await criar(30)).body.sucesso).toBe(false);
      expect((await criar(30, GERAL())).status).toBe(201);
      mockConsultas = [];
      expect((await criar(40)).body.mensagem).toMatch(/saiu do rol/);
      expect((await criar("0xA")).body.mensagem).toBe("Matrícula não encontrada.");
      expect(escritas()).toHaveLength(0);
    });
    test("data do pleito inexistente: 400 (e não 500)", async () => {
      expect((await criar(10, LOCAL(), "2026-02-30")).status).toBe(400);
      expect((await criar(10, LOCAL(), "amanhã")).status).toBe(400);
      expect(escritas()).toHaveLength(0);
    });
  });
  describe("registrar o retorno (decisão da Diretoria)", () => {
    const retorno = (token, corpo = { retornou: true }) => chamar(hLicencas, { metodo: "POST", token, ligado: { id: "5" }, corpo });
    beforeEach(() => quando(/SELECT MembroId, Status FROM LicencasCandidatura/, [{ MembroId: 10, Status: "EM_LICENCA" }]));
    test("dirigente local: 403 antes de tocar o banco, mesmo com a pessoa na própria congregação", async () => {
      const r = await retorno(LOCAL());
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(er.MSG_GERAL);
      expect(mockConsultas).toHaveLength(0);
    });
    test("papel GLOBAL com escopo de lista: 403", async () => {
      const r = await retorno(tokenDe(1, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] }));
      expect(r.status).toBe(403);
    });
    test("geral: registra; o UPDATE só vale para licença EM_LICENCA e só reativa quem está em LICENCA_CANDIDATURA", async () => {
      const r = await retorno(GERAL());
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/UPDATE LicencasCandidatura SET Status[\s\S]*Status = 'EM_LICENCA'/)).toHaveLength(1);
      expect(rodou(/UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @id AND Status = 'LICENCA_CANDIDATURA'/)).toHaveLength(1);
    });
    test("outra decisão chegou antes (UPDATE não afetou linha): recusa e não reativa ninguém", async () => {
      quando(/UPDATE LicencasCandidatura SET Status/, [], 0);
      const r = await retorno(GERAL());
      expect(r.body.sucesso).toBe(false);
      expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    });
    test("'retornou' tem de ser booleano de verdade ('false' em texto não vale como verdadeiro)", async () => {
      for (const retornou of ["false", "true", 1, 0, null, undefined]) {
        expect((await retorno(GERAL(), { retornou })).status).toBe(400);
      }
      expect(escritas()).toHaveLength(0);
    });
    test("licença já decidida, inexistente ou id malformado: nada gravado", async () => {
      mockRegras = [];
      pessoasNoBanco();
      quando(/SELECT MembroId, Status FROM LicencasCandidatura/, [{ MembroId: 10, Status: "RETORNOU" }]);
      expect((await retorno(GERAL())).body.mensagem).toMatch(/já teve o retorno/);
      expect((await chamar(hLicencas, { metodo: "POST", token: GERAL(), ligado: { id: "0x5" }, corpo: { retornou: true } })).body.mensagem).toBe("Licença não encontrada.");
      expect(escritas()).toHaveLength(0);
    });
  });
});

describe("GestaoFilaAprovacoes", () => {
  const linha = (solicitacaoId, membroId, nome, congregacaoNome, extra = {}) => ({
    solicitacaoId, membroId, nome, dataSolicitacao: "2026-10-01T10:00:00", status: "PENDENTE",
    campoId: solicitacaoId * 10, nomeCampo: "dataNascimento", valorAnterior: "1990-01-01", valorProposto: "1991-02-03", statusCampo: "PENDENTE",
    congregacaoNome, extensaoNome: null, ...extra
  });
  test("lista: só os pedidos de gente do escopo, sem o pedido do próprio usuário e sem as colunas internas", async () => {
    quando(/FROM SolicitacoesEdicaoPessoa s/, [
      linha(1, 10, "Ana", "Central"),
      linha(2, 20, "Beto", "Vila Nova"),
      linha(3, 5, "Dirigente Central", "Central"),
      linha(4, 30, "Sem Congregação", null)
    ]);
    const local = await chamar(hFila, { token: LOCAL() });
    expect(local.body.map((s) => s.solicitacaoId)).toEqual([1]);
    expect(JSON.stringify(local.body)).not.toMatch(/congregacaoNome|extensaoNome/);
    const geral = await chamar(hFila, { token: GERAL() });
    expect(geral.body.map((s) => s.solicitacaoId)).toEqual([1, 2, 4].concat([3]).sort());
  });
  describe("decidir", () => {
    const campo = (extra = {}) => ({ CampoId: 10, NomeCampo: "dataNascimento", ValorAnterior: "1990-01-01", ValorProposto: "1991-02-03", Status: "PENDENTE", ...extra });
    const base = (campos = [campo()], pendentesRestantes = 0) => {
      quando(/SELECT SolicitacaoId, MembroId, Status FROM SolicitacoesEdicaoPessoa/, (i) => ({ 1: [{ SolicitacaoId: 1, MembroId: 10, Status: "PENDENTE" }], 2: [{ SolicitacaoId: 2, MembroId: 20, Status: "PENDENTE" }], 3: [{ SolicitacaoId: 3, MembroId: 5, Status: "PENDENTE" }] }[i.id] || []));
      quando(/FROM SolicitacoesEdicaoCampos WHERE CampoId = @id AND SolicitacaoId = @sol/, (i) => campos.filter((c) => c.CampoId === i.id));
      quando(/COUNT\(\*\) AS total FROM SolicitacoesEdicaoCampos/, [{ total: pendentesRestantes }]);
    };
    const decidir = (solicitacaoId, token = LOCAL(), decisoes = [{ campoId: 10, decisao: "APROVADO" }]) =>
      chamar(hFila, { metodo: "POST", token, ligado: { solicitacaoId: String(solicitacaoId), acao: "decidir" }, corpo: { decisoes } });

    test("pedido de pessoa da congregação: aprova, grava na ficha e audita", async () => {
      base();
      const r = await decidir(1);
      expect(r.body.sucesso).toBe(true);
      const upd = rodou(/UPDATE MembroReferencia SET DataNascimento = @valor WHERE MembroId = @id/);
      expect(upd).toHaveLength(1);
      expect(upd[0].inputs).toMatchObject({ id: 10, valor: "1991-02-03" });
      expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ registroId: 10, usuarioId: 5 });
    });
    test("pedido de pessoa de OUTRA congregação: a mesma resposta de pedido inexistente; a ficha não muda", async () => {
      base();
      const fora = await decidir(2);
      const inexistente = await decidir(99);
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Solicitação não encontrada." });
      expect(escritas()).toHaveLength(0);
    });
    test("ninguém decide o PRÓPRIO pedido (403), nem o geral", async () => {
      base();
      const local = await decidir(3);
      expect(local.status).toBe(403);
      const geral = await chamar(hFila, { metodo: "POST", token: tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] }), ligado: { solicitacaoId: "3", acao: "decidir" }, corpo: { decisoes: [{ campoId: 10, decisao: "APROVADO" }] } });
      expect(geral.status).toBe(403);
      expect(escritas()).toHaveLength(0);
    });
    test("geral decide pedido de qualquer congregação", async () => {
      base();
      expect((await decidir(2, GERAL(), [{ campoId: 10, decisao: "APROVADO" }])).body.sucesso).toBe(true);
      expect(rodou(/UPDATE MembroReferencia SET DataNascimento/)[0].inputs.id).toBe(20);
    });
    test("campo fora do mapa ('constructor') ou data inválida: vira REJEITADO, não toca a ficha e não dá 500", async () => {
      base([campo({ NomeCampo: "constructor" }), campo({ CampoId: 11, ValorProposto: "2026-02-30" })]);
      const r = await decidir(1, LOCAL(), [{ campoId: 10, decisao: "APROVADO" }, { campoId: 11, decisao: "APROVADO" }]);
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
      const gravados = rodou(/UPDATE SolicitacoesEdicaoCampos SET Status/).map((c) => c.inputs.status);
      expect(gravados).toEqual(["REJEITADO", "REJEITADO"]);
    });
    test("decisões malformadas (id fora do formato, decisão desconhecida, não-objeto) são puladas; lista gigante é recusada", async () => {
      // O banco devolveria o campo para QUALQUER id (inclusive nulo): só a conferência da rota impede a decisão com id fora do formato.
      quando(/FROM SolicitacoesEdicaoCampos WHERE CampoId = @id AND SolicitacaoId = @sol/, [campo()]);
      base([campo()], 1);                                                        // nada foi decidido: o campo segue pendente
      const r = await decidir(1, LOCAL(), [{ campoId: "0xA", decisao: "APROVADO" }, { campoId: 10, decisao: "TALVEZ" }, null, "x", { campoId: 10 }]);
      expect(r.body.sucesso).toBe(true);
      expect(escritas()).toHaveLength(0);
      const muitas = Array.from({ length: 51 }, () => ({ campoId: 10, decisao: "APROVADO" }));
      expect((await decidir(1, LOCAL(), muitas)).status).toBe(400);
    });
    test("solicitação com id malformado: 'não encontrada' sem consultar nada", async () => {
      base();
      const r = await chamar(hFila, { metodo: "POST", token: LOCAL(), ligado: { solicitacaoId: "0x1", acao: "decidir" }, corpo: { decisoes: [{ campoId: 10, decisao: "APROVADO" }] } });
      expect(r.body.mensagem).toBe("Solicitação não encontrada.");
      expect(mockConsultas).toHaveLength(0);
    });
  });
});

describe("GestaoCartas", () => {
  const cartasNoBanco = [
    { cartaId: 1, membroId: 10, nome: "Ana", congregacao: "Central", tipo: "MUDANCA", status: "SOLICITADA", extensaoNome: null },
    { cartaId: 2, membroId: 20, nome: "Beto", congregacao: "Vila Nova", tipo: "MUDANCA", status: "SOLICITADA", extensaoNome: null },
    { cartaId: 3, membroId: 30, nome: "Sem Congregação", congregacao: null, tipo: "MUDANCA", status: "CONCLUIDA", extensaoNome: null }
  ];
  const cartaDe = { 1: { Tipo: "RECOMENDACAO", Status: "SOLICITADA", MembroId: 10 }, 2: { Tipo: "RECOMENDACAO", Status: "SOLICITADA", MembroId: 20 } };
  test("lista: o dirigente vê só as cartas da sua congregação; o geral vê todas", async () => {
    quando(/FROM CartasTransito c\s+JOIN MembroReferencia m ON m\.MembroId = c\.MembroId\s+LEFT JOIN Congregacoes cg/, cartasNoBanco);
    const local = await chamar(hCartas, { token: LOCAL() });
    expect(local.body.map((c) => c.cartaId)).toEqual([1]);
    expect(local.body[0]).not.toHaveProperty("extensaoNome");
    expect((await chamar(hCartas, { token: GERAL() })).body.map((c) => c.cartaId)).toEqual([1, 2, 3]);
  });
  describe.each([["emitir", /UPDATE CartasTransito SET Status = 'EMITIDA'/], ["cancelar", /UPDATE CartasTransito SET Status = 'CANCELADA'/]])("%s", (acao, padraoUpdate) => {
    const agir = (cartaId, token = LOCAL()) => chamar(hCartas, { metodo: "POST", token, ligado: { acao }, corpo: { cartaId } });
    beforeEach(() => {
      quando(/SELECT Tipo, Status, MembroId FROM CartasTransito WHERE CartaId = @id/, (i) => (cartaDe[i.id] ? [cartaDe[i.id]] : []));
      quando(/SELECT MembroId FROM CartasTransito WHERE CartaId = @id/, (i) => (cartaDe[i.id] ? [{ MembroId: cartaDe[i.id].MembroId }] : []));
    });
    test("carta de pessoa da congregação: funciona e audita", async () => {
      const r = await agir(1);
      expect(r.body.sucesso).toBe(true);
      expect(rodou(padraoUpdate)).toHaveLength(1);
      expect(rodou(padraoUpdate)[0].inputs.id).toBe(1);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("carta de OUTRA congregação: a mesma resposta de carta inexistente, nada gravado", async () => {
      const fora = await agir(2);
      const inexistente = await agir(99);
      expect(fora).toEqual(inexistente);
      expect(fora.body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado = não encontrada, sem consulta; geral age sobre carta de qualquer congregação", async () => {
      expect((await agir("0x1")).body.sucesso).toBe(false);
      expect(mockConsultas).toHaveLength(0);
      expect((await agir(2, GERAL())).body.sucesso).toBe(true);
      expect(rodou(padraoUpdate)[0].inputs.id).toBe(2);
    });
  });
  test("emitir: só emite carta ainda SOLICITADA/CONFIRMADA (condição também no UPDATE, contra emissão em duplicidade)", async () => {
    quando(/SELECT Tipo, Status, MembroId FROM CartasTransito/, [{ Tipo: "MUDANCA", Status: "SOLICITADA", MembroId: 10 }]);
    quando(/UPDATE CartasTransito SET Status = 'EMITIDA'/, [], 0);
    const r = await chamar(hCartas, { metodo: "POST", token: LOCAL(), ligado: { acao: "emitir" }, corpo: { cartaId: 1 } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE CartasTransito SET Status = 'EMITIDA'[\s\S]*Status IN \('SOLICITADA','CONFIRMADA'\)/)).toHaveLength(1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  describe("processar (minimização irreversível)", () => {
    const candidatas = () => quando(/WHERE c\.Tipo = 'MUDANCA' AND c\.Status IN/, [
      { CartaId: 1, MembroId: 10, MotivoSaida: "Mudança", dataReferencia: diasAtras(60), dataAdmissao: "2010-01-01", congregacaoNome: "Central", extensaoNome: null },
      { CartaId: 2, MembroId: 20, MotivoSaida: "Mudança", dataReferencia: diasAtras(60), dataAdmissao: "2010-01-01", congregacaoNome: "Vila Nova", extensaoNome: null },
      { CartaId: 3, MembroId: 11, MotivoSaida: "Mudança", dataReferencia: diasAtras(60), dataAdmissao: diasAtras(10), congregacaoNome: "Central", extensaoNome: null },
      { CartaId: 4, MembroId: 11, MotivoSaida: "Mudança", dataReferencia: diasAtras(5), dataAdmissao: "2010-01-01", congregacaoNome: "Central", extensaoNome: null }
    ]);
    const processar = (token) => chamar(hCartas, { metodo: "POST", token, ligado: { acao: "processar" } });
    test("dirigente: só mexe nas cartas da sua congregação (minimiza a vencida, cancela a de quem voltou, deixa a recente) e deixa trilha de cada ato", async () => {
      candidatas();
      const r = await processar(LOCAL());
      expect(r.body.mensagem).toMatch(/1 saída\(s\) minimizada\(s\), 1 carta\(s\) cancelada\(s\)/);
      expect(minimizacao.minimizarCamposExMembro.mock.calls.map((c) => c[1])).toEqual([10]);
      expect(rodou(/UPDATE CartasTransito SET Status = 'CONCLUIDA'/).map((c) => c.inputs.id)).toEqual([1]);
      expect(rodou(/UPDATE CartasTransito SET Status = 'CANCELADA'/).map((c) => c.inputs.id)).toEqual([3]);
      const acoes = registrarAuditoria.mock.calls.map((c) => c[0]);
      expect(acoes).toHaveLength(2);
      expect(acoes.find((a) => /Minimizou/.test(a.acao))).toMatchObject({ tabela: "MembroReferencia", registroId: 10, usuarioId: 5, dadosDepois: { cartaId: 1 } });
      expect(acoes.find((a) => /Cancelou carta/.test(a.acao))).toMatchObject({ tabela: "CartasTransito", registroId: 3, usuarioId: 5 });
    });
    test("geral: processa as cartas de todas as congregações", async () => {
      candidatas();
      await processar(GERAL());
      expect(minimizacao.minimizarCamposExMembro.mock.calls.map((c) => c[1]).sort()).toEqual([10, 20]);
      expect(registrarAuditoria).toHaveBeenCalledTimes(3);
    });
  });
});

describe("ElegibilidadeCEI", () => {
  const consultar = (token, membroId = "10") => chamar(hCei, { token, ligado: { membroId } });
  const dados = () => {
    quando(/SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @id/, [{ CargoMinisterial: "PASTOR" }]);
    quando(/SELECT TOP 1 ProcessoId FROM ProcessosDisciplinares/, [{ ProcessoId: 9 }]);
  };
  test("só com pessoas (sem cei nem disciplina): 403 antes de tocar o banco", async () => {
    dados();
    const r = await consultar(LOCAL(["pessoas"]));
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["cei"], ["disciplina"]])("pessoas + %s e pessoa da congregação: devolve a avaliação (com o sigilo do processo)", async (extra) => {
    dados();
    const r = await consultar(LOCAL(["pessoas", extra]));
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(r.body.reputacaoIlibada).toBe(false);
  });
  test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente, sem consultar a disciplina", async () => {
    dados();
    const fora = await consultar(LOCAL(["pessoas", "cei"]), "20");
    const inexistente = await consultar(LOCAL(["pessoas", "cei"]), "99");
    expect(fora).toEqual(inexistente);
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(rodou(/ProcessosDisciplinares/)).toHaveLength(0);
  });
  test("matrícula malformada = não encontrada; geral com cei consulta qualquer congregação", async () => {
    dados();
    expect((await consultar(LOCAL(["pessoas", "cei"]), "0xA")).body.mensagem).toBe("Matrícula não encontrada.");
    expect(rodou(/ProcessosDisciplinares/)).toHaveLength(0);
    expect((await consultar(GERAL(["pessoas", "cei"]), "20")).body.sucesso).toBe(true);
  });
});

describe("GestaoVinculosFamiliares (o escopo fica na rota; o shared do autoatendimento não muda)", () => {
  const vinculoDe = { 5: { MembroId: 10, MembroParenteId: 20 }, 6: { MembroId: 20, MembroParenteId: 21 } };
  const compartilhado = () => {
    quando(/SELECT MembroId, MembroParenteId, TipoVinculoId FROM VinculosFamiliares WHERE VinculoId = @id/, (i) => (vinculoDe[i.id] ? [vinculoDe[i.id]] : []));
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId IN \(@a, @b\)/, [{ MembroId: 1 }, { MembroId: 2 }]);
    quando(/FROM TiposVinculoFamiliar WHERE TipoVinculoId = @id AND Ativo = 1/, [{ TipoVinculoId: 1 }]);
    quando(/FROM VinculosFamiliares WHERE \(MembroId = @a AND MembroParenteId = @b\)/, []);
    quando(/INSERT INTO VinculosFamiliares/, [{ VinculoId: 9 }]);
  };
  test("lista sem filtro: só vínculos com ao menos uma ponta no escopo (a família atravessa congregações); colunas internas não saem", async () => {
    quando(/c1\.Nome AS congregacaoNome/, [
      { vinculoId: 1, membroId: 10, nome: "Ana", membroParenteId: 11, parenteNome: "Bia", congregacaoNome: "Central", extensaoNome: null, parenteCongregacaoNome: "Central", parenteExtensaoNome: null },
      { vinculoId: 2, membroId: 20, nome: "Beto", membroParenteId: 10, parenteNome: "Ana", congregacaoNome: "Vila Nova", extensaoNome: null, parenteCongregacaoNome: "Central", parenteExtensaoNome: null },
      { vinculoId: 3, membroId: 20, nome: "Beto", membroParenteId: 21, parenteNome: "Caio", congregacaoNome: "Vila Nova", extensaoNome: null, parenteCongregacaoNome: "Vila Nova", parenteExtensaoNome: null },
      { vinculoId: 4, membroId: 30, nome: "Sem", membroParenteId: 21, parenteNome: "Caio", congregacaoNome: null, extensaoNome: null, parenteCongregacaoNome: "Vila Nova", parenteExtensaoNome: null }
    ]);
    const local = await chamar(hVinculos, { token: LOCAL() });
    expect(local.body.map((v) => v.vinculoId)).toEqual([1, 2]);
    expect(JSON.stringify(local.body)).not.toMatch(/congregacaoNome|extensaoNome|parenteCongregacaoNome/);
    expect((await chamar(hVinculos, { token: GERAL() })).body).toHaveLength(4);
  });
  test("lista de uma pessoa: de fora, inexistente e malformada devolvem [] sem consultar vínculos; da congregação devolve os vínculos", async () => {
    quando(/FROM VinculosFamiliares v\s+JOIN TiposVinculoFamiliar t[\s\S]*WHERE v\.MembroId = @membroId OR/, [{ vinculoId: 1, outraPessoaId: 20 }]);
    for (const membroId of ["20", "99", "0xA"]) {
      expect((await chamar(hVinculos, { token: LOCAL(), query: { membroId } })).body).toEqual([]);
    }
    expect(rodou(/FROM VinculosFamiliares v/)).toHaveLength(0);
    expect((await chamar(hVinculos, { token: LOCAL(), query: { membroId: "10" } })).body).toHaveLength(1);
  });
  describe("criar", () => {
    const criar = (membroId, membroParenteId, token = LOCAL(), extra = {}) => chamar(hVinculos, { metodo: "POST", token, corpo: { membroId, membroParenteId, tipoVinculoId: 1, ...extra } });
    test("de pessoa da congregação para parente de outra congregação: cria (a família atravessa congregações)", async () => {
      compartilhado();
      const r = await criar(10, 20);
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO VinculosFamiliares/)).toHaveLength(1);
    });
    test("a partir de pessoa de OUTRA congregação: a resposta de sempre (cadastre as duas pessoas), nada gravado", async () => {
      compartilhado();
      const fora = await criar(20, 10);
      const inexistente = await criar(99, 10);
      expect(fora).toEqual(inexistente);
      expect(fora.body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
    test("ids fora do formato: recusa sem consulta; geral cria a partir de qualquer pessoa", async () => {
      compartilhado();
      expect((await criar("0xA", 20)).body.sucesso).toBe(false);
      expect((await criar(10, "1e1")).body.sucesso).toBe(false);
      expect((await chamar(hVinculos, { metodo: "POST", token: LOCAL(), corpo: { membroId: 10, membroParenteId: 11, tipoVinculoId: "0x1" } })).body.sucesso).toBe(false);
      expect(mockConsultas).toHaveLength(0);
      expect((await criar(20, 21, GERAL())).status).toBe(201);
    });
  });
  describe("apagar", () => {
    const apagar = (id, token = LOCAL()) => chamar(hVinculos, { metodo: "DELETE", token, ligado: { id: String(id) } });
    beforeEach(() => {
      compartilhado();
      quando(/SELECT MembroId, MembroParenteId FROM VinculosFamiliares WHERE VinculoId = @id/, (i) => (vinculoDe[i.id] ? [vinculoDe[i.id]] : []));
      quando(/DELETE FROM VinculosFamiliares/, [], 1);
    });
    test("vínculo com uma ponta no escopo: apaga e audita", async () => {
      const r = await apagar(5);
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/DELETE FROM VinculosFamiliares/)).toHaveLength(1);
    });
    test("vínculo sem nenhuma ponta no escopo: a mesma resposta de vínculo inexistente, nada apagado", async () => {
      const fora = await apagar(6);
      const inexistente = await apagar(99);
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Vínculo não encontrado." });
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado = não encontrado; geral apaga qualquer vínculo", async () => {
      expect((await apagar("0x5")).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
      expect((await apagar(6, GERAL())).body.sucesso).toBe(true);
    });
  });
});

describe("GestaoCasamentos", () => {
  const casamentosNoBanco = () => quando(/FROM Casamentos c/, [
    { casamentoId: 1, membroId: 10, nome: "Ana", congregacaoNome: "Central", extensaoNome: null },
    { casamentoId: 2, membroId: 20, nome: "Beto", congregacaoNome: "Vila Nova", extensaoNome: null },
    { casamentoId: 3, membroId: 30, nome: "Sem", congregacaoNome: null, extensaoNome: null }
  ]);
  test("lista: o dirigente vê só os casamentos de pessoas da sua congregação; o geral vê todos", async () => {
    casamentosNoBanco();
    const local = await chamar(hCasamentos, { token: LOCAL() });
    expect(local.body.map((c) => c.casamentoId)).toEqual([1]);
    expect(local.body[0]).not.toHaveProperty("congregacaoNome");
    expect((await chamar(hCasamentos, { token: GERAL() })).body).toHaveLength(3);
  });
  test("lista de uma pessoa de fora, inexistente ou malformada: [] sem consultar casamentos", async () => {
    casamentosNoBanco();
    for (const membroId of ["20", "99", "0xA"]) {
      expect((await chamar(hCasamentos, { token: LOCAL(), query: { membroId } })).body).toEqual([]);
    }
    expect(rodou(/FROM Casamentos c/)).toHaveLength(0);
    expect((await chamar(hCasamentos, { token: LOCAL(), query: { membroId: "10" } })).body).toHaveLength(1);
  });
  describe("registrar", () => {
    const corpoBase = { modalidade: "CIVIL_E_RELIGIOSO", dataCasamento: "2026-09-20", nomeConjuge: "Maria de Fora" };
    const registrar = (corpo, token = LOCAL()) => chamar(hCasamentos, { metodo: "POST", token, corpo: { ...corpoBase, ...corpo } });
    beforeEach(() => quando(/INSERT INTO Casamentos/, [{ CasamentoId: 4 }]));
    test("pessoa da congregação, cônjuge pelo nome: registra", async () => {
      const r = await registrar({ membroId: 10 });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO Casamentos/)[0].inputs).toMatchObject({ membroId: 10, membroConjugeId: null, nomeConjuge: "Maria de Fora" });
    });
    test("pessoa e cônjuge membro, ambos da congregação: registra com a matrícula do cônjuge", async () => {
      const r = await registrar({ membroId: 10, membroConjugeId: 11, nomeConjuge: undefined });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO Casamentos/)[0].inputs.membroConjugeId).toBe(11);
    });
    test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente, nada gravado", async () => {
      const fora = await registrar({ membroId: 20 });
      const inexistente = await registrar({ membroId: 99 });
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
      expect(escritas()).toHaveLength(0);
    });
    test("cônjuge membro de OUTRA congregação (ou inexistente): a mesma resposta, a matrícula dele não serve de sonda", async () => {
      const fora = await registrar({ membroId: 10, membroConjugeId: 20 });
      const inexistente = await registrar({ membroId: 10, membroConjugeId: 99 });
      expect(fora).toEqual(inexistente);
      expect(fora.body.mensagem).toBe("Matrícula do cônjuge não encontrada.");
      expect(escritas()).toHaveLength(0);
    });
    test("datas inexistentes: 400; geral registra para qualquer pessoa", async () => {
      expect((await registrar({ membroId: 10, dataCasamento: "2026-02-30" })).status).toBe(400);
      expect((await registrar({ membroId: 10, dataHabilitacaoCivil: "ontem" })).status).toBe(400);
      expect(escritas()).toHaveLength(0);
      expect((await registrar({ membroId: 20 }, GERAL())).status).toBe(201);
    });
  });
  describe("apagar", () => {
    const apagar = (id, token = LOCAL()) => chamar(hCasamentos, { metodo: "DELETE", token, ligado: { id: String(id) } });
    beforeEach(() => {
      quando(/SELECT MembroId, DataCasamento FROM Casamentos WHERE CasamentoId = @id/, (i) => ({ 1: [{ MembroId: 10, DataCasamento: "2026-01-01" }], 2: [{ MembroId: 20, DataCasamento: "2026-01-01" }] }[i.id] || []));
      quando(/DELETE FROM Casamentos/, [], 1);
    });
    test("casamento de pessoa da congregação: apaga e audita", async () => {
      expect((await apagar(1)).body.sucesso).toBe(true);
      expect(rodou(/DELETE FROM Casamentos/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("casamento de pessoa de OUTRA congregação: a mesma resposta de casamento inexistente, nada apagado", async () => {
      const fora = await apagar(2);
      const inexistente = await apagar(99);
      expect(fora).toEqual(inexistente);
      expect(fora.body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado = não encontrado; geral apaga qualquer um", async () => {
      expect((await apagar("0x1")).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
      expect((await apagar(2, GERAL())).body.sucesso).toBe(true);
    });
  });
});

describe("GestaoApresentacaoCriancas e ApresentacaoCriancaPdf (a congregação é a do registro, senão a do pai, senão a da mãe)", () => {
  const nascimento = diasAtras(30);
  const base = { dataNascimento: nascimento, nomePai: null, estadoCivilPai: null, membroIdMae: null, nomeMae: null, estadoCivilMae: null, oficiante: null, modalidade: "SOLENE", dataApresentacao: diasAtras(1), protocolo: null,
    congregacaoNome: null, congregacaoPaiNome: null, congregacaoMaeNome: null, extensaoPaiNome: null, extensaoMaeNome: null };
  const registros = () => [
    { ...base, apresentacaoId: 1, nomeCrianca: "Criança Central", membroIdPai: 10, congregacaoId: 1, congregacaoNome: "Central", congregacaoPaiNome: "Central" },
    { ...base, apresentacaoId: 2, nomeCrianca: "Criança Vila", membroIdPai: 20, congregacaoId: 2, congregacaoNome: "Vila Nova", congregacaoPaiNome: "Vila Nova" },
    { ...base, apresentacaoId: 3, nomeCrianca: "Criança sem congregação no registro", membroIdPai: 11, congregacaoId: null, congregacaoPaiNome: "Central" },
    { ...base, apresentacaoId: 4, nomeCrianca: "Criança órfã de congregação", membroIdPai: 30, congregacaoId: null }
  ];
  describe("lista", () => {
    test("o dirigente vê só as da sua congregação (a do registro ou, na falta, a do pai); o geral vê todas; colunas internas não saem", async () => {
      quando(/FROM ApresentacoesCrianca a/, registros());
      const local = await chamar(hApresentacoes, { token: LOCAL() });
      expect(local.body.map((a) => a.apresentacaoId)).toEqual([1, 3]);
      expect(JSON.stringify(local.body)).not.toMatch(/congregacaoNome|congregacaoPaiNome|congregacaoMaeNome|extensaoPaiNome/);
      expect((await chamar(hApresentacoes, { token: GERAL() })).body.map((a) => a.apresentacaoId)).toEqual([1, 2, 3, 4]);
    });
    test("filtro com id malformado: [] sem consultar", async () => {
      quando(/FROM ApresentacoesCrianca a/, registros());
      expect((await chamar(hApresentacoes, { token: LOCAL(), query: { pai: "0xA" } })).body).toEqual([]);
      expect(mockConsultas).toHaveLength(0);
    });
    test("sem a permissão disciplina, o impedimento dos pais não diz 'disciplina'; com a permissão, o detalhe aparece", async () => {
      quando(/SELECT DISTINCT ProcessosDisciplinares\.MembroId/, [{ MembroId: 10 }]);
      quando(/FROM ApresentacoesCrianca a/, registros());
      const sem = await chamar(hApresentacoes, { token: LOCAL(["pessoas"]) });
      expect(sem.body[0].aptidao.apto).toBe(false);
      expect(JSON.stringify(sem.body)).not.toMatch(/disciplina/i);
      const com = await chamar(hApresentacoes, { token: LOCAL(["pessoas", "disciplina"]) });
      expect(com.body[0].aptidao.itens.impedimentoPais.detalhe).toMatch(/sob disciplina/);
    });
  });
  describe("registrar", () => {
    const registrar = (corpo, token = LOCAL()) => chamar(hApresentacoes, { metodo: "POST", token, corpo: { nomeCrianca: "Davi", dataNascimento: nascimento, modalidade: "SOLENE", dataApresentacao: diasAtras(0), ...corpo } });
    beforeEach(() => {
      quando(/SELECT EstadoCivil, CongregacaoId FROM MembroReferencia WHERE MembroId = @id/, (i) => ({ 10: [{ EstadoCivil: "CASADO", CongregacaoId: 1 }], 11: [{ EstadoCivil: "CASADO", CongregacaoId: 1 }], 20: [{ EstadoCivil: "CASADO", CongregacaoId: 2 }] }[i.id] || []));
      quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => ({ 1: [{ Nome: "Central" }], 2: [{ Nome: "Vila Nova" }] }[i.id] || []));
      quando(/INSERT INTO ApresentacoesCrianca/, [{ ApresentacaoId: 77 }]);
    });
    test("pai da congregação: registra e a congregação do registro assume a do pai", async () => {
      const r = await registrar({ membroIdPai: 10 });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO ApresentacoesCrianca/)[0].inputs).toMatchObject({ membroIdPai: 10, membroIdMae: null, congregacaoId: 1 });
    });
    test("pai de OUTRA congregação: a mesma resposta de matrícula inexistente; nada gravado (a disciplina do pai não serve de sonda)", async () => {
      quando(/SELECT DISTINCT ProcessosDisciplinares\.MembroId/, [{ MembroId: 20 }]);
      const fora = await registrar({ membroIdPai: 20 });
      const inexistente = await registrar({ membroIdPai: 99 });
      expect(fora).toEqual(inexistente);
      expect(fora.body.mensagem).toBe("Matrícula do(a) pai não encontrada.");
      expect(rodou(/ProcessosDisciplinares/)).toHaveLength(0);
      expect(escritas()).toHaveLength(0);
    });
    test("mãe de OUTRA congregação com o pai da congregação: recusa (todos os pais informados precisam estar no escopo)", async () => {
      const r = await registrar({ membroIdPai: 10, membroIdMae: 20 });
      expect(r.body.mensagem).toBe("Matrícula do(a) mãe não encontrada.");
      expect(escritas()).toHaveLength(0);
    });
    test("congregacaoId informada fora do escopo: recusa; dentro do escopo: usa a informada", async () => {
      expect((await registrar({ membroIdPai: 10, congregacaoId: 2 })).body.mensagem).toBe("Congregação inválida.");
      expect(escritas()).toHaveLength(0);
      const ok = await registrar({ membroIdPai: 10, congregacaoId: 1 });
      expect(ok.status).toBe(201);
      expect(rodou(/INSERT INTO ApresentacoesCrianca/)[0].inputs.congregacaoId).toBe(1);
    });
    test("pai sob disciplina, sem a permissão disciplina: a recusa não diz 'disciplina'; com a permissão, diz", async () => {
      quando(/SELECT DISTINCT ProcessosDisciplinares\.MembroId/, [{ MembroId: 10 }]);
      const sem = await registrar({ membroIdPai: 10 });
      expect(sem.body.sucesso).toBe(false);
      expect(sem.body.mensagem).not.toMatch(/disciplina/i);
      const com = await registrar({ membroIdPai: 10 }, LOCAL(["pessoas", "disciplina"]));
      expect(com.body.mensagem).toMatch(/sob disciplina/);
      expect(escritas()).toHaveLength(0);
    });
    test("datas inexistentes: 400; geral registra com pai de qualquer congregação", async () => {
      expect((await registrar({ membroIdPai: 10, dataNascimento: "2026-02-30" })).status).toBe(400);
      expect(escritas()).toHaveLength(0);
      expect((await registrar({ membroIdPai: 20 }, GERAL())).status).toBe(201);
    });
  });
  describe("apagar", () => {
    const apagar = (id, token = LOCAL()) => chamar(hApresentacoes, { metodo: "DELETE", token, ligado: { id: String(id) } });
    beforeEach(() => {
      quando(/FROM ApresentacoesCrianca a[\s\S]*WHERE a\.ApresentacaoId = @id/, (i) => registros().filter((r) => r.apresentacaoId === i.id));
      quando(/DELETE FROM ApresentacoesCrianca/, [], 1);
    });
    test("registro da congregação: apaga e audita", async () => {
      expect((await apagar(1)).body.sucesso).toBe(true);
      expect(rodou(/DELETE FROM ApresentacoesCrianca/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("registro de OUTRA congregação (e o que não tem congregação alguma): a mesma resposta de inexistente, nada apagado", async () => {
      const fora = await apagar(2);
      const inexistente = await apagar(99);
      expect(fora).toEqual(inexistente);
      expect((await apagar(4)).body).toEqual(inexistente.body);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado = não encontrado; geral apaga qualquer um", async () => {
      expect((await apagar("0x1")).body.sucesso).toBe(false);
      expect((await apagar(2, GERAL())).body.sucesso).toBe(true);
    });
  });
  describe("certificado em PDF", () => {
    const pdf = (id, token = LOCAL()) => chamar(hPdfApresentacao, { token, ligado: { id: String(id) } });
    beforeEach(() => quando(/FROM ApresentacoesCrianca a[\s\S]*WHERE a\.ApresentacaoId = @id/, (i) => registros().filter((r) => r.apresentacaoId === i.id)));
    test("registro da congregação: gera o PDF, grava o protocolo da 1ª emissão e deixa na trilha quem emitiu", async () => {
      const r = await pdf(1);
      expect(r.status).toBe(200);
      expect(r.headers["Content-Type"]).toBe("application/pdf");
      expect(rodou(/UPDATE ApresentacoesCrianca SET Protocolo/)).toHaveLength(1);
      expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "ApresentacoesCrianca", registroId: 1, usuarioId: 5 });
    });
    test("registro de OUTRA congregação: o mesmo 404 de registro inexistente, sem PDF e sem protocolo", async () => {
      const fora = await pdf(2);
      const inexistente = await pdf(99);
      expect(fora).toEqual(inexistente);
      expect(fora.status).toBe(404);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado: 404 sem consulta; geral emite de qualquer congregação", async () => {
      expect((await pdf("0x1")).status).toBe(404);
      expect(mockConsultas).toHaveLength(0);
      expect((await pdf(2, GERAL())).status).toBe(200);
    });
  });
});

describe("HistoricoMembro", () => {
  const consultar = (membroId, token = LOCAL()) => chamar(hHistorico, { token, ligado: { membroId: String(membroId) } });
  beforeEach(() => quando(/SELECT Nome, FormaAdmissao, CONVERT/, [{ Nome: "Ana", FormaAdmissao: "BATISMO", DataAdmissao: "2020-01-01", DataBatismo: null, DataRitoRecebimento: null, Origem: null, IgrejaAnterior: null, DataSaida: null, MotivoSaida: null }]));
  test("pessoa da congregação: devolve a linha do tempo", async () => {
    const r = await consultar(10);
    expect(r.status).toBe(200);
    expect(r.body.nome).toBe("Ana");
    expect(r.body.eventos.length).toBeGreaterThan(0);
  });
  test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente, sem ler nenhuma tabela da ficha", async () => {
    const fora = await consultar(20);
    const inexistente = await consultar(99);
    expect(fora).toEqual(inexistente);
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(rodou(/FROM (Consagracoes|CartasTransito|MarcosMembro|ProcessosDisciplinares|ProcedimentosAbandono)/)).toHaveLength(0);
    expect(rodou(/SELECT Nome, FormaAdmissao/)).toHaveLength(0);
  });
  test("matrícula malformada = não encontrada; geral abre a de qualquer congregação", async () => {
    expect((await consultar("0xA")).body.mensagem).toBe("Matrícula não encontrada.");
    expect((await consultar(20, GERAL())).body.nome).toBe("Ana");
  });
});

describe("HistoricoSiteMembro", () => {
  const SEM = { temEmail: false, inscricoes: [], pedidos: [] };
  const consultar = (matricula, token = LOCAL()) => chamar(hHistoricoSite, { token, query: { matricula: String(matricula) } });
  const directus = (dados) => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: dados }) })); };
  beforeEach(() => quando(/SELECT Email FROM MembroReferencia WHERE MembroId = @id/, [{ Email: "ana@exemplo.org" }]));
  test("pessoa da congregação com e-mail: consulta o Directus pelo e-mail e devolve só os campos necessários", async () => {
    directus([{ evento: { title: "Congresso", event_date: "2026-05-01" }, presente: true, valor_pago: 30, grupo: { nome: "Jovens" } }]);
    const r = await consultar(10);
    expect(r.body.temEmail).toBe(true);
    expect(r.body.inscricoes).toEqual([{ eventoTitulo: "Congresso", eventoData: "2026-05-01", presente: true }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain(encodeURIComponent("ana@exemplo.org"));
  });
  test("pessoa de OUTRA congregação, inexistente ou malformada: a MESMA resposta de 'pessoa sem e-mail', sem ler o e-mail e sem chamar o Directus", async () => {
    directus([]);
    for (const matricula of [20, 99, "0xA"]) {
      const r = await consultar(matricula);
      expect(r.body).toEqual(SEM);
    }
    expect(rodou(/SELECT Email FROM MembroReferencia/)).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  test("falha ou lentidão do Directus: 'indisponível', sem repassar o erro", async () => {
    global.fetch = jest.fn(async () => { throw new Error("token secreto no erro"); });
    const r = await consultar(10);
    expect(r.body).toEqual({ temEmail: true, indisponivel: true, inscricoes: [], pedidos: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
  test("a consulta tem tempo limite; sem matrícula: 400; geral consulta qualquer congregação", async () => {
    directus([]);
    await consultar(10);
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
    expect((await chamar(hHistoricoSite, { token: LOCAL() })).status).toBe(400);
    expect((await consultar(20, GERAL())).body.temEmail).toBe(true);
  });
});

describe("ListarMarcosMembro e RegistrarMarcoMembro", () => {
  describe("listar", () => {
    const listar = (membroId, token = LOCAL()) => chamar(hListarMarcos, { token, query: { membroId: String(membroId) } });
    beforeEach(() => quando(/FROM MarcosMembro\s+WHERE MembroId = @id/, [{ marcoId: 1, tipo: "CONVERSAO", descricao: "Conversão" }]));
    test("pessoa da congregação: devolve os marcos", async () => {
      expect((await listar(10)).body).toHaveLength(1);
    });
    test("pessoa de OUTRA congregação, inexistente ou malformada: [] sem consultar os marcos", async () => {
      for (const id of [20, 99, "0xA"]) expect((await listar(id)).body).toEqual([]);
      expect(rodou(/FROM MarcosMembro/)).toHaveLength(0);
    });
    test("sem membroId: 400; geral lista os marcos de qualquer congregação", async () => {
      expect((await chamar(hListarMarcos, { token: LOCAL() })).status).toBe(400);
      expect((await listar(20, GERAL())).body).toHaveLength(1);
    });
  });
  describe("registrar", () => {
    const registrar = (corpo, token = LOCAL()) => chamar(hRegistrarMarco, { metodo: "POST", token, corpo: { tipo: "CONVERSAO", descricao: "Aceitou a Jesus", ...corpo } });
    beforeEach(() => quando(/INSERT INTO MarcosMembro/, [{ MarcoId: 3 }]));
    test("pessoa da congregação: grava e audita", async () => {
      const r = await registrar({ membroId: 10, dataMarco: "2001-05-06" });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO MarcosMembro/)[0].inputs).toMatchObject({ membroId: 10, tipo: "CONVERSAO", criadoPor: 5 });
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente, nada gravado", async () => {
      const fora = await registrar({ membroId: 20 });
      const inexistente = await registrar({ membroId: 99 });
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
      expect(escritas()).toHaveLength(0);
    });
    test("matrícula malformada, data inexistente: nada gravado; geral registra para qualquer congregação", async () => {
      expect((await registrar({ membroId: "0xA" })).body.mensagem).toBe("Matrícula não encontrada.");
      expect((await registrar({ membroId: 10, dataMarco: "2026-13-01" })).status).toBe(400);
      expect(escritas()).toHaveLength(0);
      expect((await registrar({ membroId: 20 }, GERAL())).status).toBe(201);
    });
  });
});

describe("UploadFotoMembro", () => {
  const enviar = (membroId, token = LOCAL(), corpo = {}) => chamar(hFoto, { metodo: "POST", token, ligado: { membroId: String(membroId) }, corpo: { fotoBase64: JPEG_BASE64, mimeType: "image/jpeg", ...corpo } });
  const comConsentimento = () => quando(/FROM ConsentimentosLGPD c1/, [{ Tipo: "FOTO", Concedido: true }]);
  test("pessoa da congregação com consentimento: salva o blob com a matrícula canônica, grava a URL e audita", async () => {
    comConsentimento();
    const r = await enviar(10);
    expect(r.body.sucesso).toBe(true);
    expect(storage.salvarFoto).toHaveBeenCalledWith(10, expect.any(Buffer), "image/jpeg");
    expect(rodou(/UPDATE MembroReferencia SET FotoUrl/)[0].inputs).toMatchObject({ id: 10 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("pessoa de OUTRA congregação: a mesma resposta de matrícula inexistente; nada salvo nem gravado", async () => {
    comConsentimento();
    const fora = await enviar(20);
    const inexistente = await enviar(99);
    expect(fora).toEqual(inexistente);
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(storage.salvarFoto).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("grafias alternativas da matrícula ('0x0A', '1e1', '10.0') não passam: não geram blob órfão", async () => {
    comConsentimento();
    for (const alias of ["0x0A", "1e1", "10.0", " 10", "010"]) {
      expect((await enviar(alias)).body.sucesso).toBe(false);
    }
    expect(storage.salvarFoto).not.toHaveBeenCalled();
  });
  test("sem consentimento: recusa sem salvar", async () => {
    const r = await enviar(10);
    expect(r.body.sucesso).toBe(false);
    expect(storage.salvarFoto).not.toHaveBeenCalled();
  });
  test("conteúdo que não é a imagem declarada, imagem vazia e base64 gigante: 400 sem salvar", async () => {
    comConsentimento();
    expect((await enviar(10, LOCAL(), { fotoBase64: Buffer.from("<script>alert(1)</script>").toString("base64") })).status).toBe(400);
    expect((await enviar(10, LOCAL(), { mimeType: "image/png" })).status).toBe(400);      // bytes de JPEG declarados como PNG
    const decodificar = jest.spyOn(Buffer, "from");
    try {
      expect((await enviar(10, LOCAL(), { fotoBase64: "x".repeat(8 * 1024 * 1024) })).status).toBe(400);
      // O texto gigante é recusado ANTES de ser decodificado.
      expect(decodificar.mock.calls.some((c) => typeof c[0] === "string" && c[0].length > 8000000)).toBe(false);
    } finally { decodificar.mockRestore(); }
    expect((await enviar(10, LOCAL(), { mimeType: "text/html" })).status).toBe(400);
    expect(storage.salvarFoto).not.toHaveBeenCalled();
  });
  test("falha do armazenamento: o texto do erro NÃO vai para o cliente", async () => {
    comConsentimento();
    storage.salvarFoto.mockRejectedValueOnce(new Error("DefaultEndpointsProtocol=https;AccountKey=SEGREDO"));
    const r = await enviar(10);
    expect(r.body.sucesso).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/SEGREDO|AccountKey/);
    expect(escritas()).toHaveLength(0);
  });
  test("geral troca a foto de qualquer congregação", async () => {
    comConsentimento();
    expect((await enviar(20, GERAL())).body.sucesso).toBe(true);
    expect(storage.salvarFoto).toHaveBeenCalledWith(20, expect.any(Buffer), "image/jpeg");
  });
});
