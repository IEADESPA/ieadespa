import { buildSearchIndex } from "@/lib/search";

/**
 * Static search index consumed by the header command palette and by
 * /busca/. Covers mensagens, notícias, órgãos e congregações — metadata
 * only, never full article bodies, so it stays small.
 */
export async function GET() {
  const index = await buildSearchIndex();

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
