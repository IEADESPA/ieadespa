// Arquivos de JavaScript do front, na ORDEM em que o index.html os carrega: script.js e depois cada app/modulos/*.js
// (vD.2, 07/10/2026: o script.js está sendo dividido em módulos — scripts clássicos, mesmo escopo global). Todo instrumento
// que lia "o script.js" (modelo de respostas, cobertura, chave do plano) passa a ler a junção, por aqui.
// Com a pasta sem módulos (linhas de base antigas) o texto é exatamente o script.js: a chave do plano não muda.
const fs = require("fs");
const path = require("path");

function arquivosFront(pastaApp) {
  const index = fs.readFileSync(path.join(pastaApp, "index.html"), "utf8");
  const modulos = [...index.matchAll(/<script\s+src="(modulos\/[^"]+\.js)"/g)].map((m) => m[1]);
  return ["script.js", ...modulos];
}
function lerFront(pastaApp) {
  return arquivosFront(pastaApp).map((nome) => ({ nome, codigo: fs.readFileSync(path.join(pastaApp, nome), "utf8") }));
}
function textoFront(pastaApp) {
  return lerFront(pastaApp).map((a) => a.codigo).join("");
}
module.exports = { arquivosFront, lerFront, textoFront };
