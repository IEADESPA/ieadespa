// Monta a página da rodada 31 (24/11/2026) a partir da página leve da rodada 30 (propostas-r30/index.html, a versão publicada),
// que não muda. A 31 fica no alto; a 30 e a 29 ficam recolhidas; a 28 (respondida antes) sai, para a página
// ficar abaixo de ~400 KB. O "Já aprovados (rodadas 2 a 18)" continua um link para a página antiga. A observação geral passa a
// 'geral-r31'. Para caber: o código que nenhuma tela usa mais sai (a "poda", pelo analisador do TypeScript).
// No fim, a procura das palavras proibidas no HTML inteiro.
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r30', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const corta = (a, b, nome) => { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j < i) throw new Error('não achei a lista da ' + nome); html = html.slice(0, i) + html.slice(j + b.length); };

// 1. as telas da 31 logo depois da lista da 30 (unshift: a 31 fica na frente)
const ancora = 'TELAS.unshift(...TELAS_R30.map(t => Object.assign({}, t, { rodada: 30 })));';
t(ancora, ancora + '\n' + ['r31-carta.js', 'r31-telas.js', 'r31-lista.js'].map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n'));
// 2. a 28 sai (respondida; fica no Git, nas páginas antigas): a lista das telas e o unshift; o código que outras usam fica
corta('const TELAS_R28 = [', 'TELAS.unshift(...TELAS_R28.map(t => Object.assign({}, t, { rodada: 28 })));', '28');
// 3. a rodada atual e os grupos: a 31 aberta, a 30 e a 29 respondidas e recolhidas
{ const i = html.indexOf('const RODADA_ATUAL = 30;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 31;\nconst GRUPOS_TELAS = [[31, "Rodada 31: Membros, a saída e a volta (a carta com o histórico, a página do QR, o pedido com a cidade, o abandono com a Câmara de liderança e a volta sem os cargos) (para escolher agora)"], [30, "Rodada 30 (respondida)"], [29, "Rodada 29 (respondida)"]];' + html.slice(j); }
t('${EXPLICA_R30}', '${EXPLICA_R31}');
t("'propostas-explica-r30'", "'propostas-explica-r31'", true);
t("'propostas-r30-antigas'", "'propostas-r31-antigas'", true);
t('// as rodadas 29 e 28, já respondidas, ficam recolhidas embaixo da 30', '// as rodadas 30 e 29, já respondidas, ficam recolhidas embaixo da 31');
// 4. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 30)', 'if (i >= 0 && TELAS[i].rodada === 31)');
t("'geral-r30'", "'geral-r31'", true);
t("escolhas/geral-r30'", "escolhas/geral-r31'", true);
// 5. o HTML em volta
t('<title>Propostas rodada 30</title>', '<title>Propostas rodada 31</title>');
t('IEADESPA · FASE 10 · rodada 30', 'IEADESPA · FASE 10 · rodada 31');
t('Observação geral sobre a rodada 30', 'Observação geral sobre a rodada 31');
t('Esta página é da rodada 30. As rodadas 29 e 28, já respondidas, ficam logo abaixo da 30, recolhidas, com as escolhas e as observações guardadas.', 'Esta página é da rodada 31. As rodadas 30 e 29, já respondidas, ficam logo abaixo da 31, recolhidas, com as escolhas e as observações guardadas.');
t('/* Rodada 30: as rodadas 29 e 28, já respondidas, recolhidas embaixo da 30 */', '/* Rodada 31: as rodadas 30 e 29, já respondidas, recolhidas embaixo da 31 */');
// 5b. sem modo escuro (decisão dele de 24/11/2026: as propostas só no claro, para a rodada sair mais rápido); a página
// sempre abre no claro, mesmo que o navegador tenha guardado o escuro de uma rodada anterior
t('<div class="grupo" role="group" aria-label="Modo">\n        <span class="grupo-rot">Modo</span>\n        <button type="button" class="modo-btn" id="modo-claro" aria-pressed="true">Claro</button>\n        <button type="button" class="modo-btn" id="modo-escuro" aria-pressed="false">Escuro</button>\n',
  '<div class="grupo" role="group" aria-label="Ver">\n');
t('    <button type="button" class="modo-btn" id="cheia-modo">Trocar claro/escuro</button>\n', '');
t("  if (s.modo === 'escuro') estado.modo = 'escuro';\n", '');
t('3) Troque entre claro e escuro (e, quando aparecer, em "Quem está vendo").', '3) Troque entre o notebook e o celular e, quando aparecer, em "Quem está vendo".');
t("  $('modo-claro').setAttribute('aria-pressed', String(estado.modo === 'claro'));\n  $('modo-escuro').setAttribute('aria-pressed', String(estado.modo === 'escuro'));\n", '');
t(": ${t.opcoes[estado.opcao][0]} · ${estado.modo}`", ": ${t.opcoes[estado.opcao][0]}`");
t("  if (bt.id === 'modo-claro' || bt.id === 'modo-escuro') { estado.modo = bt.id === 'modo-escuro' ? 'escuro' : 'claro'; renderPrevia(); lembrar(); return; }\n", '');
t("  if (bt.id === 'cheia-modo') { estado.modo = estado.modo === 'claro' ? 'escuro' : 'claro'; renderPrevia(); lembrar(); return; }\n", '');

// 6. a poda: sai a declaração de topo que ninguém mais usa (nem as telas, nem a página, nem as ferramentas de conferir e de foto)
{
  const ini = html.indexOf('<script>') + 8, fim = html.indexOf('</script>', ini), js = html.slice(ini, fim), corte = js.indexOf('const $ = id');
  const defs = js.slice(0, corte), resto = js.slice(corte);
  const sf = ts.createSourceFile('p.js', defs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const PAL = /[A-Za-z_$][\w$]*/g, palavras = s => new Set(s.match(PAL) || []);
  const st = sf.statements.map(s => {
    let nomes = null;
    if (ts.isVariableStatement(s) && s.declarationList.declarations.every(d => ts.isIdentifier(d.name))) nomes = s.declarationList.declarations.map(d => d.name.text);
    else if (ts.isFunctionDeclaration(s) && s.name) nomes = [s.name.text];
    const texto = defs.slice(s.getFullStart(), s.getEnd());
    return { texto, nomes, usa: palavras(texto), vivo: !nomes };
  });
  const dono = new Map(); st.forEach((s, i) => (s.nomes || []).forEach(n => dono.set(n, i)));
  const fila = [];
  const marca = n => { const i = dono.get(n); if (i !== undefined && !st[i].vivo) { st[i].vivo = true; fila.push(i); } };
  ['TELAS', 'P', 'comBarraDoCelular', 'ehCel'].forEach(marca);
  palavras(resto).forEach(marca);
  st.forEach((s, i) => { if (!s.nomes) fila.push(i); });
  while (fila.length) { const i = fila.pop(); st[i].usa.forEach(marca); }
  const fora = st.filter(s => !s.vivo);
  const novo = st.filter(s => s.vivo).map(s => s.texto).join('') + defs.slice(sf.statements.length ? sf.statements[sf.statements.length - 1].getEnd() : 0);
  html = html.slice(0, ini) + novo + resto + html.slice(fim);
  console.log('poda: saíram', fora.length, 'declarações de', st.length, '·', (fora.reduce((a, s) => a + Buffer.byteLength(s.texto), 0) / 1024).toFixed(0), 'KB');
}

// 7. a procura obrigatória: no HTML inteiro, "culto" só em "Oferta de culto"; e nenhum botão ou opção "Mês anterior"
const achou = [];
const rx = /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi; let m;
while ((m = rx.exec(html))) { if (/^culto$/i.test(m[0]) && /oferta de $/i.test(html.slice(m.index - 10, m.index))) continue; achou.push(html.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')); }
const nOferta = (html.match(/oferta de culto/gi) || []).length;
console.log('Oferta de culto:', nOferta, '· palavras proibidas fora disso:', achou.length);
achou.slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r31'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r31', 'index.html'), html);
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
