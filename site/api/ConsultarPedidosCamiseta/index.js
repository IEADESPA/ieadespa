const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 22 (camisetas/uniformes) — consulta pública só com telefone, de
 * propósito sem código nenhum (decisão explícita do usuário: "só digita o
 * telefone e pronto"). `camiseta_pedidos`/`camiseta_itens_pedido` não têm
 * leitura pública (protege telefone e valores), então essa Function faz o
 * mesmo papel de `VerificarInscricao`: varre com o token de admin e só
 * devolve o que bate com o hash do telefone informado.
 *
 * Um pedido é um "carrinho": um valor pago só (`camiseta_pedidos.valor_pago`)
 * cobre várias linhas de item (tamanho+modelo+quantidade). Não existe
 * pagamento por item — a alocação de quanto de cada item já está "pago" é
 * calculada aqui, em ordem de criação dos itens (o primeiro item cadastrado
 * consome pagamento primeiro), pra decidir quantas peças de cada linha já
 * podem ser retiradas.
 *
 * Preço por peça pode variar por tamanho (`camiseta_grupos.precos_tamanho`,
 * opcional) — tamanho sem entrada aí usa `valor_venda` como padrão (ou é
 * grátis, se nem isso estiver definido). Por isso a alocação caminha em
 * dinheiro (não mais em "peças equivalentes"), consumindo o valor pago pelo
 * preço de cada item conforme anda pela lista.
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
  if (!permitir(`camiseta:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const { telefone } = body;
  if (!telefone) {
    context.res = { status: 400, body: { erro: "Telefone ausente." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

  const pedidosRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_pedidos?fields=id,nome,telefone,valor_pago,avulso,grupo.nome,grupo.valor_venda,grupo.precos_tamanho&limit=-1`,
    { headers },
  );
  if (!pedidosRes.ok) {
    context.log.error("Falha ao buscar pedidos no Directus:", pedidosRes.status);
    context.res = { status: 502, body: { erro: "Falha ao consultar pedidos." } };
    return;
  }
  const pedidos = (await pedidosRes.json()).data || [];

  const meusPedidos = pedidos.filter((p) => conferirHash(telefone, p.telefone));
  if (meusPedidos.length === 0) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidos: [] } };
    return;
  }

  const idsPedidos = meusPedidos.map((p) => p.id).join(",");
  const itensRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_itens_pedido?filter[pedido][_in]=${idsPedidos}&fields=id,pedido,tamanho,modelo,quantidade,quantidade_retirada&sort=id&limit=-1`,
    { headers },
  );
  const todosItens = itensRes.ok ? (await itensRes.json()).data || [] : [];

  const resultado = meusPedidos.map((p) => {
    const itensDoPedido = todosItens.filter((i) => i.pedido === p.id);
    const itensComAlocacao = alocarPagamento(itensDoPedido, Number(p.valor_pago ?? 0), p.grupo);
    const valorTotal = itensDoPedido.reduce((s, i) => s + i.quantidade * precoTamanho(p.grupo, i.tamanho), 0);

    return {
      lote: p.grupo?.nome ?? null,
      valorTotal,
      valorPago: p.valor_pago,
      itens: itensComAlocacao.map((i) => ({
        tamanho: i.tamanho,
        modelo: i.modelo,
        quantidade: i.quantidade,
        valorUnitario: precoTamanho(p.grupo, i.tamanho),
        quantidadePaga: i.quantidadePaga,
        quantidadeRetirada: i.quantidade_retirada,
      })),
    };
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidos: resultado } };
};
