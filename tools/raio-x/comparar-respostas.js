// tools/raio-x/comparar-respostas.js — compara as respostas guardadas pelo medir-velocidade3.js antes e depois de uma correção de velocidade: cada caso precisa
// sair IGUAL (mesmo status, mesmo conteúdo). A ordem de listas que o banco devolve sem ORDER BY (as respostas de uma votação) não conta: essas listas são
// comparadas ordenadas. Uso: node tools/raio-x/comparar-respostas.js <pasta-antes> <pasta-depois>
const fs = require("fs");
const path = require("path");
const [, , antes, depois] = process.argv;
// Listas sem ordem garantida pelo banco na resposta de hoje: comparadas em ordem canônica.
const SEM_ORDEM = new Set(["respostas"]);
function canonico(v, chave) {
  if (Array.isArray(v)) {
    const itens = v.map((x) => canonico(x));
    return SEM_ORDEM.has(chave) ? itens.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x)) : itens;
  }
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canonico(v[k], k); return o; }
  return v;
}
// Listas ordenadas por um critério com empates (antes, o desempate ficava por conta do banco; depois da correção 3 há um desempate fixo): comparadas como o MESMO
// CONJUNTO de itens e a MESMA ORDEM pelo critério da tela.
const ORDEM_COM_EMPATE = [
  [/^vinculos-familiares--/, (i) => i.nome],
  [/^relatorios-departamentais--/, (i) => i.anoReferencia * 100 + i.mesReferencia]
];
function mesmoConjuntoEOrdem(a, b, chave) {
  if (a.status !== b.status || !Array.isArray(a.corpo) || !Array.isArray(b.corpo) || a.corpo.length !== b.corpo.length) return false;
  const ms = (x) => x.corpo.map((i) => JSON.stringify(canonico(i))).sort();
  const A = ms(a), B = ms(b);
  return A.every((x, i) => x === B[i]) && JSON.stringify(a.corpo.map(chave)) === JSON.stringify(b.corpo.map(chave));
}
let iguais = 0, diferentes = 0;
for (const f of fs.readdirSync(antes).filter((x) => x.endsWith(".json")).sort()) {
  const b = path.join(depois, f);
  if (!fs.existsSync(b)) { console.log(`FALTA no depois: ${f}`); diferentes++; continue; }
  const objA = JSON.parse(fs.readFileSync(path.join(antes, f), "utf8")), objB = JSON.parse(fs.readFileSync(b, "utf8"));
  const A = JSON.stringify(canonico(objA));
  const B = JSON.stringify(canonico(objB));
  const empate = ORDEM_COM_EMPATE.find(([re]) => re.test(f));
  if (A === B) { iguais++; console.log(`igual     ${f} (${A.length} caracteres)`); }
  else if (empate && mesmoConjuntoEOrdem(objA, objB, empate[1])) { iguais++; console.log(`igual     ${f} (mesmos ${objA.corpo.length} itens e a mesma ordem pelo critério da tela; só o desempate mudou)`); }
  else {
    diferentes++;
    let i = 0; while (i < A.length && A[i] === B[i]) i++;
    console.log(`DIFERENTE ${f}: a partir do caractere ${i}\n  antes : ${A.slice(Math.max(0, i - 80), i + 120)}\n  depois: ${B.slice(Math.max(0, i - 80), i + 120)}`);
  }
}
console.log(`\n${iguais} iguais, ${diferentes} diferentes`);
process.exitCode = diferentes ? 1 : 0;
