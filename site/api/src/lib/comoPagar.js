/**
 * "Como pagar" dos pedidos de camiseta (09/11/2026): para "Meus pedidos" e "Minha Conta" mostrarem, no pedido que ainda deve, para onde
 * mandar o dinheiro (com um Pix de exatamente o que falta). Lê o `pagamento_config` das campanhas e dos eventos vinculados com `fields=*`
 * — pedir o campo pelo nome daria 403 enquanto ele não existir no Directus — e devolve o JSON cru: quem mostra (o navegador) passa por
 * `normalizarPagamento`/`pagamentoDaCampanha` (src/lib/pagamentoEvento.ts). São dados públicos (os mesmos da página da camiseta e do evento).
 *
 * Nunca quebra a consulta: qualquer falha devolve um mapa vazio (o pedido aparece sem o "como pagar", como antes).
 */
const MAX_GRUPOS = 50;

/** Mapa grupoId → { campanha, evento } (o `pagamento_config` cru de cada um, ou null). */
async function pagamentoDosGrupos(directusUrl, headers, grupoIds) {
  const ids = [...new Set((grupoIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_GRUPOS);
  const mapa = new Map();
  if (!ids.length || !directusUrl) return mapa;
  try {
    const r = await fetch(`${directusUrl}/items/camiseta_grupos?filter[id][_in]=${ids.join(",")}&fields=*&limit=${MAX_GRUPOS}`, { headers });
    if (!r.ok) return mapa;
    const grupos = (await r.json()).data || [];
    const eventoIds = [...new Set(grupos.map((g) => Number(g.evento)).filter((n) => Number.isInteger(n) && n > 0))];
    const eventos = new Map();
    if (eventoIds.length) {
      const re = await fetch(`${directusUrl}/items/eventos?filter[id][_in]=${eventoIds.join(",")}&fields=*&limit=${MAX_GRUPOS}`, { headers });
      if (re.ok) for (const e of (await re.json()).data || []) eventos.set(Number(e.id), e.pagamento_config ?? null);
    }
    for (const g of grupos) mapa.set(Number(g.id), { campanha: g.pagamento_config ?? null, evento: eventos.get(Number(g.evento)) ?? null });
  } catch {
    return new Map();
  }
  return mapa;
}

module.exports = { pagamentoDosGrupos };
