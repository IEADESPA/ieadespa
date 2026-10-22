const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
// URL pública do sistema de governança — não é segredo (mesmo padrão da SolicitarCodigoConta).
const SISTEMA_API_URL = "https://app.ieadespa.org.br/api";
const MAX_TEXTO = 500;
const MAX_NOME = 80;

/*
 * v7.11.1 — o envio do mural de oração passa por aqui (antes o navegador
 * gravava direto no Directus, com a permissão pública de criar item).
 *
 * 1. Grava o pedido em `mural_oracao` com o token de admin, como sempre
 *    (aguardando moderação; o confidencial vai para a aba "Confidenciais").
 * 2. Avisa o sistema (servidor a servidor, `/api/cuidado-pastoral-site`, com
 *    a chave combinada CHAVE_SITE_SISTEMA no cabeçalho x-site-key). O sistema
 *    confere o SINAL DE RISCO (as mesmas palavras do cuidado pastoral): o
 *    confidencial e o com risco entram na fila do cuidado pastoral do nível
 *    geral, e com risco a Diretoria é avisada na hora.
 * 3. Com risco, o pedido vira confidencial aqui também: nunca é publicado no
 *    mural, e a pessoa vê na hora os telefones do CVV (188) e da polícia (190).
 *
 * Se o sistema não responder, o pedido fica só no Directus, como antes (a
 * pessoa não perde o que escreveu); o 188 e o 190 aparecem na página sempre.
 */
async function avisarSistema(dados, log) {
  const chave = process.env.CHAVE_SITE_SISTEMA;
  if (!chave) {
    log.warn("CHAVE_SITE_SISTEMA ausente: o pedido do mural não foi ao cuidado pastoral do sistema.");
    return null;
  }
  try {
    const res = await fetch(`${SISTEMA_API_URL}/cuidado-pastoral-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-site-key": chave },
      body: JSON.stringify(dados),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      if (res.status === 401) log.warn("O sistema recusou a chave do site (CHAVE_SITE_SISTEMA diferente nos dois aplicativos do Azure?): o pedido do mural não foi ao cuidado pastoral.");
      else log.warn(`O sistema respondeu ${res.status} ao pedido do mural.`);
      return null;
    }
    const data = await res.json();
    return { risco: data.risco === true, gravado: data.gravado === true };
  } catch (e) {
    log.warn("O sistema não respondeu ao pedido do mural:", e && e.name);
    return null;
  }
}

module.exports = async function (context, req) {
  const log = Object.assign((...a) => context.log(...a), { warn: (...a) => (context.log.warn || context.log)(...a), error: (...a) => (context.log.error || context.log)(...a) });
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
  if (!permitir(`enviar-pedido-mural:${ipDoPedido(req)}`, 10)) return responder(429, { erro: "Muitas tentativas. Aguarde alguns minutos." });

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    return responder(500, { erro: "Configuração ausente." });
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  // Honeypot: bot preencheu o campo escondido — finge que deu certo, sem gravar nada.
  if (typeof body.site === "string" && body.site !== "") return responder(200, { ok: true, risco: false, confidencial: false });

  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!texto || texto.length > MAX_TEXTO) return responder(400, { erro: `Escreva o pedido (até ${MAX_TEXTO} letras).` });
  if (body.nome != null && typeof body.nome !== "string") return responder(400, { erro: "Nome inválido." });
  if (nome.length > MAX_NOME) return responder(400, { erro: `O nome pode ter até ${MAX_NOME} letras.` });
  if (typeof body.confidencial !== "boolean") return responder(400, { erro: "Pedido inválido." });
  if (body.consentimento !== true) return responder(400, { erro: "É preciso marcar a autorização para enviar o pedido." });
  const confidencial = body.confidencial;

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };
  let itemId = null;
  try {
    const criar = await fetch(`${DIRECTUS_URL}/items/mural_oracao?fields=id`, {
      method: "POST",
      headers,
      body: JSON.stringify({ texto, nome: nome || null, confidencial, consentimento_lgpd: true }),
    });
    if (criar.ok) itemId = Number((await criar.json()).data?.id) || null;
    else log.error("Falha ao gravar o pedido do mural no Directus:", criar.status);
  } catch (e) {
    log.error("Falha ao gravar o pedido do mural no Directus:", e && e.name);
  }

  const sistema = await avisarSistema({ texto, nome: nome || null, confidencial, ...(itemId ? { siteItemId: itemId } : {}) }, log);
  const risco = !!(sistema && sistema.risco);

  // Com risco, nunca vai ao mural público: marca como confidencial (a moderação não tem "Aprovar" para confidencial).
  if (risco && !confidencial && itemId) {
    try {
      const patch = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${itemId}`, { method: "PATCH", headers, body: JSON.stringify({ confidencial: true }) });
      if (!patch.ok) log.error("Falha ao marcar como confidencial o pedido do mural com risco:", patch.status);
    } catch (e) {
      log.error("Falha ao marcar como confidencial o pedido do mural com risco:", e && e.name);
    }
  }

  // Sem o Directus e sem o sistema guardar, o pedido se perdeu: a pessoa tenta de novo.
  if (!itemId && !(sistema && sistema.gravado)) return responder(502, { erro: "Não foi possível enviar agora. Tente novamente em instantes.", risco });
  return responder(200, { ok: true, risco, confidencial: confidencial || risco });
};
