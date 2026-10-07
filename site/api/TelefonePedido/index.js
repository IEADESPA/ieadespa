const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { decifrarTelefone, linkWhatsApp } = require("../src/lib/telefone");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Telefone de um pedido de camiseta, para o botão de WhatsApp do painel (07/10/2026).
 *
 * Só para quem está logado no painel: a chamada traz o token do Directus da pessoa
 * (`Authorization: Bearer …`) e esta rota PROVA que esse token enxerga o pedido — pede o
 * próprio pedido ao Directus com o token dela; se o Directus recusar, não há telefone.
 * Quem pode ler pedidos no Directus (Administrador, Semi-administrador) pode ver o telefone;
 * mais ninguém. O número está cifrado na coleção (ver `telefone.js`); só aqui, no servidor,
 * ele volta a ser número. Pedidos de antes de 07/10/2026 não têm o cifrado (só hash):
 * respondem 404 com a explicação.
 */
const LIMITE_POR_IP = 60; // 5 min — a equipe clica muitas vezes seguidas na entrega

function formatar(digitos) {
  if (!digitos) return null;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  return resto.length === 9 ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}` : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

module.exports = async function (context, req) {
  if (!permitir(`telefone-pedido:${ipDoPedido(req)}`, LIMITE_POR_IP)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }
  const pedidoId = Number(req.params?.pedidoId);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    context.res = { status: 400, body: { erro: "Pedido inválido." } };
    return;
  }
  // O token do painel vem no cabeçalho próprio `x-painel-token` (mesma razão do `x-auth-token` do
  // sistema: um `Authorization` pode ser alterado/anexado pelo proxy do Static Web Apps). Aceita o
  // `Authorization: Bearer …` como reserva.
  const cabecalhoDe = (nome) => { const k = Object.keys(req.headers || {}).find((c) => c.toLowerCase() === nome); return k ? String(req.headers[k]) : ""; };
  const tokenPainel = (cabecalhoDe("x-painel-token") || cabecalhoDe("authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!tokenPainel) {
    context.res = { status: 401, body: { erro: "Entre no painel para ver o telefone." } };
    return;
  }

  // Prova de acesso: o token da pessoa precisa enxergar ESTE pedido no Directus.
  const prova = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos/${pedidoId}?fields=id`, { headers: { Authorization: `Bearer ${tokenPainel}` } });
  if (prova.status === 401 || prova.status === 403) {
    context.res = { status: 401, body: { erro: `Sua sessão do painel não vale mais. Entre de novo. (Directus respondeu ${prova.status})` } };
    return;
  }
  if (prova.status === 404) {
    context.res = { status: 404, body: { erro: "Pedido não encontrado." } };
    return;
  }
  if (!prova.ok) {
    context.res = { status: 502, body: { erro: "Falha ao conferir o acesso." } };
    return;
  }

  const res = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos/${pedidoId}?fields=id,nome,telefone_cifrado,date_created`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
  if (!res.ok) {
    context.res = { status: 502, body: { erro: "Falha ao ler o pedido." } };
    return;
  }
  const pedido = (await res.json()).data;
  const digitos = decifrarTelefone(pedido.telefone_cifrado);
  if (!digitos) {
    const criadoEm = pedido.date_created ? new Date(pedido.date_created) : null;
    const antigo = criadoEm && criadoEm.getTime() < Date.parse("2026-10-07T00:00:00-03:00");
    const motivo = antigo
      ? `foi feito em ${criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Belem" })}, antes de o sistema guardar telefones (07/10/2026). Ele passa a ter o telefone no dia em que a pessoa consultar "Meus pedidos".`
      : "foi lançado sem um telefone válido.";
    context.res = { status: 404, body: { erro: `Este pedido não tem o telefone guardado: ${motivo}` } };
    return;
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { pedidoId, nome: pedido.nome, telefone: formatar(digitos), digitos, whatsapp: linkWhatsApp(digitos) },
  };
};
