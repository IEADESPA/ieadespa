const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { verificar } = require("../src/lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 23 (enquetes) — resultado só aparece pra quem já votou (ou quando a
 * enquete já encerrou, aí aparece pra todo mundo). Antes disso, sem token
 * válido ou sem voto registrado, devolve só se a pessoa já votou (não), sem
 * contagem nenhuma — não dá pra "espiar" o resultado sem participar.
 */
module.exports = async function (context, req) {
  if (!permitir(`enquete-consultar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const enqueteId = Number(body.enqueteId);
  if (!Number.isInteger(enqueteId) || enqueteId <= 0) {
    context.res = { status: 400, body: { erro: "Enquete inválida." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

  const enqueteRes = await fetch(
    `${DIRECTUS_URL}/items/enquetes/${enqueteId}?fields=id,opcoes,ativa,encerra_em`,
    { headers },
  );
  if (!enqueteRes.ok) {
    context.res = { status: 404, body: { erro: "Enquete não encontrada." } };
    return;
  }
  const enquete = (await enqueteRes.json()).data;
  const encerrada = !enquete.ativa || (enquete.encerra_em && new Date(enquete.encerra_em).getTime() <= Date.now());

  const email = verificar(body.token);
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
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { jaVotou: false, opcaoVotada: null, encerrada, contagens: null },
    };
    return;
  }

  const votosRes = await fetch(
    `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&fields=opcao&limit=-1`,
    { headers },
  );
  const votos = votosRes.ok ? (await votosRes.json()).data || [] : [];
  const contagens = enquete.opcoes.map((_, indice) => votos.filter((v) => v.opcao === indice).length);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { jaVotou, opcaoVotada, encerrada, contagens },
  };
};
