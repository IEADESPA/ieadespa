const { avaliarJanela } = require("../src/lib/janela");
const { limitesDoGrupo, temLimite, disponibilidade, usoDoAgregado, umaVezPorChave, FILTRO_PECAS_DOS_LOTES_ABERTOS } = require("../src/lib/limiteLote");

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
 * 16/10/2026 — limite de pedidos do lote: quando a campanha tem `limite_total`
 * e/ou `limites_tamanho`, a resposta traz também `limite: { esgotado, tamanhosEsgotados }`
 * (sem números: a página só mostra "esgotado"). Quem manda é a API de criar pedido
 * (que recusa o que não cabe); isto é só para a tela não deixar a pessoa preencher
 * um formulário que vai ser recusado. Se o Directus falhar ao somar as peças, a
 * resposta sai sem o campo `limite` (a tela não esconde nada por isso).
 *
 * Cache de 20 s por instância para a janela (ativo/prazo) e de 5 s para as peças do
 * lote: num pico, milhares de aberturas de página (e a página consulta de novo a cada
 * poucos segundos enquanto está esgotada) não viram milhares de consultas ao Directus.
 */
const CACHE_MS = 20 * 1000;
const CACHE_LIMITE_MS = 5 * 1000;
const cache = new Map();
const cacheLimite = new Map();

async function disponibilidadeDoLote(grupoId, grupo, headers) {
  const limites = limitesDoGrupo(grupo);
  if (!temLimite(limites)) return null;
  const agora = Date.now();
  const assinatura = JSON.stringify([limites, grupo.tamanhos || null]);
  const guardado = cacheLimite.get(grupoId);
  if (guardado && guardado.assinatura === assinatura && agora - guardado.em < CACHE_LIMITE_MS) return guardado.valor;

  // as peças dos lotes ABERTOS da campanha (sem lote aberto, soma zero: o próximo pedido abre um lote novo).
  // Uma soma só por campanha de cada vez: quem chega com a memória vencida espera a MESMA resposta (ver o comentário do cache, acima).
  return umaVezPorChave(`status-camiseta-uso:${grupoId}`, async () => {
    const usoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_itens_pedido?${FILTRO_PECAS_DOS_LOTES_ABERTOS(grupoId)}&aggregate[sum]=quantidade&groupBy[]=tamanho`, { headers });
    if (!usoRes.ok) return undefined;
    const uso = usoDoAgregado((await usoRes.json()).data);
    const valor = disponibilidade(limites, uso, Array.isArray(grupo.tamanhos) ? grupo.tamanhos.map(String) : []);
    cacheLimite.set(grupoId, { em: Date.now(), assinatura, valor });
    return valor;
  });
}

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
  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
  const responder = (corpo) => { context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: corpo }; };

  const agora = Date.now();
  let guardado = cache.get(grupoId);
  if (!guardado || agora - guardado.em >= CACHE_MS) {
    // Uma consulta só por campanha de cada vez (por instância): com a memória vencida e mil aberturas de página no mesmo segundo, todas esperam a MESMA resposta do Directus
    // em vez de disparar mil consultas (medido em 19/10/2026: 200 aberturas simultâneas levavam ~20 s no meio e 4 falhavam).
    const lida = await umaVezPorChave(`status-camiseta:${grupoId}`, async () => {
      // `fields=*`: `limite_total` e `limites_tamanho` são campos novos e o Directus responde 403 a quem pede um campo que não existe.
      const res = await fetch(`${DIRECTUS_URL}/items/camiseta_grupos/${grupoId}?fields=*`, { headers });
      let corpo;
      let grupo = null;
      if (res.status === 404 || res.status === 403) {
        corpo = { aberto: false, motivo: "inexistente", mensagem: "Camiseta não encontrada." };
      } else if (!res.ok) {
        // Directus indisponível: não esconder o formulário por isso (a API recusa se for o caso).
        return { falhou: true };
      } else {
        grupo = (await res.json()).data;
        corpo = avaliarJanela({ ativo: grupo.ativo !== false, ate: grupo.pedidos_ate, rotulo: "pedidos" });
      }
      const novo = { em: Date.now(), corpo, grupo };
      cache.set(grupoId, novo);
      return novo;
    });
    if (lida.falhou) {
      context.res = { status: 502, body: { erro: "Falha ao consultar a campanha." } };
      return;
    }
    guardado = lida;
  }

  if (guardado.corpo.aberto === false || !guardado.grupo) return responder(guardado.corpo);
  let limite = null;
  try { limite = await disponibilidadeDoLote(grupoId, guardado.grupo, headers); } catch { limite = null; }
  return responder(limite ? { ...guardado.corpo, limite } : guardado.corpo);
};
