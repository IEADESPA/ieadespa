// Escopo das rotas de administração, auditoria e relatórios (auditoria de escopo territorial, 02/10/2026).
// Regra: o que é da IGREJA TODA (trilha de auditoria, compliance, integridade, ROPA, catálogos de fluxo/notificação/retenção, texto mestre do Regimento e os relatórios
// consolidados) é só do nível GERAL = papel GLOBAL **e** escopo "TODAS". Papel local com a permissão, papel Global com escopo de lista e papel local com escopo "TODAS" são
// recusados ANTES de tocar no banco. O banco é simulado pelo TEXTO da consulta (como em revisaoV75.test.js); o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({
  urlComSas: (u) => u, urlDocumentoComSas: (u) => (u ? `${u}?sas` : null),
  salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://conta.blob.core.windows.net/documentos-institucionais/doc-1")
}));
// Os cálculos pesados dos relatórios não são o assunto aqui (a porta é): respostas fixas.
jest.mock("../demonstracoes", () => ({
  calcularBalancoPatrimonial: jest.fn(async () => ({ ativo: { total: 1 }, passivo: { total: 1 }, patrimonioLiquido: 0 })),
  calcularDRP: jest.fn(async () => ({ totalDespesas: 0 })), calcularMutacoesPL: jest.fn(async () => ({})), calcularFluxoCaixa: jest.fn(async () => ({}))
}));
jest.mock("../imunidade", () => ({
  calcularSemaforo: jest.fn(async () => ({ semaforoGeral: "VERDE" })), conflitosInteresse: jest.fn(async () => []), cargaTributaria: jest.fn(async () => ({ itens: [] })), round2: (n) => n
}));
jest.mock("../tesouraria", () => ({ saldoCentroCusto: jest.fn(async () => 0), round2: (n) => n }));
jest.mock("../compliance", () => ({
  ...jest.requireActual("../compliance"),
  calcularIndicadoresFinanceiros: jest.fn(async () => ({ mesesReservaCaixa: 3 })),
  escanearAlertasCompliance: jest.fn(async () => []),
  gerarRecertificacoesTodasPermissoes: jest.fn(async () => 0)
}));

