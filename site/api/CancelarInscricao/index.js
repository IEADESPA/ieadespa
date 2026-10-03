const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

const norm = (v) => String(v || "").trim().toLowerCase();

/*
 * Fase 21 (eventos customizáveis): dos gaps reais confirmados contra
 * Sympla/Even3/Eventbrite, este é o que o usuário escolheu construir agora —
 * cancelamento pela própria pessoa (sem depender da equipe), com promoção
 * automática de quem está na lista de espera. Mesma verificação de
 * identidade já usada em certificado/qrcode/crachá (código + telefone
 * conferido por hash, nunca texto puro — ver `VerificarInscricao`), e a
 * mesma ordem de exclusão já usada em `painel-eventos/evento/inscritos.astro`
 * (respostas do formulário antes da inscrição em si).
 */
module.exports = async function (context, req) {
  if (!permitir(`cancelar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const { evento, codigo, telefone } = body;
  if (!evento || !codigo || !telefone) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

  const rosterRes = await fetch(
    `${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${encodeURIComponent(evento)}&fields=id,codigo,telefone,aguardando_vaga&limit=-1`,
    { headers },
  );
  if (!rosterRes.ok) {
    context.log.error("Falha ao buscar roster no Directus:", rosterRes.status);
    context.res = { status: 502, body: { erro: "Falha ao consultar inscrições." } };
    return;
  }
  const roster = (await rosterRes.json()).data || [];

  const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
  if (!registro || !conferirHash(telefone, registro.telefone)) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { cancelado: false } };
    return;
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
    context.log.error("Falha ao excluir inscrição:", delRes.status);
    context.res = { status: 502, body: { erro: "Falha ao cancelar." } };
    return;
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

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { cancelado: true, promovido } };
};
