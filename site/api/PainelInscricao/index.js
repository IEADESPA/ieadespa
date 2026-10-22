const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { montarAlteracao, perfilPode, CAMPOS_RESPOSTA } = require("../src/lib/auditoriaPagamento");

/*
 * Ações do painel de inscritos que precisam de "quem e quando" (v7.13, 22/10/2026): marcar/desmarcar PAGO, dar/tirar CORTESIA (motivo + quem autorizou) e mudar o TIPO DE
 * PARTICIPANTE do crachá. Rota `POST /api/painel-inscricao`, com o token do painel no cabeçalho `x-painel-token` (o `Authorization` pode ser mexido pelo proxy do Static Web
 * Apps; ver `TelefonePedido`).
 *
 * Por que uma função e não o navegador gravando direto: o "quem" não pode vir da tela. Aqui:
 *   1. com o token DA PESSOA: `GET /users/me` (quem é), `GET /permissions/me` (o perfil pode alterar pagamento?) e a própria inscrição (o perfil enxerga esta inscrição?);
 *   2. as regras de `auditoriaPagamento.js` montam os campos (o nome e o id saem do passo 1, a hora do servidor);
 *   3. grava com o token de administrador — os campos de auditoria podem ficar fechados para o perfil da equipe no Directus, e mesmo assim esta rota grava.
 * Quem o Directus não deixaria alterar a inscrição recebe 403 aqui também.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const LIMITE_POR_IP = 120; // 5 min — a equipe confere uma lista inteira de uma vez
const camposConferidos = new Set(); // campos do esquema v7.13 que esta instância já viu existirem

const cabecalhoDe = (req, nome) => { const k = Object.keys(req.headers || {}).find((c) => c.toLowerCase() === nome); return k ? String(req.headers[k]) : ""; };

module.exports = async function (context, req) {
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
  if (!permitir(`painel-inscricao:${ipDoPedido(req)}`, LIMITE_POR_IP)) return responder(429, { erro: "Muitas tentativas. Aguarde alguns minutos." });
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    return responder(500, { erro: "Configuração ausente." });
  }
  const token = (cabecalhoDe(req, "x-painel-token") || cabecalhoDe(req, "authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder(401, { erro: "Entre no painel de novo." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const inscricaoId = Number(body.inscricaoId);
  if (!Number.isInteger(inscricaoId) || inscricaoId <= 0) return responder(400, { erro: "Inscrição inválida." });
  if (!["pago", "cortesia", "tipo"].includes(body.acao)) return responder(400, { erro: "Ação inválida." });

  const daPessoa = (caminho) => fetch(`${DIRECTUS_URL}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  let eu;
  let permissoes;
  try {
    const [rEu, rPerm, rItem] = await Promise.all([
      daPessoa("/users/me?fields=id,first_name,last_name,email"),
      daPessoa("/permissions/me"),
      daPessoa(`/items/inscricoes_eventos/${inscricaoId}?fields=id`),
    ]);
    if (rEu.status === 401 || rEu.status === 403) return responder(401, { erro: "Sua sessão do painel não vale mais. Entre de novo." });
    if (!rEu.ok || !rPerm.ok) return responder(502, { erro: "Não foi possível conferir seu acesso agora. Tente de novo." });
    if (rItem.status === 403 || rItem.status === 404) return responder(404, { erro: "Inscrição não encontrada (ou seu perfil não pode vê-la)." });
    if (!rItem.ok) return responder(502, { erro: "Não foi possível conferir a inscrição agora. Tente de novo." });
    eu = (await rEu.json()).data;
    permissoes = (await rPerm.json()).data;
    // Um perfil sem acesso ao painel do Directus pode não enxergar o próprio nome em /users/me (medido na réplica local: só o id volta). O id saiu do token da pessoa;
    // o nome é lido com o token de administrador PARA ESSE id — continua impossível escrever o nome de outro.
    if (eu && eu.id && !eu.first_name && !eu.last_name && !eu.email) {
      const rNome = await fetch(`${DIRECTUS_URL}/users/${encodeURIComponent(eu.id)}?fields=id,first_name,last_name,email`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
      if (rNome.ok) eu = { ...eu, ...((await rNome.json()).data || {}), id: eu.id };
    }
  } catch (e) {
    context.log.error("Falha ao conferir o acesso:", e);
    return responder(502, { erro: "Não foi possível conferir seu acesso agora. Tente de novo." });
  }
  if (!perfilPode(permissoes, body.acao)) return responder(403, { erro: "Seu perfil não pode alterar o pagamento das inscrições." });

  const alteracao = montarAlteracao(body, eu);
  if (alteracao.erro) return responder(400, { erro: alteracao.erro });

  // O Directus ignora em silêncio campo que não existe: sem o esquema v7.13 o "pago" mudaria e o "quem e quando" sumiria. Confere ANTES de gravar (uma vez por instância).
  const conferir = body.acao === "pago" ? "pago_conferido_valor" : body.acao === "cortesia" ? "cortesia_registrada_valor" : "tipo_participante";
  if (!camposConferidos.has(conferir)) {
    const rc = await fetch(`${DIRECTUS_URL}/fields/inscricoes_eventos/${conferir}`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } }).catch(() => null);
    if (!rc || rc.status === 403 || rc.status === 404) {
      context.log.error(`O campo ${conferir} não existe: aplique site/scripts/directus-eventos-v713-esquema.mjs`);
      return responder(503, { erro: "O registro de quem confirmou ainda não está disponível neste Directus. Avise o responsável pelo site. Nada foi alterado." });
    }
    if (!rc.ok) return responder(502, { erro: "Não foi possível conferir agora. Tente de novo." });
    camposConferidos.add(conferir);
  }

  // Revisão de 22/10/2026: "tirar a cortesia" de quem não tem cortesia não grava nada (senão ficaria um "cortesia tirada por…" que nunca existiu).
  if (body.acao === "cortesia" && body.ativa === false) {
    const ra = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${inscricaoId}?fields=*`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
    if (!ra.ok) return responder(502, { erro: "Não foi possível conferir a inscrição agora. Tente de novo." });
    if (((await ra.json()).data || {}).cortesia !== true) return responder(409, { erro: "Esta inscrição não tem cortesia: não há o que tirar." });
  }

  const r = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${inscricaoId}?fields=${CAMPOS_RESPOSTA}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(alteracao.campos),
  });
  if (!r.ok) {
    context.log.error(`Falha ao gravar ${body.acao} na inscrição ${inscricaoId}: ${r.status}`);
    return responder(502, { erro: "Não foi possível gravar agora. Tente de novo." });
  }
  const gravado = (await r.json().catch(() => ({}))).data || {};
  context.log(`inscrição ${inscricaoId}: ${body.acao} por ${eu.id}`);
  return responder(200, { ok: true, inscricao: gravado });
};
