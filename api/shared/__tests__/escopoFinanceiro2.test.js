// Escopo territorial das rotas do grupo "finanças e patrimônio, parte 2" (decisão do responsável, 02/10/2026): quem tem login de liderança só vê e só altera o que está
// dentro do seu escopo; o nível GERAL (papel Global E escopo TODAS) vê tudo.
//  - INSTITUCIONAIS (só o geral): GestaoInvestimentos, GestaoNif, GestaoObrigacoesFiscais, GestaoParametrosMonetarios, GestaoOrcamentos, GestaoNotasExplicativas,
//    GestaoFundoExecucaoPdq (GET) e o PUT de GestaoParametrosSaida (o GET segue aberto a `financeiro`: a tela de Saída usa).
//  - PDQ (GestaoPdqPlanos/Metas/Projetos): ler = `cli` ou `financeiro`; escrever = `cli` ou geral.
//  - CONGREGAÇÃO (escopo pela congregação do registro): GestaoManutencaoVeiculo e GestaoObraMarcos; registro de fora do escopo responde igual a registro que não existe.
// O banco é simulado por TEXTO da consulta (como em revisaoV75.test.js); o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (!padrao.test(texto)) continue;
      const recordset = typeof valor === "function" ? valor(inputs) : valor;
      return { recordset, rowsAffected: [typeof afetadas === "function" ? afetadas(inputs) : (afetadas === undefined ? 0 : afetadas)] };
    }
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://armazenamento/doc-1") }));

const auth = require("../auth");
const storage = require("../storage");
const { registrarAuditoria } = require("../auditoria");
const entrada = require("../entradaFinanceira");
const { exigirAcessoPdq } = require("../pdqAcesso");
const hFundo = require("../../GestaoFundoExecucaoPdq/index.js");
const hInvest = require("../../GestaoInvestimentos/index.js");
const hManut = require("../../GestaoManutencaoVeiculo/index.js");
const hNif = require("../../GestaoNif/index.js");
const hNotas = require("../../GestaoNotasExplicativas/index.js");
const hMarcos = require("../../GestaoObraMarcos/index.js");
const hFiscais = require("../../GestaoObrigacoesFiscais/index.js");
const hOrcamentos = require("../../GestaoOrcamentos/index.js");
const hMonetarios = require("../../GestaoParametrosMonetarios/index.js");
const hParamSaida = require("../../GestaoParametrosSaida/index.js");
const hMetas = require("../../GestaoPdqMetas/index.js");
const hPlanos = require("../../GestaoPdqPlanos/index.js");
const hProjetos = require("../../GestaoPdqProjetos/index.js");

const tok = (claims) => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", ...claims });
const GERAL = tok({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
const GERAL_SEM_PERMISSAO = tok({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] });
const LOCAL_A = tok({ nivel: "CONGREGACAO", escopoCongregacoes: ["A"], permissoes: ["financeiro"] });
const AREA_AB = tok({ nivel: "AREA", escopoCongregacoes: ["A", "B"], permissoes: ["financeiro"] });
const GLOBAL_COM_LISTA = tok({ nivel: "GLOBAL", escopoCongregacoes: ["A"], permissoes: ["financeiro"] });
const LOCAL_COM_TODAS = tok({ nivel: "CONGREGACAO", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
const CLI_LOCAL = tok({ nivel: "CONGREGACAO", escopoCongregacoes: ["A"], permissoes: ["cli"] });
const PIN = tok({ via: "PIN", nivel: null, escopoCongregacoes: [], permissoes: [] });

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const ESCRITA = /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i;
const gravacoes = () => mockConsultas.filter(c => ESCRITA.test(c.sql));
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const erroSql = (numero) => () => { const e = new Error("erro simulado do SQL Server"); e.number = numero; throw e; };

beforeEach(() => { mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); storage.salvarDocumento.mockClear(); });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Validação de entrada compartilhada
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("shared/entradaFinanceira", () => {
  test("numeroEntre: só número ou texto numérico simples, dentro da faixa", () => {
    expect(entrada.numeroEntre(10, 0, 100)).toBe(10);
    expect(entrada.numeroEntre("12.5", 0, 100)).toBe(12.5);
    expect(entrada.numeroEntre(" 7 ", 0, 100)).toBe(7);
    for (const ruim of ["1e1", "0x10", "", "abc", "5,5", null, undefined, true, [5], {}, NaN, Infinity, 101, -1, "101", "-1"]) {
      expect(entrada.numeroEntre(ruim, 0, 100)).toBeNull();
    }
    expect(entrada.numeroEntre(0, 0.01, 100)).toBeNull();
  });
  test("inteiroEntre recusa fração", () => {
    expect(entrada.inteiroEntre("2026", 1900, 2200)).toBe(2026);
    expect(entrada.inteiroEntre(2026.5, 1900, 2200)).toBeNull();
    expect(entrada.inteiroEntre("1899", 1900, 2200)).toBeNull();
  });
  test("dataIso: data que existe no calendário; devolve AAAA-MM-DD", () => {
    expect(entrada.dataIso("2026-10-02")).toBe("2026-10-02");
    expect(entrada.dataIso("2026-10-02T12:00:00.000Z")).toBe("2026-10-02");
    for (const ruim of ["2026-02-30", "2026-13-01", "02/10/2026", "2026-1-2", "", null, undefined, 20261002, "2026-10-02; DROP TABLE x"]) {
      expect(entrada.dataIso(ruim)).toBeNull();
    }
  });
  test("textoAte / textoOpcionalAte", () => {
    expect(entrada.textoAte("  oi ", 5)).toBe("oi");
    expect(entrada.textoAte("   ", 5)).toBeNull();
    expect(entrada.textoAte("abcdef", 5)).toBeNull();
    expect(entrada.textoAte(5, 5)).toBeNull();
    expect(entrada.textoOpcionalAte(undefined, 5)).toBe("");
    expect(entrada.textoOpcionalAte("", 5)).toBe("");
    expect(entrada.textoOpcionalAte("abcdef", 5)).toBeNull();
    expect(entrada.textoOpcionalAte(7, 5)).toBeNull();
  });
  test("afetadas e chaves do SQL Server", () => {
    expect(entrada.afetadas({ rowsAffected: [3] })).toBe(3);
    expect(entrada.afetadas({ rowsAffected: [] })).toBe(0);
    expect(entrada.afetadas({})).toBe(0);
    expect(entrada.violouChaveUnica({ number: 2627 })).toBe(true);
    expect(entrada.violouChaveUnica({ number: 2601 })).toBe(true);
    expect(entrada.violouChaveUnica({ number: 547 })).toBe(false);
    expect(entrada.violouChaveEstrangeira({ number: 547 })).toBe(true);
  });
  test("conteudoCombinaComTipo: a assinatura do arquivo precisa bater com o tipo declarado", () => {
    expect(entrada.conteudoCombinaComTipo(Buffer.from("%PDF-1.4 ..."), "application/pdf")).toBe(true);
    expect(entrada.conteudoCombinaComTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]), "image/jpeg")).toBe(true);
    expect(entrada.conteudoCombinaComTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), "image/png")).toBe(true);
    expect(entrada.conteudoCombinaComTipo(Buffer.from("%PDF-1.4 ..."), "image/png")).toBe(false);
    expect(entrada.conteudoCombinaComTipo(Buffer.from("<html>"), "application/pdf")).toBe(false);
    expect(entrada.conteudoCombinaComTipo(Buffer.from("%PDF"), "text/html")).toBe(false);
    expect(entrada.conteudoCombinaComTipo(null, "application/pdf")).toBe(false);
  });
});

