// vD.2 — extração mecânica de um bloco contíguo do app/script.js para app/modulos/<nome>.js.
// Uso: node extrair-modulo.js <nome> "<marcador de início>" "<marcador de fim (exclusivo)>"
// O bloco vai do marcador de início até a linha ANTES do marcador de fim. As funções de nível
// superior do bloco que estavam no registrarAcoes({...}) do script.js saem de lá e entram num
// registrarAcoes({...}) no fim do arquivo novo.
const fs = require("fs");
const path = require("path");
const RAIZ = require("path").resolve(__dirname, "..", "..");
const [nome, mIni, mFim] = process.argv.slice(2);
if (!nome || !mIni || !mFim) { console.error("uso: node extrair-modulo.js <nome> <marcador-inicio> <marcador-fim>"); process.exit(2); }
const arq = path.join(RAIZ, "app/script.js");
const linhas = fs.readFileSync(arq, "utf8").split("\n");
const ini = linhas.findIndex((l) => l.includes(mIni));
const fim = linhas.findIndex((l, i) => i > ini && l.includes(mFim));
if (ini < 0 || fim < 0) { console.error("marcadores não encontrados:", ini, fim); process.exit(1); }
let bloco = linhas.slice(ini, fim);
while (bloco.length && bloco[bloco.length - 1].trim() === "") bloco.pop();
const restante = [...linhas.slice(0, ini), ...linhas.slice(fim)];

// funções de nível superior do bloco
const nomesBloco = new Set();
for (const l of bloco) { const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l); if (m) nomesBloco.add(m[1]); }
// consts/lets do bloco (para o relatório)
const constsBloco = bloco.filter((l) => /^(const|let|var)\s/.test(l)).length;

// registrarAcoes({...}) do script.js: tira os nomes do bloco
const texto = restante.join("\n");
const iReg = texto.lastIndexOf("registrarAcoes({");
if (iReg < 0) { console.error("registrarAcoes não encontrado"); process.exit(1); }
const iFimReg = texto.indexOf("});", iReg);
const corpoReg = texto.slice(iReg + "registrarAcoes({".length, iFimReg);
const nomesReg = corpoReg.split(",").map((s) => s.trim()).filter(Boolean);
const saem = nomesReg.filter((n) => nomesBloco.has(n));
const ficam = nomesReg.filter((n) => !nomesBloco.has(n));
// reescreve a lista no mesmo formato (linhas de ~140 colunas)
function formatar(nomes) {
  const out = []; let linha = "  ";
  for (const n of nomes) { const peca = n + ", "; if ((linha + peca).length > 150) { out.push(linha.replace(/\s+$/, "")); linha = "  "; } linha += peca; }
  out.push(linha.replace(/,\s*$/, ""));
  return "\n" + out.join("\n") + "\n";
}
const novoTexto = texto.slice(0, iReg) + "registrarAcoes({" + formatar(ficam) + texto.slice(iFimReg);

// arquivo do módulo
const cabecalho = [
  `// app/modulos/${nome}.js — módulo extraído do script.js (vD.2, ${new Date().toISOString().slice(0, 10)}).`,
  "// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo",
  "// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações",
  "// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).",
  "",
];
const rodape = ["", "registrarAcoes({" + formatar(saem) + "});", ""];
fs.mkdirSync(path.join(RAIZ, "app/modulos"), { recursive: true });
fs.writeFileSync(path.join(RAIZ, "app/modulos", `${nome}.js`), [...cabecalho, ...bloco, ...rodape].join("\n"));
fs.writeFileSync(arq, novoTexto);
console.log(`bloco: linhas ${ini + 1}-${fim} (${bloco.length} linhas), ${nomesBloco.size} funções, ${constsBloco} declarações; ações movidas: ${saem.length}; script.js agora tem ${novoTexto.split("\n").length} linhas`);
console.log("ações:", saem.join(", "));
