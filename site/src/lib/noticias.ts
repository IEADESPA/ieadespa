import { formatDate } from "@/lib/posts";
import { COVER_WIDTHS, directusAssetSrcset, directusAssetUrl, fetchItems } from "@/lib/directus";

export { formatDate };

const CATEGORY_LABEL: Record<string, string> = {
  institucional: "Institucional",
  eventos: "Eventos",
  comunicado: "Comunicado",
  testemunho: "Testemunho",
};

export const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? category;

interface DirectusNoticia {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  date: string;
  cover: string | null;
  featured: boolean;
  draft: boolean;
  body: string;
  orgao_relacionado: number | null;
  entrevistado_nome: string | null;
  entrevistado_papel: string | null;
}

export interface NoticiaData {
  title: string;
  excerpt: string;
  category: string;
  date: Date;
  cover?: string;
  coverSrcset?: string;
  featured: boolean;
  draft: boolean;
  orgaoRelacionado: number | null;
  /** Só preenchido em notícias baseadas numa entrevista (categoria "Testemunho"). */
  entrevistado?: { nome: string; papel: string | null };
}

export interface Noticia {
  id: string;
  data: NoticiaData;
  body: string;
}

let cached: Noticia[] | null = null;

function toNoticia(n: DirectusNoticia): Noticia {
  return {
    id: n.slug,
    body: n.body ?? "",
    data: {
      title: n.title,
      excerpt: n.excerpt,
      category: n.category,
      date: new Date(n.date),
      cover: n.cover ? directusAssetUrl(n.cover, { width: 1600, quality: 80, format: "webp" }) : undefined,
      coverSrcset: n.cover ? directusAssetSrcset(n.cover, COVER_WIDTHS, { quality: 80, format: "webp" }) : undefined,
      featured: n.featured,
      draft: n.draft,
      orgaoRelacionado: n.orgao_relacionado,
      entrevistado: n.entrevistado_nome ? { nome: n.entrevistado_nome, papel: n.entrevistado_papel } : undefined,
    },
  };
}

/** Busca todas as notícias do Directus. Roda em tempo de build. */
export async function getAllNoticias(): Promise<Noticia[]> {
  if (cached) return cached;
  const items = await fetchItems<DirectusNoticia>("noticias");
  cached = items.map(toNoticia);
  return cached;
}

export const byNewest = (a: Noticia, b: Noticia) => b.data.date.getTime() - a.data.date.getTime();

export const visibleNoticias = (noticias: Noticia[]) =>
  noticias.filter((noticia) => !noticia.data.draft).sort(byNewest);

export const noticiaHref = (noticia: Noticia) => `/noticia/${noticia.id}/`;

export const getFeaturedNoticias = (noticias: Noticia[], limit = 3) =>
  visibleNoticias(noticias)
    .filter((noticia) => noticia.data.featured)
    .slice(0, limit);

export const readingMinutes = (noticia: Noticia) => {
  const words = (noticia.body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
};

export const readingLabel = (noticia: Noticia) => `${readingMinutes(noticia)} min de leitura`;
