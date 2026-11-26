// Monta a página da rodada 35 (26/11/2026), a última do Módulo 3 (Estrutura e Territórios): os perfis de acesso de cada
// cargo (com a passagem de quem já tem acesso), afastar do cargo, o acréscimo da agenda (o último domingo e a ceia geral),
// o acréscimo do termo (a assinatura reforçada e a linha do PDF) e o que a 32 deixou para depois (as áreas e os números,
// a congregação nova e o ponto de culto novo, mudar de área, fechar ou juntar, e os termos guardados). Parte da página da
// rodada 34 (propostas-r34/index.html, a publicada em 25/11/2026), que não muda. Uma página por rodada: a nova tem SÓ a 35
// (a lista da 34 sai, e a poda leva o código que só ela usava; o que a 35 reaproveita da 32 à 34 fica). No alto, os links
// das anteriores (6szt…, rodada 34; NF7z…, 33; HYtY…, 32; 58VZ…, 31; KMeb…, 19 a 30; G1gj…, 2 a 18). As escolhas: coleção
// 'escolhas', ids 'r35-*' e 'geral-r35'. No fim, a procura das palavras proibidas: a lista antiga (do Financeiro) na página
// toda, menos o código do Módulo 3 (os fontes da 32 à 35); nos fontes da 35, a lista do Módulo 3 ("culto" é a língua da
// igreja aqui; "ceia" só vale em "Santa Ceia", "ceia local" e "ceia geral", as palavras dele em 25/11).
const fs = require('fs'), path = require('path');
const ts = (() => { try { return require('typescript'); } catch { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'typescript')); } })();
const pasta = __dirname;
let html = fs.readFileSync(path.join(pasta, 'propostas-r34', 'index.html'), 'utf8');
const t = (a, b, todos) => { if (!html.includes(a)) throw new Error('não achei: ' + a.slice(0, 90)); html = todos ? html.split(a).join(b) : html.replace(a, () => b); };
const antes = Buffer.byteLength(html);
const FONTES = ['r35-base.js', 'r35-perfis.js', 'r35-afastar.js', 'r35-agenda.js', 'r35-assinar.js', 'r35-igrejas.js', 'r35-mudar.js', 'r35-guardados.js', 'r35-lista.js'].filter(f => fs.existsSync(path.join(pasta, f)));
const fontes35 = FONTES.map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');
const fontesAntes = fs.readdirSync(pasta).filter(f => /^r3[234]-.*[.]js$/.test(f)).map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');

// 1. as telas da 35 NO LUGAR da lista da 34
t('TELAS.unshift(...TELAS_R34.map(t => Object.assign({}, t, { rodada: 34 })));', fontes35);
// 2. a rodada atual e o grupo: só a 35
{ const i = html.indexOf('const RODADA_ATUAL = 34;'), j = html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ', i)); if (i < 0) throw new Error('não achei a rodada atual');
  html = html.slice(0, i) + 'const RODADA_ATUAL = 35;\nconst GRUPOS_TELAS = [[35, "Rodada 35: Estrutura e Territórios, a última (os acessos pelo cargo, afastar do cargo, o último domingo e a ceia geral, a assinatura reforçada, as áreas e os números, a congregação nova, mudar de área, fechar ou juntar, e os termos guardados) (para escolher agora)"]];' + html.slice(j); }
