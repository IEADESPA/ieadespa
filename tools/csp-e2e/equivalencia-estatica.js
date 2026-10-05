// Verificação ESTÁTICA e INDEPENDENTE da conversão: compara, ponto a ponto, o atributo de evento ORIGINAL com o convertido (relatório do agente A, 867 pontos),
// checando função/ação, quantidade e conteúdo de cada argumento e as marcas prevent/stop. Não depende de simular dados: cobre também os modelos que a
// comparação em navegador não alcançou. Tudo que a regra não explica sai como "A REVISAR".
const fs = require("fs");
const tsv = fs.readFileSync(require("path").join(__dirname, "conversao-relatorio.tsv"), "utf8").split("\n").slice(1).filter(Boolean);

// divide por vírgulas de nível superior respeitando aspas, ${...}, () [] {}
function dividir(txt) {
  const out = []; let atual = "", prof = 0, aspa = null;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspa) { atual += c; if (c === "\\") { atual += txt[++i] ?? ""; continue; } if (c === aspa && aspa !== "`") aspa = null; else if (c === "`" && aspa === "`") aspa = null; continue; }
    if (c === "$" && txt[i + 1] === "{") { let d = 0, j = i; for (; j < txt.length; j++) { if (txt[j] === "{") d++; else if (txt[j] === "}") { d--; if (d === 0) break; } } atual += txt.slice(i, j + 1); i = j; continue; }
    if (c === '"' || c === "'" || c === "`") { aspa = c; atual += c; continue; }
    if ("([{".includes(c)) prof++;
    if (")]}".includes(c)) prof--;
    if (c === "," && prof === 0) { out.push(atual.trim()); atual = ""; continue; }
    atual += c;
  }
  if (atual.trim() !== "" || out.length) out.push(atual.trim());
  return out;
}
const sem$ = (s) => s.trim();
// o que o conversor deve ter produzido para UM argumento original
function esperados(arg) {
  const a = arg.trim();
  let m;
  if (a === "this") return ["ARG.elemento"];
  if (a === "event") return ["ARG.evento"];
  if (a === "this.value") return ["ARG.valor"];
  if (a === "this.checked") return ["ARG.marcado"];
  if ((m = /^\$\{argJs\(([\s\S]*)\)\}$/.exec(a))) { const x = m[1].trim(); return [`String(${x} ?? "")`, `String(${x})`, `${x}`, `Number(${x})`]; }
  if ((m = /^'\$\{([\s\S]*)\}'$/.exec(a)) || (m = /^"\$\{([\s\S]*)\}"$/.exec(a))) { const x = m[1].trim(); return [`String(${x})`, `String(${x} ?? "")`]; }
  if ((m = /^\$\{([\s\S]*)\}$/.exec(a))) { const x = m[1].trim(); return [x, `Number(${x})`, `(${x})`, ...(/^[\w$.]+ \? true : false$/.test(x) ? [] : [])]; }
  if ((m = /^'([^'$\\]*)'$/.exec(a))) return [`"${m[1]}"`, `'${m[1]}'`];
  if ((m = /^"([^"$\\]*)"$/.exec(a))) return [`"${m[1]}"`];
  if (/^-?\d+(\.\d+)?$/.test(a) || /^(true|false|null|undefined)$/.test(a)) return [a];
  if (a.startsWith("{") && a.endsWith("}")) { // objeto literal com this.checked/this.value
    const t = a.replace(/this\.checked/g, "ARG.marcado").replace(/this\.value/g, "ARG.valor");
    return [t, t.replace(/\$\{([^}]*)\}/g, "$1")];
  }
  if ((m = /^${([sS]*?)?s*"(true|false)"s*:s*"(true|false)"}$/.exec(a))) { const c = m[1].trim(); return [c + " ? " + m[2] + " : " + m[3], "(" + c + ") ? " + m[2] + " : " + m[3]]; }
  if ((m = /^${([sS]*?)?s*Number(([sS]*?))s*:s*"null"}$/.exec(a))) { const c = m[1].trim(); return ["(" + c + ") ? Number(" + m[2] + ") : null", c + " ? Number(" + m[2] + ") : null"]; }
  return null; // forma não prevista
}
const norm = (s) => s.replace(/\s+/g, " ").replace(/\s*([,{}()])\s*/g, "$1").trim();

