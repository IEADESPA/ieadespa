const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

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
app.http("orar-mural", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "orar-mural",
  handler: async (request, context) => {
    if (!permitir(`orar-mural:${ipDoPedido(request)}`)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
      context.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return { status: 400, jsonBody: { erro: "Id inválido." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    const atualRes = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${id}?fields=orando_count`, { headers });
    if (!atualRes.ok) {
      return { status: 404, jsonBody: { erro: "Pedido não encontrado." } };
    }
    const atual = (await atualRes.json()).data;
    const novoCount = Number(atual?.orando_count ?? 0) + 1;

    const patchRes = await fetch(`${DIRECTUS_URL}/items/mural_oracao/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ orando_count: novoCount }),
    });
    if (!patchRes.ok) {
      context.error("Falha ao gravar contador no Directus:", patchRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao registrar." } };
    }

    return { jsonBody: { orandoCount: novoCount } };
  },
});
