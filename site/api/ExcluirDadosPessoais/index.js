const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

async function exigirStaff(staffToken) {
  if (!staffToken) return false;
  const res = await fetch(`${DIRECTUS_URL}/users/me`, { headers: { Authorization: `Bearer ${staffToken}` } });
  return res.ok;
}

/*
 * Exclusão de verdade (irreversível) do que foi encontrado por
 * `BuscarDadosPessoais` — nome, telefone (hash) e tudo ligado a eles
 * (respostas de pergunta, itens de pedido) somem, via `ON DELETE CASCADE`
 * já configurado nas relações (inscricoes_eventos→respostas_inscricao,
 * camiseta_pedidos→itens/respostas). Certificado/crachá param de funcionar
 * pra sempre depois disso, porque a linha que os gera deixa de existir —
 * consequência esperada e correta de uma exclusão de verdade.
 *
 * Promove a lista de espera de cada evento afetado, exatamente como
 * `CancelarInscricao` já faz — apagar uma vaga confirmada por LGPD não
 * deveria deixar a vaga "presa" sem ninguém.
 */
module.exports = async function (context, req) {
  if (!permitir(`lgpd-excluir:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};

  if (!(await exigirStaff(body.staffToken))) {
    context.res = { status: 401, body: { erro: "Sessão de equipe inválida — entre de novo no painel." } };
    return;
  }

  if (body.confirmar !== true) {
    context.res = { status: 400, body: { erro: "Confirmação ausente." } };
    return;
  }

  const telefone = String(body.telefone || "");
  if (!telefone) {
    context.res = { status: 400, body: { erro: "Telefone ausente." } };
    return;
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
  // `CancelarInscricao`.
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

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      inscricoesExcluidas: inscricoes.length,
      pedidosExcluidos: pedidos.length,
      promovidos,
    },
  };
};
