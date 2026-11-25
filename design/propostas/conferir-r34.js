// O conferir.js de sempre para a página da rodada 34 (25/11/2026; uma página por rodada: só a 34): a sintaxe, cada desenho (só
// no claro, cada nível e os dois aparelhos), undefined/NaN/[object Object]/${ esquecido, caixas <div> desiguais, emojis e as
// palavras que não existem na Igreja (a lista do Módulo 3, que libera "culto", só aceita "ceia" em "Santa Ceia" e barra o
// vocabulário do Regimento).
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || 'propostas-r34/index.html';
const h = fs.readFileSync(path.join(__dirname, arq), 'utf8');
const ini = h.indexOf('<script>') + 8, js = h.slice(ini, h.indexOf('</script>', ini));
new Function(js);
const { TELAS, P } = new Function(js.slice(0, js.indexOf('const $ = id')) + '; return { TELAS, P };')();
const PROIB = /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/i, PROIB34 = /(?<!santa )ceia|malote|cofre|segunda-feira|domingo à noite|lacre|extens[ãa]o da tenda|extens[õo]es|\bparecer\b|comiss[ãa]o de miss[õo]es|quadrante|regi[ãa]o|regi[õo]es|distrito(?! sede)|distritos/i, AVISO = /segunda|duas pessoas/i, EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
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
      const txt = s.replace(/<[^>]*>/g, ' ').replace(/oferta de culto/gi, '');
      const pm = txt.match(t.rodada === 34 ? PROIB34 : PROIB); if (pm) { ruins++; console.log('PALAVRA PROIBIDA', t.id, pf, d, '·', txt.slice(Math.max(0, pm.index - 40), pm.index + 40)); }
      if (EMOJI.test(s)) { ruins++; console.log('EMOJI', t.id, pf, d); }
      const av = txt.match(AVISO); if (av) avisos.add(`${t.id} · ${pf} · ${txt.slice(Math.max(0, av.index - 40), av.index + 30).replace(/\s+/g, ' ')}`);
    }
const textos34 = TELAS.filter(t => t.rodada === 34).map(t => `${t.nome} ${t.decidido} ${t.opcoes.map(o => o[1]).join(' ')} ${(t.perfis || []).map(x => x[1]).join(' ')} ${JSON.stringify(t.explica || {})}`).join(' ').replace(/<[^>]*>/g, ' ');
const tm34 = textos34.match(PROIB34); if (tm34) { ruins++; console.log('PALAVRA PROIBIDA NAS DESCRIÇÕES DA 34 ·', textos34.slice(tm34.index - 40, tm34.index + 40)); }
if (TELAS.some(t => t.rodada !== 34)) { ruins++; console.log('TELA DE OUTRA RODADA NA PÁGINA:', TELAS.filter(t => t.rodada !== 34).map(t => t.id).join(', ')); }
// cada nível de cada tela da 34 tem a sua explicação
for (const t of TELAS.filter(t => t.rodada === 34)) for (const [k] of t.perfis || []) if (!(t.explica || {})[k]) { ruins++; console.log('SEM EXPLICAÇÃO', t.id, k); }
console.log(arq, '· telas', TELAS.length, '· desenhos conferidos', n, '· com problema', ruins);
if (avisos.size) { console.log('para olhar (segunda/duas pessoas no texto):'); [...avisos].slice(0, 20).forEach(x => console.log('   ', x)); }
