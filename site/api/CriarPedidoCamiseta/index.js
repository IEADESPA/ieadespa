const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { gerarHash, conferirHash } = require("../src/lib/telefone");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Cria um pedido público de camiseta, atribuindo-o automaticamente ao
 * "lote" (janela de compra) que estiver aberto na campanha — do jeito que a
 * planilha de camisetas da tesouraria já funciona há anos: cada pedido cai
 * sozinho no lote vigente, sem o admin escolher nada; quando a equipe fecha
 * o lote (painel, `/painel-camisetas/grupo/pedidos/`), o próximo pedido cria
 * um lote novo sozinho, com o número seguinte.
 *
 * A criação de pedido/item/resposta deixou de ser feita direto pelo
 * navegador (permissão pública removida do Directus) — reunir tudo aqui
 * evita a corrida de duas pessoas criarem o "lote 1" ao mesmo tempo (só um
 * lugar decide isso) e evita expor a lógica de atribuição de lote no
 * cliente.
 *
 * Telefone chega em texto puro (não mais pré-hashado pelo navegador via
 * `/api/telefone-hash`) — precisa estar em texto aqui mesmo pra poder
 * comparar contra os pedidos já existentes da campanha (hash usa salt
 * aleatório, então só dá pra comparar telefone por telefone, nunca por
 * igualdade direta de hash — mesma técnica de `VerificarInscricao`/
 * `ConsultarPedidosCamiseta`). O hash pra gravação é calculado aqui mesmo.
 */
async function pedidoDuplicado(headers, grupoId, telefone, email) {
  const res = await fetch(
    `${DIRECTUS_URL}/items/camiseta_pedidos?filter[grupo][_eq]=${grupoId}&fields=id,telefone,email&limit=-1`,
    { headers },
  );
  if (!res.ok) throw new Error("falha ao conferir pedidos existentes");
  const existentes = (await res.json()).data || [];
  const emailNormalizado = email ? String(email).trim().toLowerCase() : null;
  return existentes.some((p) => {
    if (conferirHash(telefone, p.telefone)) return true;
    if (emailNormalizado && p.email && String(p.email).trim().toLowerCase() === emailNormalizado) return true;
    return false;
  });
}
async function encontrarOuCriarLoteAberto(headers, grupoId) {
  const abertoRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&filter[status][_eq]=aberto&sort=-numero&limit=1`,
    { headers },
  );
  const aberto = abertoRes.ok ? (await abertoRes.json()).data?.[0] : null;
  if (aberto) return aberto.id;

  const ultimoRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&sort=-numero&limit=1&fields=numero`,
    { headers },
  );
  const ultimo = ultimoRes.ok ? (await ultimoRes.json()).data?.[0] : null;
  const proximoNumero = (ultimo?.numero ?? 0) + 1;

  const criadoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_lotes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ grupo: grupoId, numero: proximoNumero, status: "aberto" }),
  });
  if (!criadoRes.ok) throw new Error("falha ao criar lote");
  const criado = (await criadoRes.json()).data;
  return criado.id;
}

module.exports = async function (context, req) {
  if (!permitir(`criar-pedido-camiseta:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const grupoId = Number(body.grupoId);
  const nome = String(body.nome || "").trim();
  const telefone = String(body.telefone || "");
  const email = body.email ? String(body.email).trim() : null;
  const itens = Array.isArray(body.itens) ? body.itens : [];
  const respostas = Array.isArray(body.respostas) ? body.respostas : [];

  const telefoneHash = gerarHash(telefone);
  if (!Number.isInteger(grupoId) || grupoId <= 0 || !nome || !telefoneHash || itens.length === 0) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  const totalQuantidade = itens.reduce((soma, item) => soma + (Number(item.quantidade) || 0), 0);

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const grupoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_grupos/${grupoId}?fields=id,limite_uma_por_pessoa`, { headers });
  if (!grupoRes.ok) {
    context.res = { status: 404, body: { erro: "Camiseta não encontrada." } };
    return;
  }
  const grupo = (await grupoRes.json()).data;

  if (grupo.limite_uma_por_pessoa) {
    if (totalQuantidade > 1) {
      context.res = { status: 400, body: { erro: "Esta campanha permite só 1 peça por pessoa." } };
      return;
    }
    try {
      if (await pedidoDuplicado(headers, grupoId, telefone, email)) {
        context.res = {
          status: 409,
          body: { erro: "Você já fez um pedido nesta campanha. Esta campanha permite só 1 peça por pessoa." },
        };
        return;
      }
    } catch (err) {
      context.log.error("Falha ao conferir pedido duplicado:", err);
      context.res = { status: 502, body: { erro: "Falha ao preparar o pedido." } };
      return;
    }
  }

  let loteId;
  try {
    loteId = await encontrarOuCriarLoteAberto(headers, grupoId);
  } catch (err) {
    context.log.error("Falha ao resolver lote aberto:", err);
    context.res = { status: 502, body: { erro: "Falha ao preparar o pedido." } };
    return;
  }

  const pedidoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      grupo: grupoId,
      lote: loteId,
      nome,
      telefone: telefoneHash,
      email,
      congregacao: body.congregacaoId ? Number(body.congregacaoId) : null,
    }),
  });
  if (!pedidoRes.ok) {
    context.log.error("Falha ao criar pedido:", pedidoRes.status);
    context.res = { status: 502, body: { erro: "Falha ao criar pedido." } };
    return;
  }
  const pedidoId = (await pedidoRes.json()).data.id;

  await Promise.all([
    ...itens.map((item) =>
      fetch(`${DIRECTUS_URL}/items/camiseta_itens_pedido`, {
        method: "POST",
        headers,
        body: JSON.stringify({ pedido: pedidoId, tamanho: item.tamanho || null, modelo: item.modelo || null, quantidade: Number(item.quantidade) || 0 }),
      }),
    ),
    ...respostas.map((resposta) =>
      fetch(`${DIRECTUS_URL}/items/respostas_pedido_camiseta`, {
        method: "POST",
        headers,
        body: JSON.stringify({ pedido: pedidoId, pergunta: resposta.pergunta, valor: resposta.valor }),
      }),
    ),
  ]);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidoId, lote: loteId } };
};
