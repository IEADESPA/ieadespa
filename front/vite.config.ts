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
    reportCompressedSize: true,
    rollupOptions: {
      input: { membros: aqui("src/membros.ts") },
      preserveEntrySignatures: "exports-only",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "comum-[hash].js",
        assetFileNames: "[name][extname]"
      }
    }
  }
});
