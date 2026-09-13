/**
 * Fase 24.3 — extrai coordenadas de um link do Google Maps colado por quem
 * cadastra o evento, em vez de geocodificar o texto do endereço. Motivo,
 * levantado pelo usuário depois de ver o mesmo problema acontecer com as
 * congregações: um endereço digitado (mesmo digitado certo) pode ser
 * geocodificado alguns metros/ruas longe do lugar de verdade — o link que a
 * própria pessoa gera no Google Maps (compartilhar → copiar link, depois de
 * já ter encontrado o pino certo lá) carrega a coordenada exata que ela
 * conferiu com os próprios olhos, sem depender de o Google "adivinhar" nada.
 *
 * Roda em tempo de build (Node, sem CORS) — resolve o link curto se for o
 * caso, e tenta os formatos de coordenada mais comuns que o Google usa,
 * nesta ordem de confiança: `!3d..!4d..` (coordenada exata do pino/marcador)
 * antes de `@lat,lng` (centro da tela, pode estar puxado) e de `q=lat,lng`.
 */
export interface Coordenada {
  lat: number;
  lng: number;
}

async function resolverLinkCurto(url: string): Promise<string> {
  if (!/goo\.gl|maps\.app\.goo\.gl/.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

export async function coordenadaDeLinkMaps(url: string): Promise<Coordenada | null> {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const resolvido = await resolverLinkCurto(trimmed);

  const marcador = resolvido.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (marcador) return { lat: Number(marcador[1]), lng: Number(marcador[2]) };

  const centroTela = resolvido.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (centroTela) return { lat: Number(centroTela[1]), lng: Number(centroTela[2]) };

  const paramQ = resolvido.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (paramQ) return { lat: Number(paramQ[1]), lng: Number(paramQ[2]) };

  return null;
}