describe("shared/pdqAcesso.exigirAcessoPdq", () => {
  const porta = (token, metodo) => { const context = {}; const u = exigirAcessoPdq({ method: metodo, headers: token ? { "x-auth-token": token } : {} }, context); return { u, res: context.res }; };
  test("ler: cli ou financeiro; escrever: cli ou geral", () => {
    expect(porta(LOCAL_A, "GET").u).toMatchObject({ membroId: 5 });
    expect(porta(CLI_LOCAL, "GET").u).toMatchObject({ membroId: 5 });
    expect(porta(LOCAL_A, "POST").res.status).toBe(403);
    expect(porta(LOCAL_A, "PUT").res.status).toBe(403);
    expect(porta(AREA_AB, "POST").res.status).toBe(403);
    expect(porta(GLOBAL_COM_LISTA, "POST").res.status).toBe(403);
    expect(porta(LOCAL_COM_TODAS, "PUT").res.status).toBe(403);
    expect(porta(CLI_LOCAL, "POST").u).toMatchObject({ membroId: 5 });
    expect(porta(GERAL, "POST").u).toMatchObject({ membroId: 5 });
  });
  test("sem sessão 401; PIN e quem não tem cli nem financeiro: 403", () => {
    expect(porta(null, "GET").res.status).toBe(401);
    expect(porta(PIN, "GET").res.status).toBe(403);
    expect(porta(tok({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] }), "GET").res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Rotas INSTITUCIONAIS: só o geral, e a recusa vem ANTES de tocar no banco
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const CORPO_QUALQUER = { valorReferenciaCotacoes: 500, ano: 2027, linhas: [{ tipoMovimento: "SAIDA", categoriaCodigo: "X", valorOrcado: 10 }], texto: "x", acao: "CONFIRMAR", sinalizacaoId: 1, aplicacaoId: 1, retencaoId: 1, obrigacaoId: 1, percentual: 5, valorId: 1, sigla: "X", nome: "X", valor: 1 };
const INSTITUCIONAIS = [
  ["GestaoInvestimentos GET portfólio", hInvest, {}],
  ["GestaoInvestimentos GET aplicacoes", hInvest, { ligado: { recurso: "aplicacoes" } }],
  ["GestaoInvestimentos GET liquidez", hInvest, { ligado: { recurso: "liquidez" } }],
  ["GestaoInvestimentos POST aplicacoes", hInvest, { metodo: "POST", ligado: { recurso: "aplicacoes" } }],
  ["GestaoInvestimentos PUT aplicacoes", hInvest, { metodo: "PUT", ligado: { recurso: "aplicacoes" } }],
  ["GestaoNif GET sinalizacoes", hNif, { ligado: { recurso: "sinalizacoes" } }],
  ["GestaoNif POST sinalizacoes", hNif, { metodo: "POST", ligado: { recurso: "sinalizacoes" } }],
  ["GestaoNif PUT sinalizacoes", hNif, { metodo: "PUT", ligado: { recurso: "sinalizacoes" } }],
  ["GestaoNif GET comunicacoes", hNif, { ligado: { recurso: "comunicacoes" } }],
  ["GestaoNif POST comunicacoes", hNif, { metodo: "POST", ligado: { recurso: "comunicacoes" } }],
  ["GestaoObrigacoesFiscais GET calendário", hFiscais, {}],
  ["GestaoObrigacoesFiscais GET medidor-ecd", hFiscais, { ligado: { recurso: "medidor-ecd" } }],
  ["GestaoObrigacoesFiscais GET retencoes", hFiscais, { ligado: { recurso: "retencoes" } }],
  ["GestaoObrigacoesFiscais POST", hFiscais, { metodo: "POST" }],
  ["GestaoObrigacoesFiscais PUT", hFiscais, { metodo: "PUT" }],
  ["GestaoObrigacoesFiscais POST retencoes", hFiscais, { metodo: "POST", ligado: { recurso: "retencoes" } }],
  ["GestaoObrigacoesFiscais PUT retencoes", hFiscais, { metodo: "PUT", ligado: { recurso: "retencoes" } }],
  ["GestaoParametrosMonetarios GET", hMonetarios, {}],
  ["GestaoParametrosMonetarios GET anexo", hMonetarios, { ligado: { recurso: "anexo" } }],
  ["GestaoParametrosMonetarios GET resolucoes", hMonetarios, { ligado: { recurso: "resolucoes" } }],
  ["GestaoParametrosMonetarios POST", hMonetarios, { metodo: "POST" }],
  ["GestaoParametrosMonetarios PUT", hMonetarios, { metodo: "PUT" }],
  ["GestaoParametrosMonetarios POST corrigir-todos", hMonetarios, { metodo: "POST", ligado: { recurso: "corrigir-todos" } }],
  ["GestaoParametrosMonetarios POST resolucoes", hMonetarios, { metodo: "POST", ligado: { recurso: "resolucoes" } }],
  ["GestaoOrcamentos GET lista", hOrcamentos, {}],
  ["GestaoOrcamentos GET detalhe", hOrcamentos, { ligado: { id: "1" } }],
  ["GestaoOrcamentos POST", hOrcamentos, { metodo: "POST" }],
  ["GestaoOrcamentos PUT", hOrcamentos, { metodo: "PUT", ligado: { id: "1" } }],
  ["GestaoNotasExplicativas GET", hNotas, { ligado: { ano: "2026" } }],
  ["GestaoNotasExplicativas PUT", hNotas, { metodo: "PUT", ligado: { ano: "2026" } }],
  ["GestaoFundoExecucaoPdq GET", hFundo, {}],
  ["GestaoParametrosSaida PUT", hParamSaida, { metodo: "PUT" }]
];

describe.each(INSTITUCIONAIS)("%s", (_nome, handler, args) => {
  const chamarCom = (token) => chamar(handler, { corpo: CORPO_QUALQUER, ...args, token });
  test("sem sessão: 401, sem tocar no banco", async () => {
    expect((await chamarCom(undefined)).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN: 403, sem tocar no banco", async () => {
    expect((await chamarCom(PIN)).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["Tesoureiro Local (congregação)", LOCAL_A], ["Tesoureiro de Área", AREA_AB]])("%s com `financeiro`: 403 ANTES de tocar no banco", async (_p, token) => {
    const r = await chamarCom(token);
    expect(r.status).toBe(403);
    expect(r.body.sucesso).toBe(false);
    expect(mockConsultas).toHaveLength(0);
    expect(gravacoes()).toHaveLength(0);
  });
  test("papel Global com escopo de LISTA e papel local com escopo TODAS também levam 403 antes do banco (nem o nível nem o escopo sozinho basta)", async () => {
    expect((await chamarCom(GLOBAL_COM_LISTA)).status).toBe(403);
    expect((await chamarCom(LOCAL_COM_TODAS)).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral sem a permissão `financeiro`: 403", async () => {
    expect((await chamarCom(GERAL_SEM_PERMISSAO)).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral passa da porta (nem 401 nem 403; o banco simulado está vazio, então a rota pode até falhar depois da porta — o que importa é ter passado)", async () => {
    let r = null;
    try { r = await chamarCom(GERAL); } catch (_erro) { r = null; }
    if (r) expect([401, 403]).not.toContain(r.status);
    else expect(mockConsultas.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoParametrosSaida: o GET segue aberto a `financeiro`; o PUT é só do geral e tem teto
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoParametrosSaida", () => {
  test("GET continua para Tesoureiro Local (a tela de Saída precisa do valor)", async () => {
    quando(/SELECT ValorReferenciaCotacoes FROM ParametrosSaida/, [{ ValorReferenciaCotacoes: 1000 }]);
    const r = await chamar(hParamSaida, { token: LOCAL_A });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ valorReferenciaCotacoes: 1000 });
  });
  test("GET: PIN 403 e sem sessão 401", async () => {
    expect((await chamar(hParamSaida, { token: PIN })).status).toBe(403);
    expect((await chamar(hParamSaida, {})).status).toBe(401);
  });
  test("PUT do Tesoureiro Local é recusado e NADA é gravado", async () => {
    const r = await chamar(hParamSaida, { metodo: "PUT", token: LOCAL_A, corpo: { valorReferenciaCotacoes: 99999999 } });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("PUT do geral grava, com a auditoria trazendo o valor de antes", async () => {
    quando(/SELECT ValorReferenciaCotacoes FROM ParametrosSaida/, [{ ValorReferenciaCotacoes: 1000 }]);
    const r = await chamar(hParamSaida, { metodo: "PUT", token: GERAL, corpo: { valorReferenciaCotacoes: "2500.50" } });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    const escrita = gravacoes();
    expect(escrita).toHaveLength(1);
    expect(escrita[0].inputs.valor).toBe(2500.5);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "ParametrosSaida", dadosAntes: { ValorReferenciaCotacoes: 1000 }, dadosDepois: { valorReferenciaCotacoes: 2500.5 } }));
  });
  test.each([[0], [-5], ["abc"], ["1e3"], [null], [undefined], [true], [100000.01], [99999999.99], [Infinity]])("PUT com valor %p: 400, nada gravado", async (valor) => {
    const r = await chamar(hParamSaida, { metodo: "PUT", token: GERAL, corpo: { valorReferenciaCotacoes: valor } });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("o teto em si (R$ 100.000,00) vale", async () => {
    const r = await chamar(hParamSaida, { metodo: "PUT", token: GERAL, corpo: { valorReferenciaCotacoes: 100000 } });
    expect(r.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoFundoExecucaoPdq
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoFundoExecucaoPdq", () => {
  const presidente = () => { quando(/FROM Orgaos WHERE Sigla/, [{ OrgaoId: 1 }]); quando(/FROM Assentos/, [{ AssentoId: 1 }]); };
  test("GET do geral devolve saldo, dotação e suspensão", async () => {
    quando(/FROM RateioGeralValores/, [{ total: 100 }]);
    quando(/FROM SaidasTesouraria s/, [{ total: 30 }]);
    quando(/SELECT TOP 1 \* FROM PdqFundoSuspensoes/, []);
    quando(/SELECT Percentual FROM RateioGeralDestinos/, [{ Percentual: 10 }]);
    const r = await chamar(hFundo, { token: GERAL });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ percentualDotacao: 10, saldoDisponivel: 70, suspenso: false });
  });
  test("POST de quem tem `financeiro` mas não o Assento de Presidente: 403, nada gravado", async () => {
    quando(/FROM Orgaos WHERE Sigla/, [{ OrgaoId: 1 }]);
    quando(/FROM Assentos/, []);
    for (const token of [GERAL, LOCAL_A]) {
      const r = await chamar(hFundo, { metodo: "POST", token, corpo: { acao: "SUSPENDER", motivo: "x" } });
      expect(r.status).toBe(403);
    }
    expect(gravacoes()).toHaveLength(0);
  });
  test("POST: sem sessão 401, PIN 403", async () => {
    expect((await chamar(hFundo, { metodo: "POST", corpo: { acao: "SUSPENDER", motivo: "x" } })).status).toBe(401);
    expect((await chamar(hFundo, { metodo: "POST", token: PIN, corpo: { acao: "SUSPENDER", motivo: "x" } })).status).toBe(403);
  });
  test("Presidente suspende: a conferência de 'já suspenso' vai dentro do INSERT; grava e audita", async () => {
    presidente();
    quando(/SELECT TOP 1 \* FROM PdqFundoSuspensoes/, []);
    quando(/INSERT INTO PdqFundoSuspensoes/, [{ SuspensaoId: 7 }], 1);
    const r = await chamar(hFundo, { metodo: "POST", token: GERAL, corpo: { acao: "SUSPENDER", motivo: "  crise  " } });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    const inserts = rodou(/INSERT INTO PdqFundoSuspensoes/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/WHERE NOT EXISTS/);
    expect(inserts[0].inputs.motivo).toBe("crise");
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "PdqFundoSuspensoes", registroId: 7 }));
  });
  test("suspensão simultânea (o INSERT condicional não devolve linha): 'já está suspenso', sem auditoria", async () => {
    presidente();
    quando(/SELECT TOP 1 \* FROM PdqFundoSuspensoes/, []);
    quando(/INSERT INTO PdqFundoSuspensoes/, [], 0);
    const r = await chamar(hFundo, { metodo: "POST", token: GERAL, corpo: { acao: "SUSPENDER", motivo: "crise" } });
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "O Fundo já está suspenso." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("Presidente reativa: UPDATE só da suspensão ainda aberta; se ninguém foi afetado, 'não está suspenso'", async () => {
    presidente();
    quando(/SELECT TOP 1 \* FROM PdqFundoSuspensoes/, [{ SuspensaoId: 7, MotivoSuspensao: "x", SuspensoEm: new Date() }]);
    quando(/UPDATE PdqFundoSuspensoes/, [], 1);
    const ok = await chamar(hFundo, { metodo: "POST", token: GERAL, corpo: { acao: "REATIVAR", motivo: "normalizou" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/UPDATE PdqFundoSuspensoes/)[0].sql).toMatch(/AND ReativadoEm IS NULL/);
    mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear();
    presidente();
    quando(/SELECT TOP 1 \* FROM PdqFundoSuspensoes/, [{ SuspensaoId: 7, MotivoSuspensao: "x", SuspensoEm: new Date() }]);
    quando(/UPDATE PdqFundoSuspensoes/, [], 0);
    const corrida = await chamar(hFundo, { metodo: "POST", token: GERAL, corpo: { acao: "REATIVAR", motivo: "normalizou" } });
    expect(corrida.body).toMatchObject({ sucesso: false, mensagem: "O Fundo não está suspenso." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test.each([[{ acao: "OUTRA", motivo: "x" }], [{ acao: "SUSPENDER" }], [{ acao: "SUSPENDER", motivo: "   " }], [{ acao: "SUSPENDER", motivo: "x".repeat(301) }], [{ acao: "SUSPENDER", motivo: 5 }]])("corpo inválido %j: 400", async (corpo) => {
    const r = await chamar(hFundo, { metodo: "POST", token: GERAL, corpo });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoInvestimentos: o geral opera; resgate não passa do saldo aplicado nem se repete
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoInvestimentos (geral)", () => {
  const POST = { tipo: "CDB", instituicao: "Banco X", valorAplicado: 1000, dataAplicacao: "2026-10-01", dataVencimento: "2027-10-01", taxaAnual: 12 };
  test("GET aplicacoes e POST funcionam para o geral", async () => {
    quando(/FROM AplicacoesFinanceiras a ORDER BY/, [{ AplicacaoId: 1 }]);
    expect((await chamar(hInvest, { token: GERAL, ligado: { recurso: "aplicacoes" } })).body).toEqual([{ AplicacaoId: 1 }]);
    quando(/^\s*INSERT INTO AplicacoesFinanceiras/, [{ AplicacaoId: 4 }]);
    const r = await chamar(hInvest, { metodo: "POST", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { ...POST, fonteId: "3" } });
    expect(r.status).toBe(201);
    const ins = gravacoes();
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ valor: 1000, taxa: 12, fonte: 3, dataAplic: "2026-10-01", venc: "2027-10-01" });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "AplicacoesFinanceiras", registroId: 4 }));
  });
  test.each([
    [{ valorAplicado: -5 }], [{ valorAplicado: "1e5" }], [{ valorAplicado: 0 }], [{ valorAplicado: "abc" }], [{ valorAplicado: 1e12 }],
    [{ dataAplicacao: "2026-02-30" }], [{ dataVencimento: "ontem" }], [{ fonteId: "0x1" }], [{ fonteId: "-3" }], [{ taxaAnual: "x" }], [{ taxaAnual: 1000 }],
    [{ tipo: "ACOES" }], [{ liquidez: "NUNCA" }], [{ instituicao: "x".repeat(151) }]
  ])("POST com %j: 400 e nada gravado", async (troca) => {
    const r = await chamar(hInvest, { metodo: "POST", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { ...POST, ...troca } });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  const aplicacao = (extra = {}) => ({ AplicacaoId: 1, ValorAplicado: 1000, Status: "ATIVA", ...extra });
  const cenario = ({ status = "ATIVA", resgatado = 300, inserido = 1 } = {}) => {
    quando(/SELECT \* FROM AplicacoesFinanceiras WHERE AplicacaoId/, (i) => i.id === 1 ? [aplicacao({ Status: status })] : []);
    quando(/SELECT ISNULL\(SUM\(ValorResgatado\), 0\) AS total FROM ResgatesAplicacoes/, [{ total: resgatado }]);
    quando(/^\s*INSERT INTO ResgatesAplicacoes/, [], inserido);
    quando(/^\s*UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA'/, [], 1);
  };
  const resgatar = (corpo) => chamar(hInvest, { metodo: "PUT", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { aplicacaoId: 1, acao: "RESGATAR", ...corpo } });
  test("RESGATAR dentro do saldo: grava o resgate e NÃO marca RESGATADA enquanto sobra saldo", async () => {
    cenario();
    const r = await resgatar({ valorResgatado: 200, dataResgate: "2026-10-02" });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/^\s*INSERT INTO ResgatesAplicacoes/)).toHaveLength(1);
    expect(rodou(/^\s*INSERT INTO ResgatesAplicacoes/)[0].inputs).toMatchObject({ apl: 1, valor: 200, data: "2026-10-02" });
    expect(rodou(/^\s*UPDATE AplicacoesFinanceiras/)).toHaveLength(0);
  });
  test("RESGATAR exatamente o saldo restante zera a aplicação: passa a RESGATADA", async () => {
    cenario();
    const r = await resgatar({ valorResgatado: 700 });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/^\s*UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA'/)).toHaveLength(1);
  });
  test("RESGATAR acima do saldo aplicado (1000 aplicados − 300 já resgatados = 700): recusado, nada gravado", async () => {
    cenario();
    const r = await resgatar({ valorResgatado: 700.01 });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/700\.00/);
    expect(gravacoes()).toHaveLength(0);
  });
  test("aplicação já RESGATADA não recebe resgate nem novo encerramento", async () => {
    cenario({ status: "RESGATADA" });
    expect((await resgatar({ valorResgatado: 1 })).body.sucesso).toBe(false);
    const enc = await chamar(hInvest, { metodo: "PUT", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { aplicacaoId: 1, acao: "ENCERRAR" } });
    expect(enc.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });
  test("resgates simultâneos: o INSERT condicional não gravou ninguém → recusado e sem auditoria", async () => {
    cenario({ inserido: 0 });
    const r = await resgatar({ valorResgatado: 100 });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/^\s*INSERT INTO ResgatesAplicacoes/)[0].sql).toMatch(/WHERE EXISTS/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(rodou(/^\s*UPDATE AplicacoesFinanceiras/)).toHaveLength(0);
  });
  test.each([[{ valorResgatado: -1 }], [{ valorResgatado: "1e2" }], [{ valorResgatado: 0 }], [{}], [{ dataResgate: "31/12/2026", valorResgatado: 10 }], [{ aplicacaoId: "abc", valorResgatado: 10 }], [{ aplicacaoId: "0x1", valorResgatado: 10 }], [{ acao: "APAGAR", valorResgatado: 10 }]])("PUT com %j: 400 e nada gravado", async (troca) => {
    cenario();
    const r = await resgatar(troca);
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("aplicação inexistente: 'não encontrada'", async () => {
    cenario();
    const r = await resgatar({ aplicacaoId: 99, valorResgatado: 10 });
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "Aplicação não encontrada." });
  });
  test("ENCERRAR reserva o encerramento primeiro e registra o resgate do que sobrou (700); quem perde a corrida não grava nada", async () => {
    cenario();
    const r = await chamar(hInvest, { metodo: "PUT", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { aplicacaoId: 1, acao: "ENCERRAR" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/^\s*INSERT INTO ResgatesAplicacoes/)[0].inputs.valor).toBe(700);
    mockRegras = []; mockConsultas = [];
    quando(/SELECT \* FROM AplicacoesFinanceiras WHERE AplicacaoId/, [aplicacao()]);
    quando(/SELECT ISNULL\(SUM\(ValorResgatado\), 0\) AS total FROM ResgatesAplicacoes/, [{ total: 300 }]);
    quando(/^\s*UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA'/, [], 0);
    const perdeu = await chamar(hInvest, { metodo: "PUT", token: GERAL, ligado: { recurso: "aplicacoes" }, corpo: { aplicacaoId: 1, acao: "ENCERRAR" } });
    expect(perdeu.body.sucesso).toBe(false);
    expect(rodou(/^\s*INSERT INTO ResgatesAplicacoes/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoNif
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoNif (geral)", () => {
  const nif = (metodo, recurso, corpo) => chamar(hNif, { metodo, token: GERAL, ligado: { recurso }, corpo });
  test("decidir só vale para sinalização PENDENTE (a conferência vai no UPDATE) e grava a auditoria com antes e depois", async () => {
    quando(/^\s*UPDATE NifSinalizacoes/, [], 1);
    const r = await nif("PUT", "sinalizacoes", { sinalizacaoId: 8, acao: "DESCARTAR" });
    expect(r.body.sucesso).toBe(true);
    const up = rodou(/^\s*UPDATE NifSinalizacoes/);
    expect(up).toHaveLength(1);
    expect(up[0].sql).toMatch(/AND Status = 'PENDENTE'/);
    expect(up[0].inputs).toMatchObject({ id: 8, status: "DESCARTADA" });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ registroId: 8, dadosAntes: { status: "PENDENTE" }, dadosDepois: { status: "DESCARTADA" } }));
  });
  test("sinalização já CONFIRMADA/DESCARTADA ou inexistente (nenhuma linha afetada): recusado e SEM auditoria", async () => {
    quando(/^\s*UPDATE NifSinalizacoes/, [], 0);
    const r = await nif("PUT", "sinalizacoes", { sinalizacaoId: 8, acao: "DESCARTAR" });
    expect(r.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test.each([[{ sinalizacaoId: "abc", acao: "CONFIRMAR" }], [{ sinalizacaoId: "0x1", acao: "CONFIRMAR" }], [{ sinalizacaoId: 1, acao: "APAGAR" }], [{ acao: "CONFIRMAR" }]])("PUT com %j: 400, sem tocar no banco", async (corpo) => {
    const r = await nif("PUT", "sinalizacoes", corpo);
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST sinalizacoes grava; id malformado e descrição longa são 400; chave estrangeira inexistente vira 400 (não 500)", async () => {
    quando(/^\s*INSERT INTO NifSinalizacoes/, [{ SinalizacaoId: 3 }]);
    const ok = await nif("POST", "sinalizacoes", { tipo: "VALOR_ATIPICO", descricao: " algo estranho ", saidaId: "12" });
    expect(ok.status).toBe(201);
    expect(gravacoes()[0].inputs).toMatchObject({ descricao: "algo estranho", saidaId: 12, fornecedorId: null, doacaoId: null });
    for (const ruim of [{ saidaId: "abc" }, { fornecedorId: "-1" }, { doacaoId: "1e2" }, { descricao: "x".repeat(501) }, { tipo: "OUTRO" }]) {
      mockConsultas = [];
      const r = await nif("POST", "sinalizacoes", { tipo: "VALOR_ATIPICO", descricao: "d", ...ruim });
      expect(r.status).toBe(400);
      expect(gravacoes()).toHaveLength(0);
    }
    mockRegras = [];
    quando(/^\s*INSERT INTO NifSinalizacoes/, erroSql(547));
    const fk = await nif("POST", "sinalizacoes", { tipo: "VALOR_ATIPICO", descricao: "d", saidaId: 99999 });
    expect(fk.status).toBe(400);
  });
  test("comunicação ao COAF: só de sinalização CONFIRMADA; id malformado é 400", async () => {
    quando(/SELECT CriadoEm, DecididoEm, Status FROM NifSinalizacoes/, [{ Status: "CONFIRMADA", CriadoEm: new Date(), DecididoEm: new Date() }]);
    quando(/^\s*INSERT INTO ComunicacoesCoaf/, [{ ComunicacaoId: 3 }]);
    const ok = await nif("POST", "comunicacoes", { sinalizacaoId: "4", protocolo: "P-1" });
    expect(ok.status).toBe(201);
    expect(rodou(/^\s*INSERT INTO ComunicacoesCoaf/)[0].inputs).toMatchObject({ sinal: 4, protocolo: "P-1", dentroPrazo: 1 });
    for (const ruim of ["abc", "0x4", "04", "-4", "4e0"]) {
      expect((await nif("POST", "comunicacoes", { sinalizacaoId: ruim })).status).toBe(400);
    }
    expect((await nif("POST", "comunicacoes", { sinalizacaoId: 4, protocolo: "x".repeat(51) })).status).toBe(400);
    mockRegras = [];
    quando(/SELECT CriadoEm, DecididoEm, Status FROM NifSinalizacoes/, [{ Status: "PENDENTE", CriadoEm: new Date() }]);
    mockConsultas = [];
    const pendente = await nif("POST", "comunicacoes", { sinalizacaoId: 4 });
    expect(pendente.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoNotasExplicativas / GestaoOrcamentos / GestaoParametrosMonetarios / GestaoObrigacoesFiscais (geral)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoNotasExplicativas (geral)", () => {
  test("GET e PUT do geral; ano malformado ou fora da faixa é 400 antes do banco", async () => {
    quando(/SELECT \* FROM NotasExplicativas WHERE Ano/, [{ Texto: "critérios" }]);
    expect((await chamar(hNotas, { token: GERAL, ligado: { ano: "2026" } })).body).toEqual({ ano: 2026, texto: "critérios" });
    quando(/^\s*MERGE NotasExplicativas/, [], 1);
    const put = await chamar(hNotas, { metodo: "PUT", token: GERAL, ligado: { ano: 2026 }, corpo: { texto: "novo" } });
    expect(put.body.sucesso).toBe(true);
    expect(gravacoes()).toHaveLength(1);
    mockConsultas = [];
    for (const ano of ["abc", "0x7E9", "1e3", "-1", "1800", "99999", undefined]) {
      expect((await chamar(hNotas, { token: GERAL, ligado: { ano } })).status).toBe(400);
    }
    expect((await chamar(hNotas, { metodo: "PUT", token: GERAL, ligado: { ano: 2026 }, corpo: { texto: { a: 1 } } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("GestaoOrcamentos (geral)", () => {
  const linhas = [{ tipoMovimento: "ENTRADA", categoriaCodigo: "DIZIMO", valorOrcado: 1000 }, { tipoMovimento: "SAIDA", categoriaCodigo: "ENERGIA", valorOrcado: "250.50" }];
  test("POST cria o orçamento e as linhas (1 cabeçalho + 2 linhas) com a auditoria", async () => {
    quando(/SELECT OrcamentoId FROM OrcamentosAnuais WHERE Ano/, []);
    quando(/^\s*INSERT INTO OrcamentosAnuais/, [{ OrcamentoId: 9 }]);
    const r = await chamar(hOrcamentos, { metodo: "POST", token: GERAL, corpo: { ano: "2027", linhas } });
    expect(r.status).toBe(201);
    expect(rodou(/^\s*INSERT INTO OrcamentoLinhas/)).toHaveLength(2);
    expect(rodou(/^\s*INSERT INTO OrcamentoLinhas/)[1].inputs).toMatchObject({ orcamentoId: 9, valorOrcado: 250.5 });
  });
  test.each([
    ["linha repetida", { ano: 2027, linhas: [linhas[0], linhas[0]] }],
    ["valor em notação científica", { ano: 2027, linhas: [{ ...linhas[0], valorOrcado: "1e5" }] }],
    ["valor acima do DECIMAL(12,2)", { ano: 2027, linhas: [{ ...linhas[0], valorOrcado: 1e12 }] }],
    ["tipo inválido", { ano: 2027, linhas: [{ ...linhas[0], tipoMovimento: "X" }] }],
    ["código longo demais", { ano: 2027, linhas: [{ ...linhas[0], categoriaCodigo: "x".repeat(31) }] }],
    ["uma linha boa e uma ruim", { ano: 2027, linhas: [linhas[0], { ...linhas[1], valorOrcado: -1 }] }],
    ["ano fracionário", { ano: 2027.5, linhas }], ["ano em texto", { ano: "abc", linhas }], ["sem linhas", { ano: 2027, linhas: [] }]
  ])("POST com %s: 400 e NADA é gravado (nem o cabeçalho)", async (_n, corpo) => {
    const r = await chamar(hOrcamentos, { metodo: "POST", token: GERAL, corpo });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("ano já cadastrado: recusado, nada gravado", async () => {
    quando(/SELECT OrcamentoId FROM OrcamentosAnuais WHERE Ano/, [{ OrcamentoId: 1 }]);
    const r = await chamar(hOrcamentos, { metodo: "POST", token: GERAL, corpo: { ano: 2027, linhas } });
    expect(r.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });
  test("GET detalhe: id malformado ou inexistente têm a mesma resposta; id válido traz as linhas", async () => {
    quando(/SELECT \* FROM OrcamentosAnuais WHERE OrcamentoId/, (i) => i.id === 3 ? [{ OrcamentoId: 3, Ano: 2026, Status: "ABERTO" }] : []);
    quando(/FROM OrcamentoLinhas ol/, [{ tipoMovimento: "ENTRADA", categoriaCodigo: "DIZIMO", valorOrcado: 10, categoriaNome: "Dízimo" }]);
    quando(/FROM LancamentosTesouraria/, [{ total: 7 }]);
    const ok = await chamar(hOrcamentos, { token: GERAL, ligado: { id: "3" } });
    expect(ok.body).toMatchObject({ orcamentoId: 3, ano: 2026, linhas: [{ realizado: 7 }] });
    const inexistente = await chamar(hOrcamentos, { token: GERAL, ligado: { id: "99" } });
    const malformado = await chamar(hOrcamentos, { token: GERAL, ligado: { id: "0x3" } });
    expect(malformado).toEqual(inexistente);
    expect(inexistente.body.sucesso).toBe(false);
  });
  test("PUT: encerrado não aceita linhas; status inválido é 400; linhas ruins são ignoradas (as boas entram)", async () => {
    quando(/SELECT \* FROM OrcamentosAnuais WHERE OrcamentoId/, (i) => (i.id === 3 ? [{ OrcamentoId: 3, Ano: 2026, Status: "ABERTO" }] : []));
    const ok = await chamar(hOrcamentos, { metodo: "PUT", token: GERAL, ligado: { id: "3" }, corpo: { linhas: [linhas[0], { ...linhas[1], valorOrcado: -1 }, linhas[0]] } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/^\s*MERGE OrcamentoLinhas/)).toHaveLength(1);
    expect((await chamar(hOrcamentos, { metodo: "PUT", token: GERAL, ligado: { id: "3" }, corpo: { status: "ZUMBI" } })).status).toBe(400);
    const inexistente = await chamar(hOrcamentos, { metodo: "PUT", token: GERAL, ligado: { id: "99" }, corpo: { status: "ENCERRADO" } });
    expect(inexistente.body.sucesso).toBe(false);
    for (const ruim of ["abc", "0x3", "03", "-3", "3e0"]) {
      expect(await chamar(hOrcamentos, { metodo: "PUT", token: GERAL, ligado: { id: ruim }, corpo: { status: "ENCERRADO" } })).toEqual(inexistente);
    }
    mockRegras = [];
    quando(/SELECT \* FROM OrcamentosAnuais WHERE OrcamentoId/, [{ OrcamentoId: 3, Ano: 2026, Status: "ENCERRADO" }]);
    mockConsultas = [];
    const enc = await chamar(hOrcamentos, { metodo: "PUT", token: GERAL, ligado: { id: "3" }, corpo: { linhas: [linhas[0]] } });
    expect(enc.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });
});

describe("GestaoParametrosMonetarios (geral)", () => {
  const monet = (metodo, recurso, corpo) => chamar(hMonetarios, { metodo, token: GERAL, ligado: { recurso }, corpo });
  test("corrigir-todos é UMA instrução só (tudo ou nada) e conta as linhas afetadas", async () => {
    quando(/^\s*UPDATE ValoresMonetarios SET Valor = ROUND/, [], 4);
    const r = await monet("POST", "corrigir-todos", { percentual: "4.62", resolucaoId: "2" });
    expect(r.body.sucesso).toBe(true);
    expect(r.body.mensagem).toMatch(/4 valor\(es\) corrigido\(s\) em 4\.62%/);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].inputs).toMatchObject({ pct: 4.62, resolucao: 2 });
    expect(gravacoes()[0].sql).toMatch(/WHERE Ativo = 1/);            // só os valores ATIVOS são corrigidos
  });
  test.each([[0], [-3], [100.01], ["1e2"], ["abc"], [null], [undefined]])("corrigir-todos com percentual %p: 400, nada gravado", async (percentual) => {
    const r = await monet("POST", "corrigir-todos", { percentual });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("corrigir-todos: resolução malformada é 400; estouro do DECIMAL (8115) ou resolução inexistente (547) viram 400 (nada foi alterado), não 500", async () => {
    expect((await monet("POST", "corrigir-todos", { percentual: 5, resolucaoId: "abc" })).status).toBe(400);
    quando(/^\s*UPDATE ValoresMonetarios SET Valor = ROUND/, erroSql(8115));
    expect((await monet("POST", "corrigir-todos", { percentual: 5 })).status).toBe(400);
    mockRegras = [];
    quando(/^\s*UPDATE ValoresMonetarios SET Valor = ROUND/, erroSql(547));
    expect((await monet("POST", "corrigir-todos", { percentual: 5, resolucaoId: 9 })).status).toBe(400);
  });
  test("POST: sigla repetida é recusada sem gravar; sigla nova grava", async () => {
    quando(/SELECT ValorId FROM ValoresMonetarios WHERE Sigla/, (i) => i.sigla === "LIMITE_IDENTIFICACAO_DOADOR" ? [{ ValorId: 1 }] : []);
    const dup = await monet("POST", undefined, { sigla: "LIMITE_IDENTIFICACAO_DOADOR", nome: "Limite", valor: 100 });
    expect(dup.body).toMatchObject({ sucesso: false });
    expect(gravacoes()).toHaveLength(0);
    quando(/^\s*INSERT INTO ValoresMonetarios/, [{ ValorId: 5 }]);
    const ok = await monet("POST", undefined, { sigla: "NOVA", nome: "Nova", valor: "10.5", unidade: "R$" });
    expect(ok.status).toBe(201);
    expect(gravacoes()[0].inputs).toMatchObject({ sigla: "NOVA", valor: 10.5, resolucao: null });
  });
  test.each([[{ valor: -1 }], [{ valor: "1e3" }], [{ valor: 1e12 }], [{ sigla: "x".repeat(41) }], [{ nome: "" }], [{ unidade: "x".repeat(11) }], [{ resolucaoId: "0x1" }]])("POST com %j: 400, nada gravado", async (troca) => {
    const r = await monet("POST", undefined, { sigla: "S", nome: "N", valor: 1, ...troca });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT corrigir: por novoValor ou por percentual; valores absurdos, NaN e resultado negativo são 400", async () => {
    quando(/SELECT \* FROM ValoresMonetarios WHERE ValorId/, [{ ValorId: 1, Valor: 200 }]);
    quando(/^\s*UPDATE ValoresMonetarios SET Valor = @valor/, [], 1);
    const porPct = await monet("PUT", undefined, { valorId: 1, acao: "CORRIGIR", percentual: 10 });
    expect(porPct.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs.valor).toBe(220);
    mockConsultas = [];
    const porValor = await monet("PUT", undefined, { valorId: 1, acao: "CORRIGIR", novoValor: "250.5" });
    expect(porValor.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs.valor).toBe(250.5);
    for (const ruim of [{ novoValor: "abc" }, { novoValor: -1 }, { novoValor: 1e12 }, { percentual: -150 }, { percentual: 1000 }, { percentual: "x" }, {}]) {
      mockConsultas = [];
      const r = await monet("PUT", undefined, { valorId: 1, acao: "CORRIGIR", ...ruim });
      expect(r.status).toBe(400);
      expect(gravacoes()).toHaveLength(0);
    }
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect((await monet("PUT", undefined, { valorId: ruim, acao: "CORRIGIR", novoValor: 1 })).status).toBe(400);
    }
  });
  test("resoluções: número, data e assunto validados", async () => {
    quando(/^\s*INSERT INTO ResolucoesNormativas/, [{ ResolucaoId: 2 }]);
    expect((await monet("POST", "resolucoes", { numero: "RN 1/2026", dataResolucao: "2026-09-01", assunto: "Correção anual" })).status).toBe(201);
    for (const ruim of [{ numero: "x".repeat(31) }, { dataResolucao: "2026-02-30" }, { assunto: "" }]) {
      mockConsultas = [];
      expect((await monet("POST", "resolucoes", { numero: "N", dataResolucao: "2026-09-01", assunto: "A", ...ruim })).status).toBe(400);
      expect(gravacoes()).toHaveLength(0);
    }
  });
});

describe("GestaoObrigacoesFiscais (geral)", () => {
  const fiscal = (metodo, recurso, corpo) => chamar(hFiscais, { metodo, token: GERAL, ligado: { recurso }, corpo });
  const pdf = Buffer.from("%PDF-1.4 recibo").toString("base64");
  test("TRANSMITIR: guarda o recibo e grava uma vez, com a auditoria", async () => {
    quando(/SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId/, [{ Status: "PENDENTE" }]);
    quando(/^\s*UPDATE ObrigacoesFiscais/, [], 1);
    const r = await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: pdf, mimeType: "application/pdf" });
    expect(r.body.sucesso).toBe(true);
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    expect(gravacoes()[0].sql).toMatch(/AND Status <> 'TRANSMITIDA'/);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 3, url: "https://armazenamento/doc-1" });
  });
  test("TRANSMITIR repetido (já TRANSMITIDA) ou que perde a corrida: recusado; o recibo NÃO é gravado antes de saber", async () => {
    quando(/SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId/, [{ Status: "TRANSMITIDA" }]);
    const repetido = await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: pdf, mimeType: "application/pdf" });
    expect(repetido.body.sucesso).toBe(false);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(gravacoes()).toHaveLength(0);
    mockRegras = [];
    quando(/SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId/, [{ Status: "PENDENTE" }]);
    quando(/^\s*UPDATE ObrigacoesFiscais/, [], 0);
    const corrida = await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR" });
    expect(corrida.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("obrigação inexistente: 'não encontrada'; id malformado é 400", async () => {
    expect((await fiscal("PUT", undefined, { obrigacaoId: 77, acao: "TRANSMITIR" })).body.sucesso).toBe(false);
    for (const id of ["abc", "0x3", -1, 0]) {
      expect((await fiscal("PUT", undefined, { obrigacaoId: id, acao: "TRANSMITIR" })).status).toBe(400);
    }
  });
  test("recibo: acima de 15 MB (conferido antes de decodificar), conteúdo que não é do tipo declarado e tipo fora da lista são 400, sem gravar nada", async () => {
    quando(/SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId/, [{ Status: "PENDENTE" }]);
    // Começa com a assinatura de PDF de verdade: só o TAMANHO pode barrar (se não, a checagem do conteúdo recusaria por outro motivo e o limite ficaria sem teste).
    const enorme = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(16 * 1024 * 1024)]).toString("base64");
    const espia = jest.spyOn(Buffer, "from");
    const recusado = await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: enorme, mimeType: "application/pdf" });
    const decodificou = espia.mock.calls.some(c => c[0] === enorme);
    espia.mockRestore();
    expect(recusado.status).toBe(400);
    expect(decodificou).toBe(false);                                  // o tamanho é conferido pelo texto, ANTES de alocar o arquivo decodificado
    expect((await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: pdf, mimeType: "image/png" })).status).toBe(400);
    expect((await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: pdf, mimeType: "text/html" })).status).toBe(400);
    expect((await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: { a: 1 }, mimeType: "application/pdf" })).status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(gravacoes()).toHaveLength(0);
  });
  test("recibo logo abaixo do limite passa", async () => {
    quando(/SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId/, [{ Status: "PENDENTE" }]);
    quando(/^\s*UPDATE ObrigacoesFiscais/, [], 1);
    const quase = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(14 * 1024 * 1024)]).toString("base64");
    expect((await fiscal("PUT", undefined, { obrigacaoId: 3, acao: "TRANSMITIR", reciboBase64: quase, mimeType: "application/pdf" })).body.sucesso).toBe(true);
  });
  test("RECOLHER é uma vez só: o UPDATE confere o status e, sem linha afetada, recusa sem auditar", async () => {
    quando(/^\s*UPDATE RetencoesFonte/, [], 1);
    const ok = await fiscal("PUT", "retencoes", { retencaoId: 2, acao: "RECOLHER", dataRecolhimento: "2026-10-02" });
    expect(ok.body.sucesso).toBe(true);
    expect(gravacoes()[0].sql).toMatch(/AND Status <> 'RECOLHIDA'/);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 2, data: "2026-10-02" });
    mockRegras = []; registrarAuditoria.mockClear();
    quando(/^\s*UPDATE RetencoesFonte/, [], 0);
    const repetido = await fiscal("PUT", "retencoes", { retencaoId: 2, acao: "RECOLHER" });
    expect(repetido.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    for (const ruim of ["abc", "0x2", "02", "-2", "2e0"]) {
      expect((await fiscal("PUT", "retencoes", { retencaoId: ruim, acao: "RECOLHER" })).status).toBe(400);
    }
    expect((await fiscal("PUT", "retencoes", { retencaoId: 2, acao: "RECOLHER", dataRecolhimento: "31/12/2026" })).status).toBe(400);
  });
  test("POST obrigação: valida entrada; repetida (chave única) vira resposta amigável, não 500", async () => {
    const corpo = { tipo: "ECF", anoReferencia: 2026, cnpj: "00.000.000/0001-00", prazoEntrega: "2027-07-31" };
    quando(/^\s*INSERT INTO ObrigacoesFiscais/, [{ ObrigacaoId: 1 }]);
    expect((await fiscal("POST", undefined, corpo)).status).toBe(201);
    for (const ruim of [{ anoReferencia: "abc" }, { anoReferencia: 1800 }, { prazoEntrega: "2027-02-30" }, { cnpj: "x".repeat(19) }, { tipo: "XYZ" }, { observacao: "x".repeat(301) }]) {
      mockConsultas = [];
      expect((await fiscal("POST", undefined, { ...corpo, ...ruim })).status).toBe(400);
      expect(gravacoes()).toHaveLength(0);
    }
    mockRegras = [];
    quando(/^\s*INSERT INTO ObrigacoesFiscais/, erroSql(2627));
    const dup = await fiscal("POST", undefined, corpo);
    expect(dup.status).toBe(200);
    expect(dup.body.sucesso).toBe(false);
  });
  test("POST retenção: competência AAAA-MM e valores válidos", async () => {
    quando(/^\s*INSERT INTO RetencoesFonte/, [{ RetencaoId: 1 }]);
    const corpo = { naturezaRendimento: "AUTONOMO", competencia: "2026-09", valorBase: 1000, valorRetido: "15.5" };
    expect((await fiscal("POST", "retencoes", corpo)).status).toBe(201);
    for (const ruim of [{ competencia: "2026-13" }, { competencia: "09/2026" }, { valorBase: -1 }, { valorRetido: "1e3" }, { naturezaRendimento: "OUTRA" }]) {
      mockConsultas = [];
      expect((await fiscal("POST", "retencoes", { ...corpo, ...ruim })).status).toBe(400);
      expect(gravacoes()).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoManutencaoVeiculo: escopo pela congregação do veículo
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoManutencaoVeiculo", () => {
  const VEICULOS = { 1: "A", 2: "B", 3: null };               // bemId → congregação (3 = Sede/matriz)
  const MANUTENCOES = {                                          // manutenção → { bem, concluída }
    10: { BemId: 1, congregacaoNome: "A", DataRealizada: null, Valor: 100 }, 11: { BemId: 2, congregacaoNome: "B", DataRealizada: null, Valor: 100 },
    12: { BemId: 1, congregacaoNome: "A", DataRealizada: "2026-01-01", Valor: 100 }, 13: { BemId: 3, congregacaoNome: null, DataRealizada: null, Valor: 100 }
  };
  const monta = () => {
    quando(/WHERE b\.BemId = @bemId AND b\.Tipo = 'VEICULO'/, (i) => (i.bemId in VEICULOS ? [{ BemId: i.bemId, congregacaoNome: VEICULOS[i.bemId] }] : []));
    quando(/WHERE m\.ManutencaoId = @id/, (i) => (MANUTENCOES[i.id] ? [{ ManutencaoId: i.id, ...MANUTENCOES[i.id] }] : []));
    quando(/^\s*INSERT INTO ManutencoesVeiculo/, [{ ManutencaoId: 20 }]);
    quando(/^\s*UPDATE ManutencoesVeiculo/, [], 1);
  };
  const POST = (bemId, token) => chamar(hManut, { metodo: "POST", token, corpo: { bemId, tipoManutencao: "PREVENTIVA", dataAgendada: "2026-11-01", descricao: "Troca de óleo", valor: 150 } });
  const PUT = (id, token, corpo = { dataRealizada: "2026-10-02", valor: 180 }) => chamar(hManut, { metodo: "PUT", token, ligado: { recurso: String(id) }, corpo });

  test("sem sessão 401; PIN 403; sem `financeiro` 403 — antes do banco", async () => {
    expect((await chamar(hManut, {})).status).toBe(401);
    expect((await chamar(hManut, { token: PIN })).status).toBe(403);
    expect((await chamar(hManut, { token: GERAL_SEM_PERMISSAO })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("alertas: o local só vê o veículo da própria congregação; o geral vê todos (inclusive o da Sede)", async () => {
    const venc = new Date(Date.now() + 5 * 864e5);
    quando(/LEFT JOIN VeiculosFrota/, [
      { BemId: 1, bemDescricao: "Van A", congregacaoNome: "A", LicenciamentoVencimento: venc, seguroVencimento: null, proximaManutencaoAgendada: null },
      { BemId: 2, bemDescricao: "Van B", congregacaoNome: "B", LicenciamentoVencimento: venc, seguroVencimento: null, proximaManutencaoAgendada: null },
      { BemId: 3, bemDescricao: "Carro da Sede", congregacaoNome: null, LicenciamentoVencimento: venc, seguroVencimento: null, proximaManutencaoAgendada: null }
    ]);
    const local = await chamar(hManut, { token: LOCAL_A, ligado: { recurso: "alertas" } });
    expect(local.body.map(a => a.bemId)).toEqual([1]);
    const area = await chamar(hManut, { token: AREA_AB, ligado: { recurso: "alertas" } });
    expect(area.body.map(a => a.bemId)).toEqual([1, 2]);
    const geral = await chamar(hManut, { token: GERAL, ligado: { recurso: "alertas" } });
    expect(geral.body.map(a => a.bemId)).toEqual([1, 2, 3]);
    const localComTodas = await chamar(hManut, { token: LOCAL_COM_TODAS, ligado: { recurso: "alertas" } });
    expect(localComTodas.body.map(a => a.bemId)).toEqual([1, 2]);            // veículo da Sede só para o geral (papel Global E escopo TODAS)
  });
  test("lista: só as manutenções de veículos do escopo, sem expor a congregação; bemId malformado é 400", async () => {
    const todas = [
      { ManutencaoId: 10, BemId: 1, bemDescricao: "Van A", congregacaoNome: "A" }, { ManutencaoId: 11, BemId: 2, bemDescricao: "Van B", congregacaoNome: "B" },
      { ManutencaoId: 13, BemId: 3, bemDescricao: "Sede", congregacaoNome: null }
    ];
    quando(/FROM ManutencoesVeiculo m\s+JOIN BensPatrimoniais b/, (i) => todas.filter(m => !i.bemId || m.BemId === i.bemId));
    const local = await chamar(hManut, { token: LOCAL_A });
    expect(local.body.map(m => m.ManutencaoId)).toEqual([10]);
    expect(local.body[0]).not.toHaveProperty("congregacaoNome");
    expect((await chamar(hManut, { token: GERAL })).body.map(m => m.ManutencaoId)).toEqual([10, 11, 13]);
    for (const ruim of ["abc", "0x1", "05", "-1", "1e1", " 1"]) {
      expect((await chamar(hManut, { token: LOCAL_A, query: { bemId: ruim } })).status).toBe(400);
    }
    expect((await chamar(hManut, { token: LOCAL_A, query: { bemId: "2" } })).body).toEqual([]);
  });
  test("POST: veículo de FORA do escopo responde igual a veículo que não existe e nada é gravado; dentro do escopo grava", async () => {
    monta();
    const fora = await POST(2, LOCAL_A);
    const inexistente = await POST(99, LOCAL_A);
    expect(fora).toEqual(inexistente);
    expect(fora.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
    const malformado = await POST("0x1", LOCAL_A);
    expect(malformado).toEqual(inexistente);
    const dentro = await POST(1, LOCAL_A);
    expect(dentro.status).toBe(201);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].inputs).toMatchObject({ bemId: 1, valor: 150, data: "2026-11-01" });
  });
  test("POST: veículo da Sede só o geral; local (mesmo com escopo TODAS) é recusado igual a 'não existe'", async () => {
    monta();
    expect(await POST(3, LOCAL_A)).toEqual(await POST(99, LOCAL_A));
    expect(await POST(3, LOCAL_COM_TODAS)).toEqual(await POST(99, LOCAL_A));
    expect(gravacoes()).toHaveLength(0);
    expect((await POST(3, GERAL)).status).toBe(201);
    expect(gravacoes()).toHaveLength(1);
  });
  test("POST do geral em veículo de outra congregação funciona; área alcança A e B mas não a Sede", async () => {
    monta();
    expect((await POST(2, GERAL)).status).toBe(201);
    expect((await POST(2, AREA_AB)).status).toBe(201);
    mockConsultas = [];
    expect(await POST(3, AREA_AB)).toEqual(await POST(99, AREA_AB));
    expect(gravacoes()).toHaveLength(0);
  });
  test.each([[{ valor: -1 }], [{ valor: "1e3" }], [{ dataAgendada: "2026-02-30" }], [{ tipoManutencao: "OUTRA" }], [{ descricao: "x".repeat(301) }]])("POST com %j: 400 e nada gravado", async (troca) => {
    monta();
    const r = await chamar(hManut, { metodo: "POST", token: LOCAL_A, corpo: { bemId: 1, tipoManutencao: "PREVENTIVA", dataAgendada: "2026-11-01", descricao: "ok", ...troca } });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: manutenção de veículo de FORA do escopo responde igual a manutenção que não existe — mesmo com corpo inválido — e nada é gravado", async () => {
    monta();
    const fora = await PUT(11, LOCAL_A);
    const inexistente = await PUT(99, LOCAL_A);
    expect(fora).toEqual(inexistente);
    expect(fora.body.sucesso).toBe(false);
    expect(await PUT(11, LOCAL_A, {})).toEqual(inexistente);
    expect(await PUT("abc", LOCAL_A)).toEqual(inexistente);
    expect(await PUT(13, LOCAL_A)).toEqual(inexistente);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT dentro do escopo conclui, com a auditoria trazendo o registro de antes; o geral conclui a de qualquer congregação", async () => {
    monta();
    const r = await PUT(10, LOCAL_A);
    expect(r.body.sucesso).toBe(true);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].sql).toMatch(/AND DataRealizada IS NULL/);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 10, data: "2026-10-02", valor: 180 });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ registroId: 10, dadosAntes: expect.objectContaining({ Valor: 100 }), dadosDepois: { dataRealizada: "2026-10-02", valor: 180 } }));
    expect((await PUT(11, GERAL)).body.sucesso).toBe(true);
    expect((await PUT(13, GERAL)).body.sucesso).toBe(true);
  });
  test("PUT: não refaz a conclusão (nem pela corrida) e não aceita valor negativo", async () => {
    monta();
    const concluida = await PUT(12, LOCAL_A);
    expect(concluida.body).toMatchObject({ sucesso: false, mensagem: "Esta manutenção já foi concluída." });
    expect(gravacoes()).toHaveLength(0);
    for (const ruim of [{ dataRealizada: "2026-10-02", valor: -5 }, { dataRealizada: "2026-10-02", valor: "1e3" }, { dataRealizada: "ontem" }, {}]) {
      expect((await PUT(10, LOCAL_A, ruim)).status).toBe(400);
    }
    expect(gravacoes()).toHaveLength(0);
    mockRegras = [];
    quando(/^\s*UPDATE ManutencoesVeiculo/, [], 0);          // a primeira regra que casa vale: esta vem antes da de monta()
    monta();
    const corrida = await PUT(10, LOCAL_A);
    expect(corrida.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// GestaoObraMarcos: escopo pela congregação da obra
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoObraMarcos", () => {
  const OBRAS = { 1: { CongregacaoId: 100, congregacaoNome: "A" }, 2: { CongregacaoId: 200, congregacaoNome: "B" } };
  const MARCOS = { 5: { MarcoId: 5, ObraId: 1, SaidaId: null, ObraCongregacaoId: 100, congregacaoNome: "A" }, 6: { MarcoId: 6, ObraId: 2, SaidaId: null, ObraCongregacaoId: 200, congregacaoNome: "B" } };
  const SAIDAS = { 50: { SaidaId: 50, CongregacaoId: 100, Status: "PAGA" }, 51: { SaidaId: 51, CongregacaoId: 200, Status: "PAGA" }, 52: { SaidaId: 52, CongregacaoId: 100, Status: "PENDENTE" } };
  const monta = () => {
    quando(/FROM ObrasTemplo o JOIN Congregacoes c/, (i) => (OBRAS[i.id] ? [{ ObraId: i.id, ...OBRAS[i.id] }] : []));
    quando(/FROM ObraMarcos m JOIN ObrasTemplo/, (i) => (MARCOS[i.id] ? [MARCOS[i.id]] : []));
    quando(/FROM SaidasTesouraria WHERE SaidaId/, (i) => (SAIDAS[i.saidaId] ? [SAIDAS[i.saidaId]] : []));
    quando(/SELECT \* FROM ObraMarcos WHERE ObraId/, (i) => [{ MarcoId: i.obraId === 1 ? 5 : 6, ObraId: i.obraId }]);
    quando(/^\s*INSERT INTO ObraMarcos/, [{ MarcoId: 9 }]);
    quando(/^\s*UPDATE ObraMarcos/, [], 1);
  };
  const GET = (obraId, token) => chamar(hMarcos, { token, query: { obraId } });
  const POST = (obraId, token, extra = {}) => chamar(hMarcos, { metodo: "POST", token, corpo: { obraId, descricao: "Fundação", dataPrevista: "2026-12-01", percentualFisicoPrevisto: 20, valorPrevisto: 5000, ...extra } });
  const PUT = (id, token, corpo = { percentualFisicoRealizado: 50 }) => chamar(hMarcos, { metodo: "PUT", token, ligado: { id: String(id) }, corpo });

  test("sem sessão 401; PIN 403; sem `financeiro` 403 — antes do banco", async () => {
    expect((await chamar(hMarcos, {})).status).toBe(401);
    expect((await chamar(hMarcos, { token: PIN })).status).toBe(403);
    expect((await chamar(hMarcos, { token: GERAL_SEM_PERMISSAO })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("GET: marcos da obra de FORA do escopo vêm vazios, igual a obra que não existe; dentro do escopo e o geral veem", async () => {
    monta();
    const fora = await GET("2", LOCAL_A);
    const inexistente = await GET("99", LOCAL_A);
    expect(fora).toEqual(inexistente);
    expect(fora.body).toEqual([]);
    expect(rodou(/SELECT \* FROM ObraMarcos WHERE ObraId/)).toHaveLength(0);          // nem consultou os marcos da obra de fora
    expect((await GET("1", LOCAL_A)).body).toHaveLength(1);
    expect((await GET("2", GERAL)).body).toHaveLength(1);
    expect((await GET("2", AREA_AB)).body).toHaveLength(1);
    expect((await GET("abc", GERAL)).status).toBe(400);
    expect((await chamar(hMarcos, { token: GERAL })).status).toBe(400);
  });
  test("POST: obra de FORA do escopo responde igual a obra que não existe e nada é gravado; dentro do escopo grava", async () => {
    monta();
    const fora = await POST(2, LOCAL_A);
    const inexistente = await POST(99, LOCAL_A);
    expect(fora).toEqual(inexistente);
    expect(fora.body).toMatchObject({ sucesso: false, mensagem: "Obra não encontrada." });
    expect(await POST("0x1", LOCAL_A)).toEqual(inexistente);
    expect(gravacoes()).toHaveLength(0);
    const dentro = await POST("1", LOCAL_A);
    expect(dentro.status).toBe(201);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].inputs).toMatchObject({ obraId: 1, pct: 20, valor: 5000, data: "2026-12-01" });
    expect((await POST(2, GERAL)).status).toBe(201);
  });
  test.each([[{ percentualFisicoPrevisto: 101 }], [{ percentualFisicoPrevisto: -1 }], [{ valorPrevisto: -5 }], [{ valorPrevisto: "1e4" }], [{ valorPrevisto: 1e12 }], [{ dataPrevista: "2026-02-30" }], [{ descricao: "x".repeat(301) }]])("POST com %j: 400 e nada gravado", async (troca) => {
    monta();
    const r = await POST(1, GERAL, troca);
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: marco de obra de FORA do escopo responde igual a marco que não existe — mesmo com corpo e Saída inválidos — e nada é gravado", async () => {
    monta();
    const fora = await PUT(6, LOCAL_A);
    const inexistente = await PUT(99, LOCAL_A);
    expect(fora).toEqual(inexistente);
    expect(fora.body).toMatchObject({ sucesso: false, mensagem: "Marco não encontrado." });
    expect(await PUT(6, LOCAL_A, {})).toEqual(inexistente);
    expect(await PUT(6, LOCAL_A, { percentualFisicoRealizado: 50, saidaId: 50 })).toEqual(inexistente);
    expect(await PUT("abc", LOCAL_A)).toEqual(inexistente);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT dentro do escopo atualiza, com auditoria de antes e depois; o geral atualiza o de qualquer congregação", async () => {
    monta();
    const r = await PUT(5, LOCAL_A, { percentualFisicoRealizado: "50.5", dataConclusao: "2026-10-02" });
    expect(r.body.sucesso).toBe(true);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 5, pct: 50.5, data: "2026-10-02", saidaId: null });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ registroId: 5, dadosAntes: expect.objectContaining({ MarcoId: 5 }) }));
    expect((await PUT(6, GERAL)).body.sucesso).toBe(true);
  });
  test("PUT com Saída: precisa existir, estar PAGA e ser da MESMA congregação da obra (uma mensagem só para qualquer falha)", async () => {
    monta();
    const ok = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: 50 });
    expect(ok.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs.saidaId).toBe(50);
    mockConsultas = [];
    const outraCongregacao = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: 51 });
    const naoPaga = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: 52 });
    const inexistente = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: 99 });
    const malformada = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: "abc" });
    const hexadecimal = await PUT(5, LOCAL_A, { percentualFisicoRealizado: 100, saidaId: "0x32" });       // 0x32 = 50, uma Saída válida: só a grafia canônica do id vale
    for (const r of [outraCongregacao, naoPaga, inexistente, malformada, hexadecimal]) expect(r.status).toBe(400);
    expect(outraCongregacao).toEqual(naoPaga);
    expect(outraCongregacao).toEqual(inexistente);
    expect(outraCongregacao).toEqual(malformada);
    expect(outraCongregacao).toEqual(hexadecimal);
    expect(gravacoes()).toHaveLength(0);
  });
  test.each([[{ percentualFisicoRealizado: 101 }], [{ percentualFisicoRealizado: -1 }], [{ percentualFisicoRealizado: "1e1" }], [{ percentualFisicoRealizado: 10, dataConclusao: "31/12/2026" }], [{}]])("PUT com %j: 400 e nada gravado", async (corpo) => {
    monta();
    const r = await PUT(5, LOCAL_A, corpo);
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// PDQ: ler = cli ou financeiro; escrever = cli ou geral; plano ENCERRADO não muda
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("PDQ — quem escreve", () => {
  const ESCRITAS = [
    ["GestaoPdqPlanos POST", hPlanos, { metodo: "POST", corpo: { anoInicio: 2027, anoFim: 2030, titulo: "PDQ", eixos: [{ nome: "a" }, { nome: "b" }, { nome: "c" }] } }],
    ["GestaoPdqPlanos PUT", hPlanos, { metodo: "PUT", ligado: { id: "1" }, corpo: { status: "VIGENTE" } }],
    ["GestaoPdqMetas POST", hMetas, { metodo: "POST", corpo: { eixoId: 1, descricao: "m", prazoAno: 2028 } }],
    ["GestaoPdqMetas PUT", hMetas, { metodo: "PUT", ligado: { id: "1" }, corpo: { status: "CUMPRIDA" } }],
    ["GestaoPdqProjetos POST", hProjetos, { metodo: "POST", corpo: { metaId: 1, nome: "p", orcamentoPrevisto: 10, cronogramaInicio: "2027-01-01", cronogramaFim: "2027-12-31" } }],
    ["GestaoPdqProjetos PUT", hProjetos, { metodo: "PUT", ligado: { id: "1" }, corpo: { status: "CANCELADO" } }]
  ];
  describe.each(ESCRITAS)("%s", (_n, handler, args) => {
    test("sem sessão 401, PIN 403", async () => {
      expect((await chamar(handler, args)).status).toBe(401);
      expect((await chamar(handler, { ...args, token: PIN })).status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
    test.each([["Tesoureiro Local", LOCAL_A], ["Tesoureiro de Área", AREA_AB], ["Global com escopo de lista", GLOBAL_COM_LISTA], ["local com escopo TODAS", LOCAL_COM_TODAS]])("%s com `financeiro`: 403 antes do banco", async (_p, token) => {
      const r = await chamar(handler, { ...args, token });
      expect(r.status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
    test("quem tem `cli` e o geral passam da porta (o banco simulado está vazio: a rota pode falhar depois da porta, o que importa é ter passado)", async () => {
      for (const token of [CLI_LOCAL, GERAL]) {
        mockConsultas = [];
        let r = null;
        try { r = await chamar(handler, { ...args, token }); } catch (_erro) { r = null; }
        if (r) expect([401, 403]).not.toContain(r.status);
        else expect(mockConsultas.length).toBeGreaterThan(0);
      }
    });
  });
  test("leitura continua para o Tesoureiro Local (lista de planos e de projetos)", async () => {
    quando(/FROM PdqPlanos p ORDER BY/, [{ planoId: 1 }]);
    quando(/FROM PdqProjetos p\s+JOIN PdqMetas m/, [{ projetoId: 1 }]);
    expect((await chamar(hPlanos, { token: LOCAL_A })).body).toEqual([{ planoId: 1 }]);
    expect((await chamar(hProjetos, { token: LOCAL_A })).body).toEqual([{ projetoId: 1 }]);
    expect((await chamar(hProjetos, { token: LOCAL_A, query: { metaId: "abc" } })).status).toBe(400);
    expect((await chamar(hPlanos, { token: LOCAL_A, ligado: { id: "abc" } })).body.sucesso).toBe(false);
  });
});

describe("GestaoPdqPlanos", () => {
  const corpo = { anoInicio: "2027", anoFim: "2030", titulo: "  PDQ 2027  ", eixos: [{ nome: "Evangelização" }, { nome: "Discipulado", descricao: "d" }, { nome: "Missões" }] };
  test("geral cria o plano com os 3 eixos e a auditoria", async () => {
    quando(/^\s*INSERT INTO PdqPlanos/, [{ PlanoId: 4 }]);
    const r = await chamar(hPlanos, { metodo: "POST", token: GERAL, corpo });
    expect(r.status).toBe(201);
    expect(rodou(/^\s*INSERT INTO PdqEixos/)).toHaveLength(3);
    expect(rodou(/^\s*INSERT INTO PdqPlanos/)[0].inputs).toMatchObject({ anoInicio: 2027, anoFim: 2030, titulo: "PDQ 2027" });
  });
  test("quem tem `cli` (mesmo local) também cria", async () => {
    quando(/^\s*INSERT INTO PdqPlanos/, [{ PlanoId: 4 }]);
    expect((await chamar(hPlanos, { metodo: "POST", token: CLI_LOCAL, corpo })).status).toBe(201);
  });
  test("período já existente (chave única) vira resposta amigável e não deixa eixos soltos", async () => {
    quando(/^\s*INSERT INTO PdqPlanos/, erroSql(2627));
    const r = await chamar(hPlanos, { metodo: "POST", token: GERAL, corpo });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/^\s*INSERT INTO PdqEixos/)).toHaveLength(0);
  });
  test.each([[{ anoFim: "2020" }], [{ anoInicio: "abc" }], [{ titulo: "x".repeat(201) }], [{ eixos: [{ nome: "a" }, { nome: "b" }] }], [{ eixos: [{ nome: "a" }, { nome: "b" }, { nome: "" }] }], [{ eixos: [{ nome: "a" }, { nome: "b" }, { nome: "c", descricao: "x".repeat(501) }] }]])("POST com %j: 400 e nada gravado", async (troca) => {
    const r = await chamar(hPlanos, { metodo: "POST", token: GERAL, corpo: { ...corpo, ...troca } });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: status válido atualiza com a auditoria de antes e depois; inexistente e id malformado respondem igual; status inválido é 400", async () => {
    quando(/SELECT \* FROM PdqPlanos WHERE PlanoId/, (i) => (i.id === 1 ? [{ PlanoId: 1, Status: "EM_ELABORACAO" }] : []));
    const ok = await chamar(hPlanos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "VIGENTE" } });
    expect(ok.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ dadosAntes: { PlanoId: 1, Status: "EM_ELABORACAO" }, dadosDepois: { status: "VIGENTE" } }));
    mockConsultas = [];
    const inexistente = await chamar(hPlanos, { metodo: "PUT", token: GERAL, ligado: { id: "9" }, corpo: { status: "VIGENTE" } });
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect(await chamar(hPlanos, { metodo: "PUT", token: GERAL, ligado: { id: ruim }, corpo: { status: "VIGENTE" } })).toEqual(inexistente);
    }
    expect(gravacoes()).toHaveLength(0);
    expect((await chamar(hPlanos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "ZUMBI" } })).status).toBe(400);
  });
});

describe("GestaoPdqPlanos — detalhe e projetos", () => {
  test("GET detalhe: plano existente traz os eixos; inexistente e id malformado respondem igual", async () => {
    quando(/SELECT \* FROM PdqPlanos WHERE PlanoId/, (i) => (i.id === 1 ? [{ PlanoId: 1, Titulo: "PDQ" }] : []));
    quando(/FROM PdqEixos WHERE PlanoId/, [{ eixoId: 1, nome: "Eixo" }]);
    quando(/FROM PdqMetas WHERE EixoId/, []);
    const ok = await chamar(hPlanos, { token: LOCAL_A, ligado: { id: "1" } });
    expect(ok.body).toMatchObject({ PlanoId: 1, eixos: [{ eixoId: 1 }] });
    const inexistente = await chamar(hPlanos, { token: LOCAL_A, ligado: { id: "9" } });
    expect(inexistente.body.sucesso).toBe(false);
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect(await chamar(hPlanos, { token: LOCAL_A, ligado: { id: ruim } })).toEqual(inexistente);
    }
  });
});

describe("GestaoPdqProjetos — detalhe", () => {
  test("GET detalhe: projeto existente traz os remanejamentos; inexistente e id malformado respondem igual", async () => {
    quando(/WHERE p\.ProjetoId = @id/, (i) => (i.id === 1 ? [{ projetoId: 1, nome: "P" }] : []));
    quando(/FROM PdqRemanejamentos r/, [{ remanejamentoId: 3 }]);
    const ok = await chamar(hProjetos, { token: LOCAL_A, ligado: { id: "1" } });
    expect(ok.body).toMatchObject({ projetoId: 1, remanejamentos: [{ remanejamentoId: 3 }] });
    const inexistente = await chamar(hProjetos, { token: LOCAL_A, ligado: { id: "9" } });
    expect(inexistente.body.sucesso).toBe(false);
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect(await chamar(hProjetos, { token: LOCAL_A, ligado: { id: ruim } })).toEqual(inexistente);
    }
  });
});

describe("GestaoPdqMetas", () => {
  const eixo = (planoStatus) => quando(/FROM PdqEixos e JOIN PdqPlanos p/, (i) => (i.id === 1 ? [{ EixoId: 1, PlanoStatus: planoStatus }] : []));
  const meta = (planoStatus) => quando(/SELECT m\.\*, p\.Status AS PlanoStatus FROM PdqMetas m/, (i) => (i.id === 1 ? [{ MetaId: 1, EixoId: 1, Status: "EM_ANDAMENTO", JustificativaTecnica: null, PlanoStatus: planoStatus }] : []));
  const POST = (token, extra = {}) => chamar(hMetas, { metodo: "POST", token, corpo: { eixoId: 1, descricao: "Plantar 3 igrejas", prazoAno: 2028, ...extra } });
  test("cli e geral criam meta em plano vigente", async () => {
    eixo("VIGENTE");
    quando(/^\s*INSERT INTO PdqMetas/, [{ MetaId: 6 }]);
    expect((await POST(CLI_LOCAL)).status).toBe(201);
    expect((await POST(GERAL)).status).toBe(201);
    expect(gravacoes()).toHaveLength(2);
  });
  test("plano ENCERRADO não recebe meta; eixo inexistente ou malformado: 'Eixo não encontrado.'", async () => {
    eixo("ENCERRADO");
    const r = await POST(GERAL);
    expect(r.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
    mockRegras = [];
    eixo("VIGENTE");
    expect((await POST(GERAL, { eixoId: 99 })).body).toMatchObject({ sucesso: false, mensagem: "Eixo não encontrado." });
    expect((await POST(GERAL, { eixoId: "0x1" })).body).toMatchObject({ sucesso: false, mensagem: "Eixo não encontrado." });
    expect(gravacoes()).toHaveLength(0);
  });
  test.each([[{ prazoAno: "abc" }], [{ prazoAno: 1500 }], [{ descricao: "x".repeat(301) }], [{ indicador: "x".repeat(301) }]])("POST com %j: 400", async (troca) => {
    eixo("VIGENTE");
    expect((await POST(GERAL, troca)).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: meta de plano ENCERRADO não muda; de plano vigente muda, com a auditoria de antes", async () => {
    meta("ENCERRADO");
    const bloqueado = await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "CUMPRIDA" } });
    expect(bloqueado.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
    mockRegras = [];
    meta("VIGENTE");
    const ok = await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "CUMPRIDA" } });
    expect(ok.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 1, status: "CUMPRIDA" });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ dadosAntes: expect.objectContaining({ MetaId: 1 }) }));
    expect(registrarAuditoria.mock.calls[0][0].dadosAntes).not.toHaveProperty("PlanoStatus");
  });
  test("PUT: NAO_CUMPRIDA exige justificativa; id malformado e meta inexistente respondem igual", async () => {
    meta("VIGENTE");
    expect((await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "NAO_CUMPRIDA" } })).status).toBe(400);
    expect((await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "NAO_CUMPRIDA", justificativaTecnica: "x".repeat(1001) } })).status).toBe(400);
    const inexistente = await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: "9" }, corpo: { status: "CUMPRIDA" } });
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect(await chamar(hMetas, { metodo: "PUT", token: GERAL, ligado: { id: ruim }, corpo: { status: "CUMPRIDA" } })).toEqual(inexistente);
    }
    expect(gravacoes()).toHaveLength(0);
  });
});

