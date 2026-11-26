// Monta a página da rodada 32 (24/11/2026), o começo do Módulo 3 (Estrutura e Territórios), a partir da página da
// rodada 31 (propostas-r31/index.html, a versão publicada em 24/11/2026), que não muda. Uma página por rodada (24/11/2026):
// a página nova tem SÓ a 32 (a lista da 31 sai, e a poda leva o código que só ela usava); no alto, os links das anteriores
// (58VZ…, rodada 31; KMeb…, rodadas 19 a 30; G1gj…, 2 a 18). As escolhas: coleção 'escolhas', ids 'r32-*' e 'geral-r32'. Para caber: a poda tira o código que nenhuma tela usa (o analisador do TypeScript).
// No fim, a procura das palavras proibidas: a lista antiga (do Financeiro) na página toda, menos os fontes da 32; nos
// fontes da 32, a lista do módulo 3 ("culto" é a língua da igreja aqui; sai o vocabulário do Regimento).
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r31', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const FONTES = ['r32-base.js', 'r32-ficha.js', 'r32-cultos.js', 'r32-painel.js', 'r32-posse.js', 'r32-mapa.js', 'r32-lista.js'].filter(f => fs.existsSync(path.join(pasta, f)));
const fontes32 = FONTES.map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');

// 1. as telas da 32 NO LUGAR da lista da 31 (sem a linha que põe a 31 em TELAS, a poda tira TELAS_R31 e o que só ela usa)
const ancora = 'TELAS.unshift(...TELAS_R31.map(t => Object.assign({}, t, { rodada: 31 })));';
t(ancora, fontes32);
// 2. a rodada atual e o grupo: só a 32 (as anteriores estão nas páginas de arquivo, pelos links do alto)
{ const i = html.indexOf('const RODADA_ATUAL = 31;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 32;\nconst GRUPOS_TELAS = [[32, "Rodada 32: Estrutura e Territórios, o começo (a ficha da congregação, os cultos e os pontos de culto, o painel do que está desatualizado, a diretoria com o termo de posse e o mapa) (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R31}', '${EXPLICA_R32}');
t("'propostas-explica-r31'", "'propostas-explica-r32'", true);
t("'propostas-r31-antigas'", "'propostas-r32-antigas'", true);
t('// rodadas recolhidas embaixo da atual: na página nova da 31 não há nenhuma (GRUPOS_TELAS só com a 31)', '// rodadas recolhidas embaixo da atual: uma página por rodada, não há nenhuma (GRUPOS_TELAS só com a 32)');
// 3. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 31)', 'if (i >= 0 && TELAS[i].rodada === 32)');
t("'geral-r31'", "'geral-r32'", true);
t("escolhas/geral-r31'", "escolhas/geral-r32'", true);
// 4. o HTML em volta
t('<title>Propostas de tela</title>', '<title>Propostas de tela · rodada 32</title>');
t('IEADESPA · FASE 10 · rodada 31', 'IEADESPA · FASE 10 · rodada 32');
t('Observação geral sobre a rodada 31', 'Observação geral sobre a rodada 32');
{ const kmeb = '<a class="aprovados-btn" href="https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz"';
  t(kmeb, '<a class="aprovados-btn" href="https://claude.ai/artifact/58VZXcgVGNdrUxoVZRp2c6" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodada 31)</span><span class="aprovados-n">abre em outra aba</span><svg class="aprovados-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>\n    ' + kmeb); }
t('Esta página começa na rodada 31. As rodadas 19 a 30 e as rodadas 2 a 18 ficam nas duas páginas acima, com as escolhas e as observações guardadas como estavam.',
  'Esta página tem só a rodada 32: cada rodada ganha a sua página. A rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas três páginas acima, com as escolhas e as observações guardadas como estavam.');

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
// 6a. a lista antiga (do Financeiro) na página toda, menos os fontes da 32: "culto" só em "Oferta de culto"
// (o título do grupo da 32, em GRUPOS_TELAS, também é do Módulo 3)
const linhaGrupos = html.slice(html.indexOf('const GRUPOS_TELAS = '), html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ')));
const semR32 = (fontes32 + '\n' + linhaGrupos).split('\n').reduce((s, linha) => (linha.trim().length > 20 ? s.split(linha).join('') : s), html);
const achou = procura(semR32, /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi, (m, s) => /^culto$/i.test(m[0]) && /oferta de $/i.test(s.slice(m.index - 10, m.index)));
// 6b. nos fontes da 32 (Módulo 3): "culto" liberado ("ponto de culto", "os cultos"); fora o que vem do Regimento e não é a
// realidade (a "Extensão da Tenda" virou ponto de culto; congregação nova sem parecer; região, quadrante e distrito dormem:
// "Distrito Sede", o nome da Área 1, fica) e o que já era proibido no dinheiro
const achou32 = procura(fontes32, /ceia|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|bparecerb|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o\b|regi[õo]es|distrito(?! sede)|distritos/gi);
console.log('Oferta de culto:', (html.match(/oferta de culto/gi) || []).length, '· palavras proibidas fora disso:', achou.length, '· nos fontes da 32 (lista do módulo 3):', achou32.length);
achou.concat(achou32).slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length || achou32.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r32'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r32', 'index.html'), html);
console.log('fontes da 32:', FONTES.join(', '));
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
