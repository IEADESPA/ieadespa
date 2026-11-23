// Monta a página da rodada 29 (23/11/2026) a partir da página leve da rodada 28 (propostas-r28/index.html, a versão publicada),
// que não muda. A 29 fica no alto; a 28 e a 27, já respondidas, ficam recolhidas; a 26 (respondida antes) sai, para a página
// ficar leve. O "Já aprovados (rodadas 2 a 18)" continua um link para a página antiga. A observação geral passa a 'geral-r29'.
// Para caber: o código que nenhuma tela usa mais sai (a "poda", pelo analisador do TypeScript).
// No fim, a procura das palavras proibidas no HTML inteiro.
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r28', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const corta = (a, b, nome) => { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j < i) throw new Error('não achei a lista da ' + nome); html = html.slice(0, i) + html.slice(j + b.length); };

// 1. as telas da 29 logo depois da lista da 28 (unshift: a 29 fica na frente)
const ancora = 'TELAS.unshift(...TELAS_R28.map(t => Object.assign({}, t, { rodada: 28 })));';
t(ancora, ancora + '\n' + ['r29-saida.js', 'r29-mais.js', 'r29-lista.js'].map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n'));
// 2. a 26 sai (respondida; fica no Git, nas páginas antigas): a lista das telas e o unshift; o código que outras usam fica
corta('const TELAS_R26 = [', 'TELAS.unshift(...TELAS_R26.map(t => Object.assign({}, t, { rodada: 26 })));', '26');
// 3. a rodada atual e os grupos: a 29 aberta, a 28 e a 27 respondidas e recolhidas
{ const i = html.indexOf('const RODADA_ATUAL = 28;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 29;\nconst GRUPOS_TELAS = [[29, "Rodada 29: a saída do membro refeita (o membro sai pelo aplicativo, com a carta; ninguém confirma), o abandono, os cargos vagos, o que fica guardado e a volta, o falecimento (para escolher agora)"], [28, "Rodada 28 (respondida)"], [27, "Rodada 27 (respondida)"]];' + html.slice(j); }
t('${EXPLICA_R28}', '${EXPLICA_R29}');
t("'propostas-explica-r28'", "'propostas-explica-r29'", true);
t("'propostas-r28-antigas'", "'propostas-r29-antigas'", true);
t('// as rodadas 27 e 26, já respondidas, ficam recolhidas embaixo da 28', '// as rodadas 28 e 27, já respondidas, ficam recolhidas embaixo da 29');
// 4. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 28)', 'if (i >= 0 && TELAS[i].rodada === 29)');
t("'geral-r28'", "'geral-r29'", true);
t("escolhas/geral-r28'", "escolhas/geral-r29'", true);
// 5. o HTML em volta
t('<title>Propostas rodada 28</title>', '<title>Propostas rodada 29</title>');
t('IEADESPA · FASE 10 · rodada 28', 'IEADESPA · FASE 10 · rodada 29');
t('Observação geral sobre a rodada 28', 'Observação geral sobre a rodada 29');
t('Esta página é da rodada 28. As rodadas 27 e 26, já respondidas, ficam logo abaixo da 28, recolhidas, com as escolhas e as observações guardadas.', 'Esta página é da rodada 29. As rodadas 28 e 27, já respondidas, ficam logo abaixo da 29, recolhidas, com as escolhas e as observações guardadas.');
t('/* Rodada 28: as rodadas 27 e 26, já respondidas, recolhidas embaixo da 28 */', '/* Rodada 29: as rodadas 28 e 27, já respondidas, recolhidas embaixo da 29 */');

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
fs.mkdirSync(path.join(pasta, 'propostas-r29'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r29', 'index.html'), html);
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB');
