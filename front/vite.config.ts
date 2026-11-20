// O build das telas novas (FASE 10): cada módulo é uma entrada e sai em app/svelte/<módulo>.js (+ .css), carregado pela casca SÓ
// quando a pessoa entra no módulo (app/modulos/casca.js, abrirModuloSvelte). Peças comuns a dois módulos ou mais saem num pedaço
// próprio com o hash no nome (o cache do navegador nunca serve um pedaço velho).
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

const aqui = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  base: "/svelte/",
  build: {
    outDir: aqui("../app/svelte"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    modulePreload: false,
    // um CSS só por módulo (a casca põe o <link> ao entrar): nada de dezenas de arquivinhos de estilo pela rede lenta
    cssCodeSplit: false,
    reportCompressedSize: true,
    rollupOptions: {
      input: { membros: aqui("src/membros.ts") },
      preserveEntrySignatures: "exports-only",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        // o pedaço comum tem nome fixo (a casca o pede junto com a entrada, sem esperar a entrada chegar); as telas, com o hash
        chunkFileNames: (c) => (c.name === "comum" ? "comum.js" : "[name]-[hash].js"),
        // as peças comuns e o Svelte num pedaço só ("comum"); cada tela no pedaço dela
        manualChunks(id: string) {
          if (/[\/]node_modules[\/]svelte[\/]/.test(id) || /[\/]src[\/]comum[\/]/.test(id)) return "comum";
          // o que as telas de Membros dividem (o estado, os rótulos, os avisos...) vai junto: nenhuma tela espera um segundo pedaço
          if (/[\/]src[\/]membros[\/][^\/]+\.ts$/.test(id)) return "comum";
          return undefined;
        },
        // o CSS único sai com o nome do módulo (membros.css), que é o que a casca procura
        assetFileNames: (a) => ((a.names ?? []).some((n) => n.endsWith(".css")) ? "membros.css" : "[name][extname]")
      }
    }
  }
});
