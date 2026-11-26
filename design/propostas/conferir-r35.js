// O conferir.js de sempre para a página da rodada 35 (26/11/2026; uma página por rodada: só a 35): a sintaxe, cada desenho (só
// no claro, cada nível e os dois aparelhos), undefined/NaN/[object Object]/${ esquecido, caixas <div> desiguais, emojis e as
// palavras que não existem na Igreja (a lista do Módulo 3, que libera "culto", só aceita "ceia" em "Santa Ceia", "ceia local"
// e "ceia geral" e barra o vocabulário do Regimento). A única exceção é o cartão dos níveis dormindo (o plano: "só a Geral
// vê que existem"), na tela das áreas, vista pela Geral: a frase exata R35_DORMINDO_TXT é descontada antes da procura.
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || 'propostas-r35/index.html';
const h = fs.readFileSync(path.join(__dirname, arq), 'utf8');
const ini = h.indexOf('<script>') + 8, js = h.slice(ini, h.indexOf('</script>', ini));
new Function(js);
const { TELAS, P, DORM } = new Function(js.slice(0, js.indexOf('const $ = id')) + '; return { TELAS, P, DORM: typeof R35_DORMINDO_TXT === "string" ? R35_DORMINDO_TXT : "" };')();
const PROIB = /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/i, PROIB35 = /(?<!santa )ceia(?!s? (?:locais|local|gerais|geral))|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o|regi[õo]es|distrito(?! sede)|distritos/i, AVISO = /segunda|duas pessoas/i, EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
let n = 0, ruins = 0; const avisos = new Set();
for (const t of TELAS) for (const o of t.opcoes) for (const modo of ['claro'])
  for (const pf of (t.perfis || [[undefined]]).map(x => x[0]))
    for (const d of (t.disp ? ['notebook', 'celular'] : ['notebook'])) {
      let s;
      try { s = o[2](P(modo), pf, d); } catch (e) { ruins++; console.log('EXCEÇÃO', t.id, o[0], modo, pf, d, e.message); continue; }
      n++;
      const m = s.match(/.{0,50}(undefined|NaN|\[object Object\]|\$\{).{0,50}/);
      if (m) { ruins++; console.log('PROBLEMA', t.id, '|', o[0], '|', modo, '|', pf, '|', d, '\n   ', m[0]); }
      const abre = (s.match(/<div\b/g) || []).length, fecha = (s.match(/<\/div>/g) || []).length;
      if (abre !== fecha) { ruins++; console.log('CAIXAS DESIGUAIS', t.id, '|', o[0], '|', modo, '|', pf, '|', d, '| abre', abre, 'fecha', fecha); }
      const abreS = (s.match(/<span\b/g) || []).length, fechaS = (s.match(/<\/span>/g) || []).length;
      if (abreS !== fechaS) { ruins++; console.log('SPAN DESIGUAL', t.id, '|', pf, '|', d, '| abre', abreS, 'fecha', fechaS); }
      let txt = s.replace(/<[^>]*>/g, ' ').replace(/oferta de culto/gi, '');
      if (DORM && t.id === 'r35-areas' && pf === 'geral') txt = txt.split(DORM).join(' ');
      const pm = txt.match(t.rodada === 35 ? PROIB35 : PROIB); if (pm) { ruins++; console.log('PALAVRA PROIBIDA', t.id, pf, d, '·', txt.slice(Math.max(0, pm.index - 40), pm.index + 40)); }
      if (EMOJI.test(s)) { ruins++; console.log('EMOJI', t.id, pf, d); }
      const av = txt.match(AVISO); if (av) avisos.add(`${t.id} · ${pf} · ${txt.slice(Math.max(0, av.index - 40), av.index + 30).replace(/\s+/g, ' ')}`);
    }
const textos35 = TELAS.filter(t => t.rodada === 35).map(t => `${t.nome} ${t.decidido} ${t.opcoes.map(o => o[1]).join(' ')} ${(t.perfis || []).map(x => x[1]).join(' ')} ${JSON.stringify(t.explica || {})}`).join(' ').replace(/<[^>]*>/g, ' ').split(DORM || '\u0000').join(' ');
const tm35 = textos35.match(PROIB35); if (tm35) { ruins++; console.log('PALAVRA PROIBIDA NAS DESCRIÇÕES DA 35 ·', textos35.slice(tm35.index - 40, tm35.index + 40)); }
if (TELAS.some(t => t.rodada !== 35)) { ruins++; console.log('TELA DE OUTRA RODADA NA PÁGINA:', TELAS.filter(t => t.rodada !== 35).map(t => t.id).join(', ')); }
// cada nível de cada tela da 35 tem a sua explicação
for (const t of TELAS.filter(t => t.rodada === 35)) for (const [k] of t.perfis || []) if (!(t.explica || {})[k]) { ruins++; console.log('SEM EXPLICAÇÃO', t.id, k); }
console.log(arq, '· telas', TELAS.length, '· desenhos conferidos', n, '· com problema', ruins);
if (avisos.size) { console.log('para olhar (segunda/duas pessoas no texto):'); [...avisos].slice(0, 20).forEach(x => console.log('   ', x)); }
