const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { verificar } = require("../src/lib/contaToken");

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
module.exports = async function (context, req) {
  if (!permitir(`enquete-votar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const email = verificar(body.token);
  if (!email) {
    context.res = { status: 401, body: { erro: "Entre na Minha Conta para votar." } };
    return;
  }

  const enqueteId = Number(body.enqueteId);
  const opcao = Number(body.opcao);
  if (!Number.isInteger(enqueteId) || enqueteId <= 0 || !Number.isInteger(opcao) || opcao < 0) {
    context.res = { status: 400, body: { erro: "Parâmetros inválidos." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

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
  if (encerrada) {
    context.res = { status: 409, body: { erro: "Esta enquete já foi encerrada." } };
    return;
  }
  if (opcao >= enquete.opcoes.length) {
    context.res = { status: 400, body: { erro: "Opção inválida." } };
    return;
  }

  const votoRes = await fetch(
    `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
    { headers },
  );
  const votoExistente = votoRes.ok ? (await votoRes.json()).data?.[0] : null;
  if (votoExistente) {
    context.res = { status: 409, body: { erro: "Você já votou nesta enquete." } };
    return;
  }

  const criarRes = await fetch(`${DIRECTUS_URL}/items/enquete_votos`, {
    method: "POST",
    headers,
    body: JSON.stringify({ enquete: enqueteId, opcao, email }),
  });
  if (!criarRes.ok) {
    context.log.error("Falha ao gravar voto no Directus:", criarRes.status);
    context.res = { status: 502, body: { erro: "Falha ao registrar voto." } };
    return;
  }

  const votosRes = await fetch(
    `${DIRECTUS_URL}/items/enquete_votos?filter[enquete][_eq]=${enqueteId}&fields=opcao&limit=-1`,
    { headers },
  );
  const votos = votosRes.ok ? (await votosRes.json()).data || [] : [];
  const contagens = enquete.opcoes.map((_, indice) => votos.filter((v) => v.opcao === indice).length);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { opcaoVotada: opcao, contagens } };
};
