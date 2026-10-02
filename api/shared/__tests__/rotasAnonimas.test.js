// Varredura de TODAS as rotas HTTP do sistema (cada api/*/function.json): chamada SEM sessão. Toda rota que não está na lista de rotas públicas aprovadas precisa recusar
// com 401 (ou com a recusa própria da rotina agendada). Nasceu de uma lição cara: a matrícula na URL valia como identidade em ~15 rotas "meus dados" e, mesmo depois de
// fechá-las, uma rota de enquetes (que aceitava a matrícula no CORPO) escapou da busca por "handler sem login" porque tinha login em OUTRAS ações. Rota nova que for pública
// por desenho precisa entrar na lista abaixo, com o motivo — é uma decisão consciente, não um esquecimento.
const fs = require("fs");
const path = require("path");

let mockLinhas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async () => ({ recordset: [], rowsAffected: [0] }), batch: async () => ({ recordset: [] }) }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));

const RAIZ = path.join(__dirname, "..", "..");

// Rotas que PODEM responder sem sessão, e por quê.
const PUBLICAS = {
  AgendaPublica: "agenda pública da igreja (cultos e eventos)",
  CongregacoesPublico: "lista pública de congregações e dirigentes (site)",
  ConsultarProtocoloOuvidoria: "consulta do próprio protocolo (o código é o segredo)",
  VerificarCertificado: "verificação pública de certificado (o código é o segredo; com limitador)",
  VerificarContaMembro: "chamada servidor a servidor do site; só devolve um booleano; limitador por origem + chave combinada com o site (CHAVE_SITE_SISTEMA, ver chaveSiteSistema.test.js)",
  LoginSecretaria: "porta de entrada da liderança (senha + bloqueio)",
  LogoutSecretaria: "encerrar a própria sessão",
  MembroEntrar: "porta de entrada do membro (matrícula + PIN + bloqueio)",
  SolicitarCodigoAcessoMembro: "pedir o código por e-mail (resposta genérica, com limites)",
  ConfirmarCodigoAcessoMembro: "confirmar o código por e-mail (com limites)",
  RegistrarPresenca: "check-in da Portaria: matrícula + senha da reunião dita na sala (com limitador)",
  InscricaoPush: "GET devolve só a chave pública VAPID; o resto exige sessão",
  GestaoCatalogos: "GET devolve catálogos de referência (congregações, cargos...); escrever exige permissão",
  GetOrgaos: "lista de órgãos (referência)",
  GestaoTextoMestre: "GET do texto mestre vigente (normativo público)"
};
// Rotinas agendadas: protegidas por segredo (x-cron-secret), não por sessão.
const ROTINAS = new Set(["NotificacoesAgendador", "EbdFechamentoAutomatico", "FluxosEscalonador", "AvaliarNotificacoes"]);

function rotas() {
  const saida = [];
  for (const dir of fs.readdirSync(RAIZ)) {
    const fj = path.join(RAIZ, dir, "function.json");
    if (!fs.existsSync(fj) || !fs.existsSync(path.join(RAIZ, dir, "index.js"))) continue;
    const cfg = JSON.parse(fs.readFileSync(fj, "utf8"));
    const gatilho = (cfg.bindings || []).find(b => b.type === "httpTrigger");
    if (!gatilho || gatilho.authLevel !== "anonymous") continue;
    saida.push({ dir, route: gatilho.route || "", metodos: (gatilho.methods || ["get"]).map(m => m.toUpperCase()) });
  }
  return saida;
}
// Parâmetros de rota ({id?}, {acao?}, {sigla?}, {matricula}...): cada rota decide o que fazer conforme a combinação (a Comissões só aceita sigla CCJ/PMO, a Enquetes só conhece
// algumas ações). Por isso a varredura experimenta várias combinações realistas em vez de uma só: a rota é "fechada" se NENHUMA devolve sucesso sem sessão e se ao menos uma
// chega ao 401 (prova de que a porta de sessão existe e está acessível).
// O Azure Functions entrega o segmento numérico da URL como NÚMERO (`/comissoes/1` chega como 1, não "1"): os dois formatos entram, senão um handler que chama .toUpperCase()
// no valor passa no teste e dá 500 em produção (aconteceu em GestaoComissoes).
const VALORES = [undefined, "1", 1, "x", "CCJ", "votar", "responder"];
function combinacoes(route) {
  const nomes = [...route.matchAll(/\{\*?([a-zA-Z]+)\??\}/g)].map(m => m[1]);
  let todas = [{}];
  for (const n of nomes) {
    const prox = [];
    for (const base of todas) for (const v of VALORES) prox.push(v === undefined ? base : { ...base, [n]: v });
    todas = prox;
  }
  return todas;
}

const TODAS = rotas();

test("a varredura enxerga as rotas (se vier vazia, o teste não protege nada)", () => {
  expect(TODAS.length).toBeGreaterThan(100);
  for (const nome of Object.keys(PUBLICAS)) expect(TODAS.some(r => r.dir === nome)).toBe(true);      // a lista de públicas não aponta para rota que não existe mais
});

describe.each(TODAS.filter(r => !PUBLICAS[r.dir] && !ROTINAS.has(r.dir)).map(r => [r.dir, r]))("%s sem sessão", (_nome, r) => {
  test.each(r.metodos)("%s: nunca dá sucesso sem sessão, e chega ao 401", async (metodo) => {
    const handler = require(path.join(RAIZ, r.dir, "index.js"));
    const status = new Set();
    for (const ligado of combinacoes(r.route)) {
      const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
      await handler(context, { method: metodo, query: {}, body: {}, headers: {} });
      status.add(context.res && context.res.status);
    }
    expect([...status].filter(s => !(s >= 400))).toEqual([]);          // nenhuma combinação devolveu sucesso (ou ficou sem resposta)
    expect(status.has(401)).toBe(true);                                // e a porta de sessão responde
  });
});

describe.each([...ROTINAS].filter(n => TODAS.some(r => r.dir === n)))("rotina agendada %s", (nome) => {
  test("sem o segredo da rotina: 401", async () => {
    const handler = require(path.join(RAIZ, nome, "index.js"));
    const r = TODAS.find(x => x.dir === nome);
    const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
    await handler(context, { method: r.metodos[0], query: {}, body: {}, headers: {} });
    expect(context.res && context.res.status).toBe(401);
  });
});

describe("as rotas públicas que ainda têm ação protegida", () => {
  test("GestaoCatalogos: escrever sem sessão é 401", async () => {
    const handler = require(path.join(RAIZ, "GestaoCatalogos", "index.js"));
    const context = { bindingData: { catalogo: "congregacoes" }, log: { error() {} } };
    await handler(context, { method: "POST", query: {}, body: { nome: "x" }, headers: {} });
    expect(context.res.status).toBe(401);
  });
  test("InscricaoPush: inscrever/remover sem sessão é 401", async () => {
    const handler = require(path.join(RAIZ, "InscricaoPush", "index.js"));
    for (const metodo of ["POST", "DELETE"]) {
      const context = { bindingData: {}, log: { error() {} } };
      await handler(context, { method: metodo, query: {}, body: {}, headers: {} });
      expect(context.res.status).toBe(401);
    }
  });
});
