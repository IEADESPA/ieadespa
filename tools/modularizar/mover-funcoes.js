// vD.2 — devolve ao script.js funções de nível superior que foram parar num módulo mas são de uso geral do front
// (ex.: escaparHtmlEbd, argsAttr). Cada função sai do módulo com o comentário colado acima dela e entra no script.js
// numa seção própria, logo antes do registro de ações ("// ---- CSP forte: AÇÕES..."). Texto das funções intacto.
// Uso: node mover-funcoes.js <modulo> "<título da seção>" nome1 nome2 ...
const fs = require("fs");
const RAIZ = require("path").resolve(__dirname, "..", "..");
const [modulo, titulo, ...nomes] = process.argv.slice(2);
if (!modulo || !titulo || !nomes.length) { console.error("uso: node mover-funcoes.js <modulo> <titulo> nomes..."); process.exit(2); }
const arqMod = `${RAIZ}/app/modulos/${modulo}.js`, arqScript = `${RAIZ}/app/script.js`;
let mod = fs.readFileSync(arqMod, "utf8").split("\n");
const pecas = [];
for (const nome of nomes) {
  const ini0 = mod.findIndex((l) => new RegExp(`^(async\\s+)?function\\s+${nome}\\s*\\(`).test(l));
  if (ini0 < 0) { console.error("função não encontrada no módulo:", nome); process.exit(1); }
  let fim = ini0; while (fim < mod.length && !/^}\s*$/.test(mod[fim])) fim++;
  let ini = ini0; while (ini > 0 && /^\/\//.test(mod[ini - 1]) && !/^\/\/ ----/.test(mod[ini - 1])) ini--;
  pecas.push(mod.slice(ini, fim + 1).join("\n"));
  mod.splice(ini, fim - ini + 1);
  // tira linha vazia dupla deixada no lugar
  if (ini > 0 && ini < mod.length && mod[ini - 1].trim() === "" && mod[ini].trim() === "") mod.splice(ini, 1);
}
fs.writeFileSync(arqMod, mod.join("\n"));
let script = fs.readFileSync(arqScript, "utf8");
const marca = "// ---- CSP forte: AÇÕES QUE O HTML PODE PEDIR";
const i = script.indexOf(marca);
if (i < 0) { console.error("marca do registro não encontrada no script.js"); process.exit(1); }
const secao = `// ---- ${titulo} ----\n${pecas.join("\n\n")}\n\n`;
script = script.slice(0, i) + secao + script.slice(i);
fs.writeFileSync(arqScript, script);
console.log(`${nomes.length} função(ões) devolvida(s) ao script.js: ${nomes.join(", ")}; módulo com ${mod.length} linhas`);
