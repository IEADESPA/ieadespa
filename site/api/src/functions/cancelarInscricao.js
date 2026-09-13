const { app } = require("@azure/functions");
const { conferirHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

const norm = (v) => String(v || "").trim().toLowerCase();

/*
 * Fase 21 (eventos customizáveis): dos gaps reais confirmados contra
 * Sympla/Even3/Eventbrite, este é o que o usuário escolheu construir agora —
 * cancelamento pela própria pessoa (sem depender da equipe), com promoção
 * automática de quem está na lista de espera. Mesma verificação de
 * identidade já usada em certificado/qrcode/crachá (código + telefone
 * conferido por hash, nunca texto puro — ver `verificar-inscricao.js`), e a
 * mesma ordem de exclusão já usada em `painel-eventos/evento/inscritos.astro`
 * (respostas do formulário antes da inscrição em si).
 */
app.http("cancelar-inscricao", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cancelar-inscricao",
  handler: async (request, context) => {
    const chave = `cancelar:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
      context.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const { evento, codigo, telefone } = body || {};
    if (!evento || !codigo || !telefone) {
      return { status: 400, jsonBody: { erro: "Parâmetros ausentes." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

    const rosterRes = await fetch(
      `${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${encodeURIComponent(evento)}&fields=id,codigo,telefone,aguardando_vaga&limit=-1`,
      { headers },
    );
    if (!rosterRes.ok) {
      context.error("Falha ao buscar roster no Directus:", rosterRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao consultar inscrições." } };
    }
    const roster = (await rosterRes.json()).data || [];

    const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
    if (!registro || !conferirHash(telefone, registro.telefone)) {
      return { jsonBody: { cancelado: false } };
    }

    const respostasRes = await fetch(
      `${DIRECTUS_URL}/items/respostas_inscricao?filter[inscricao][_eq]=${registro.id}&fields=id`,
      { headers },
    );
    const respostas = respostasRes.ok ? (await respostasRes.json()).data || [] : [];
    if (respostas.length) {
      await fetch(`${DIRECTUS_URL}/items/respostas_inscricao`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(respostas.map((r) => r.id)),
      });
    }

    const delRes = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${registro.id}`, {
      method: "DELETE",
      headers,
    });
    if (!delRes.ok) {
      context.error("Falha ao excluir inscrição:", delRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao cancelar." } };
    }

    // Só existe alguém na lista de espera se o evento já estava com vaga
    // esgotada (é a única forma de `aguardando_vaga` virar true no cadastro)
    // — então só faz sentido promover quando a vaga cancelada era uma vaga
    // CONFIRMADA de verdade, nunca quando quem cancelou já estava na fila.
    let promovido = false;
    if (!registro.aguardando_vaga) {
      const esperaRes = await fetch(
        `${DIRECTUS_URL}/items/inscricoes_eventos?filter[_and][0][evento][_eq]=${encodeURIComponent(evento)}&filter[_and][1][aguardando_vaga][_eq]=true&sort=date_created&fields=id&limit=1`,
        { headers },
      );
      const espera = esperaRes.ok ? (await esperaRes.json()).data || [] : [];
      if (espera.length) {
        const promoRes = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${espera[0].id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ aguardando_vaga: false }),
        });
        promovido = promoRes.ok;
      }
    }

    return { jsonBody: { cancelado: true, promovido } };
  },
});
