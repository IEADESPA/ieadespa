const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { verificar } = require("../lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 23 (enquetes) — resultado só aparece pra quem já votou (ou quando a
 * enquete já encerrou, aí aparece pra todo mundo). Antes disso, sem token
 * válido ou sem voto registrado, devolve só se a pessoa já votou (não), sem
 * contagem nenhuma — não dá pra "espiar" o resultado sem participar.
 */
app.http("consultar-enquete", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "consultar-enquete",
  handler: async (request, context) => {
    if (!permitir(`enquete-consultar:${ipDoPedido(request)}`)) {
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

    const enqueteId = Number(body?.enqueteId);
    if (!Number.isInteger(enqueteId) || enqueteId <= 0) {
      return { status: 400, jsonBody: { erro: "Enquete inválida." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

    const enqueteRes = await fetch(
      `${DIRECTUS_URL}/items/enquetes/${enqueteId}?fields=id,opcoes,ativa,encerra_em`,
      { headers },
    );
    if (!enqueteRes.ok) {
      return { status: 404, jsonBody: { erro: "Enquete não encontrada." } };
    }
    const enquete = (await enqueteRes.json()).data;
    const encerrada = !enquete.ativa || (enquete.encerra_em && new Date(enquete.encerra_em).getTime() <= Date.now());

    const email = verificar(body?.token);
    let jaVotou = false;
    let opcaoVotada = null;

    if (email) {
      const votoRes = await fetch(
        `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
        { headers },
      );
      const votoExistente = votoRes.ok ? (await votoRes.json()).data?.[0] : null;
      if (votoExistente) {
        jaVotou = true;
        opcaoVotada = votoExistente.opcao;
      }
    }

    if (!jaVotou && !encerrada) {
      return { jsonBody: { jaVotou: false, opcaoVotada: null, encerrada, contagens: null } };
    }

    const votosRes = await fetch(
      `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&fields=opcao&limit=-1`,
      { headers },
    );
    const votos = votosRes.ok ? (await votosRes.json()).data || [] : [];
    const contagens = enquete.opcoes.map((_, indice) => votos.filter((v) => v.opcao === indice).length);

    return { jsonBody: { jaVotou, opcaoVotada, encerrada, contagens } };
  },
});
