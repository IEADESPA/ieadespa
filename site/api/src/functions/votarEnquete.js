const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { verificar } = require("../lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 23 (enquetes) — voto exige sessão válida da Minha Conta (Fase 26):
 * é o e-mail contido no token assinado, nunca um e-mail cru mandado pelo
 * navegador, que impede voto duplicado (um voto por e-mail por enquete,
 * checado aqui antes de gravar). Sem isso não existe jeito confiável de
 * impedir voto repetido — era exatamente o motivo da enquete ter ficado
 * esperando a Fase 26 existir (ver README).
 */
app.http("votar-enquete", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "votar-enquete",
  handler: async (request, context) => {
    if (!permitir(`enquete-votar:${ipDoPedido(request)}`)) {
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

    const email = verificar(body?.token);
    if (!email) {
      return { status: 401, jsonBody: { erro: "Entre na Minha Conta para votar." } };
    }

    const enqueteId = Number(body?.enqueteId);
    const opcao = Number(body?.opcao);
    if (!Number.isInteger(enqueteId) || enqueteId <= 0 || !Number.isInteger(opcao) || opcao < 0) {
      return { status: 400, jsonBody: { erro: "Parâmetros inválidos." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    const enqueteRes = await fetch(
      `${DIRECTUS_URL}/items/enquetes/${enqueteId}?fields=id,opcoes,ativa,encerra_em`,
      { headers },
    );
    if (!enqueteRes.ok) {
      return { status: 404, jsonBody: { erro: "Enquete não encontrada." } };
    }
    const enquete = (await enqueteRes.json()).data;
    const encerrada = !enquete.ativa || (enquete.encerra_em && new Date(enquete.encerra_em).getTime() <= Date.now());
    if (encerrada) {
      return { status: 409, jsonBody: { erro: "Esta enquete já foi encerrada." } };
    }
    if (opcao >= enquete.opcoes.length) {
      return { status: 400, jsonBody: { erro: "Opção inválida." } };
    }

    const votoRes = await fetch(
      `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
      { headers },
    );
    const votoExistente = votoRes.ok ? (await votoRes.json()).data?.[0] : null;
    if (votoExistente) {
      return { status: 409, jsonBody: { erro: "Você já votou nesta enquete." } };
    }

    const criarRes = await fetch(`${DIRECTUS_URL}/items/enquete_votos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ enquete: enqueteId, opcao, email }),
    });
    if (!criarRes.ok) {
      context.error("Falha ao gravar voto no Directus:", criarRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao registrar voto." } };
    }

    const votosRes = await fetch(
      `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&fields=opcao&limit=-1`,
      { headers },
    );
    const votos = votosRes.ok ? (await votosRes.json()).data || [] : [];
    const contagens = enquete.opcoes.map((_, indice) => votos.filter((v) => v.opcao === indice).length);

    return { jsonBody: { opcaoVotada: opcao, contagens } };
  },
});
