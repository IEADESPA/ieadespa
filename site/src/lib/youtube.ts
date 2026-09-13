/**
 * Extrai o ID de 11 caracteres de um link de vídeo do YouTube, em qualquer
 * um dos formatos comuns (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`).
 * Devolve `null` pra qualquer link que não seja reconhecido — quem chama
 * decide o que fazer nesse caso (ex: cair de volta pro link cru).
 */
export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const embedMatch = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/** URL da miniatura estática do vídeo — não custa nenhum JavaScript nem
 * conexão com o YouTube até a pessoa decidir assistir de verdade. */
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
