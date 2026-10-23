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
 * Trava 7-C (23/10/2026):
 * 4. O pedido que o sistema GUARDOU (confidencial ou com risco) perde o texto e
 *    o nome no Directus: o texto fica só no sistema (Cuidado pastoral → Pedidos
 *    de oração, nível geral). No Directus sobra a marca (confidencial, data).
 * 5. Sem resposta do sistema (fora do ar, banco acordando, chave recusada), o
 *    risco é desconhecido: o pedido vira CONFIDENCIAL por padrão (nunca vai ao
 *    mural público por engano) e ganha a marca `sistema_pendente` (a escolha
 *    original da pessoa: PUBLICO ou CONFIDENCIAL). Toda vez que o sistema
 *    responde a um envio novo, até 2 pendentes são reenviados (o sistema
 *    reconhece o mesmo item pelo número e não grava nem avisa duas vezes):
 *    guardado → perde o texto; comum sem risco → volta para a moderação de sempre.
 *    O campo `sistema_pendente` é criado pelo script
 *    site/scripts/directus-mural-pendente-esquema.mjs; sem ele, o pedido sem
 *    resposta fica confidencial (seguro) e só não é reenviado.
 *
 * Sem a chave configurada no site, nada muda: o pedido fica só no Directus,
 * como antes; o 188 e o 190 aparecem na página sempre.
 */
const TEXTO_GUARDADO_NO_SISTEMA = "(pedido guardado no sistema da Igreja: Cuidado pastoral → Pedidos de oração, nível geral)";
const MAX_REENVIOS = 2;

async function avisarSistema(dados, log, prazoMs = 8000) {
  const chave = process.env.CHAVE_SITE_SISTEMA;
  if (!chave) {
    log.warn("CHAVE_SITE_SISTEMA ausente: o pedido do mural não foi ao cuidado pastoral do sistema.");
    return { semChave: true };
  }
  try {
    const res = await fetch(`${SISTEMA_API_URL}/cuidado-pastoral-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-site-key": chave },
      body: JSON.stringify(dados),
      signal: AbortSignal.timeout(prazoMs),
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

async function alterar(headers, log, itemId, campos, rotulo) {
  try {
    const r = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${itemId}`, { method: "PATCH", headers, body: JSON.stringify(campos) });
    if (!r.ok) log.error(`Pedido do mural — falha ao ${rotulo}:`, r.status);
    return r.ok;
  } catch (e) {
    log.error(`Pedido do mural — falha ao ${rotulo}:`, e && e.name);
    return false;
  }
}
// O que o Directus guarda depois da resposta do sistema (ou da falta dela).
async function depoisDoSistema(headers, log, { itemId, confidencial, sistema }) {
  if (!itemId || (sistema && sistema.semChave)) return;
  if (sistema && sistema.gravado) {
    // o sistema guardou: o texto e o nome saem do Directus (só a marca fica)
    await alterar(headers, log, itemId, { confidencial: true, texto: TEXTO_GUARDADO_NO_SISTEMA, nome: null }, "tirar do Directus o texto guardado no sistema");
    return;
  }
  if (sistema && !sistema.risco && !confidencial) return;            // pedido comum: segue a moderação de sempre
  // sem resposta (risco desconhecido) ou o sistema não guardou um confidencial/com risco (ocupado, limite da hora): confidencial agora, e a marca para reenviar.
  // Duas gravações: a marca pode ainda não existir no Directus, e a falta dela nunca pode impedir o "confidencial".
  await alterar(headers, log, itemId, { confidencial: true }, "marcar como confidencial");
  await alterar(headers, log, itemId, { sistema_pendente: confidencial ? "CONFIDENCIAL" : "PUBLICO" }, "marcar para reenvio");
}
// Reenvia ao sistema até MAX_REENVIOS pedidos que ficaram sem resposta (o sistema acabou de responder: está de pé).
async function reenviarPendentes(headers, log, excetoId) {
  let lista = [];
  try {
    const r = await fetch(`${DIRECTUS_URL}/items/mural_oracao?filter[sistema_pendente][_nnull]=true&fields=id,texto,nome,sistema_pendente&sort=id&limit=${MAX_REENVIOS + 1}`,
      { headers, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return 0;                                                // o campo ainda não existe no Directus: nada a reenviar
    lista = ((await r.json()).data || []).filter((x) => x && x.id !== excetoId).slice(0, MAX_REENVIOS);
  } catch (e) {
    return 0;
  }
  let feitos = 0;
  for (const it of lista) {
    const original = it.sistema_pendente === "CONFIDENCIAL";
    const s = await avisarSistema({ texto: it.texto, nome: it.nome || null, confidencial: original, siteItemId: it.id }, log, 3000);
    if (!s || s.semChave) break;
    if (s.gravado) await alterar(headers, log, it.id, { confidencial: true, texto: TEXTO_GUARDADO_NO_SISTEMA, nome: null, sistema_pendente: null }, "concluir o reenvio");
    else if (!s.risco && !original) await alterar(headers, log, it.id, { confidencial: false, sistema_pendente: null }, "devolver à moderação");
    else continue;                                                      // o sistema não guardou agora (ocupado): fica para a próxima
    feitos++;
  }
  return feitos;
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
  await depoisDoSistema(headers, log, { itemId, confidencial, sistema });
  if (sistema && !sistema.semChave) await reenviarPendentes(headers, log, itemId);

  // Sem o Directus e sem o sistema guardar, o pedido se perdeu: a pessoa tenta de novo.
  if (!itemId && !(sistema && sistema.gravado)) return responder(502, { erro: "Não foi possível enviar agora. Tente novamente em instantes.", risco });
  return responder(200, { ok: true, risco, confidencial: confidencial || risco });
};
