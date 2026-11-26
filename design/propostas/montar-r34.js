// Monta a página da rodada 34 (25/11/2026), os ajustes da 33 no Módulo 3 (Estrutura e Territórios): os cultos com a agenda
// personalizada (culto só da Sede, só das congregações e o tipo de cada domingo) e o termo de posse de todos que trabalham,
// por cargo, com o Presidente e o Secretário Geral assinando em lote. Parte da página da rodada 33 (propostas-r33/index.html,
// a publicada em 25/11/2026), que não muda. Uma página por rodada: a nova tem SÓ a 34 (a lista da 33 sai, e a poda leva o
// código que só ela usava, como o mapa e a virada aprovados; o que a 34 reaproveita da 32 e da 33 fica). No alto, os links
// das anteriores (NF7z…, rodada 33; HYtY…, 32; 58VZ…, 31; KMeb…, 19 a 30; G1gj…, 2 a 18). As escolhas: coleção 'escolhas',
// ids 'r34-*' e 'geral-r34'. No fim, a procura das palavras proibidas: a lista antiga (do Financeiro) na página toda, menos o
// código do Módulo 3 (os fontes da 32, da 33 e da 34); nos fontes da 34, a lista do Módulo 3 ("culto" é a língua da igreja
// aqui, e "ceia" só vale em "Santa Ceia", o tipo do 1º domingo).
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r33', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const FONTES = ['r34-base.js', 'r34-cultos.js', 'r34-posse.js', 'r34-lista.js'];
const fontes34 = FONTES.map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');
const fontesAntes = fs.readdirSync(pasta).filter(f => /^r3[23]-.*\.js$/.test(f)).map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');

// 1. as telas da 34 NO LUGAR da lista da 33
t('TELAS.unshift(...TELAS_R33.map(t => Object.assign({}, t, { rodada: 33 })));', fontes34);
// 2. a rodada atual e o grupo: só a 34
{ const i = html.indexOf('const RODADA_ATUAL = 33;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 34;\nconst GRUPOS_TELAS = [[34, "Rodada 34: Estrutura e Territórios, os ajustes da 33 (os cultos com a agenda personalizada, e o termo de posse de todos, por cargo, com o Presidente e o Secretário Geral) (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R33}', '${EXPLICA_R34}');
t("'propostas-explica-r33'", "'propostas-explica-r34'", true);
t("'propostas-r33-antigas'", "'propostas-r34-antigas'", true);
t('(GRUPOS_TELAS só com a 33)', '(GRUPOS_TELAS só com a 34)');
// 3. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 33)', 'if (i >= 0 && TELAS[i].rodada === 34)');
t("'geral-r33'", "'geral-r34'", true);
t("escolhas/geral-r33'", "escolhas/geral-r34'", true);
// 4. o HTML em volta
t('<title>Propostas de tela · rodada 33</title>', '<title>Propostas de tela · rodada 34</title>');
t('IEADESPA · FASE 10 · rodada 33', 'IEADESPA · FASE 10 · rodada 34');
t('Observação geral sobre a rodada 33', 'Observação geral sobre a rodada 34');
{ const r32 = '<a class="aprovados-btn" href="https://claude.ai/artifact/HYtYxyM4ysGnxhxnWiCk5o"';
  t(r32, '<a class="aprovados-btn" href="https://claude.ai/artifact/NF7zseCp4zVWsUEwUzmQDG" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodada 33)</span><span class="aprovados-n">abre em outra aba</span><svg class="aprovados-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>\n    ' + r32); }
t('Esta página tem só a rodada 33: cada rodada ganha a sua página. A rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas quatro páginas acima, com as escolhas e as observações guardadas como estavam.',
  'Esta página tem só a rodada 34: cada rodada ganha a sua página. A rodada 33, a rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas cinco páginas acima, com as escolhas e as observações guardadas como estavam.');

// 5. a poda: sai a declaração de topo que ninguém mais usa (nem as telas, nem a página, nem as ferramentas de conferir e de foto)
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
  st.filter(s => s.vivo && s.nomes).sort((a, b) => b.texto.length - a.texto.length).slice(0, 6).forEach(s => console.log('   pesa:', s.nomes.join(','), (Buffer.byteLength(s.texto) / 1024).toFixed(1), 'KB'));
  console.log('poda: saíram', fora.length, 'declarações de', st.length, '·', (fora.reduce((a, s) => a + Buffer.byteLength(s.texto), 0) / 1024).toFixed(0), 'KB');
}

// 6. a procura obrigatória das palavras que não existem na Igreja
const procura = (texto, rx, pula) => { const L = []; let m; rx.lastIndex = 0; while ((m = rx.exec(texto))) { if (pula && pula(m, texto)) continue; L.push(texto.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')); } return L; };
// 6a. a lista antiga na página toda, menos o código do Módulo 3 (os fontes da 32, da 33 e da 34) e o título do grupo
const linhaGrupos = html.slice(html.indexOf('const GRUPOS_TELAS = '), html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ')));
const semMod3 = (fontes34 + '\n' + fontesAntes + '\n' + linhaGrupos).split('\n').reduce((s, linha) => (linha.trim().length > 20 ? s.split(linha).join('') : s), html);
const achou = procura(semMod3, /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi, (m, s) => /^culto$/i.test(m[0]) && /oferta de $/i.test(s.slice(m.index - 10, m.index)));
// 6b. nos fontes da 34 (Módulo 3): "culto" liberado e "ceia" só em "Santa Ceia"; fora o vocabulário do Regimento que não é a realidade
const achou34 = procura(fontes34, /(?<!santa )ceia|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o\b|regi[õo]es|distrito(?! sede)|distritos/gi);
console.log('Oferta de culto:', (html.match(/oferta de culto/gi) || []).length, '· palavras proibidas fora do Módulo 3:', achou.length, '· nos fontes da 34 (lista do módulo 3):', achou34.length);
achou.concat(achou34).slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length || achou34.length) process.exitCode = 1;
// 7. nada da lista da 33 pode sobrar na página
const sobra33 = ['TELAS_R33', 'geral-r33', 'EXPLICA_R33', 'PERFIS33_MAPA', 'r33Mapa', 'r33Virada', 'r33Padrao', 'R33_EX_POSSE'].filter(s => html.includes(s));
console.log('sobrou da 33:', sobra33.length ? sobra33.join(', ') : 'nada');
if (sobra33.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r34'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r34', 'index.html'), html);
console.log('fontes da 34:', FONTES.join(', '));
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
