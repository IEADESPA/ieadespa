const { avaliarJanela } = require("../src/lib/janela");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * "Esta campanha ainda aceita pedido?" — consultado pela página da camiseta
 * ao abrir (06/10/2026). O site é estático: a página foi montada quando a
 * campanha estava aberta e continua no ar até alguém remontar o site; quem
 * desativa a campanha no Directus espera que o formulário suma NA HORA, não
 * depois de um build. A regra é a mesma de `CriarPedidoCamiseta` (que
 * continua recusando por conta própria — isto aqui é só para a tela não
 * prometer o que a API vai negar): `ativo = false` fecha, mesmo com prazo no
 * futuro; `pedidos_ate` (dia inclusive, Brasília) fecha pelo prazo.
 *
 * Cache de 20 s por instância: num pico, milhares de aberturas de página não
 * viram milhares de consultas ao Directus.
 */
const CACHE_MS = 20 * 1000;
const cache = new Map();

module.exports = async function (context, req) {
  const grupoId = Number(req.params?.grupoId);
  if (!Number.isInteger(grupoId) || grupoId <= 0) {
    context.res = { status: 400, body: { erro: "Campanha inválida." } };
    return;
  }
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const agora = Date.now();
  const guardado = cache.get(grupoId);
  if (guardado && agora - guardado.em < CACHE_MS) {
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: guardado.corpo };
    return;
  }

  const res = await fetch(`${DIRECTUS_URL}/items/camiseta_grupos/${grupoId}?fields=id,ativo,pedidos_ate`, {
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
  });
  let corpo;
  if (res.status === 404 || res.status === 403) {
    corpo = { aberto: false, motivo: "inexistente", mensagem: "Camiseta não encontrada." };
  } else if (!res.ok) {
    // Directus indisponível: não esconder o formulário por isso (a API recusa se for o caso).
    context.res = { status: 502, body: { erro: "Falha ao consultar a campanha." } };
    return;
  } else {
    const grupo = (await res.json()).data;
    corpo = avaliarJanela({ ativo: grupo.ativo !== false, ate: grupo.pedidos_ate, rotulo: "pedidos" });
  }

  cache.set(grupoId, { em: agora, corpo });
  context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: corpo };
};