const resumo = { total: 0, igual: 0, revisar: [], porFlag: { prevent: 0, stop: 0 } };
for (const linha of tsv) {
  const [arquivo, ln, antes, depois] = linha.split("\t");
  if (!antes || !depois) continue;
  resumo.total++;
  const ant = /\bon([a-z]+)\s*=\s*(["'])([\s\S]*)\2$/.exec(antes.trim());
  const dep = /data-on-([a-z]+)="([^"]*)"/.exec(depois);
  if (!ant || !dep) { resumo.revisar.push({ arquivo, ln, motivo: "não consegui ler antes/depois", antes, depois }); continue; }
  const evento = ant[1], corpo = ant[3].trim();
  if (evento !== dep[1]) { resumo.revisar.push({ arquivo, ln, motivo: `evento mudou ${evento} -> ${dep[1]}`, antes, depois }); continue; }
  // marcas
  const prevenir = /event\.preventDefault\(\)|return false/.test(corpo), parar = /event\.stopPropagation\(\)/.test(corpo);
  const temPrevent = new RegExp(`data-prevent="[^"]*\\b${evento}\\b`).test(depois), temStop = new RegExp(`data-stop="[^"]*\\b${evento}\\b`).test(depois);
  if (prevenir !== temPrevent) { resumo.revisar.push({ arquivo, ln, motivo: `preventDefault: original=${prevenir} novo=${temPrevent}`, antes, depois }); continue; }
  if (parar !== temStop) { resumo.revisar.push({ arquivo, ln, motivo: `stopPropagation: original=${parar} novo=${temStop}`, antes, depois }); continue; }
  // a chamada: remove preventDefault/stopPropagation/return false do corpo
  const nucleo = corpo.replace(/event\.preventDefault\(\);?/g, "").replace(/event\.stopPropagation\(\);?/g, "").replace(/;?\s*return false;?/g, "").replace(/;\s*$/, "").trim();
  const mc = /^([\w$.]+)\(([\s\S]*)\)$/.exec(nucleo);
  if (!mc) { resumo.revisar.push({ arquivo, ln, motivo: "corpo original não é uma chamada simples", antes, depois }); continue; }
  const [, fn, argsOrig] = mc;
  const acao = dep[2];
  if (acao !== fn) { resumo.revisar.push({ arquivo, ln, motivo: `ação ${fn} -> ${acao}`, antes, depois }); continue; }
  const lista = argsOrig.trim() === "" ? [] : dividir(argsOrig);
  const ma = /data-args-[a-z]+="\$\{argsAttr\(([\s\S]*)\)\}"/.exec(depois);
  let novos = ma ? dividir(ma[1]) : [];
  if (!ma) {
    const mj = /data-args-[a-z]+=(?:'([^']*)'|"([^"]*)")/.exec(depois);
    if (mj) { try { const arr = JSON.parse((mj[1] ?? mj[2]).replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); novos = arr.map((v) => JSON.stringify(v)); } catch (e) { novos = ["<JSON invalido>"]; } }
  }
  if (fn === "ativarComTeclado" && lista.length === 1 && lista[0] === "event" && novos.length === 2 && norm(novos[0]) === "ARG.evento" && norm(novos[1]) === "ARG.elemento") { resumo.igual++; continue; }
  if (lista.length !== novos.length) { resumo.revisar.push({ arquivo, ln, motivo: `nº de argumentos ${lista.length} -> ${novos.length}`, antes, depois }); continue; }
  let ok = true, why = "";
  for (let i = 0; i < lista.length && ok; i++) {
    const esp = esperados(lista[i]);
    if (!esp) { ok = false; why = `arg #${i} forma não prevista: ${lista[i].slice(0, 70)}`; break; }
    if (!esp.some((e) => norm(e) === norm(novos[i]))) { ok = false; why = `arg #${i}: original ${lista[i].slice(0, 60)} -> novo ${novos[i].slice(0, 60)}`; }
  }
  if (!ok) { resumo.revisar.push({ arquivo, ln, motivo: why, antes, depois }); continue; }
  resumo.igual++;
  if (prevenir) resumo.porFlag.prevent++; if (parar) resumo.porFlag.stop++;
}
console.log(`pontos: ${resumo.total} | equivalência CONFIRMADA por regra: ${resumo.igual} | A REVISAR: ${resumo.revisar.length}`);
console.log(`(com data-prevent: ${resumo.porFlag.prevent}, data-stop: ${resumo.porFlag.stop})`);
const agrupado = {};
for (const r of resumo.revisar) { const k = r.motivo.replace(/arg #\d+.*/, "arg: valor diferente do esperado").replace(/nº de argumentos.*/, "nº de argumentos"); (agrupado[k] = agrupado[k] || []).push(r); }
for (const [k, v] of Object.entries(agrupado)) {
  console.log(`\n--- ${k} (${v.length})`);
  for (const r of v.slice(0, 40)) console.log(`  ${r.arquivo}:${r.ln}  ${r.motivo.slice(0, 120)}\n      antes : ${r.antes.slice(0, 150)}\n      depois: ${r.depois.slice(0, 190)}`);
}
