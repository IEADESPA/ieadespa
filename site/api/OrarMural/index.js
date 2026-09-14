const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Bug real encontrado numa revisão geral (ver README, Mural de oração): o
 * contador "orando por você" era incrementado por um PATCH público direto em
 * `orando_count`, com o número calculado no PRÓPRIO NAVEGADOR de quem clicou
 * — dava pra chamar a API do Directus manualmente e definir qualquer valor
 * (defacement), sem precisar nem clicar no botão. Esta Function substitui
 * esse PATCH direto: o incremento (sempre +1, nunca um valor vindo do
 * cliente) é calculado aqui, com o token de admin — a permissão pública de
 * `update` em `mural_oracao` foi removida do Directus, então agora não existe
 * mais nenhum jeito de escrever `orando_count` a não ser por aqui.
 *
 * Continua não exigindo login (mesmo espírito do resto do site) — o limite
 * por IP (ver `rateLimit.js`) reduz, mas não elimina, alguém inflar o
 * contador clicando várias vezes de navegadores diferentes; aceitável pro
 * que é (um contador informal de intercessão, não um dado sensível ou
 * financeiro) — o que importava corrigir de verdade era a possibilidade de
 * definir um valor arbitrário.
 */
module.exports = async function (context, req) {
  if (!permitir(`orar-mural:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    context.res = { status: 400, body: { erro: "Id inválido." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const atualRes = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${id}?fields=orando_count`, { headers });
  if (!atualRes.ok) {
    context.res = { status: 404, body: { erro: "Pedido não encontrado." } };
    return;
  }
  const atual = (await atualRes.json()).data;
  const novoCount = Number(atual?.orando_count ?? 0) + 1;

  const patchRes = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ orando_count: novoCount }),
  });
  if (!patchRes.ok) {
    context.log.error("Falha ao gravar contador no Directus:", patchRes.status);
    context.res = { status: 502, body: { erro: "Falha ao registrar." } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { orandoCount: novoCount } };
};
