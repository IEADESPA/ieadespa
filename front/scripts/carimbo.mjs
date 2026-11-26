// npm run build carimba a saída; npm run conferir (ou node scripts/carimbo.mjs --conferir) diz se ela ainda corresponde ao fonte.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { carimbar, conferir } = require("./carimbo-lib.cjs");

if (process.argv.includes("--conferir")) {
  const erros = conferir();
  if (erros.length) { for (const e of erros) console.error("✗ " + e); process.exit(1); }
  console.log("✓ app/svelte corresponde ao código-fonte de front/");
} else {
  const c = carimbar();
  console.log(`carimbo: fonte ${c.fonte.slice(0, 12)}, ${Object.keys(c.arquivos).length} arquivo(s)`);
}