describe("GestaoPdqProjetos", () => {
  const meta = (planoStatus) => quando(/SELECT m\.MetaId, p\.Status AS PlanoStatus/, (i) => (i.id === 1 ? [{ MetaId: 1, PlanoStatus: planoStatus }] : []));
  const projeto = (planoStatus) => quando(/FROM PdqProjetos pr JOIN PdqMetas m/, (i) => (i.id === 1 ? [{ ProjetoId: 1, Status: "PLANEJADO", CronogramaInicio: new Date("2027-01-01"), CronogramaFim: new Date("2027-12-31"), PlanoStatus: planoStatus }] : []));
  const CORPO = { metaId: 1, nome: "Templo novo", orcamentoPrevisto: 1000, cronogramaInicio: "2027-01-01", cronogramaFim: "2027-12-31" };
  const POST = (token, extra = {}) => chamar(hProjetos, { metodo: "POST", token, corpo: { ...CORPO, ...extra } });
  test("cli e geral criam projeto em plano vigente", async () => {
    meta("VIGENTE");
    quando(/^\s*INSERT INTO PdqProjetos/, [{ ProjetoId: 8 }]);
    expect((await POST(CLI_LOCAL)).status).toBe(201);
    expect((await POST(GERAL)).status).toBe(201);
    expect(gravacoes()[0].inputs).toMatchObject({ metaId: 1, orcamentoPrevisto: 1000, cronogramaInicio: "2027-01-01", responsavelMembroId: null });
  });
  test("plano ENCERRADO não recebe projeto; meta inexistente: 'Meta não encontrada.'", async () => {
    meta("ENCERRADO");
    expect((await POST(GERAL)).body.sucesso).toBe(false);
    expect((await POST(GERAL, { metaId: 99 })).body).toMatchObject({ sucesso: false, mensagem: "Meta não encontrada." });
    expect((await POST(GERAL, { metaId: "0x1" })).body).toMatchObject({ sucesso: false, mensagem: "Meta não encontrada." });
    expect(gravacoes()).toHaveLength(0);
  });
  test("responsável precisa ser uma matrícula que existe", async () => {
    meta("VIGENTE");
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId/, (i) => (i.id === 40 ? [{ MembroId: 40 }] : []));
    quando(/^\s*INSERT INTO PdqProjetos/, [{ ProjetoId: 8 }]);
    expect((await POST(GERAL, { responsavelMembroId: 40 })).status).toBe(201);
    expect(gravacoes()[0].inputs.responsavelMembroId).toBe(40);
    mockConsultas = [];
    for (const ruim of [999, "abc", "0x28"]) {
      expect((await POST(GERAL, { responsavelMembroId: ruim })).status).toBe(400);
    }
    expect(gravacoes()).toHaveLength(0);
  });
  test.each([[{ orcamentoPrevisto: -1 }], [{ orcamentoPrevisto: "1e3" }], [{ orcamentoPrevisto: 1e12 }], [{ cronogramaFim: "2026-12-31" }], [{ cronogramaFim: "2027-02-30" }], [{ nome: "x".repeat(201) }], [{ descricao: "x".repeat(501) }]])("POST com %j: 400 e nada gravado", async (troca) => {
    meta("VIGENTE");
    expect((await POST(GERAL, troca)).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: projeto de plano ENCERRADO não muda; de plano vigente muda; prazo antes do início é 400", async () => {
    projeto("ENCERRADO");
    const bloqueado = await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "CANCELADO" } });
    expect(bloqueado.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
    mockRegras = [];
    projeto("VIGENTE");
    const ok = await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "EM_EXECUCAO", cronogramaFim: "2028-06-30" } });
    expect(ok.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 1, status: "EM_EXECUCAO", cronogramaFim: "2028-06-30" });
    expect(registrarAuditoria.mock.calls[0][0].dadosAntes).not.toHaveProperty("PlanoStatus");
    mockConsultas = [];
    expect((await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { cronogramaFim: "2026-12-31" } })).status).toBe(400);
    expect((await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { cronogramaFim: "ontem" } })).status).toBe(400);
    expect((await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "1" }, corpo: { status: "ZUMBI" } })).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("PUT: projeto inexistente e id malformado respondem igual", async () => {
    projeto("VIGENTE");
    const inexistente = await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: "9" }, corpo: { status: "CANCELADO" } });
    for (const ruim of ["abc", "0x1", "01", "-1", "1e0"]) {
      expect(await chamar(hProjetos, { metodo: "PUT", token: GERAL, ligado: { id: ruim }, corpo: { status: "CANCELADO" } })).toEqual(inexistente);
    }
    expect(gravacoes()).toHaveLength(0);
  });
});
