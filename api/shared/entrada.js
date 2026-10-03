// shared/entrada.js (v7.6) — PONTO ÚNICO DE ENTRADA de toda rota HTTP.
//
// Cada function.json com gatilho httpTrigger aponta `"scriptFile": "../shared/entrada.js"`. O host carrega ESTE módulo (uma vez, o mesmo para todas as funções)
// e chama `module.exports(context, req)`; aqui se descobre qual função foi chamada pela pasta dela (context.executionContext.functionDirectory, com o
// functionName de reserva), carrega o index.js daquela pasta (require, com cache) e repassa a chamada sem mudar nada.
//
// Por que existir: a sessão passou a ser revogável (shared/auth.js, "SESSÃO REVOGÁVEL"). getSessao/exigirLogin são síncronos e ~180 handlers os chamam sem
// await, quase todos ANTES de abrir o banco — então a lista de sessões encerradas precisa estar em memória ANTES do handler rodar. É isso que se faz aqui:
// `await auth.sincronizarRevogacoes()` (relê no máximo a cada 3 s; bloqueia só na primeira vez). Requisição sem token não espera nada (não há sessão a
// conferir). Sem lista confiável (banco fora há mais de 60 s), a resposta é 503 — falha FECHADO: um token derrubado não pode voltar a valer porque o banco caiu.
//
// O teste shared/__tests__/entradaUnica.test.js falha se algum function.json HTTP não usar este arquivo, e carrega o handler de TODAS as pastas por aqui.
const path = require("path");
const auth = require("./auth");

const RAIZ_API = path.resolve(__dirname, "..");
const NOME_DE_FUNCAO = /^[A-Za-z0-9_-]+$/;
const handlers = new Map();

// Só o NOME da pasta é usado (nunca o caminho inteiro): o handler sempre sai de <raiz da api>/<pasta>/index.js — um caminho estranho não carrega arquivo de fora.
function pastaDaFuncao(context) {
  const ec = (context && context.executionContext) || {};
  const candidatos = [ec.functionDirectory ? path.basename(String(ec.functionDirectory)) : null, ec.functionName ? String(ec.functionName) : null];
  for (const nome of candidatos) if (nome && NOME_DE_FUNCAO.test(nome) && nome !== "shared") return nome;
  return null;
}

function carregarHandler(context) {
  const pasta = pastaDaFuncao(context);
  if (!pasta) throw new Error("Ponto de entrada: não consegui identificar a função chamada.");
  if (handlers.has(pasta)) return handlers.get(pasta);
  const handler = require(path.join(RAIZ_API, pasta, "index.js"));
  if (typeof handler !== "function") throw new Error(`Ponto de entrada: ${pasta}/index.js não exporta uma função.`);
  handlers.set(pasta, handler);
  return handler;
}

module.exports = async function entrada(context, ...args) {
  const handler = carregarHandler(context);
  const req = args[0];
  if (auth.extrairToken(req)) {
    try {
      await auth.sincronizarRevogacoes();
    } catch (e) {
      if (context && context.log && typeof context.log.error === "function") context.log.error("[entrada] lista de sessões encerradas indisponível:", e.message);
      context.res = {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "10" },
        body: { sucesso: false, mensagem: "O sistema não conseguiu conferir as sessões agora. Tente de novo em alguns segundos." }
      };
      return;
    }
  }
  return handler(context, ...args);
};

// Para os testes. NÃO enumeráveis de propósito: o exportado precisa ser, para o host, igual ao de um index.js comum (uma função sem propriedades) — um export
// com propriedades enumeráveis pode ser lido como "objeto com várias funções", e o host procuraria uma `run`/`index` que não existe.
Object.defineProperty(module.exports, "carregarHandler", { value: carregarHandler, enumerable: false });
Object.defineProperty(module.exports, "pastaDaFuncao", { value: pastaDaFuncao, enumerable: false });
