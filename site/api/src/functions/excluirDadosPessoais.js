const { app } = require("@azure/functions");
const { conferirHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

async function exigirStaff(staffToken) {
  if (!staffToken) return false;
  const res = await fetch(`${DIRECTUS_URL}/users/me`, { headers: { Authorization: `Bearer ${staffToken}` } });
  return res.ok;
}

/*
 * Exclusão de verdade (irreversível) do que foi encontrado por
 * `buscarDadosPessoais.js` — nome, telefone (hash) e tudo ligado a eles
 * (respostas de pergunta, itens de pedido) somem, via `ON DELETE CASCADE`
 * já configurado nas relações (inscricoes_eventos→respostas_inscricao,
 * camiseta_pedidos→itens/respostas). Certificado/crachá param de funcionar
 * pra sempre depois disso, porque a linha que os gera deixa de existir —
 * consequência esperada e correta de uma exclusão de verdade.
 *
 * Promove a lista de espera de cada evento afetado, exatamente como
 * `cancelarInscricao.js` já faz — apagar uma vaga confirmada por LGPD não
 * deveria deixar a vaga "presa" sem ninguém.
 */
app.http("excluir-dados-pessoais", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "excluir-dados-pessoais",
  handler: async (request, context) => {
    if (!permitir(`lgpd-excluir:${ipDoPedido(request)}`)) {
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

    if (!(await exigirStaff(body?.staffToken))) {
      return { status: 401, jsonBody: { erro: "Sessão de equipe inválida — entre de novo no painel." } };
    }

    if (body?.confirmar !== true) {
      return { status: 400, jsonBody: { erro: "Confirmação ausente." } };
    }

    const telefone = String(body?.telefone || "");
    if (!telefone) {
      return { status: 400, jsonBody: { erro: "Telefone ausente." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    const [inscricoesRes, pedidosRes] = await Promise.all([
      fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?fields=id,telefone,evento,aguardando_vaga&limit=-1`, { headers }),
      fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?fields=id,telefone&limit=-1`, { headers }),
    ]);

    const inscricoesTodas = inscricoesRes.ok ? (await inscricoesRes.json()).data || [] : [];
    const pedidosTodos = pedidosRes.ok ? (await pedidosRes.json()).data || [] : [];

    const inscricoes = inscricoesTodas.filter((i) => conferirHash(telefone, i.telefone));
    const pedidos = pedidosTodos.filter((p) => conferirHash(telefone, p.telefone));

    for (const inscricao of inscricoes) {
      await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${inscricao.id}`, { method: "DELETE", headers });
    }
    for (const pedido of pedidos) {
      await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos/${pedido.id}`, { method: "DELETE", headers });
    }

    // Promove 1 pessoa da lista de espera por evento onde uma vaga
    // CONFIRMADA (não quem já esperava) foi apagada — mesmo critério de
    // `cancelarInscricao.js`.
    const eventosComVagaLiberada = [...new Set(inscricoes.filter((i) => !i.aguardando_vaga).map((i) => i.evento))];
    let promovidos = 0;
    for (const eventoId of eventosComVagaLiberada) {
      const esperaRes = await fetch(
        `${DIRECTUS_URL}/items/inscricoes_eventos?filter[_and][0][evento][_eq]=${eventoId}&filter[_and][1][aguardando_vaga][_eq]=true&sort=date_created&fields=id&limit=1`,
        { headers },
      );
      const espera = esperaRes.ok ? (await esperaRes.json()).data || [] : [];
      if (espera.length) {
        const promoRes = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${espera[0].id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ aguardando_vaga: false }),
        });
        if (promoRes.ok) promovidos += 1;
      }
    }

    return {
      jsonBody: {
        inscricoesExcluidas: inscricoes.length,
        pedidosExcluidos: pedidos.length,
        promovidos,
      },
    };
  },
});
