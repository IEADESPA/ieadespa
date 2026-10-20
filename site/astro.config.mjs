// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import rehypeSlug from "rehype-slug";
import { siteConfig } from "./src/config/site.ts";
import { codeThemes, codeDefaultColor } from "./src/config/code.ts";

import mdx from "@astrojs/mdx";

const shikiConfig = /** @type {const} */ ({
  themes: codeThemes,
  defaultColor: codeDefaultColor,
});

export default defineConfig({
  site: siteConfig.siteUrl,
  redirects: {
    "/ministerios": "/orgaos/",
  },
  integrations: [
    sitemap({
      // fora do mapa do site: a busca e as telas da equipe (/painel, /painel-eventos, /painel-camisetas, /painel-conteudo — já são noindex)
      filter: (page) => page !== new URL("/busca/", siteConfig.siteUrl).toString() && !new URL(page).pathname.startsWith("/painel"),
    }),
    mdx(),
  ],
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeSlug],
    }),
    shikiConfig,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
