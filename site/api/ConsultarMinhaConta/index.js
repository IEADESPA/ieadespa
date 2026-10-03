const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { verificar } = require("../src/lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 26 — depois de logada, a "Minha Conta" reúne o que a pessoa já fazia
 * espalhado pelo site (inscrições em eventos, pedidos de camiseta), tudo pelo
 * mesmo critério: `email` gravado naquele registro bate com o e-mail contido
 * no token de sessão (assinado, ver `contaToken.js`) — nunca o e-mail cru
 * mandado pelo navegador, ou qualquer um poderia consultar a conta alheia só
 * digitando o e-mail de outra pessoa.
 */
/**
 * Preço por peça pode variar por tamanho (`camiseta_grupos.precos_tamanho`,
 * opcional) — ver a mesma lógica em `ConsultarPedidosCamiseta`.
 */
function precoTamanho(grupo, tamanho) {
  const precos = grupo?.precos_tamanho || {};
  if (tamanho && precos[tamanho] != null && precos[tamanho] !== "") return Number(precos[tamanho]);
  return grupo?.valor_venda != null ? Number(grupo.valor_venda) : 0;
}

function alocarPagamento(itens, valorPago, grupo) {
  let restante = Number(valorPago) || 0;
  return itens.map((item) => {
    const preco = precoTamanho(grupo, item.tamanho);
    if (preco <= 0) return { ...item, quantidadePaga: item.quantidade };
    const quantidadePaga = Math.max(0, Math.min(item.quantidade, Math.floor(restante / preco)));
    restante -= quantidadePaga * preco;
    return { ...item, quantidadePaga };
  });
}

module.exports = async function (context, req) {
  if (!permitir(`conta-consultar:${ipDoPedido(req)}`)) {
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
    context.res = { status: 401, body: { erro: "Sessão inválida ou expirada." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
  const filtroEmail = `filter[email][_eq]=${encodeURIComponent(email)}`;

  const [inscricoesRes, pedidosRes] = await Promise.all([
    fetch(
      `${DIRECTUS_URL}/items/inscricoes_eventos?${filtroEmail}&fields=id,codigo,pago,presente,aguardando_vaga,pendente_aprovacao,evento.slug,evento.title,evento.event_date&sort=-id&limit=-1`,
      { headers },
    ),
    fetch(
      `${DIRECTUS_URL}/items/camiseta_pedidos?${filtroEmail}&fields=id,valor_pago,avulso,separado,grupo.nome,grupo.valor_venda,grupo.precos_tamanho&sort=-id&limit=-1`,
      { headers },
    ),
  ]);

  const inscricoes = inscricoesRes.ok ? (await inscricoesRes.json()).data || [] : [];
  const pedidos = pedidosRes.ok ? (await pedidosRes.json()).data || [] : [];

  let itensPorPedido = {};
  if (pedidos.length > 0) {
    const idsPedidos = pedidos.map((p) => p.id).join(",");
    const itensRes = await fetch(
      `${DIRECTUS_URL}/items/camiseta_itens_pedido?filter[pedido][_in]=${idsPedidos}&fields=id,pedido,tamanho,modelo,quantidade,quantidade_retirada&sort=id&limit=-1`,
      { headers },
    );
    const todosItens = itensRes.ok ? (await itensRes.json()).data || [] : [];
    for (const item of todosItens) {
      (itensPorPedido[item.pedido] ??= []).push(item);
    }
  }

  const pedidosResultado = pedidos.map((p) => {
    const itensComAlocacao = alocarPagamento(itensPorPedido[p.id] || [], Number(p.valor_pago ?? 0), p.grupo);
    return {
      grupo: p.grupo?.nome ?? null,
      valorPago: p.valor_pago,
      separado: Boolean(p.separado),
      itens: itensComAlocacao.map((i) => ({
        tamanho: i.tamanho,
        modelo: i.modelo,
        quantidade: i.quantidade,
        quantidadePaga: i.quantidadePaga,
        quantidadeRetirada: i.quantidade_retirada,
      })),
    };
  });

  const inscricoesResultado = inscricoes.map((i) => ({
    eventoTitulo: i.evento?.title ?? null,
    eventoSlug: i.evento?.slug ?? null,
    eventoData: i.evento?.event_date ?? null,
    codigo: i.codigo,
    pago: i.pago,
    presente: i.presente,
    aguardandoVaga: i.aguardando_vaga,
    pendenteAprovacao: i.pendente_aprovacao,
  }));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { email, inscricoes: inscricoesResultado, pedidos: pedidosResultado },
  };
};
