// Monta a página da rodada 33 (25/11/2026), os ajustes da 32 no Módulo 3 (Estrutura e Territórios): os cultos com a agenda
// padrão da Geral, o termo de posse em três partes com a virada só do executivo, e o mapa com o bairro da ficha. Parte da
// página da rodada 32 (propostas-r32/index.html, a publicada em 24/11/2026), que não muda. Uma página por rodada: a nova
// tem SÓ a 33 (a lista da 32 sai, e a poda leva o código que só ela usava; o que a 33 reaproveita da 32 fica). No alto,
// os links das anteriores (HYtY…, rodada 32; 58VZ…, 31; KMeb…, 19 a 30; G1gj…, 2 a 18). As escolhas: coleção 'escolhas',
// ids 'r33-*' e 'geral-r33'. No fim, a procura das palavras proibidas: a lista antiga (do Financeiro) na página toda, menos
// o código do Módulo 3 (os fontes da 32 e da 33); nesses, a lista do Módulo 3 ("culto" é a língua da igreja aqui).
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r32', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const FONTES = ['r33-base.js', 'r33-cultos.js', 'r33-posse.js', 'r33-mapa.js', 'r33-lista.js'];
const fontes33 = FONTES.map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');
const fontes32 = fs.readdirSync(pasta).filter(f => /^r32-.*\.js$/.test(f)).map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');

// 1. as telas da 33 NO LUGAR da lista da 32
t('TELAS.unshift(...TELAS_R32.map(t => Object.assign({}, t, { rodada: 32 })));', fontes33);
// 2. a rodada atual e o grupo: só a 33
{ const i = html.indexOf('const RODADA_ATUAL = 32;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 33;\nconst GRUPOS_TELAS = [[33, "Rodada 33: Estrutura e Territórios, os ajustes da 32 (os cultos com a agenda padrão da Geral, o termo de posse em três partes com a virada do ano, e o mapa com o bairro da ficha) (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R32}', '${EXPLICA_R33}');
t("'propostas-explica-r32'", "'propostas-explica-r33'", true);
t("'propostas-r32-antigas'", "'propostas-r33-antigas'", true);
t('(GRUPOS_TELAS só com a 32)', '(GRUPOS_TELAS só com a 33)');
// 3. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 32)', 'if (i >= 0 && TELAS[i].rodada === 33)');
t("'geral-r32'", "'geral-r33'", true);
t("escolhas/geral-r32'", "escolhas/geral-r33'", true);
// 4. o HTML em volta
t('<title>Propostas de tela · rodada 32</title>', '<title>Propostas de tela · rodada 33</title>');
t('IEADESPA · FASE 10 · rodada 32', 'IEADESPA · FASE 10 · rodada 33');
t('Observação geral sobre a rodada 32', 'Observação geral sobre a rodada 33');
{ const r31 = '<a class="aprovados-btn" href="https://claude.ai/artifact/58VZXcgVGNdrUxoVZRp2c6"';
  t(r31, '<a class="aprovados-btn" href="https://claude.ai/artifact/HYtYxyM4ysGnxhxnWiCk5o" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodada 32)</span><span class="aprovados-n">abre em outra aba</span><svg class="aprovados-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>\n    ' + r31); }
t('Esta página tem só a rodada 32: cada rodada ganha a sua página. A rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas três páginas acima, com as escolhas e as observações guardadas como estavam.',
  'Esta página tem só a rodada 33: cada rodada ganha a sua página. A rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas quatro páginas acima, com as escolhas e as observações guardadas como estavam.');

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
// 6a. a lista antiga na página toda, menos o código do Módulo 3 (os fontes da 32 e da 33) e o título do grupo
const linhaGrupos = html.slice(html.indexOf('const GRUPOS_TELAS = '), html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ')));
const semMod3 = (fontes33 + '\n' + fontes32 + '\n' + linhaGrupos).split('\n').reduce((s, linha) => (linha.trim().length > 20 ? s.split(linha).join('') : s), html);
const achou = procura(semMod3, /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi, (m, s) => /^culto$/i.test(m[0]) && /oferta de $/i.test(s.slice(m.index - 10, m.index)));
// 6b. nos fontes da 33 (Módulo 3): "culto" liberado; fora o vocabulário do Regimento que não é a realidade e o que já era proibido
const achou33 = procura(fontes33, /ceia|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o\b|regi[õo]es|distrito(?! sede)|distritos/gi);
console.log('Oferta de culto:', (html.match(/oferta de culto/gi) || []).length, '· palavras proibidas fora do Módulo 3:', achou.length, '· nos fontes da 33 (lista do módulo 3):', achou33.length);
achou.concat(achou33).slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length || achou33.length) process.exitCode = 1;
// 7. nada da lista da 32 pode sobrar na página
const sobra32 = ['TELAS_R32', 'geral-r32', 'EXPLICA_R32', 'PERFIS32_PAINEL', 'r32Painel', 'r32Ficha'].filter(s => html.includes(s));
console.log('sobrou da 32:', sobra32.length ? sobra32.join(', ') : 'nada');
if (sobra32.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r33'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r33', 'index.html'), html);
console.log('fontes da 33:', FONTES.join(', '));
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
