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
  // Erro do Directus aqui é ERRO, nunca "não existe lote": em 06/10/2026, sob carga
  // (centenas de pedidos por hora), respostas falhas foram lidas como "nenhum lote
  // aberto" e "nenhum lote anterior", e a rota criou seis lotes "abertos" ao mesmo
  // tempo, três deles com o número 1. Falhou a consulta: 502 e o pedido não entra.
  const abertoRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&filter[status][_eq]=aberto&sort=-numero&limit=1`,
    { headers },
  );
  if (!abertoRes.ok) throw new Error(`falha ao consultar lote aberto (${abertoRes.status})`);
  const aberto = (await abertoRes.json()).data?.[0];
  if (aberto) return aberto.id;

  const ultimoRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&sort=-numero&limit=1&fields=numero`,
    { headers },
  );
  if (!ultimoRes.ok) throw new Error(`falha ao consultar último lote (${ultimoRes.status})`);
  const ultimo = (await ultimoRes.json()).data?.[0];
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

  const grupoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_grupos/${grupoId}?fields=id,limite_uma_por_pessoa,ativo,pedidos_ate`, { headers });
  if (!grupoRes.ok) {
    context.res = { status: 404, body: { erro: "Camiseta não encontrada." } };
    return;
  }
  const grupo = (await grupoRes.json()).data;

  // Campanha encerrada não aceita pedido — nem pelo formulário antigo ainda aberto num
  // navegador, nem por chamada direta. Até 06/10/2026 esta rota olhava só a existência do
  // grupo: uma campanha desativada no Directus (`ativo = false`) e com prazo vencido
  // continuou recebendo centenas de pedidos, e cada lote fechado fazia o próximo pedido
  // abrir um lote novo. `ativo` fecha de vez; `pedidos_ate` (dia, inclusive, no horário de
  // Brasília) fecha pelo prazo.
  if (grupo.ativo === false) {
    context.res = { status: 403, body: { erro: "Esta campanha está encerrada e não aceita mais pedidos." } };
    return;
  }
  if (grupo.pedidos_ate) {
    const texto = String(grupo.pedidos_ate);
    const soDia = /^\d{4}-\d{2}-\d{2}$/.test(texto);
    const fim = new Date(soDia ? `${texto}T23:59:59-03:00` : texto);
    if (!Number.isNaN(fim.getTime()) && Date.now() > fim.getTime()) {
      const [ano, mes, dia] = texto.slice(0, 10).split("-");
      context.res = { status: 403, body: { erro: `O prazo de pedidos desta campanha encerrou em ${dia}/${mes}/${ano}.` } };
      return;
    }
  }

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
