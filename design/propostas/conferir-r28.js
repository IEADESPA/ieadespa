// O conferir.js de sempre para a página leve da rodada 28 (23/11/2026): a sintaxe, cada desenho (modos, níveis e aparelhos),
// undefined/NaN/[object Object]/${ esquecido, caixas <div> desiguais, emojis e as palavras que não existem na Igreja.
const fs = require('fs'), path = require('path');
const arq = process.argv[2] || 'propostas-r28/index.html';
const h = fs.readFileSync(path.join(__dirname, arq), 'utf8');
const ini = h.indexOf('<script>') + 8, js = h.slice(ini, h.indexOf('</script>', ini));
new Function(js);
const { TELAS, P } = new Function(js.slice(0, js.indexOf('const $ = id')) + '; return { TELAS, P };')();
const PROIB = /culto|ceia|malote|cofre|segunda-feira|domingo à noite|lacre/i, AVISO = /domingo|segunda|duas pessoas/i, EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
let n = 0, ruins = 0; const avisos = new Set();
for (const t of TELAS) for (const o of t.opcoes) for (const modo of ['claro', 'escuro'])
  for (const pf of (t.perfis || [[undefined]]).map(x => x[0]))
    for (const d of (t.disp ? ['notebook', 'celular'] : ['notebook'])) {
      let s;
      try { s = o[2](P(modo), pf, d); } catch (e) { ruins++; console.log('EXCEÇÃO', t.id, o[0], modo, pf, d, e.message); continue; }
      n++;
      const m = s.match(/.{0,50}(undefined|NaN|\[object Object\]|\$\{).{0,50}/);
      if (m) { ruins++; console.log('PROBLEMA', t.id, '|', o[0], '|', modo, '|', pf, '|', d, '\n   ', m[0]); }
      const abre = (s.match(/<div\b/g) || []).length, fecha = (s.match(/<\/div>/g) || []).length;
      if (abre !== fecha) { ruins++; console.log('CAIXAS DESIGUAIS', t.id, '|', o[0], '|', modo, '|', pf, '|', d, '| abre', abre, 'fecha', fecha); }
      const txt = s.replace(/<[^>]*>/g, ' ').replace(/oferta de culto/gi, '');
      const pm = txt.match(PROIB); if (pm) { ruins++; console.log('PALAVRA PROIBIDA', t.id, pf, d, '·', txt.slice(Math.max(0, pm.index - 40), pm.index + 40)); }
      if (EMOJI.test(s)) { ruins++; console.log('EMOJI', t.id, pf, d); }
      const av = txt.match(AVISO); if (av) avisos.add(`${t.id} · ${pf} · ${txt.slice(Math.max(0, av.index - 40), av.index + 30).replace(/\s+/g, ' ')}`);
    }
const textos = TELAS.map(t => `${t.decidido} ${t.opcoes.map(o => o[1]).join(' ')} ${JSON.stringify(t.explica || {})}`).join(' ').replace(/oferta de culto/gi, '');
const tm = textos.match(PROIB); if (tm) { ruins++; console.log('PALAVRA PROIBIDA NAS DESCRIÇÕES ·', textos.slice(tm.index - 40, tm.index + 40)); }
console.log(arq, '· telas', TELAS.length, '· desenhos conferidos', n, '· com problema', ruins);
if (avisos.size) { console.log('para olhar (domingo/segunda/duas pessoas no texto):'); [...avisos].slice(0, 20).forEach(x => console.log('   ', x)); }
