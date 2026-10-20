// aplicar-migracao.js — aplica UMA migração sobre o banco local, no mesmo molde do executor do deploy (lotes separados por GO), em segundos.
// Serve para reaplicar a migração em desenvolvimento sem esperar os ~9 minutos do executor completo (que continua sendo a prova final: `bash rodar.sh preparar`).
// Uso: node -r ./shim-mssql.js aplicar-migracao.js 145            (aplica sql/migrations/145_*.sql; com "145 2" aplica a 145 duas vezes, para provar a idempotência)
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const numero = process.argv[2];
const vezes = Number(process.argv[3] || 1);
if (!numero) { console.log("Informe o número da migração (ex.: 145)."); process.exit(1); }
const pasta = path.join(L.API, "..", "sql", "migrations");
const arquivos = fs.readdirSync(pasta).filter((n) => n.startsWith(`${numero}_`) && n.endsWith(".sql"));
if (arquivos.length !== 1) { console.log(`Esperava 1 arquivo para ${numero}, achei ${arquivos.length}.`); process.exit(1); }
(async () => {
  const pool = await L.obterPool();
  const lotes = fs.readFileSync(path.join(pasta, arquivos[0]), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < vezes; i++) for (const lote of lotes) await pool.request().query(lote);
  console.log(`aplicada ${arquivos[0]} (${lotes.length} lotes) x${vezes}`);
  L.shimEncerrar();
})().catch((e) => { console.log("ERRO:", e && e.message); try { L.shimEncerrar(); } catch { } process.exitCode = 1; });
