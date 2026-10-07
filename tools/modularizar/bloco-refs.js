// vD.2 — para um bloco [ini, fim) do app/script.js (ou de um ramo), lista os nomes de nível superior declarados nele e
// quantas vezes cada um é citado FORA do bloco (chamadas de outras partes do script.js). Uso:
//   node bloco-refs.js <ramo|-> "<marcador início>" "<marcador fim>"
const { execSync } = require("child_process");
const fs = require("fs");
const RAIZ = require("path").resolve(__dirname, "..", "..");
const [ramo, mIni, mFim] = process.argv.slice(2);
const texto = ramo && ramo !== "-" ? execSync(`git show ${ramo}:app/script.js`, { cwd: RAIZ, maxBuffer: 1 << 26 }).toString("utf8") : fs.readFileSync(RAIZ + "/app/script.js", "utf8");
const linhas = texto.replace(/\r/g, "").split("\n");
const ini = linhas.findIndex((l) => l.includes(mIni));
const fim = linhas.findIndex((l, i) => i > ini && l.includes(mFim));
if (ini < 0 || fim < 0) { console.error("marcadores não encontrados", ini, fim); process.exit(1); }
const bloco = linhas.slice(ini, fim), fora = [...linhas.slice(0, ini), ...linhas.slice(fim)].join("\n");
const nomes = [];
for (const l of bloco) { let m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l); if (m) nomes.push([m[1], "função"]); m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(l); if (m) nomes.push([m[1], "declaração"]); }
const soltas = bloco.filter((l) => /^[^\s\/}]/.test(l) && !/^(async\s+)?function |^const |^let |^var |^\/\//.test(l));
const citados = [];
for (const [n, tipo] of nomes) { const c = (fora.match(new RegExp("\\b" + n.replace(/\$/g, "\\$") + "\\b", "g")) || []).length; if (c) citados.push(`${n} (${tipo}): ${c}×`); }
console.log(`bloco: linhas ${ini + 1}-${fim} (${bloco.length} linhas), ${nomes.filter((x) => x[1] === "função").length} funções, ${nomes.filter((x) => x[1] === "declaração").length} declarações, ${soltas.length} instruções soltas${soltas.length ? ": " + soltas.map((s) => s.slice(0, 60)).join(" | ") : ""}`);
console.log(`citados fora do bloco: ${citados.length ? citados.join(", ") : "nenhum"}`);
