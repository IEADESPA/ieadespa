/*
 * Contador de visitas do site (16/10/2026): a regra que tira a gravação do caminho de cada visita.
 *
 * Antes, o navegador de cada visitante mandava a visita DIRETO para o Directus (`POST /items/pageviews`, com pré-voo CORS: duas
 * requisições por visita). O Directus de produção (App Service B1, um núcleo) chegava a 100 % de CPU com ~60–70 visitantes por minuto
 * só por causa disso. Agora o navegador chama a Function `RegistrarVisita` (mesma origem, sem pré-voo) e ela guarda a visita num
 * BUFFER EM MEMÓRIA; o Directus recebe UMA gravação em lote (um POST com o array de linhas) a cada 25 visitas ou a cada 10 segundos.
 *
 * Garantias (provadas em `scripts/testes/visitas-unidade.cjs`):
 *  - a visita nunca falha por causa do Directus: a gravação do lote acontece DENTRO da requisição que a disparou (depois de responder,
 *    a CPU da Function não é garantida), e qualquer falha só devolve as linhas ao buffer;
 *  - só UMA gravação por vez por instância: numa rajada, as visitas que chegam durante a gravação ficam no buffer e saem juntas na
 *    gravação seguinte, em vez de virar uma gravação por grupo de 25;
 *  - depois de uma falha, nova tentativa só passados 10 s (não martela um Directus que já está mal);
 *  - o buffer nunca passa de 500 linhas: passou disso, descarta as MAIS ANTIGAS (a memória da instância é protegida);
 *  - não há persistência: se a instância reciclar (deploy, ociosidade), perde-se o que estava no buffer — no máximo as visitas dos
 *    últimos 10 s. É só um contador; essa perda é aceita de propósito. Com pouco movimento (intervalo entre visitas > 10 s) cada visita
 *    dispara a própria gravação, então nada fica esperando.
 */

const TAMANHO_DESCARGA = 25; // chegou a 25 linhas: grava
const INTERVALO_DESCARGA_MS = 10 * 1000; // ou passaram 10 s desde a última descarga: grava
const TETO_BUFFER = 500; // nunca guarda mais que isto (descarta as mais antigas)
const LIMITE_CORPO_BYTES = 1024;
const LIMITE_PATH = 200;
const LIMITE_REFERRER = 100;
const TEMPO_LIMITE_GRAVACAO_MS = 5000;

// Robôs, pré-visualizadores de link e ferramentas de linha de comando: não são visita de pessoa.
const ROBO = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|curl|headless/i;
// Nome de host (a parte "hostname" de uma URL, como o navegador entrega): letras, números, pontos e hífens; ou um IPv6 entre colchetes.
const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const HOST_IPV6 = /^\[[0-9a-f:.]+\]$/i;

function ehRobo(userAgent) {
  return ROBO.test(String(userAgent == null ? "" : userAgent));
}

function caractereProibidoNoCaminho(codigo, caractere) {
  if (codigo < 32 || codigo === 127) return true; // controle
  if (codigo >= 0x80 && codigo <= 0x9f) return true; // controle C1
  if (codigo === 0x2028 || codigo === 0x2029) return true; // separadores de linha do Unicode
  return caractere === "?" || caractere === "#"; // consulta e âncora nunca entram (poderiam trazer dado da pessoa)
}

/** `{ ok: true, linha: { path, referrer_domain } }` ou `{ ok: false, erro }`. Só os dois campos passam; qualquer outro é ignorado. */
function validarVisita(corpo) {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "Corpo inválido." };

  const { path, referrer_domain: dominio } = corpo;
  if (typeof path !== "string" || path.length === 0 || path.length > LIMITE_PATH || path[0] !== "/") return { ok: false, erro: "Caminho inválido." };
  for (let i = 0; i < path.length; i++) {
    if (caractereProibidoNoCaminho(path.charCodeAt(i), path[i])) return { ok: false, erro: "Caminho inválido." };
  }

  let referrer = null;
  if (dominio !== undefined && dominio !== null && dominio !== "") {
    if (typeof dominio !== "string" || dominio.length > LIMITE_REFERRER || !(HOST.test(dominio) || HOST_IPV6.test(dominio))) {
      return { ok: false, erro: "Origem inválida." };
    }
    referrer = dominio.toLowerCase();
  }
  return { ok: true, linha: { path, referrer_domain: referrer } };
}

