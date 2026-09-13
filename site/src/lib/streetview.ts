/**
 * Fase 24.2 — Street View Static API. Roda em tempo de build (a chave é
 * restrita por domínio, então uma checagem de cobertura feita aqui, no
 * servidor de build, precisaria de outra chave sem restrição — em vez
 * disso, a checagem usa o mesmo endpoint sem gastar cota de imagem
 * (`/streetview/metadata`, gratuito) só pra decidir se a foto existe antes
 * de publicar um `<img>` que poderia quebrar.
 */
export interface StreetViewMetadata {
  coberto: boolean;
  /** "AAAA-MM" (mês/ano em que a foto foi tirada pelo Google), ou null se
   * não houver cobertura — usado na Fase 24.11 pra decidir, comparando com
   * uma foto manual, qual das duas está mais atual. */
  data: string | null;
}

export async function streetViewMetadata(lat: number, lng: number, key: string): Promise<StreetViewMetadata> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${key}`,
    );
    if (!res.ok) return { coberto: false, data: null };
    const json = await res.json();
    if (json.status !== "OK") return { coberto: false, data: null };
    return { coberto: true, data: typeof json.date === "string" ? json.date : null };
  } catch {
    return { coberto: false, data: null };
  }
}

/** URL da imagem em si — sem heading definido, o Google mira a câmera
 * automaticamente na direção do ponto informado, a partir do panorama mais
 * próximo (documentado assim pela própria Street View Static API). */
export function streetViewImageUrl(lat: number, lng: number, key: string, size = "640x400"): string {
  const params = new URLSearchParams({ size, location: `${lat},${lng}`, fov: "80", key });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}
