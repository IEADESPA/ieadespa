// Cobertura do plano: quais atributos on* da ORIGINAL (index.html estático + modelos no script.js e nos módulos de app/modulos/) foram acionados ao menos uma vez.
// node cobertura.js <plano.json> [pastaOriginal] [-v]
const fs = require("fs");
const path = require("path");
const { arquivosFront } = require("./fontes");

// forma = código com todo argumento literal ou interpolado trocado por #
function semInterpolacao(s) { let out = "", prof = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (prof === 0 && c === "$" && s[i + 1] === "{") { prof = 1; out += "#"; i++; continue; } if (prof > 0) { if (c === "{") prof++; else if (c === "}") prof--; continue; } out += c; } return out; }
const forma = (s) => semInterpolacao(String(s)).replace(/&quot;[^&]*&quot;|"[^"]*"|'[^']*'/g, "#").replace(/-?\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
function extrair(t) {
  const out = [];
  const re = /\bon([a-z]+)\s*=\s*(["'])/g;
  let m;
  while ((m = re.exec(t))) {
    const aspa = m[2]; let i = re.lastIndex, prof = 0, corpo = "";
    for (; i < t.length; i++) {
      const c = t[i];
      if (prof === 0 && c === "$" && t[i + 1] === "{") { prof = 1; corpo += "${"; i++; continue; }
      if (prof > 0) { if (c === "{") prof++; else if (c === "}") prof--; corpo += c; continue; }
      if (c === aspa) break;
      corpo += c;
    }
    out.push({ ev: m[1], corpo, linha: t.slice(0, m.index).split("\n").length });
    re.lastIndex = i + 1;
  }
  return out;
}
function cobertura(plano, pasta) {
  const acionadas = new Set();
  for (const a of plano) if (a.codigo) acionadas.add(a.evento + ": " + forma(a.codigo));
  const porArquivo = {}, faltam = [];
  for (const f of ["index.html", ...arquivosFront(pasta)]) {
    const lista = extrair(fs.readFileSync(path.join(pasta, f), "utf8"));
    let c = 0;
    for (const x of lista) {
      if (acionadas.has(x.ev + ": " + forma(x.corpo))) c++;
      else faltam.push(`${f}:${x.linha} on${x.ev}="${x.corpo.replace(/\s+/g, " ").slice(0, 110)}"`);
    }
    porArquivo[f] = { acionados: c, total: lista.length };
  }
  return { porArquivo, faltam };
}
module.exports = { cobertura };

if (require.main === module) {
  const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const pasta = process.argv[3] && !process.argv[3].startsWith("-") ? process.argv[3] : path.join(__dirname, "original", "app");
  const r = cobertura(d.plano, pasta);
  let t = 0, c = 0;
  for (const [f, v] of Object.entries(r.porArquivo)) { console.log(`${f}: ${v.acionados}/${v.total} atributos de evento acionados ao menos uma vez (${Math.round(100 * v.acionados / v.total)}%)`); t += v.total; c += v.acionados; }
  console.log(`TOTAL: ${c}/${t} (${Math.round(100 * c / t)}%)`);
  if (process.argv.includes("-v")) console.log(r.faltam.join("\n"));
}
