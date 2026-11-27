// Monta a página da rodada 36 (27/11/2026), a ÚLTIMA rodada de telas novas até o lançamento: o perfil de cada cargo
// refeito (o módulo traz as funções do nível), vários cargos ao mesmo tempo, o cargo vago (no lugar do afastar), a ceia geral
// no sábado, e a área nova com a troca do pastor de área. Parte da página da rodada 35 (propostas-r35/index.html, a
// publicada em 26/11/2026), que não muda. Uma página por rodada: a nova tem SÓ a 36 (a lista da 35 sai, e a poda leva o
// código que só ela usava; o que a 36 reaproveita da 32 à 35 fica). No alto, os links das anteriores (G6iC…, 35; 6szt…, 34;
// NF7z…, 33; HYtY…, 32; 58VZ…, 31; KMeb…, 19 a 30; G1gj…, 2 a 18). As escolhas: coleção 'escolhas', ids 'r36-*' e
// 'geral-r36'. No fim, a procura das palavras proibidas: a lista antiga (do Financeiro) na página toda, menos o código do
// Módulo 3 (os fontes da 32 à 36); nos fontes da 36, a lista do Módulo 3; e as sobras da 35 (as telas reprovadas).
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r35', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const FONTES = ['r36-base.js', 'r36-perfis.js', 'r36-varios.js', 'r36-vago.js', 'r36-agenda.js', 'r36-area.js', 'r36-lista.js'];
const fontes36 = FONTES.map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');
const fontesAntes = fs.readdirSync(pasta).filter(f => /^r3[2345]-.*[.]js$/.test(f)).map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');

// 1. as telas da 36 NO LUGAR da lista da 35
t('TELAS.unshift(...TELAS_R35.map(t => Object.assign({}, t, { rodada: 35 })));', fontes36);
// 2. a rodada atual e o grupo: só a 36
{ const i = html.indexOf('const RODADA_ATUAL = 35;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 36;\nconst GRUPOS_TELAS = [[36, "Rodada 36, a última de telas novas: o perfil de cada cargo, vários cargos ao mesmo tempo, o cargo vago, a ceia geral no sábado e a área nova (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R35}', '${EXPLICA_R36}');
t("'propostas-explica-r35'", "'propostas-explica-r36'", true);
t("'propostas-r35-antigas'", "'propostas-r36-antigas'", true);
t('(GRUPOS_TELAS só com a 35)', '(GRUPOS_TELAS só com a 36)');
// 3. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 35)', 'if (i >= 0 && TELAS[i].rodada === 36)');
t("'geral-r35'", "'geral-r36'", true);
t("escolhas/geral-r35'", "escolhas/geral-r36'", true);
// 4. o HTML em volta
t('<title>Propostas de tela · rodada 35</title>', '<title>Propostas de tela · rodada 36</title>');
t('IEADESPA · FASE 10 · rodada 35', 'IEADESPA · FASE 10 · rodada 36');
t('Observação geral sobre a rodada 35', 'Observação geral sobre a rodada 36');
{ const r34 = '<a class="aprovados-btn" href="https://claude.ai/artifact/6sztidgaZ5r3a46jdZYzfi"';
  t(r34, '<a class="aprovados-btn" href="https://claude.ai/artifact/G6iCv25ZBDB6bcK9pjYHYC" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodada 35)</span><span class="aprovados-n">abre em outra aba</span><svg class="aprovados-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>\n    ' + r34); }
t('Esta página tem só a rodada 35: cada rodada ganha a sua página. A rodada 34, a rodada 33, a rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas seis páginas acima, com as escolhas e as observações guardadas como estavam.',
  'Esta página tem só a rodada 36: cada rodada ganha a sua página. A rodada 35, a rodada 34, a rodada 33, a rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas sete páginas acima, com as escolhas e as observações guardadas como estavam.');

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
  console.log('poda: saíram', fora.length, 'declarações de', st.length, '·', (fora.reduce((a, s) => a + Buffer.byteLength(s.texto), 0) / 1024).toFixed(0), 'KB');
}

// 6. a procura obrigatória das palavras que não existem na Igreja
const procura = (texto, rx, pula) => { const L = []; let m; rx.lastIndex = 0; while ((m = rx.exec(texto))) { if (pula && pula(m, texto)) continue; L.push(texto.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')); } return L; };
// 6a. a lista antiga na página toda, menos o código do Módulo 3 (os fontes da 32 à 36) e o título do grupo
const linhaGrupos = html.slice(html.indexOf('const GRUPOS_TELAS = '), html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ')));
const semMod3 = (fontes36 + '\n' + fontesAntes + '\n' + linhaGrupos).split('\n').reduce((s, linha) => (linha.trim().length > 20 ? s.split(linha).join('') : s), html);
const achou = procura(semMod3, /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi, (m, s) => /^culto$/i.test(m[0]) && /oferta de $/i.test(s.slice(m.index - 10, m.index)));
// 6b. nos fontes da 36 (Módulo 3): "culto" liberado; "ceia" só em "Santa Ceia", "ceia local" e "ceia geral"; fora o
// vocabulário do Regimento que não é a realidade
const achou36 = procura(fontes36, /(?<!santa )ceia(?!s? (?:locais|local|gerais|geral))|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o\b|regi[õo]es|distrito(?! sede)|distritos|departamentos? como m[óo]dulo/gi);
console.log('Oferta de culto:', (html.match(/oferta de culto/gi) || []).length, '· palavras proibidas fora do Módulo 3:', achou.length, '· nos fontes da 36 (lista do módulo 3):', achou36.length);
achou.concat(achou36).slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length || achou36.length) process.exitCode = 1;
// 7. nada da lista da 35 pode sobrar na página (as telas reprovadas e o afastar, sobretudo)
const sobra35 = ['TELAS_R35', 'geral-r35', 'EXPLICA_R35', 'R35_EX_', 'PERFIS35_', 'r35Perfis', 'r35Afastar', 'r35Passagem', 'R35_PASS', 'R35_MOTIVO', 'r35NaoRol'].filter(s => html.includes(s));
console.log('sobrou da 35:', sobra35.length ? sobra35.join(', ') : 'nada');
if (sobra35.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r36'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r36', 'index.html'), html);
fs.copyFileSync(path.join(pasta, '..', '..', 'site', 'public', 'logo.png'), path.join(pasta, 'propostas-r36', 'logo.png'));
console.log('fontes da 36:', FONTES.join(', '));
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
