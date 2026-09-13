const { app } = require("@azure/functions");
const { conferirHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 22 (camisetas/uniformes) — consulta pública só com telefone, de
 * propósito sem código nenhum (decisão explícita do usuário: "só digita o
 * telefone e pronto"). `camiseta_pedidos`/`camiseta_itens_pedido` não têm
 * leitura pública (protege telefone e valores), então essa Function faz o
 * mesmo papel de `verificar-inscricao.js`: varre com o token de admin e só
 * devolve o que bate com o hash do telefone informado.
 *
 * Um pedido é um "carrinho": um valor pago só (`camiseta_pedidos.valor_pago`)
 * cobre várias linhas de item (tamanho+modelo+quantidade). Não existe
 * pagamento por item — a alocação de quanto de cada item já está "pago" é
 * calculada aqui, em ordem de criação dos itens (o primeiro item cadastrado
 * consome pagamento primeiro), pra decidir quantas peças de cada linha já
 * podem ser retiradas.
 */
function alocarPagamento(itens, valorPago, valorUnitario) {
  let restante = valorUnitario > 0 ? valorPago / valorUnitario : 0;
  return itens.map((item) => {
    const quantidadePaga = Math.max(0, Math.min(item.quantidade, Math.floor(restante)));
    restante -= quantidadePaga;
    return { ...item, quantidadePaga };
  });
}

app.http("consultar-pedidos-camiseta", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "consultar-pedidos-camiseta",
  handler: async (request, context) => {
    const chave = `camiseta:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
      context.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const { telefone } = body || {};
    if (!telefone) {
      return { status: 400, jsonBody: { erro: "Telefone ausente." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

    const pedidosRes = await fetch(
      `${DIRECTUS_URL}/items/camiseta_pedidos?fields=id,nome,telefone,valor_pago,avulso,grupo.nome,grupo.valor_venda&limit=-1`,
      { headers },
    );
    if (!pedidosRes.ok) {
      context.error("Falha ao buscar pedidos no Directus:", pedidosRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao consultar pedidos." } };
    }
    const pedidos = (await pedidosRes.json()).data || [];

    const meusPedidos = pedidos.filter((p) => conferirHash(telefone, p.telefone));
    if (meusPedidos.length === 0) {
      return { jsonBody: { pedidos: [] } };
    }

    const idsPedidos = meusPedidos.map((p) => p.id).join(",");
    const itensRes = await fetch(
      `${DIRECTUS_URL}/items/camiseta_itens_pedido?filter[pedido][_in]=${idsPedidos}&fields=id,pedido,tamanho,modelo,quantidade,quantidade_retirada&sort=id&limit=-1`,
      { headers },
    );
    const todosItens = itensRes.ok ? (await itensRes.json()).data || [] : [];

    const resultado = meusPedidos.map((p) => {
      const itensDoPedido = todosItens.filter((i) => i.pedido === p.id);
      const valorUnitario = Number(p.grupo?.valor_venda ?? 0);
      const itensComAlocacao = alocarPagamento(itensDoPedido, Number(p.valor_pago ?? 0), valorUnitario);

      return {
        lote: p.grupo?.nome ?? null,
        valorUnitario: p.grupo?.valor_venda ?? null,
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

    return { jsonBody: { pedidos: resultado } };
  },
});
