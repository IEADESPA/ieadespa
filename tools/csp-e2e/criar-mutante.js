// Teste do próprio equipamento: cópia da ORIGINAL com 4 defeitos plantados de propósito (o comparador tem de apontar cada um).
//  1) botão "Aa+" (modo de leitura fácil) sem manipulador (botão morto);
//  2) "Imprimir" das minhas cartas chamando com o argumento errado (não acha a carta, não abre janela);
//  3) formulário de trocar senha sem preventDefault (a página navega);
//  4) teclado (Enter) nos cartões do painel do dia com o "event" errado (currentTarget não é o cartão).
// Uso: node criar-mutante.js  →  node rodar.js --original original/app --nova mutante/app --nova-sem-csp --rapido
const fs = require("fs");
const path = require("path");
const orig = path.join(__dirname, "original", "app");
const dest = path.join(__dirname, "mutante", "app");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(orig, dest, { recursive: true });
function trocar(arq, de, para) {
  const f = path.join(dest, arq);
  const t = fs.readFileSync(f, "utf8");
  const n = t.split(de).length - 1;
  if (n !== 1) throw new Error(`esperava 1 ocorrência em ${arq}, achei ${n}: ${de}`);
  fs.writeFileSync(f, t.split(de).join(para));
  console.log(`${arq}: troca feita — ${de.slice(0, 80)}`);
}
trocar("index.html", ` onclick="alternarModoLeitura()"`, "");
trocar("script.js", "onclick=\"imprimirMinhaCarta(${c.cartaId})\"", "onclick=\"imprimirMinhaCarta(${c.cartaId + 1000})\"");
trocar("index.html", `onsubmit="event.preventDefault(); trocarMinhaSenha();"`, `onsubmit="trocarMinhaSenha();"`);
trocar("script.js", `onclick="irParaBlocoPainel(\${argJs(b.aba)})" tabindex="0" role="button" onkeydown="ativarComTeclado(event)"`, `onclick="irParaBlocoPainel(\${argJs(b.aba)})" tabindex="0" role="button" onkeydown="ativarComTeclado({ key: 'Enter', preventDefault() {}, currentTarget: document.body })"`);
