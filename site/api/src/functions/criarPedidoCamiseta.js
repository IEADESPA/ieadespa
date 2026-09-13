const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

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
 */
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

app.http("criar-pedido-camiseta", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "criar-pedido-camiseta",
  handler: async (request, context) => {
    if (!permitir(`criar-pedido-camiseta:${ipDoPedido(request)}`)) {
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

    const grupoId = Number(body?.grupoId);
    const nome = String(body?.nome || "").trim();
    const telefoneHash = String(body?.telefoneHash || "");
    const itens = Array.isArray(body?.itens) ? body.itens : [];
    const respostas = Array.isArray(body?.respostas) ? body.respostas : [];

    if (!Number.isInteger(grupoId) || grupoId <= 0 || !nome || !telefoneHash || itens.length === 0) {
      return { status: 400, jsonBody: { erro: "Parâmetros ausentes." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    let loteId;
    try {
      loteId = await encontrarOuCriarLoteAberto(headers, grupoId);
    } catch (err) {
      context.error("Falha ao resolver lote aberto:", err);
      return { status: 502, jsonBody: { erro: "Falha ao preparar o pedido." } };
    }

    const pedidoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        grupo: grupoId,
        lote: loteId,
        nome,
        telefone: telefoneHash,
        email: body?.email || null,
        congregacao: body?.congregacaoId ? Number(body.congregacaoId) : null,
      }),
    });
    if (!pedidoRes.ok) {
      context.error("Falha ao criar pedido:", pedidoRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao criar pedido." } };
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

    return { jsonBody: { pedidoId, lote: loteId } };
  },
});
