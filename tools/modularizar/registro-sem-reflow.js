// Mantém o registrarAcoes({...}) do script.js com as linhas ORIGINAIS (HEAD), só sem os nomes que foram para o módulo.
const fs = require("fs"); const { execSync } = require("child_process");
const RAIZ = require("path").resolve(__dirname, "..", "..");
const NOME = process.argv[2] || "psc";
const modulo = fs.readFileSync(RAIZ + "/app/modulos/" + NOME + ".js", "utf8");
const nomes = new Set(modulo.slice(modulo.lastIndexOf("registrarAcoes({")).match(/[A-Za-z_$][\w$]*/g).filter((n) => n !== "registrarAcoes"));
const head = execSync("git show HEAD:app/script.js", { cwd: RAIZ, maxBuffer: 1 << 26 }).toString("utf8").replace(/\r/g, "");
const atual = fs.readFileSync(RAIZ + "/app/script.js", "utf8").replace(/\r/g, "");
const blocoDe = (t) => { const i = t.lastIndexOf("registrarAcoes({"); const f = t.indexOf("});", i) + 3; return [i, f, t.slice(i, f)]; };
const [, , orig] = blocoDe(head);
const linhas = orig.split("\n");
const saida = [];
for (let i = 0; i < linhas.length; i++) {
  const l = linhas[i];
  if (i === 0 || i === linhas.length - 1) { saida.push(l); continue; }
  const ind = /^\s*/.exec(l)[0];
  const itens = l.trim().split(",").map((s) => s.trim()).filter(Boolean).filter((n) => !nomes.has(n));
  if (itens.length) saida.push(ind + itens.join(", ") + ",");
}
// última linha de nomes sem vírgula final
for (let i = saida.length - 2; i > 0; i--) { if (saida[i].trim()) { saida[i] = saida[i].replace(/,\s*$/, ""); break; } }
const novo = saida.join("\n");
const [ia, fa] = blocoDe(atual);
fs.writeFileSync(RAIZ + "/app/script.js", atual.slice(0, ia) + novo + atual.slice(fa));
const removidos = (orig.match(/[A-Za-z_$][\w$]*/g) || []).filter((n) => nomes.has(n)).length;
console.log(`nomes do módulo: ${nomes.size}; removidos do registro: ${removidos}; linhas do bloco: ${linhas.length} -> ${saida.length}`);
