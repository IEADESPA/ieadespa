import { categories, categorySlug, type Category } from "@/config/categories";
import { siteConfig } from "@/config/site";
import { COVER_WIDTHS, directusAssetSrcset, directusAssetUrl, fetchItems } from "@/lib/directus";

export { categories, categorySlug, type Category };

/** Formato bruto de uma mensagem, como salva no Directus. */
interface DirectusMensagem {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  date: string;
  updated_date: string | null;
  author_name: string;
  author_role: string;
  cover: string | null;
  video_url: string | null;
  featured: boolean;
  draft: boolean;
  body: string;
  serie: string | null;
  serie_ordem: number | null;
}

export interface PostData {
  title: string;
  excerpt: string;
  category: Category;
  date: Date;
  updatedDate?: Date;
  author: { name: string; role: string };
  cover?: string;
  coverSrcset?: string;
  videoUrl?: string;
  featured: boolean;
  draft: boolean;
  serie?: string;
  serieOrdem?: number;
}

/** Continua com a forma `{ id, data, body }` do Astro Content Collections de
 * propósito — assim as páginas que já liam `post.data.title` etc. não
 * precisam mudar, só trocam de onde a lista de mensagens vem. */
export interface Post {
  id: string;
  data: PostData;
  body: string;
}

let cachedPosts: Post[] | null = null;

function toPost(m: DirectusMensagem): Post {
  return {
    id: m.slug,
    body: m.body ?? "",
    data: {
      title: m.title,
      excerpt: m.excerpt,
      category: m.category as Category,
      date: new Date(m.date),
      updatedDate: m.updated_date ? new Date(m.updated_date) : undefined,
      author: { name: m.author_name, role: m.author_role },
      cover: m.cover ? directusAssetUrl(m.cover, { width: 1600, quality: 80, format: "webp" }) : undefined,
      coverSrcset: m.cover ? directusAssetSrcset(m.cover, COVER_WIDTHS, { quality: 80, format: "webp" }) : undefined,
      videoUrl: m.video_url ?? undefined,
      featured: m.featured,
      draft: m.draft,
      serie: m.serie ?? undefined,
      serieOrdem: m.serie_ordem ?? undefined,
    },
  };
}

/** Outras mensagens da mesma série, em ordem — usado na página da mensagem
 * pra navegar entre as partes ("parte 2 de 3", com link pras demais). */
export const getSerie = (posts: Post[], post: Post) => {
  if (!post.data.serie) return [];
  return posts
    .filter((p) => p.data.serie === post.data.serie)
    .sort((a, b) => (a.data.serieOrdem ?? 0) - (b.data.serieOrdem ?? 0));
};

/** Busca todas as mensagens do Directus. Roda em tempo de build. */
export async function getAllMensagens(): Promise<Post[]> {
  if (cachedPosts) return cachedPosts;
  const items = await fetchItems<DirectusMensagem>("mensagens");
  cachedPosts = items.map(toPost);
  return cachedPosts;
}

export const authorSlug = (author: string) =>
  author
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "e")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export const categoryHref = (category: string) => `/tema/${categorySlug(category)}/`;

export const postSlug = (post: Post) => post.id;

export const postHref = (post: Post) => `/mensagem/${postSlug(post)}/`;

export const byNewest = (a: Post, b: Post) => b.data.date.getTime() - a.data.date.getTime();

export const visiblePosts = (posts: Post[]) =>
  posts.filter((post) => !post.data.draft).sort(byNewest);

/**
 * Reading time from the raw Markdown body at 220 words per minute, so posts
 * never have to carry a hand-maintained `readMinutes` field.
 */
export const readingMinutes = (post: Post) => {
  const words = (post.body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
};

export const readingLabel = (post: Post) => `${readingMinutes(post)} min de leitura`;

export const getFeatured = (posts: Post[], limit = 5) =>
  visiblePosts(posts)
    .filter((post) => post.data.featured)
    .slice(0, limit);

export const getPostsByCategory = (posts: Post[], category: string) =>
  visiblePosts(posts).filter((post) => post.data.category === category);

/** Categories in configured order, with post counts. Empty ones are dropped. */
export const getCategoryList = (posts: Post[]) => {
  const visible = visiblePosts(posts);

  return categories
    .map((category) => ({
      name: category,
      slug: categorySlug(category),
      count: visible.filter((post) => post.data.category === category).length,
    }))
    .filter((entry) => entry.count > 0);
};

export const getRelated = (posts: Post[], current: Post, limit = 3) =>
  visiblePosts(posts)
    .filter((post) => post.id !== current.id)
    .sort((a, b) => {
      const sameCategory =
        Number(b.data.category === current.data.category) -
        Number(a.data.category === current.data.category);
      return sameCategory || byNewest(a, b);
    })
    .slice(0, limit);

/** Previous/next in publication order, matching the article footer navigation. */
export const getAdjacent = (posts: Post[], current: Post) => {
  const ordered = visiblePosts(posts);
  const index = ordered.findIndex((post) => post.id === current.id);

  return {
    newer: index > 0 ? ordered[index - 1] : undefined,
    older: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined,
  };
};

export const getAllAuthors = (posts: Post[]) =>
  Array.from(
    visiblePosts(posts)
      .reduce((authors, post) => {
        const slug = authorSlug(post.data.author.name);
        const current = authors.get(slug);
        authors.set(slug, {
          name: post.data.author.name,
          role: post.data.author.role,
          posts: [...(current?.posts ?? []), post],
        });
        return authors;
      }, new Map<string, { name: string; role: string; posts: Post[] }>())
      .entries(),
  )
    .map(([slug, author]) => ({ slug, ...author }))
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));

/* timeZone: "UTC" porque as datas vêm do Directus como "AAAA-MM-DD" (um dia
   de calendário, não um instante) — sem isso, formatar dependeria do fuso
   horário de onde o build roda, podendo mostrar o dia errado. */
export const formatDate = (date: Date, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat(siteConfig.dateLocale, {
    month: style === "short" ? "short" : "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
