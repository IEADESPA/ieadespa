// Monta a página da rodada 31 (24/11/2026) a partir da página leve da rodada 30 (propostas-r30/index.html, a versão publicada),
// que não muda. A 31 vai para uma página NOVA, só com ela: a KMeb… (rodadas 19 a 30) ficou pesada demais para republicar
// e vira arquivo. As listas da 28, da 29 e da 30 saem; no alto, dois links: a KMeb… (19 a 30) e a G1gj… (2 a 18). A observação geral passa a
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
// 2. página NOVA só com a 31 (24/11/2026): a KMeb… (rodadas 19 a 30) ficou pesada demais para republicar e vira arquivo,
// como a G1gj… (2 a 18). Saem as listas da 28, da 29 e da 30 (cada lista e o seu unshift); o código que a 31 usa fica,
// e a poda tira o resto. A da 30 sai depois do passo 1, porque o unshift dela é a âncora onde a 31 entrou.
corta('const TELAS_R28 = [', 'TELAS.unshift(...TELAS_R28.map(t => Object.assign({}, t, { rodada: 28 })));', '28');
corta('const TELAS_R29 = [', 'TELAS.unshift(...TELAS_R29.map(t => Object.assign({}, t, { rodada: 29 })));', '29');
corta('const TELAS_R30 = [', 'TELAS.unshift(...TELAS_R30.map(t => Object.assign({}, t, { rodada: 30 })));', '30');
// 3. a rodada atual e os grupos: só a 31 (as anteriores estão nas páginas de arquivo, pelos links do alto)
{ const i = html.indexOf('const RODADA_ATUAL = 30;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 31;\nconst GRUPOS_TELAS = [[31, "Rodada 31: Membros, a saída e a volta (a carta com o histórico, a página do QR, o pedido com a cidade, o abandono com a Câmara de liderança e a volta sem os cargos) (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R30}', '${EXPLICA_R31}');
t("'propostas-explica-r30'", "'propostas-explica-r31'", true);
t("'propostas-r30-antigas'", "'propostas-r31-antigas'", true);
t('// as rodadas 29 e 28, já respondidas, ficam recolhidas embaixo da 30', '// rodadas recolhidas embaixo da atual: na página nova da 31 não há nenhuma (GRUPOS_TELAS só com a 31)');
// 4. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 30)', 'if (i >= 0 && TELAS[i].rodada === 31)');
t("'geral-r30'", "'geral-r31'", true);
t("escolhas/geral-r30'", "escolhas/geral-r31'", true);
// 5. o HTML em volta
t('<title>Propostas rodada 30</title>', '<title>Propostas de tela</title>');
t('IEADESPA · FASE 10 · rodada 30', 'IEADESPA · FASE 10 · rodada 31');
t('Observação geral sobre a rodada 30', 'Observação geral sobre a rodada 31');
// a linha do alto: os dois arquivos, a KMeb… (19 a 30) e a G1gj… (2 a 18), cada um abrindo em outra aba
t('/* "Já aprovados": um link para a página antiga (rodadas 2 a 18), que abre em outra aba */', '/* "Já aprovados": os links para as páginas de arquivo (rodadas 19 a 30 e rodadas 2 a 18), que abrem em outra aba */');
{ const link = '    <a class="aprovados-btn" href="https://claude.ai/artifact/G1gj9hzSbdcqAZYcFjmJ1j" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodadas 2 a 18)</span>';
  if (!html.includes(link)) throw new Error('não achei o link da página antiga');
  const linha = html.slice(html.indexOf(link), html.indexOf('</a>', html.indexOf(link)) + 4);
  t(linha, linha.replace('G1gj9hzSbdcqAZYcFjmJ1j', 'KMebnrdoWfAhcz9yeRgjFz').replace('rodadas 2 a 18', 'rodadas 19 a 30') + '\n' + linha); }
t('Ali ficam as escolhas e as observações já feitas nas rodadas 2 a 18, guardadas como estavam. Esta página é da rodada 30. As rodadas 29 e 28, já respondidas, ficam logo abaixo da 30, recolhidas, com as escolhas e as observações guardadas.',
  'Esta página começa na rodada 31. As rodadas 19 a 30 e as rodadas 2 a 18 ficam nas duas páginas acima, com as escolhas e as observações guardadas como estavam.');
t('(as das rodadas 2 a 18 continuam guardadas na página antiga, em "Já aprovados")', '(as das rodadas 2 a 30 continuam guardadas nas páginas de "Já aprovados")');
t('// Página só da rodada 20 (19/11/2026; a 19 foi reprovada e refeita nela). As rodadas 2 a 18 ficam na página antiga, intacta como arquivo do que já foi aprovado;',
  '// Página nova a partir da rodada 31 (24/11/2026). As rodadas 19 a 30 (KMeb…) e 2 a 18 (G1gj…) ficam nas páginas antigas, intactas como arquivo do que já foi aprovado;');
t('/* Rodada 30: as rodadas 29 e 28, já respondidas, recolhidas embaixo da 30 */', '/* (sem uso desde a 31: a página nova não tem rodadas recolhidas) */');
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
  st.filter(s => s.vivo && s.nomes).sort((a, b) => b.texto.length - a.texto.length).slice(0, 10).forEach(s => console.log('   pesa:', s.nomes.join(','), (Buffer.byteLength(s.texto) / 1024).toFixed(1), 'KB'));
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
