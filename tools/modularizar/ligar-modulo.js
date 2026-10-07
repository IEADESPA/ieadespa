// vD.2 — depois de extrair app/modulos/<nome>.js, liga o módulo: <script> no index.html (em ordem alfabética entre os
// módulos), casca do service worker (lista alfabética) + nova versão do cache, e a versão esperada no frontCsp.test.js.
// Uso: node ligar-modulo.js <nome> <versao-nova ex.: v9> "<nota curta para o comentário do service worker>"
const fs = require("fs");
const RAIZ = require("path").resolve(__dirname, "..", "..");
const [nome, versao, nota] = process.argv.slice(2);
if (!nome || !/^v\d+$/.test(versao || "")) { console.error("uso: node ligar-modulo.js <nome> <vN> [nota]"); process.exit(2); }
const modulos = fs.readdirSync(RAIZ + "/app/modulos").filter((n) => n.endsWith(".js")).sort();
if (!modulos.includes(nome + ".js")) { console.error("app/modulos/" + nome + ".js não existe"); process.exit(1); }

// index.html: bloco de <script src="modulos/..."> reescrito em ordem alfabética
let html = fs.readFileSync(RAIZ + "/app/index.html", "utf8");
const nl = html.includes("\r\n") ? "\r\n" : "\n";
const re = /(  <script src="modulos\/[^"]+"><\/script>\r?\n)+/;
const bloco = modulos.map((m) => `  <script src="modulos/${m}"></script>${nl}`).join("");
if (!re.test(html)) { console.error("index.html sem bloco de módulos"); process.exit(1); }
html = html.replace(re, bloco);
fs.writeFileSync(RAIZ + "/app/index.html", html);

// service worker: lista e versão
let sw = fs.readFileSync(RAIZ + "/app/service-worker.js", "utf8");
const mVer = /const CACHE_NOME = "ieadespa-app-shell-(v\d+)";/.exec(sw);
if (!mVer) { console.error("CACHE_NOME não encontrado"); process.exit(1); }
const antiga = mVer[1];
sw = sw.replace(mVer[0], `const CACHE_NOME = "ieadespa-app-shell-${versao}";`);
sw = sw.replace(/const ARQUIVOS_SHELL = \[[^\]]*\];/, (t) => {
  const itens = JSON.parse(/\[[^\]]*\]/.exec(t)[0]).filter((x) => !x.startsWith("/modulos/"));
  const i = itens.indexOf("/script.js");
  itens.splice(i + 1, 0, ...modulos.map((m) => "/modulos/" + m));
  return `const ARQUIVOS_SHELL = ${JSON.stringify(itens).replace(/","/g, '", "')};`;
});
// comentário de versão: acrescenta "; vN: + nome" na linha que fecha o histórico (a que contém "a versão sobe")
sw = sw.replace(/(\/\/ casca, e a versão sobe[^\r\n]*)\)\./, (t, p) => `${p}; ${versao}: + ${nome}${nota ? " — " + nota : ""}).`);
fs.writeFileSync(RAIZ + "/app/service-worker.js", sw);

// teste: versão esperada
const arqTeste = RAIZ + "/api/shared/__tests__/frontCsp.test.js";
let teste = fs.readFileSync(arqTeste, "utf8");
teste = teste.replace(`cache novo (${antiga}), eventos.js e todos os módulos`, `cache novo (${versao}), eventos.js e todos os módulos`).replace(`ieadespa-app-shell-${antiga}";/`, `ieadespa-app-shell-${versao}";/`);
fs.writeFileSync(arqTeste, teste);
console.log(`módulos (ordem): ${modulos.join(", ")}; cache ${antiga} -> ${versao}`);
