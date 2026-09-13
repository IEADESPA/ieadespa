const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { verificar } = require("../lib/contaToken");

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
function alocarPagamento(itens, valorPago, valorUnitario) {
  let restante = valorUnitario > 0 ? valorPago / valorUnitario : 0;
  return itens.map((item) => {
    const quantidadePaga = Math.max(0, Math.min(item.quantidade, Math.floor(restante)));
    restante -= quantidadePaga;
    return { ...item, quantidadePaga };
  });
}

app.http("consultar-minha-conta", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "consultar-minha-conta",
  handler: async (request, context) => {
    if (!permitir(`conta-consultar:${ipDoPedido(request)}`)) {
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
      return { status: 401, jsonBody: { erro: "Sessão inválida ou expirada." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
    const filtroEmail = `filter[email][_eq]=${encodeURIComponent(email)}`;

    const [inscricoesRes, pedidosRes] = await Promise.all([
      fetch(
        `${DIRECTUS_URL}/items/inscricoes_eventos?${filtroEmail}&fields=id,codigo,pago,presente,aguardando_vaga,pendente_aprovacao,evento.slug,evento.title,evento.event_date&sort=-id&limit=-1`,
        { headers },
      ),
      fetch(
        `${DIRECTUS_URL}/items/camiseta_pedidos?${filtroEmail}&fields=id,valor_pago,avulso,grupo.nome,grupo.valor_venda&sort=-id&limit=-1`,
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
      const valorUnitario = Number(p.grupo?.valor_venda ?? 0);
      const itensComAlocacao = alocarPagamento(itensPorPedido[p.id] || [], Number(p.valor_pago ?? 0), valorUnitario);
      return {
        grupo: p.grupo?.nome ?? null,
        valorPago: p.valor_pago,
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

    return { jsonBody: { email, inscricoes: inscricoesResultado, pedidos: pedidosResultado } };
  },
});