/**
 * O buffer em memória. `gravar(linhas)` recebe o array e devolve uma promessa (rejeitada = falhou).
 * `agora` é injetável para os testes. `registrar(linha)` guarda a visita e, se for a hora, grava o lote ANTES de resolver:
 * `{ descarregou, ok, linhas, erro }`.
 */
function criarRegistrador({ gravar, agora = () => Date.now(), tamanho = TAMANHO_DESCARGA, intervaloMs = INTERVALO_DESCARGA_MS, teto = TETO_BUFFER }) {
  let buffer = [];
  let ultimaDescarga = -Infinity; // ainda não houve: a primeira visita de uma instância nova já grava (com pouco movimento, nada fica esperando)
  let naoAntesDe = -Infinity; // depois de uma falha, só tenta de novo passado o intervalo
  let descarregando = false;

  function aparar() {
    if (buffer.length > teto) buffer.splice(0, buffer.length - teto); // as mais antigas saem
  }

  async function descarregar(instante) {
    descarregando = true;
    ultimaDescarga = instante;
    const lote = buffer; // pegar o lote antes de qualquer espera: quem chegar enquanto grava vai para o buffer novo
    buffer = [];
    try {
      await gravar(lote);
      return { descarregou: true, ok: true, linhas: lote.length };
    } catch (erro) {
      buffer = lote.concat(buffer); // as que falharam são mais antigas que as que chegaram durante a gravação
      aparar();
      naoAntesDe = agora() + intervaloMs;
      return { descarregou: true, ok: false, linhas: lote.length, erro };
    } finally {
      descarregando = false;
    }
  }

  async function registrar(linha) {
    buffer.push(linha);
    aparar();
    const instante = agora();
    const hora = buffer.length >= tamanho || instante - ultimaDescarga >= intervaloMs;
    if (!hora || descarregando || instante < naoAntesDe) return { descarregou: false };
    return descarregar(instante);
  }

  return { registrar, tamanhoDoBuffer: () => buffer.length, copiaDoBuffer: () => buffer.slice() };
}

/** Tamanho (bytes) do corpo como chegou: o texto cru quando a plataforma o entrega, senão o que o corpo já lido ocuparia. */
function tamanhoDoCorpo(req) {
  if (typeof req.rawBody === "string") return Buffer.byteLength(req.rawBody);
  if (typeof req.body === "string") return Buffer.byteLength(req.body);
  if (req.body && typeof req.body === "object") return Buffer.byteLength(JSON.stringify(req.body));
  return 0;
}

/** O corpo como objeto: o runtime já entrega o JSON lido; se vier texto (ex.: `text/plain` de um navegador antigo), lê aqui. */
function lerCorpo(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body === undefined ? null : req.body;
}

/** A gravação de verdade: UM POST com o array de linhas, com o token de administrador e prazo (um Directus preso não pode prender a Function). */
function gravarNoDirectus({ url, token, ms = TEMPO_LIMITE_GRAVACAO_MS }) {
  return async (linhas) => {
    const res = await fetch(`${url}/items/pageviews`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(linhas),
      signal: AbortSignal.timeout(ms),
    });
    try { await res.arrayBuffer(); } catch { /* o corpo da resposta não interessa */ }
    if (!res.ok) throw new Error(`Directus respondeu ${res.status}`);
  };
}

module.exports = {
  TAMANHO_DESCARGA, INTERVALO_DESCARGA_MS, TETO_BUFFER, LIMITE_CORPO_BYTES,
  ehRobo, validarVisita, criarRegistrador, tamanhoDoCorpo, lerCorpo, gravarNoDirectus,
};