t('${EXPLICA_R34}', '${EXPLICA_R35}');
t("'propostas-explica-r34'", "'propostas-explica-r35'", true);
t("'propostas-r34-antigas'", "'propostas-r35-antigas'", true);
t('(GRUPOS_TELAS só com a 34)', '(GRUPOS_TELAS só com a 35)');
// 3. ao abrir, a tela lembrada só vale se for da rodada atual (a chave 'propostas-r15' não muda)
t('if (i >= 0 && TELAS[i].rodada === 34)', 'if (i >= 0 && TELAS[i].rodada === 35)');
t("'geral-r34'", "'geral-r35'", true);
t("escolhas/geral-r34'", "escolhas/geral-r35'", true);
// 4. o HTML em volta
t('<title>Propostas de tela · rodada 34</title>', '<title>Propostas de tela · rodada 35</title>');
t('IEADESPA · FASE 10 · rodada 34', 'IEADESPA · FASE 10 · rodada 35');
t('Observação geral sobre a rodada 34', 'Observação geral sobre a rodada 35');
{ const r33 = '<a class="aprovados-btn" href="https://claude.ai/artifact/NF7zseCp4zVWsUEwUzmQDG"';
  t(r33, '<a class="aprovados-btn" href="https://claude.ai/artifact/6sztidgaZ5r3a46jdZYzfi" target="_blank" rel="noopener"><span class="aprovados-tit">Já aprovados (rodada 34)</span><span class="aprovados-n">abre em outra aba</span><svg class="aprovados-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>\n    ' + r33); }
t('Esta página tem só a rodada 34: cada rodada ganha a sua página. A rodada 33, a rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas cinco páginas acima, com as escolhas e as observações guardadas como estavam.',
  'Esta página tem só a rodada 35: cada rodada ganha a sua página. A rodada 34, a rodada 33, a rodada 32, a rodada 31, as rodadas 19 a 30 e as rodadas 2 a 18 ficam nas seis páginas acima, com as escolhas e as observações guardadas como estavam.');

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
// 6a. a lista antiga na página toda, menos o código do Módulo 3 (os fontes da 32 à 35) e o título do grupo
const linhaGrupos = html.slice(html.indexOf('const GRUPOS_TELAS = '), html.indexOf('\n', html.indexOf('const GRUPOS_TELAS = ')));
const semMod3 = (fontes35 + '\n' + fontesAntes + '\n' + linhaGrupos).split('\n').reduce((s, linha) => (linha.trim().length > 20 ? s.split(linha).join('') : s), html);
const achou = procura(semMod3, /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/gi, (m, s) => /^culto$/i.test(m[0]) && /oferta de $/i.test(s.slice(m.index - 10, m.index)));
// 6b. nos fontes da 35 (Módulo 3): "culto" liberado; "ceia" só em "Santa Ceia", "ceia local" e "ceia geral"; fora o
// vocabulário do Regimento que não é a realidade. Os níveis dormindo (o plano: "só a Geral vê que existem") aparecem num
// cartão só da tela das áreas, com as três palavras numa linha marcada com R35_DORMINDO, que a procura desconta.
const fontes35Proc = fontes35.split('\n').filter(l => !l.includes('R35_DORMINDO')).join('\n');
const achou35 = procura(fontes35Proc, /(?<!santa )ceia(?!s? (?:locais|local|gerais|geral))|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o\b|regi[õo]es|distrito(?! sede)|distritos/gi);
console.log('Oferta de culto:', (html.match(/oferta de culto/gi) || []).length, '· palavras proibidas fora do Módulo 3:', achou.length, '· nos fontes da 35 (lista do módulo 3):', achou35.length);
achou.concat(achou35).slice(0, 30).forEach(x => console.log('   SOBROU:', x));
if (achou.length || achou35.length) process.exitCode = 1;
// 7. nada da lista da 34 pode sobrar na página
const sobra34 = ['TELAS_R34', 'geral-r34', 'EXPLICA_R34', 'R34_EX_CULTOS', 'R34_EX_POSSE', 'PERFIS34_CULTOS', 'PERFIS34_POSSE', 'r34Cultos', 'r34Posse'].filter(s => html.includes(s));
console.log('sobrou da 34:', sobra34.length ? sobra34.join(', ') : 'nada');
if (sobra34.length) process.exitCode = 1;
fs.mkdirSync(path.join(pasta, 'propostas-r35'), { recursive: true });
fs.writeFileSync(path.join(pasta, 'propostas-r35', 'index.html'), html);
console.log('fontes da 35:', FONTES.join(', '));
console.log('página:', (antes / 1024).toFixed(0), 'KB antes →', (Buffer.byteLength(html) / 1024).toFixed(0), 'KB (', Buffer.byteLength(html), 'bytes)');