const auth = require("../auth");
const { hojeBrasilia } = require("../dataBrasilia");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const hFluxoTipos = require("../../GestaoFluxoTipos/index.js");
const hNotificacaoRegras = require("../../GestaoNotificacaoRegras/index.js");
const hPoliticasRetencao = require("../../GestaoPoliticasRetencao/index.js");
const hListarAuditoria = require("../../ListarAuditoria/index.js");
const hAuditoria = require("../../GestaoAuditoria/index.js");
const hCompliance = require("../../GestaoCompliance/index.js");
const hIntegridade = require("../../GestaoIntegridade/index.js");
const hRopa = require("../../GestaoRopa/index.js");
const hTextoMestre = require("../../GestaoTextoMestre/index.js");
const hIndicadores = require("../../RelatorioIndicadoresFinanceiros/index.js");
const hDemonstracoes = require("../../RelatorioDemonstracoesContabeis/index.js");
const hDossie = require("../../RelatorioDossieFiscal/index.js");
const hImunidade = require("../../RelatorioImunidadeTributaria/index.js");
const hInforme = require("../../RelatorioInformeRendimentos/index.js");
const hSituacao = require("../../RelatorioSituacaoTesouro/index.js");
const hPdq = require("../../RelatorioProgressoPdq/index.js");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const escreveu = () => mockConsultas.filter(c => /\b(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const tokenDe = (extra = {}) => auth.reassinarSessao({ membroId: 5, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
// Os cinco perfis de sessão que cada rota institucional precisa distinguir.
const geral = (permissoes) => tokenDe({ via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const local = (permissoes) => tokenDe({ via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: ["A"], permissoes });
const area = (permissoes) => tokenDe({ via: "SENHA", nivel: "AREA", escopoCongregacoes: ["A", "B"], permissoes });
const globalComLista = (permissoes) => tokenDe({ via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: ["A"], permissoes });
const localComTodas = (permissoes) => tokenDe({ via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: "TODAS", permissoes });
const pin = () => tokenDe({ via: "PIN", permissoes: [], escopoCongregacoes: [] });

beforeEach(() => { mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); storage.salvarDocumento.mockClear(); });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1. Porta institucional: as 15 rotas que são da igreja toda
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const PORTAS = [
  ["GestaoFluxoTipos", hFluxoTipos, "permissoes", { metodo: "GET" }],
  ["GestaoNotificacaoRegras", hNotificacaoRegras, "permissoes", { metodo: "GET" }],
  ["GestaoPoliticasRetencao (ler)", hPoliticasRetencao, null, { metodo: "GET" }],
  ["GestaoPoliticasRetencao (gravar)", hPoliticasRetencao, "permissoes", { metodo: "POST", corpo: { categoria: "Teste", baseLegal: "Lei", diasRetencao: 30 } }],
  ["ListarAuditoria", hListarAuditoria, "auditoria", { metodo: "GET" }],
  ["GestaoAuditoria", hAuditoria, "auditoria", { metodo: "GET", ligado: { recurso: "ancoragens" } }],
  ["GestaoCompliance", hCompliance, "auditoria", { metodo: "GET", ligado: { recurso: "parametros" } }],
  ["GestaoIntegridade", hIntegridade, "auditoria", { metodo: "GET", ligado: { recurso: "canal-denuncia" } }],
  ["GestaoRopa", hRopa, "protecaodedados", { metodo: "GET", ligado: { recurso: "ripd" } }],
  ["GestaoTextoMestre (gravar)", hTextoMestre, "reunioes", { metodo: "PUT", corpo: { acao: "DEFINIR_REVISAO_QUADRIENAL", data: "2026-01-01" } }],
  ["RelatorioIndicadoresFinanceiros", hIndicadores, "auditoria", { metodo: "GET" }],
  ["RelatorioDemonstracoesContabeis", hDemonstracoes, "financeiro", { metodo: "GET", query: { tipo: "balanco", dataCorte: "2026-12-31" } }],
  ["RelatorioDossieFiscal", hDossie, "financeiro", { metodo: "GET", ligado: { ano: "2026" } }],
  ["RelatorioImunidadeTributaria", hImunidade, "financeiro", { metodo: "GET" }],
  ["RelatorioInformeRendimentos", hInforme, "financeiro", { metodo: "GET", ligado: { ano: "2026" } }],
  ["RelatorioSituacaoTesouro", hSituacao, "financeiro", { metodo: "GET" }]
];

describe.each(PORTAS)("%s é da administração geral", (_nome, handler, permissao, args) => {
  const chave = permissao || "financeiro";
  test("sem sessão: 401 e o banco não é tocado", async () => {
    const r = await chamar(handler, args);
    expect(r.status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (permissoes vazias, sem nível): recusada, sem tocar no banco", async () => {
    const r = await chamar(handler, { ...args, token: pin() });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["dirigente de congregação (nível local, escopo de lista)", local], ["pastor de área (nível local, escopo de lista)", area]])("%s COM a permissão: 403 antes de tocar no banco", async (_p, perfil) => {
    const r = await chamar(handler, { ...args, token: perfil([chave, "permissoes", "protecaodedados", "auditoria", "financeiro", "reunioes", "assembleia", "cli"]) });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe("Esta função é da administração geral da igreja.");
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel Global com escopo de lista (só uma congregação) COM a permissão: 403 antes de tocar no banco", async () => {
    const r = await chamar(handler, { ...args, token: globalComLista([chave, "permissoes", "protecaodedados", "auditoria", "financeiro", "reunioes"]) });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel local concedido com escopo TODAS (esquecimento no cadastro da liderança) COM a permissão: 403 antes de tocar no banco", async () => {
    const r = await chamar(handler, { ...args, token: localComTodas([chave, "permissoes", "protecaodedados", "auditoria", "financeiro", "reunioes"]) });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  if (permissao) {
    test("o geral sem a permissão da rota: 403 (nível sozinho não basta)", async () => {
      const r = await chamar(handler, { ...args, token: geral(["pessoas"]) });
      expect(r.status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
  }
  test("o geral com a permissão passa pela porta (nem 401 nem 403)", async () => {
    quando(/INSERT INTO PoliticasRetencao/, [{ PoliticaId: 1 }]);
    quando(/FROM FechamentosTesouraria f/, [{ totalItens: 0, totalBase: 0 }]);
    const r = await chamar(handler, { ...args, token: geral(["permissoes", "protecaodedados", "auditoria", "financeiro", "reunioes"]) });
    expect([401, 403]).not.toContain(r.status);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2. GestaoFluxoTipos / GestaoNotificacaoRegras: trilha de auditoria nas escritas
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoFluxoTipos: escritas ficam na trilha", () => {
  const etapas = [{ ordem: 1, nome: "Análise", responsavelPermissao: "financeiro", responsavelNivelMinimo: "AREA", prazoDias: 5 }];
  test("papel local ou Global com escopo de lista não cria tipo de fluxo (nada é gravado)", async () => {
    for (const token of [local(["permissoes"]), globalComLista(["permissoes"]), geral(["financeiro"])]) {
      const r = await chamar(hFluxoTipos, { metodo: "POST", token, corpo: { chave: "X", nome: "Y", etapas } });
      expect(r.status).toBe(403);
    }
    expect(escreveu()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o geral cria o tipo: grava tipo e etapas e registra na trilha, com as etapas", async () => {
    const r = await chamar(hFluxoTipos, { metodo: "POST", token: geral(["permissoes"]), corpo: { chave: "NOVO", nome: "Fluxo novo", etapas } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO TiposFluxo/)).toHaveLength(1);
    expect(rodou(/INSERT INTO FluxoEtapas/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "TiposFluxo", acao: "Criou tipo de fluxo", usuarioId: 5, dadosDepois: expect.objectContaining({ chave: "NOVO", etapas: [expect.objectContaining({ responsavelPermissao: "financeiro" })] }) }));
  });
  test("chave ou nome que não são texto: 400, sem gravar", async () => {
    for (const corpo of [{ chave: 123, nome: "Y", etapas }, { chave: "X", nome: { a: 1 }, etapas }, { chave: ["X"], nome: "Y", etapas }]) {
      expect((await chamar(hFluxoTipos, { metodo: "POST", token: geral(["permissoes"]), corpo })).status).toBe(400);
    }
    expect(escreveu()).toHaveLength(0);
  });
  test("o geral ativa/desativa o tipo: grava e registra na trilha", async () => {
    quando(/SELECT 1 FROM TiposFluxo WHERE Chave/, [{ "": 1 }]);
    const r = await chamar(hFluxoTipos, { metodo: "PUT", token: geral(["permissoes"]), ligado: { chave: "NOVO" }, corpo: { ativo: false } });
    expect(r.status).toBe(200);
    expect(rodou(/UPDATE TiposFluxo SET Ativo/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "TiposFluxo", acao: "Desativou tipo de fluxo", dadosDepois: { chave: "NOVO", ativo: false } }));
  });
});

describe("GestaoNotificacaoRegras: escritas ficam na trilha (antes e depois)", () => {
  const regra = { Ativa: true, CanalEmail: true, Titulo: "Seguro vencendo" };
  test("papel local, Global com escopo de lista e geral sem 'permissoes' não alteram regra (nada é gravado)", async () => {
    for (const token of [local(["permissoes"]), globalComLista(["permissoes"]), geral(["financeiro"])]) {
      const r = await chamar(hNotificacaoRegras, { metodo: "PUT", token, ligado: { chave: "SEGUROS" }, corpo: { ativa: false } });
      expect(r.status).toBe(403);
    }
    expect(escreveu()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o geral desliga a regra: grava e registra o antes e o depois", async () => {
    quando(/FROM NotificacaoRegras WHERE Chave/, [regra]);
    const r = await chamar(hNotificacaoRegras, { metodo: "PUT", token: geral(["permissoes"]), ligado: { chave: "SEGUROS" }, corpo: { ativa: false } });
    expect(r.status).toBe(200);
    expect(rodou(/UPDATE NotificacaoRegras/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
      tabela: "NotificacaoRegras", acao: "Alterou regra de notificação", usuarioId: 5,
      dadosAntes: { chave: "SEGUROS", ativa: true, canalEmail: true, titulo: "Seguro vencendo" },
      dadosDepois: { chave: "SEGUROS", ativa: false, canalEmail: true, titulo: "Seguro vencendo" }
    }));
  });
  test("regra inexistente: 404 sem gravar nem registrar; título que não é texto ou gigante: 400", async () => {
    expect((await chamar(hNotificacaoRegras, { metodo: "PUT", token: geral(["permissoes"]), ligado: { chave: "NAO_EXISTE" }, corpo: { ativa: true } })).status).toBe(404);
    quando(/FROM NotificacaoRegras WHERE Chave/, [regra]);
    for (const titulo of [123, { a: 1 }, "x".repeat(151)]) {
      expect((await chamar(hNotificacaoRegras, { metodo: "PUT", token: geral(["permissoes"]), ligado: { chave: "SEGUROS" }, corpo: { titulo } })).status).toBe(400);
    }
    expect(escreveu()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3. GestaoPoliticasRetencao: só o geral, gravar exige permissão, prazo validado, trilha
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoPoliticasRetencao", () => {
  test("ler: o geral logado (qualquer permissão) lê; local e Global com escopo de lista não leem", async () => {
    quando(/FROM PoliticasRetencao ORDER BY/, [{ politicaId: 1, categoria: "X", baseLegal: "Y", diasRetencao: 30, ativo: true }]);
    expect((await chamar(hPoliticasRetencao, { token: geral(["financeiro"]) })).status).toBe(200);
    mockConsultas.length = 0;
    expect((await chamar(hPoliticasRetencao, { token: local(["pessoas"]) })).status).toBe(403);
    expect((await chamar(hPoliticasRetencao, { token: globalComLista(["pessoas"]) })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["POST", { metodo: "POST", corpo: { categoria: "Nova", baseLegal: "Lei", diasRetencao: 30 } }, {}], ["PUT", { metodo: "PUT", corpo: { diasRetencao: 30 } }, { id: 3 }]])("gravar (%s): papel Global sem 'permissoes' nem 'protecaodedados' (Tesoureiro, Líder de Consagrações) é recusado e nada é gravado", async (_m, args, ligado) => {
    const r = await chamar(hPoliticasRetencao, { ...args, ligado, token: geral(["financeiro", "consagracoes", "reunioes"]) });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["permissoes"], ["protecaodedados"]])("gravar: o geral com '%s' grava, e a trilha leva o antes e o depois", async (permissao) => {
    quando(/SELECT BaseLegal, DiasRetencao, Ativo FROM PoliticasRetencao WHERE PoliticaId/, [{ BaseLegal: "Lei X", DiasRetencao: 1825, Ativo: true }]);
    const r = await chamar(hPoliticasRetencao, { metodo: "PUT", ligado: { id: 3 }, token: geral([permissao]), corpo: { diasRetencao: 90 } });
    expect(r.status).toBe(200);
    expect(rodou(/UPDATE PoliticasRetencao/)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
      tabela: "PoliticasRetencao", registroId: 3, usuarioId: 5,
      dadosAntes: { baseLegal: "Lei X", diasRetencao: 1825, ativo: true }, dadosDepois: { baseLegal: "Lei X", diasRetencao: 90, ativo: true }
    }));
  });
  test("prazo inválido (zero, negativo, fracionado, texto, gigante, NaN): 400 e NADA é gravado — zero apagaria dado pessoal na hora", async () => {
    quando(/SELECT BaseLegal, DiasRetencao, Ativo FROM PoliticasRetencao WHERE PoliticaId/, [{ BaseLegal: "Lei X", DiasRetencao: 1825, Ativo: true }]);
    for (const diasRetencao of [0, -1, -365, 1.5, "30", "", 36501, 99999999, NaN, Infinity, true, [30], {}]) {
      const rp = await chamar(hPoliticasRetencao, { metodo: "PUT", ligado: { id: 3 }, token: geral(["permissoes"]), corpo: { diasRetencao } });
      expect([400]).toContain(rp.status);
      const rc = await chamar(hPoliticasRetencao, { metodo: "POST", token: geral(["permissoes"]), corpo: { categoria: "Nova", baseLegal: "Lei", diasRetencao } });
      expect([400]).toContain(rc.status);
    }
    expect(escreveu()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("prazo válido: 1, 36500 e null (indeterminado) passam", async () => {
    quando(/SELECT BaseLegal, DiasRetencao, Ativo FROM PoliticasRetencao WHERE PoliticaId/, [{ BaseLegal: "Lei X", DiasRetencao: 1825, Ativo: true }]);
    for (const diasRetencao of [1, 36500, null]) {
      expect((await chamar(hPoliticasRetencao, { metodo: "PUT", ligado: { id: 3 }, token: geral(["permissoes"]), corpo: { diasRetencao } })).status).toBe(200);
    }
    expect(rodou(/UPDATE PoliticasRetencao/)).toHaveLength(3);
  });
  test("criar: o geral cria, registra na trilha com o id novo; categoria que não é texto: 400", async () => {
    quando(/INSERT INTO PoliticasRetencao/, [{ PoliticaId: 9 }]);
    const r = await chamar(hPoliticasRetencao, { metodo: "POST", token: geral(["permissoes"]), corpo: { categoria: "Nova", baseLegal: "Lei", diasRetencao: 365 } });
    expect(r.status).toBe(201);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "PoliticasRetencao", registroId: 9, acao: "Criou política de retenção", dadosDepois: { categoria: "Nova", baseLegal: "Lei", diasRetencao: 365 } }));
    for (const categoria of [123, { a: 1 }, ["x"]]) {
      expect((await chamar(hPoliticasRetencao, { metodo: "POST", token: geral(["permissoes"]), corpo: { categoria, baseLegal: "Lei" } })).status).toBe(400);
    }
  });
  test("id malformado na rota: 404 como o de política inexistente, sem consulta", async () => {
    for (const id of ["abc", "1e1", "05", "-1", "0x10"]) {
      const r = await chamar(hPoliticasRetencao, { metodo: "PUT", ligado: { id }, token: geral(["permissoes"]), corpo: { ativo: false } });
      expect(r.status).toBe(404);
    }
    expect(mockConsultas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4. ListarAuditoria
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("ListarAuditoria", () => {
  test("o geral com 'auditoria' lista a trilha", async () => {
    quando(/FROM AuditLog a/, [{ auditId: 1, tabela: "Lideranca", usuarioNome: "X" }]);
    const r = await chamar(hListarAuditoria, { token: geral(["auditoria"]), query: { tabela: "Lideranca", usuarioId: "12", de: "2026-01-01", ate: "2026-12-31" } });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    const c = rodou(/FROM AuditLog a/)[0];
    expect(c.inputs.usuarioId).toBe(12);
    expect(c.inputs.tabela).toBe("Lideranca");
  });
  test("filtro malformado (usuarioId, data, tabela): 400 sem consulta — antes era erro do driver", async () => {
    for (const query of [{ usuarioId: "abc" }, { usuarioId: "1e1" }, { usuarioId: "-3" }, { usuarioId: "0" }, { de: "ontem" }, { ate: "31/12/2026 xx" }, { tabela: "x".repeat(51) }]) {
      const r = await chamar(hListarAuditoria, { token: geral(["auditoria"]), query });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 5. GestaoAuditoria: hash só da trilha, anexos de até 15 MB, entradas validadas
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoAuditoria", () => {
  const HASH = "a".repeat(64);
  const aud = () => geral(["auditoria"]);
  const regrasAncoragem = () => {
    quando(/FROM AuditLog WHERE HashRegistro = @hash/, (i) => (i.hash === HASH ? [{ AuditId: 1 }] : []));
    quando(/SELECT TOP 1 HashRegistro FROM AuditLog/, [{ HashRegistro: HASH }]);
    quando(/INSERT INTO AuditoriaAncoragens/, [{ AncoragemId: 3 }]);
  };

  test("papel local COM 'auditoria' não registra nada: 403, nenhum INSERT, nenhum arquivo salvo", async () => {
    for (const [recurso, corpo] of [["ancoragens", { metodo: "RFC3161" }], ["niveis", { nivel: "INTERNA", titulo: "T", anoReferencia: 2026 }], ["pareceres", { mesReferencia: "2026-09", decisao: "APROVADO" }]]) {
      for (const token of [local(["auditoria"]), globalComLista(["auditoria"])]) {
        expect((await chamar(hAuditoria, { metodo: "POST", token, ligado: { recurso }, corpo })).status).toBe(403);
      }
    }
    expect(mockConsultas).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("ancoragem de hash que NÃO está na trilha: recusada, nada gravado", async () => {
    regrasAncoragem();
    const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "ancoragens" }, corpo: { metodo: "RFC3161", hashAncorado: "b".repeat(64) } });
    expect(r.body).toMatchObject({ sucesso: false });
    expect(rodou(/INSERT INTO AuditoriaAncoragens/)).toHaveLength(0);
  });
  test("ancoragem de hash malformado (curto, não hexadecimal, não texto): 400, sem consulta", async () => {
    for (const hashAncorado of ["abc", "z".repeat(64), "a".repeat(63), "a".repeat(65), 12345, ["a".repeat(64)], { h: 1 }]) {
      const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "ancoragens" }, corpo: { metodo: "RFC3161", hashAncorado } });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("ancoragem de hash que existe na trilha: grava (em minúsculas) e registra", async () => {
    regrasAncoragem();
    const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "ancoragens" }, corpo: { metodo: "REGISTRO_PUBLICO", hashAncorado: ` ${HASH.toUpperCase()} ` } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO AuditoriaAncoragens/)[0].inputs.hash).toBe(HASH);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "AuditoriaAncoragens", dadosDepois: { metodo: "REGISTRO_PUBLICO", hashAncorado: HASH } }));
  });
  test("ancoragem sem hash informado ancora o topo da trilha (como antes)", async () => {
    quando(/SELECT TOP 1 HashRegistro FROM AuditLog/, [{ HashRegistro: HASH }]);
    quando(/INSERT INTO AuditoriaAncoragens/, [{ AncoragemId: 4 }]);
    const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "ancoragens" }, corpo: { metodo: "RFC3161" } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO AuditoriaAncoragens/)[0].inputs.hash).toBe(HASH);
  });
  test("anexo de mais de 15 MB, tipo não permitido ou que não é texto base64: 400 e nada é salvo nem gravado", async () => {
    regrasAncoragem();
    const grande = Buffer.alloc(15 * 1024 * 1024 + 1, 1).toString("base64");
    const limite = Buffer.alloc(1024, 1).toString("base64");
    for (const [recurso, campo, corpoBase] of [["ancoragens", "comprovanteBase64", { metodo: "RFC3161" }], ["niveis", "documentoBase64", { nivel: "NIF", titulo: "T", anoReferencia: 2026 }], ["pareceres", "documentoBase64", { mesReferencia: "2026-09", decisao: "REJEITADO" }]]) {
      for (const corpo of [{ ...corpoBase, [campo]: grande, mimeType: "application/pdf" }, { ...corpoBase, [campo]: limite, mimeType: "text/html" }, { ...corpoBase, [campo]: limite }, { ...corpoBase, [campo]: 12345, mimeType: "application/pdf" }]) {
        const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso }, corpo });
        expect(r.status).toBe(400);
      }
    }
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escreveu()).toHaveLength(0);
  });
  test("anexo dentro do limite e do tipo: salvo e gravado", async () => {
    quando(/INSERT INTO PareceresConselhoFiscal/, [{ ParecerId: 1 }]);
    const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "pareceres" }, corpo: { mesReferencia: "2026-09", decisao: "APROVADO", documentoBase64: Buffer.from("%PDF-1.4 teste").toString("base64"), mimeType: "application/pdf" } });
    expect(r.status).toBe(201);
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    expect(rodou(/INSERT INTO PareceresConselhoFiscal/)).toHaveLength(1);
  });
  test("parecer e auditoria dos 3 níveis com campos malformados: 400, nada gravado", async () => {
    for (const corpo of [{ mesReferencia: "2026-13", decisao: "APROVADO" }, { mesReferencia: "setembro", decisao: "APROVADO" }, { mesReferencia: 202609, decisao: "APROVADO" }, { mesReferencia: "2026-09", decisao: "TALVEZ" }, { mesReferencia: "2026-09", decisao: "APROVADO", justificativa: "x".repeat(501) }, { mesReferencia: "2026-09", decisao: "APROVADO", justificativa: 7 }]) {
      expect((await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "pareceres" }, corpo })).status).toBe(400);
    }
    for (const corpo of [{ nivel: "INTERNA", titulo: "T", anoReferencia: "2026" }, { nivel: "INTERNA", titulo: "T", anoReferencia: 20260 }, { nivel: "INTERNA", titulo: "T", anoReferencia: 1899 }, { nivel: "INTERNA", titulo: "T", anoReferencia: 0 }, { nivel: "INTERNA", titulo: "T", anoReferencia: -2026 }, { nivel: "INTERNA", titulo: "T", anoReferencia: 1.5 }, { nivel: "INTERNA", titulo: 7, anoReferencia: 2026 }, { nivel: "INTERNA", titulo: "x".repeat(201), anoReferencia: 2026 }, { nivel: "INTERNA", titulo: "T", anoReferencia: 2026, conclusao: "x".repeat(501) }, { nivel: "OUTRA", titulo: "T", anoReferencia: 2026 }]) {
      expect((await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "niveis" }, corpo })).status).toBe(400);
    }
    expect(escreveu()).toHaveLength(0);
  });
  test("auditoria dos 3 níveis válida: grava e registra", async () => {
    quando(/INSERT INTO AuditoriasNiveis/, [{ AuditoriaId: 1 }]);
    const r = await chamar(hAuditoria, { metodo: "POST", token: aud(), ligado: { recurso: "niveis" }, corpo: { nivel: "EXTERNA", titulo: "Auditoria 2026", anoReferencia: 2026 } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO AuditoriasNiveis/)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 6. GestaoCompliance
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCompliance", () => {
  const aud = () => geral(["auditoria"]);   // membroId 5
  describe("alertas", () => {
    const resolver = (alertaId) => chamar(hCompliance, { metodo: "PUT", token: aud(), ligado: { recurso: "alertas" }, corpo: { alertaId, acao: "RESOLVER" } });
    test("resolve só alerta ATIVO (a condição está no UPDATE) e registra", async () => {
      quando(/UPDATE AlertasCompliance/, [], 1);
      const r = await resolver(7);
      expect(r.status).toBe(200);
      expect(rodou(/UPDATE AlertasCompliance[\s\S]*AND Status = 'ATIVO'/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "AlertasCompliance", registroId: 7 }));
    });
    test("alerta inexistente ou já resolvido (nenhuma linha afetada): 404, sem '✅ resolvido' e sem linha na trilha", async () => {
      quando(/UPDATE AlertasCompliance/, [], 0);
      const r = await resolver(999);
      expect(r.status).toBe(404);
      expect(r.body.sucesso).toBe(false);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test("id malformado: 400 sem consulta", async () => {
      for (const alertaId of ["abc", "1e1", 0, -1, 1.5, [3], undefined]) expect((await resolver(alertaId)).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
  });
  describe("recertificações", () => {
    const decidir = (recertificacaoId, acao = "CONFIRMAR") => chamar(hCompliance, { metodo: "PUT", token: aud(), ligado: { recurso: "recertificacoes" }, corpo: { recertificacaoId, acao } });
    const linha = (extra = {}) => quando(/SELECT MembroId, Status FROM RecertificacoesAcesso/, [{ MembroId: 20, Status: "PENDENTE", ...extra }]);
    test("pendente de OUTRA pessoa: decide (a condição de status está no UPDATE) e registra", async () => {
      linha();
      quando(/UPDATE RecertificacoesAcesso/, [], 1);
      const r = await decidir(11, "CONFIRMAR");
      expect(r.status).toBe(200);
      expect(rodou(/UPDATE RecertificacoesAcesso[\s\S]*AND Status = 'PENDENTE'/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "RecertificacoesAcesso", registroId: 11, acao: "Recertificou acesso" }));
    });
    test("o próprio acesso (confirmar OU expirar): 403 e nada é gravado", async () => {
      linha({ MembroId: 5 });
      quando(/UPDATE RecertificacoesAcesso/, [], 1);
      for (const acao of ["CONFIRMAR", "EXPIRAR"]) expect((await decidir(11, acao)).status).toBe(403);
      expect(rodou(/UPDATE RecertificacoesAcesso/)).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test.each([["CONFIRMADA"], ["EXPIRADA"]])("recertificação já %s não é revertida: 409 e nada é gravado", async (status) => {
      linha({ Status: status });
      quando(/UPDATE RecertificacoesAcesso/, [], 1);
      for (const acao of ["CONFIRMAR", "EXPIRAR"]) expect((await decidir(11, acao)).status).toBe(409);
      expect(rodou(/UPDATE RecertificacoesAcesso/)).toHaveLength(0);
    });
    test("corrida: outra pessoa decidiu entre a leitura e a gravação (nenhuma linha afetada): 409 e sem trilha", async () => {
      linha();
      quando(/UPDATE RecertificacoesAcesso/, [], 0);
      expect((await decidir(11)).status).toBe(409);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test("inexistente: 404; id malformado ou ação desconhecida: 400 sem consulta", async () => {
      expect((await decidir(999)).status).toBe(404);
      mockConsultas.length = 0;
      for (const id of ["abc", 0, -2, 1.5, undefined]) expect((await decidir(id)).status).toBe(400);
      expect((await decidir(11, "APAGAR")).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
  });
  describe("parâmetros", () => {
    const gravar = (corpo) => chamar(hCompliance, { metodo: "PUT", token: aud(), ligado: { recurso: "parametros" }, corpo });
    beforeEach(() => quando(/FROM ParametrosCompliance WHERE ParametroId = 1/, [{ ValorCriticoQuatroOlhos: 10000, PeriodicidadeRecertificacaoMeses: 3 }]));
    test("valores fora da faixa: 400 e nada é gravado — um teto gigante desligaria o controle dos quatro olhos", async () => {
      for (const corpo of [{ valorCriticoQuatroOlhos: 0 }, { valorCriticoQuatroOlhos: -1 }, { valorCriticoQuatroOlhos: 1e12 }, { valorCriticoQuatroOlhos: "10000" }, { valorCriticoQuatroOlhos: NaN }, { valorCriticoQuatroOlhos: Infinity }, { valorCriticoQuatroOlhos: null },
        { periodicidadeRecertificacaoMeses: 0 }, { periodicidadeRecertificacaoMeses: -3 }, { periodicidadeRecertificacaoMeses: 1.5 }, { periodicidadeRecertificacaoMeses: 121 }, { periodicidadeRecertificacaoMeses: "3" }, { periodicidadeRecertificacaoMeses: null }]) {
        expect((await gravar(corpo)).status).toBe(400);
      }
      expect(escreveu()).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test("valores na faixa: grava e registra antes/depois", async () => {
      const r = await gravar({ valorCriticoQuatroOlhos: 5000.5, periodicidadeRecertificacaoMeses: 6 });
      expect(r.status).toBe(200);
      expect(rodou(/UPDATE ParametrosCompliance/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "ParametrosCompliance", dadosDepois: { valorCriticoQuatroOlhos: 5000.5, periodicidadeRecertificacaoMeses: 6 } }));
    });
    test("só um dos dois informado: o outro é mantido", async () => {
      expect((await gravar({ periodicidadeRecertificacaoMeses: 12 })).status).toBe(200);
      expect(rodou(/UPDATE ParametrosCompliance/)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 7. GestaoIntegridade
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoIntegridade", () => {
  const aud = () => geral(["auditoria"]);
  const post = (recurso, corpo, token = aud()) => chamar(hIntegridade, { metodo: "POST", token, ligado: { recurso }, corpo });

  test("papel local ou Global com escopo de lista COM 'auditoria' não registra nada em nenhum recurso", async () => {
    const corpos = { politicas: { tipo: "DOACOES", titulo: "T", ataReferencia: "A", dataAprovacao: "2026-01-01" }, aceites: { membroId: 7, politicaId: 1 }, "due-diligence": { fornecedorId: 3, status: "APROVADO" }, "conflitos-interesse": { membroId: 7, mandatoReferencia: "2026-2028", temConflito: false } };
    for (const [recurso, corpo] of Object.entries(corpos)) for (const token of [local(["auditoria"]), globalComLista(["auditoria"])]) expect((await post(recurso, corpo, token)).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });

  describe("aceites", () => {
    const rodarComPessoaEPolitica = () => { quando(/FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 7 }]); quando(/FROM PoliticasInstitucionais WHERE PoliticaId = @p/, [{ PoliticaId: 1 }]); quando(/INSERT INTO CodigoCondutaAceites/, [{ AceiteId: 1 }]); };
    test("registra o aceite quando a pessoa e a política existem", async () => {
      rodarComPessoaEPolitica();
      const r = await post("aceites", { membroId: "7", politicaId: 1 });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO CodigoCondutaAceites/)[0].inputs).toMatchObject({ m: 7, p: 1 });
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("pessoa inexistente: resposta de negócio (200 com sucesso:false), nunca erro 500 de chave estrangeira; nada gravado", async () => {
      quando(/FROM PoliticasInstitucionais WHERE PoliticaId = @p/, [{ PoliticaId: 1 }]);
      const r = await post("aceites", { membroId: 999999, politicaId: 1 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ sucesso: false, mensagem: "Pessoa não encontrada." });
      expect(rodou(/INSERT INTO CodigoCondutaAceites/)).toHaveLength(0);
    });
    test("política inexistente: 200 com sucesso:false; nada gravado", async () => {
      quando(/FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 7 }]);
      const r = await post("aceites", { membroId: 7, politicaId: 4040 });
      expect(r.body).toMatchObject({ sucesso: false, mensagem: "Política não encontrada." });
      expect(rodou(/INSERT INTO CodigoCondutaAceites/)).toHaveLength(0);
    });
    test("ids malformados: 400 sem consulta", async () => {
      for (const corpo of [{ membroId: "abc", politicaId: 1 }, { membroId: 7, politicaId: "1e1" }, { membroId: 0, politicaId: 1 }, { membroId: -7, politicaId: 1 }, { membroId: 1.5, politicaId: 1 }, { membroId: [7], politicaId: 1 }, { membroId: 7 }]) expect((await post("aceites", corpo)).status).toBe(400);
      expect((await chamar(hIntegridade, { token: aud(), ligado: { recurso: "aceites" }, query: { politicaId: "abc" } })).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("conflitos de interesse", () => {
    test("pessoa inexistente: 200 com sucesso:false, nada gravado; existente: grava", async () => {
      const corpo = { membroId: 7, mandatoReferencia: "2026-2028", temConflito: false };
      const r1 = await post("conflitos-interesse", corpo);
      expect(r1.body).toMatchObject({ sucesso: false, mensagem: "Pessoa não encontrada." });
      expect(rodou(/INSERT INTO DeclaracoesConflitoInteresse/)).toHaveLength(0);
      quando(/FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 7 }]);
      quando(/INSERT INTO DeclaracoesConflitoInteresse/, [{ DeclaracaoId: 2 }]);
      const r2 = await post("conflitos-interesse", corpo);
      expect(r2.status).toBe(201);
      expect(rodou(/INSERT INTO DeclaracoesConflitoInteresse/)).toHaveLength(1);
    });
    test("entradas malformadas: 400 sem consulta", async () => {
      for (const corpo of [{ membroId: "x", mandatoReferencia: "2026" }, { membroId: 7, mandatoReferencia: 2026 }, { membroId: 7, mandatoReferencia: "x".repeat(21) }, { membroId: 7, mandatoReferencia: "2026", temConflito: true, descricaoConflito: "" },
        { membroId: 7, mandatoReferencia: "2026", temConflito: true, descricaoConflito: "x".repeat(501) }, { membroId: 7, mandatoReferencia: "2026", descricaoConflito: 5 }]) expect((await post("conflitos-interesse", corpo)).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("due diligence", () => {
    test("fornecedor inexistente: 200 com sucesso:false, nada gravado; existente: grava e registra", async () => {
      const r1 = await post("due-diligence", { fornecedorId: 3, status: "APROVADO" });
      expect(r1.body).toMatchObject({ sucesso: false, mensagem: "Fornecedor não encontrado." });
      expect(escreveu()).toHaveLength(0);
      quando(/FROM Fornecedores WHERE FornecedorId = @f/, [{ FornecedorId: 3 }]);
      const r2 = await post("due-diligence", { fornecedorId: "3", status: "APROVADO", observacao: "ok" });
      expect(r2.status).toBe(200);
      expect(rodou(/INSERT INTO FornecedoresDueDiligence/)).toHaveLength(1);
    });
    test("entradas malformadas: 400 sem consulta", async () => {
      for (const corpo of [{ fornecedorId: "abc", status: "APROVADO" }, { fornecedorId: 0, status: "APROVADO" }, { fornecedorId: 3, status: "TALVEZ" }, { fornecedorId: 3, status: "APROVADO", observacao: "x".repeat(501) }, { fornecedorId: 3, status: "APROVADO", observacao: 9 }]) expect((await post("due-diligence", corpo)).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("políticas", () => {
    const valida = { tipo: "CODIGO_CONDUTA", titulo: "Código de conduta 2026", ataReferencia: "Ata 12/2026", dataAprovacao: "2026-09-01" };
    test("a troca da política vigente é UMA transação (desativa a anterior e insere a nova juntas, com XACT_ABORT) — se o INSERT falhar, a anterior continua vigente", async () => {
      quando(/INSERT INTO PoliticasInstitucionais/, [{ PoliticaId: 4 }]);
      const r = await post("politicas", valida);
      expect(r.status).toBe(201);
      const gravacoes = escreveu();
      expect(gravacoes).toHaveLength(1);
      expect(gravacoes[0].sql).toMatch(/SET XACT_ABORT ON/);
      expect(gravacoes[0].sql).toMatch(/BEGIN TRANSACTION[\s\S]*UPDATE PoliticasInstitucionais SET Vigente = 0[\s\S]*INSERT INTO PoliticasInstitucionais[\s\S]*COMMIT TRANSACTION/);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "PoliticasInstitucionais", registroId: 4 }));
    });
    test("campos malformados: 400 e NADA é gravado (a política vigente não é desativada)", async () => {
      for (const corpo of [{ ...valida, dataAprovacao: "01/09/2026" }, { ...valida, dataAprovacao: "2026-02-30x" }, { ...valida, dataAprovacao: "2026-02-30" }, { ...valida, dataAprovacao: "2026-13-45" }, { ...valida, dataAprovacao: 20260901 }, { ...valida, titulo: 5 }, { ...valida, titulo: "x".repeat(201) }, { ...valida, ataReferencia: ["a"] }, { ...valida, tipo: "OUTRA" },
        { ...valida, documentoUrl: "javascript:alert(1)" }, { ...valida, documentoUrl: "http://x.com/a.pdf" }, { ...valida, documentoUrl: 7 }]) expect((await post("politicas", corpo)).status).toBe(400);
      expect(escreveu()).toHaveLength(0);
    });
    test("link https do documento é aceito", async () => {
      quando(/INSERT INTO PoliticasInstitucionais/, [{ PoliticaId: 5 }]);
      expect((await post("politicas", { ...valida, documentoUrl: "https://exemplo.org/politica.pdf" })).status).toBe(201);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 8. GestaoTextoMestre: gravar é do geral; ler sem sessão é só o texto vigente
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoTextoMestre", () => {
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\n").toString("base64");
  const valido = { arquivoBase64: PDF, mimeType: "application/pdf", dataVigencia: "2026-10-02", totalArtigos: 100, artigosTocados: 10 };
  const post = (corpo, token) => chamar(hTextoMestre, { metodo: "POST", token, corpo });
  const regrasPost = () => { quando(/ISNULL\(MAX\(NumeroVersao\), 0\) \+ 1/, [{ proximo: 3 }]); quando(/INSERT INTO TextoMestreVersoes/, [{ VersaoId: 8 }]); };
  const TODAS_PERMS = ["reunioes", "assembleia", "cli"];

  describe("gravar (POST)", () => {
    test.each([["dirigente de congregação (reunioes)", local(["reunioes", "pessoas", "estrutura"])], ["pastor de área (reunioes, assembleia)", area(["reunioes", "assembleia"])], ["papel Global com escopo de lista", globalComLista(TODAS_PERMS)], ["papel local com escopo TODAS", localComTodas(TODAS_PERMS)]])("%s: 403 — não publica o Regimento 'vigente': nada é salvo nem gravado", async (_p, token) => {
      const r = await post(valido, token);
      expect(r.status).toBe(403);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral (Secretário de Reuniões, Secretário Geral, Presidente) publica: arquivo salvo, versão gravada e registrada", async () => {
      regrasPost();
      const r = await post(valido, geral(["reunioes"]));
      expect(r.status).toBe(201);
      expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
      expect(rodou(/INSERT INTO TextoMestreVersoes/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "TextoMestreVersoes", registroId: 8 }));
    });
    test("conteúdo que não é PDF (mesmo declarado como PDF), maior que 15 MB, vazio ou com campos malformados: 400, nada salvo", async () => {
      regrasPost();
      const grande = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024, 1)]).toString("base64");
      const umByteAcima = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024 + 1 - 9, 1)]);       // exatamente 15 MB + 1 byte, com cabeçalho de PDF
      expect(umByteAcima.length).toBe(15 * 1024 * 1024 + 1);
      const noLimite = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024 - 9, 1)]);                // exatamente 15 MB: ainda passa
      const casos = [
        { ...valido, arquivoBase64: Buffer.from("<html><script>alert(1)</script></html>").toString("base64") },
        { ...valido, arquivoBase64: grande },
        { ...valido, arquivoBase64: umByteAcima.toString("base64") },
        { ...valido, arquivoBase64: "!!!" },
        { ...valido, arquivoBase64: 12345 },
        { ...valido, mimeType: "text/html" },
        { ...valido, dataVigencia: "amanhã" },
        { ...valido, dataVigencia: "2026-10-02T00:00" },
        { ...valido, dataVigencia: "2026-02-30" },
        { ...valido, totalArtigos: "100" },
        { ...valido, artigosTocados: -1 },
        { ...valido, documentoOrigemId: "abc" },
        { ...valido, documentoOrigemId: 0 }
      ];
      for (const corpo of casos) expect((await post(corpo, geral(["reunioes"]))).status).toBe(400);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      expect(rodou(/INSERT INTO TextoMestreVersoes/)).toHaveLength(0);
      // exatamente 15 MB é aceito (o limite é "maior que")
      expect((await post({ ...valido, arquivoBase64: noLimite.toString("base64") }, geral(["reunioes"]))).status).toBe(201);
      expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    });
    test("documento de origem inexistente: 400; existente: grava", async () => {
      regrasPost();
      expect((await post({ ...valido, documentoOrigemId: 77 }, geral(["reunioes"]))).status).toBe(400);
      quando(/SELECT DocumentoId FROM Documentos WHERE DocumentoId/, [{ DocumentoId: 77 }]);
      expect((await post({ ...valido, documentoOrigemId: 77 }, geral(["reunioes"]))).status).toBe(201);
      expect(rodou(/INSERT INTO TextoMestreVersoes/)[0].inputs.documentoOrigemId).toBe(77);
    });
    test("falha do armazenamento: o cliente NÃO recebe a mensagem técnica do Storage", async () => {
      storage.salvarDocumento.mockRejectedValueOnce(new Error("conta segredo123.blob.core.windows.net container documentos-institucionais AuthorizationFailure"));
      const r = await post(valido, geral(["reunioes"]));
      expect(JSON.stringify(r.body)).not.toMatch(/segredo123|blob\.core|AuthorizationFailure/);
      expect(r.body.sucesso).toBe(false);
    });
  });

  describe("definir a revisão quadrienal (PUT)", () => {
    test("dirigente, pastor de área, Global com escopo de lista: 403 e nada é gravado", async () => {
      for (const token of [local(["reunioes"]), area(TODAS_PERMS), globalComLista(TODAS_PERMS)]) {
        expect((await chamar(hTextoMestre, { metodo: "PUT", token, corpo: { acao: "DEFINIR_REVISAO_QUADRIENAL", data: "2026-01-01" } })).status).toBe(403);
      }
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral define; data malformada: 400", async () => {
      expect((await chamar(hTextoMestre, { metodo: "PUT", token: geral(["cli"]), corpo: { acao: "DEFINIR_REVISAO_QUADRIENAL", data: "2026-01-01" } })).status).toBe(200);
      expect(rodou(/UPDATE ParametrosTextoMestre/)).toHaveLength(1);
      mockConsultas.length = 0;
      for (const data of ["ontem", "2026-1-1", 20260101, "2026-02-30x", "2026-02-30", "2026-13-01"]) expect((await chamar(hTextoMestre, { metodo: "PUT", token: geral(["cli"]), corpo: { acao: "DEFINIR_REVISAO_QUADRIENAL", data } })).status).toBe(400);
      expect(escreveu()).toHaveLength(0);
    });
  });

  describe("ler (GET)", () => {
    const hoje = hojeBrasilia();
    const versao = { versaoId: 3, numeroVersao: 3, urlBlob: "https://conta.blob.core.windows.net/documentos-institucionais/doc-3", dataVigencia: "2026-01-01", documentoOrigemId: 12, totalArtigos: 100, artigosTocados: 4 };
    const regrasLeitura = () => {
      quando(/WHERE DataVigencia <= @data/, [versao]);
      quando(/FROM Documentos d/, [{ documentoId: 12, descricao: "Rascunho de alteração do Art. 5", registradoEm: "2026-09-30" }]);
      quando(/FROM ParametrosTextoMestre/, [{ data: "2024-01-01" }]);
      quando(/FROM TextoMestreVersoes ORDER BY DataVigencia DESC/, [{ versaoId: 3 }, { versaoId: 4 }]);
      quando(/FROM TextoMestreVersoes WHERE VersaoId = @id/, [versao]);
    };
    test("SEM sessão: só a versão vigente de HOJE (número, data e link assinado); nada de histórico, pendências, revisão, ids internos nem URL crua do blob", async () => {
      regrasLeitura();
      const r = await chamar(hTextoMestre, {});
      expect(r.status).toBe(200);
      expect(Object.keys(r.body)).toEqual(["vigente"]);
      expect(r.body.vigente).toEqual({ numeroVersao: 3, dataVigencia: "2026-01-01", urlAssinada: `${versao.urlBlob}?sas` });
      expect(rodou(/FROM Documentos d/)).toHaveLength(0);
      expect(rodou(/FROM ParametrosTextoMestre/)).toHaveLength(0);
      expect(mockConsultas).toHaveLength(1);                                        // só a consulta da versão vigente (nenhuma do histórico)
      expect(mockConsultas[0].sql).toMatch(/WHERE DataVigencia <= @data/);
      expect(mockConsultas[0].inputs.data).toBe(hoje);
    });
    test("SEM sessão e sem versão vigente: vigente null", async () => {
      const r = await chamar(hTextoMestre, {});
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ vigente: null });
    });
    test("SEM sessão, ?data= qualquer dia que não seja hoje (futuro = rascunho ainda não vigente; passado = histórico): 401 sem consulta", async () => {
      regrasLeitura();
      for (const data of ["2099-01-01", "2020-01-01", "2026-12-31"]) {
        if (data === hoje) continue;
        expect((await chamar(hTextoMestre, { query: { data } })).status).toBe(401);
      }
      expect(mockConsultas).toHaveLength(0);
    });
    test("SEM sessão, ?data= de hoje é igual ao padrão; data malformada: 400 sem consulta", async () => {
      regrasLeitura();
      expect((await chamar(hTextoMestre, { query: { data: hoje } })).status).toBe(200);
      mockConsultas.length = 0;
      for (const data of ["amanha", "2026-13-45", "x'; DROP TABLE a;--"]) expect((await chamar(hTextoMestre, { query: { data } })).status).toBe(400);
      expect(mockConsultas).toHaveLength(0);
    });
    test("SEM sessão, uma versão por número: 401 sem consulta", async () => {
      regrasLeitura();
      for (const id of [3, "3", 1, 999]) expect((await chamar(hTextoMestre, { ligado: { id } })).status).toBe(401);
      expect(mockConsultas).toHaveLength(0);
    });
    test("sessão provisória (só serve para criar o PIN) conta como SEM sessão", async () => {
      regrasLeitura();
      const provisoria = tokenDe({ via: "PIN", pinProvisorio: true });
      expect((await chamar(hTextoMestre, { token: provisoria, ligado: { id: 3 } })).status).toBe(401);
      const r = await chamar(hTextoMestre, { token: provisoria });
      expect(Object.keys(r.body)).toEqual(["vigente"]);
    });
    test("COM sessão (qualquer membro logado, como em GestaoDocumentos): painel completo, data futura e versão por número", async () => {
      regrasLeitura();
      const r = await chamar(hTextoMestre, { token: pin() });
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["historico", "pendenciasAtualizacao", "revisaoQuadrienal", "vigente"]);
      expect(r.body.historico).toHaveLength(2);
      expect(r.body.pendenciasAtualizacao).toHaveLength(1);
      expect(r.body.vigente.urlAssinada).toBe(`${versao.urlBlob}?sas`);
      const futura = await chamar(hTextoMestre, { token: pin(), query: { data: "2099-01-01" } });
      expect(futura.status).toBe(200);
      const porId = await chamar(hTextoMestre, { token: pin(), ligado: { id: 3 } });
      expect(porId.status).toBe(200);
      expect(porId.body.numeroVersao).toBe(3);
    });
    test("COM sessão, versão por id malformado ou inexistente: a mesma resposta 'não encontrada', sem consulta para o id malformado", async () => {
      const NAO_ENCONTRADA = { sucesso: false, mensagem: "Versão não encontrada." };
      const inexistente = await chamar(hTextoMestre, { token: pin(), ligado: { id: 998 } });           // sem regra: o banco devolve vazio
      expect(inexistente.status).toBe(200);
      expect(inexistente.body).toEqual(NAO_ENCONTRADA);
      expect(mockConsultas).toHaveLength(1);
      mockConsultas.length = 0;
      for (const id of ["abc", "1e1", "05", "-1", "0x10"]) expect((await chamar(hTextoMestre, { token: pin(), ligado: { id } })).body).toEqual(NAO_ENCONTRADA);
      expect(mockConsultas).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 9. Relatórios consolidados: o que passou a valer além da porta
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("relatórios consolidados", () => {
  test("Tesoureiro Local/de Área/de Distrito (financeiro, nível local) NÃO vê nenhum dos 5 consolidados de Tesouraria", async () => {
    const rotas = [[hDemonstracoes, { query: { tipo: "balanco", dataCorte: "2026-12-31" } }], [hDossie, { ligado: { ano: "2026" } }], [hImunidade, {}], [hInforme, { ligado: { ano: "2026" } }], [hSituacao, {}]];
    for (const nivel of ["CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO"]) {
      for (const [handler, args] of rotas) {
        const r = await chamar(handler, { ...args, token: tokenDe({ via: "SENHA", nivel, escopoCongregacoes: ["A"], permissoes: ["financeiro"] }) });
        expect(r.status).toBe(403);
      }
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("Líder Geral de Departamento (escopo TODAS, nível DEPARTAMENTO) e quem age por delegação (mantém o nível do próprio papel) não são gerais", async () => {
    const lider = tokenDe({ via: "SENHA", nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: ["financeiro", "auditoria", "reunioes"] });
    for (const handler of [hSituacao, hIndicadores, hImunidade]) expect((await chamar(handler, { token: lider })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("Informe de Rendimentos: o geral lê e a consulta (CPF de todos os ministros) fica na trilha; ano absurdo: 400", async () => {
    const r = await chamar(hInforme, { token: geral(["financeiro"]), ligado: { ano: "2025" } });
    expect(r.status).toBe(200);
    expect(r.body.anoReferencia).toBe(2025);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "InformeRendimentos", registroId: 2025, acao: "Consultou o informe anual de rendimentos", usuarioId: 5 }));
    registrarAuditoria.mockClear();
    mockConsultas.length = 0;
    expect((await chamar(hInforme, { token: geral(["financeiro"]), ligado: { ano: "99999" } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("Informe de Rendimentos recusado (local) não deixa linha na trilha", async () => {
    await chamar(hInforme, { token: local(["financeiro"]), ligado: { ano: "2025" } });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("Dossiê fiscal e Demonstrações: ano/datas absurdos ou malformados: 400 (antes: erro 500)", async () => {
    expect((await chamar(hDossie, { token: geral(["financeiro"]), ligado: { ano: "99999" } })).status).toBe(400);
    for (const query of [{ tipo: "balanco", dataCorte: "ontem" }, { tipo: "balanco", dataCorte: "2026-02-30" }, { tipo: "drp", dataInicio: "2026-01-01", dataFim: "fim do ano" }, { tipo: "fluxocaixa", dataInicio: "x", dataFim: "2026-12-31" }]) {
      expect((await chamar(hDemonstracoes, { token: geral(["financeiro"]), query })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o geral lê a Situação do Tesouro e o Dossiê (dados reais passam pela porta)", async () => {
    quando(/FROM FechamentosTesouraria f/, [{ totalItens: 0, totalBase: 0 }]);
    expect((await chamar(hSituacao, { token: geral(["financeiro"]) })).status).toBe(200);
    expect((await chamar(hDossie, { token: geral(["financeiro"]), ligado: { ano: "2026" } })).status).toBe(200);
    expect((await chamar(hIndicadores, { token: geral(["auditoria"]) })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 10. RelatorioProgressoPdq: continua aberto ao Pastor de Área (AGO); só o id é validado
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("RelatorioProgressoPdq", () => {
  const regras = () => { quando(/FROM PdqPlanos WHERE PlanoId = @id/, [{ Titulo: "PDQ 2026-2030", AnoInicio: 2026, AnoFim: 2030, Status: "VIGENTE" }]); quando(/FROM PdqEixos/, []); };
  test("sem sessão: 401; sessão de PIN: 403", async () => {
    expect((await chamar(hPdq, { ligado: { planoId: 1 } })).status).toBe(401);
    expect((await chamar(hPdq, { ligado: { planoId: 1 }, token: pin() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test.each([["Pastor de Área (assembleia)", area(["assembleia"])], ["Tesoureiro Local (financeiro)", local(["financeiro"])], ["o geral (cli)", geral(["cli"])]])("%s lê o relatório (não foi restringido)", async (_p, token) => {
    regras();
    const r = await chamar(hPdq, { ligado: { planoId: 1 }, token });
    expect(r.status).toBe(200);
    expect(r.body.titulo).toBe("PDQ 2026-2030");
    expect(r.body.planoId).toBe(1);
  });
  test("quem não tem cli, financeiro nem assembleia é recusado", async () => {
    expect((await chamar(hPdq, { ligado: { planoId: 1 }, token: local(["pessoas", "reunioes"]) })).status).toBe(403);
  });
  test("planoId malformado: a mesma resposta de plano inexistente, sem consulta (antes: erro do driver)", async () => {
    for (const planoId of ["abc", "1e1", "05", "-1", "0x10", "1.5"]) {
      const r = await chamar(hPdq, { ligado: { planoId }, token: area(["assembleia"]) });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ sucesso: false, mensagem: "Plano PDQ não encontrado." });
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("planoId inexistente: a mesma resposta", async () => {
    const r = await chamar(hPdq, { ligado: { planoId: 777 }, token: area(["assembleia"]) });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Plano PDQ não encontrado." });
  });
});
