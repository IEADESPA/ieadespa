// Monta a página da rodada 21 (20/11/2026) a partir da página leve da rodada 20 (propostas-r20/index.html), que não muda.
// A 21 fica no alto; a 20 fica num "Rodada 20 (respondida)" recolhido. O "Já aprovados (rodadas 2 a 18)" continua um link para a página antiga.
// As observações seguem com 20.000 caracteres e o rascunho no aparelho; a observação geral passa a 'geral-r21'.
// O código antigo que a página carrega não pode trazer o que não existe na Igreja: a "oferta da ceia" vira "Oferta de culto" (ele, 19/11:
// não existe oferta da ceia). No fim, a procura das palavras proibidas no HTML inteiro.
const fs = require('fs'), path = require('path');
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r20', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };

// 1. as telas da 21 logo depois da lista da 20 (unshift: a 21 fica na frente)
const ancora = 'TELAS.unshift(...TELAS_R20.map(t => Object.assign({}, t, { rodada: 20 })));';
t(ancora, ancora + '\n' + ['r21-telas.js', 'r21b-telas.js', 'r21-lista.js'].map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n'));
// 2. a explicação da 20 sai (a da 21 a substitui)
{ const i = html.indexOf('const EXPLICA_RODADA = `'), j = html.indexOf('`;\n', i) + 3; if (i < 0 || j < 3) throw new Error('não achei a explicação da 20'); html = html.slice(0, i) + html.slice(j); }
// 3. a rodada atual e os grupos: a 21 aberta, a 20 respondida e recolhida
t('const RODADA_ATUAL = 20;\nconst GRUPOS_TELAS = [[20, "Rodada 20: Financeiro, a rodada 19 refeita com a realidade do dinheiro (para escolher agora)"]];',
  'const RODADA_ATUAL = 21;\nconst GRUPOS_TELAS = [[21, "Rodada 21: Financeiro, os acertos da rodada 20 (para escolher agora)"], [20, "Rodada 20 (respondida)"]];');
t("'propostas-explica-r20'", "'propostas-explica-r21'", true);
{ const i = html.indexOf('function renderTelas() {'), j = html.indexOf('function renderOpcoes() {'); if (i < 0 || j < 0) throw new Error('não achei o renderTelas');
  html = html.slice(0, i) + `// a rodada 20, já respondida, fica recolhida embaixo da 21 (aberta se ele abriu, ou se a tela escolhida é dela)
let antigaAberta = false;
try { antigaAberta = localStorage.getItem('propostas-r20-aberta') === 'aberta'; } catch (e) { }
document.addEventListener('toggle', ev => { const d = ev.target; if (!d || !d.classList || !d.classList.contains('antiga')) return; antigaAberta = d.open; try { localStorage.setItem('propostas-r20-aberta', d.open ? 'aberta' : 'fechada'); } catch (e) { } }, true);
function renderTelas() {
  const atual = GRUPOS_TELAS.find(g => g[0] === RODADA_ATUAL), antigas = GRUPOS_TELAS.filter(g => g[0] !== RODADA_ATUAL);
  const aberta = antigaAberta || (TELAS[estado.tela] && TELAS[estado.tela].rodada !== RODADA_ATUAL);
  $('telas').innerHTML = \`<div class="rodada"><h2>\${atual[1]}</h2><details class="explica"\${explicaAberta ? ' open' : ''}><summary>O que muda nesta rodada (leia primeiro)</summary>\${EXPLICA_R21}</details><div class="telas-grid">\${botoesDaRodada(atual[0])}</div></div>\` + antigas.map(g => \`<details class="antiga"\${aberta ? ' open' : ''}><summary>\${g[1]}</summary><div class="telas-grid">\${botoesDaRodada(g[0])}</div></details>\`).join('');
}
` + html.slice(j); }
// 4. ao abrir, a tela lembrada só vale se for da rodada atual (senão começa na primeira da 21); a chave 'propostas-r15' continua a mesma
t('  if (i >= 0) { estado.tela = i; estado.opcao = TELAS[i].opcoes[s.opcao] ? s.opcao : 0; }', '  if (i >= 0 && TELAS[i].rodada === 21) { estado.tela = i; estado.opcao = TELAS[i].opcoes[s.opcao] ? s.opcao : 0; }');
t("'geral-r20'", "'geral-r21'", true);
t("escolhas/geral-r20'", "escolhas/geral-r21'", true);
// 5. o HTML em volta
t('<title>Propostas rodada 20</title>', '<title>Propostas rodada 21</title>');
t('IEADESPA · FASE 10 · rodada 20', 'IEADESPA · FASE 10 · rodada 21');
t('Observação geral sobre a rodada 20', 'Observação geral sobre a rodada 21');
t('Esta página é da rodada 20: a rodada 19 foi refeita aqui, e as observações dela continuam guardadas.', 'Esta página é da rodada 21. A rodada 20, já respondida, fica logo acima, recolhida, com as escolhas e as observações guardadas.');
t('[hidden] { display: none !important; }', `/* Rodada 21: a rodada 20, já respondida, recolhida embaixo da 21 */
.antiga { background: var(--sup); border: 1px solid var(--borda); border-radius: 12px; padding: 2px 16px; }
.antiga summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--suave); list-style: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.antiga summary::-webkit-details-marker { display: none; }
.antiga summary::before { content: ""; width: 8px; height: 8px; flex: none; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform .15s ease-out; margin: 0 4px 0 2px; }
.antiga[open] summary::before { transform: rotate(45deg); }
.antiga summary:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; border-radius: 6px; }
.antiga .telas-grid { padding: 2px 0 14px; }
@media (prefers-reduced-motion: reduce) { .antiga summary::before { transition: none; } }
[hidden] { display: none !important; }`);
// 6. a limpeza do que não existe na Igreja, no código antigo que a página carrega
const LIMPA = [
  ["const r20MNomes = (n, ini, ceia) => { const L = []; for (let i = 0; i < n; i++) { const j = ini + i; L.push(i === ceia ?", "const r20MNomes = (n, ini, sn) => { const L = []; for (let i = 0; i < n; i++) { const j = ini + i; L.push(i === sn ?"],
  ["const r20MBloco = (bloco, de, n, ini, ceia = -1) => r20MNomes(n, ini, ceia)", "const r20MBloco = (bloco, de, n, ini, sn = -1) => r20MNomes(n, ini, sn)"],
  ["['Ofertas (quando há, como a da ceia)', ", "['Oferta de culto e oferta voluntária', "],
  ["'quando há, como a da ceia'", "'Oferta de culto e voluntária'"],
  ['Oferta da ceia', 'Oferta de culto'], ['oferta da ceia', 'oferta de culto']
];
for (const [a, b] of LIMPA) html = html.split(a).join(b);
// 7. a procura obrigatória: no HTML inteiro, "culto" só em "Oferta de culto"
const achou = [];
const rx = /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi; let m;
while ((m = rx.exec(html))) { const ini = Math.max(0, m.index - 10); if (/^culto$/i.test(m[0]) && /oferta de $/i.test(html.slice(m.index - 10, m.index))) continue; achou.push(html.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')); }
const ok = (s, n) => (n ? html.match(new RegExp(s, 'gi')) || [] : []).length;
console.log('Oferta de culto:', ok('oferta de culto', 1), '· palavras proibidas fora disso:', achou.length);
achou.slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r21'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r21', 'index.html'), html);
console.log('página:', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB');
