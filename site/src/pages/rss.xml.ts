import { siteConfig } from "@/config/site";
import { getAllNoticias, noticiaHref, visibleNoticias } from "@/lib/noticias";
import { postHref, getAllMensagens, visiblePosts } from "@/lib/posts";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const posts = visiblePosts(await getAllMensagens()).map((post) => ({
    title: post.data.title,
    excerpt: post.data.excerpt,
    date: post.data.date,
    url: new URL(postHref(post), siteConfig.siteUrl).toString(),
    category: "Mensagem",
  }));

  const noticias = visibleNoticias(await getAllNoticias()).map((noticia) => ({
    title: noticia.data.title,
    excerpt: noticia.data.excerpt,
    date: noticia.data.date,
    url: new URL(noticiaHref(noticia), siteConfig.siteUrl).toString(),
    category: "Notícia",
  }));

  // Mensagens e notícias juntas, mais recente primeiro — quem acompanha por
  // leitor de feeds não precisa de dois feeds separados pra ver tudo.
  const items = [...posts, ...noticias]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 30)
    .map(
      (item) => `<item>
  <title>${escapeXml(item.title)}</title>
  <link>${item.url}</link>
  <guid>${item.url}</guid>
  <pubDate>${item.date.toUTCString()}</pubDate>
  <category>${escapeXml(item.category)}</category>
  <description>${escapeXml(item.excerpt)}</description>
</item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(siteConfig.name)}</title>
  <link>${siteConfig.siteUrl}</link>
  <description>${escapeXml(siteConfig.description)}</description>
  <language>${escapeXml(siteConfig.language)}</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
