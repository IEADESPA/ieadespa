/* ---------------- 5. O MAPA ---------------- */
// Onde ficam as congregações e os pontos de culto, e onde moram os membros. A congregação vê o ponto de cada membro dela
// (o nome ao tocar); a área e a Geral veem só a contagem por bairro, sem pessoa. A localização das igrejas vem do site.
// [bairro, x, y (0 a 100), membros que moram lá]
const R32_BAIRROS = [['Vila Nova', 30, 40, 286], ['Cidade Jardim', 56, 28, 190], ['Altamira', 18, 64, 97], ['Nova Carajás', 70, 70, 64], ['Bela Vista', 47, 58, 151], ['Monte Sião', 80, 40, 88], ['Primavera', 63, 12, 120], ['Jardim Ipê', 38, 82, 76], ['Centro', 48, 42, 342], ['Liberdade', 88, 16, 28], ['Novo Horizonte', 13, 22, 109], ['Morada do Sol', 90, 82, 41]];
// as igrejas: [nome, x, y, da Área 2?]; e os pontos de culto de Vila Nova
const R32_IGREJAS = [['Vila Nova', 31, 38, 1], ['Cidade Jardim', 57, 26, 1], ['Bela Vista', 47, 56, 1], ['Monte Sião', 81, 38, 1], ['Primavera', 64, 10, 1], ['Jardim Ipê', 38, 80, 1], ['Sede', 49, 44, 0], ['Novo Horizonte', 13, 20, 0], ['Altamira', 20, 70, 0], ['Liberdade', 92, 24, 0]];
const R32_PONTOS_XY = [[19, 61], [68, 72]];
function r32Mapa(p, W, H, k) {
  const X = v => (v * W / 100).toFixed(0), Y = v => (v * H / 100).toFixed(0);
  let s = `<rect width="${W}" height="${H}" fill="#EEF2E8"/><path d="M0 ${Y(52)} C ${X(20)} ${Y(46)}, ${X(34)} ${Y(66)}, ${X(56)} ${Y(64)} S ${X(84)} ${Y(52)}, ${W} ${Y(58)}" stroke="#A9CFEA" stroke-width="12" fill="none"/>`;
  s += [[0, 34, 100, 46], [0, 74, 100, 90], [42, 0, 52, 100], [20, 0, 26, 100], [74, 0, 70, 100], [0, 12, 100, 22]].map(r => `<line x1="${X(r[0])}" y1="${Y(r[1])}" x2="${X(r[2])}" y2="${Y(r[3])}" stroke="#FFFFFF" stroke-width="${r[0] === 0 && r[1] === 34 ? 7 : 4}"/>`).join('');
  if (k === 'local') {
    s += `<circle cx="${X(31)}" cy="${Y(38)}" r="${(W * 0.26).toFixed(0)}" fill="rgba(21,128,61,.07)" stroke="${R32_VERDE}" stroke-width="1.5" stroke-dasharray="6 5"/>`;
    let sem = 17; const rnd = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
    for (let i = 0; i < 90; i++) { const perto = i < 66, a = rnd() * 6.283, d = perto ? rnd() * 22 : 18 + rnd() * 40; s += `<circle cx="${X(Math.min(97, Math.max(3, 31 + Math.cos(a) * d)))}" cy="${Y(Math.min(96, Math.max(4, 38 + Math.sin(a) * d * 1.3)))}" r="3.6" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="1"/>`; }
  } else {
    const max = 342;
    s += R32_BAIRROS.map(b => `<circle cx="${X(b[1])}" cy="${Y(b[2])}" r="${(12 + 30 * Math.sqrt(b[3] / max)) * W / 900}" fill="rgba(29,78,216,${(0.12 + 0.4 * b[3] / max).toFixed(2)})"/><text x="${X(b[1])}" y="${+Y(b[2]) + 4}" text-anchor="middle" font-size="${W > 600 ? 12 : 10}" font-weight="800" fill="#13294A">${b[3]}</text>`).join('');
  }
  s += R32_BAIRROS.map(b => `<text x="${X(b[1])}" y="${+Y(b[2]) + (k === 'local' ? -10 : -18) * (W > 600 ? 1 : 0.8)}" text-anchor="middle" font-size="${W > 600 ? 11 : 9}" fill="#4B5563">${b[0]}</text>`).join('');
  const pino = (x, y, on, t) => `<g transform="translate(${X(x)} ${Y(y)})"><circle r="${t}" fill="${on ? R32_VERDE : '#9CA3AF'}" stroke="#FFFFFF" stroke-width="2"/><path d="M0 ${-t * 0.5} V${t * 0.45} M${-t * 0.4} ${-t * 0.15} H${t * 0.4}" stroke="#FFFFFF" stroke-width="2"/></g>`;
  const T = W > 600 ? 11 : 9;
  s += R32_IGREJAS.filter(g => k !== 'local' || g[0] === 'Vila Nova' || g[0] === 'Sede').map(g => pino(k === 'local' ? g[1] : g[1] + 4.5, k === 'local' ? g[2] : g[2] - 6, k === 'geral' || (k === 'local' ? g[0] === 'Vila Nova' : g[3]), g[0] === 'Vila Nova' && k === 'local' ? T + 3 : T)).join('');
  s += R32_PONTOS_XY.map(q => `<g transform="translate(${X(q[0])} ${Y(q[1])})"><rect x="-7" y="-7" width="14" height="14" rx="4" fill="#FFB800" stroke="#FFFFFF" stroke-width="2"/></g>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block;flex:none;border-radius:14px;border:1px solid ${p.borda}">${s}</svg>`;
}
const r32Legenda = (p, k) => `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:${p.texto}">${[[R32_VERDE, 'congregação', 10], ['#FFB800', 'ponto de culto', 3], k === 'local' ? ['#1D4ED8', 'membro (o nome ao tocar)', 10] : ['rgba(29,78,216,.45)', 'membros por bairro', 10]].map(x => `<span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:${x[2]}px;background:${x[0]};flex:none"></span>${x[1]}</span>`).join('')}${k === 'local' ? `<span style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:0;border-top:2px dashed ${R32_VERDE}"></span>3 km</span>` : ''}</div>`;
const R32_LONGE = [['Nova Carajás', '64 membros · a igreja mais perto a 3,4 km · tem um ponto de culto de Vila Nova'], ['Morada do Sol', '41 membros · a igreja mais perto a 3,1 km'], ['Liberdade', '28 membros · a igreja mais perto a 2,9 km']];
function r32MapaTela(p, k, d) {
  const cel = ehCel(d);
  const filtros = r32Pils(p, k === 'local' ? ['Congregação', 'Pontos de culto', 'Membros', '3 km'] : ['Congregações', 'Pontos de culto', 'Por bairro'], true);
  const lado = k === 'local'
    ? r32Car(p, 'Os membros de Vila Nova', '', `${r31Fatos(p, [['No mapa', '274 de 312'], ['Moram a mais de 3 km', '61'], ['Sem localização', '38: só o CEP geral da cidade']], cel)}${cel ? '' : r28Pes(p, r32Ic(p, 'mapa', 'ouro'), 'Completar os 38 endereços', 'o CEP e o número já bastam, mesmo com erro de uns 50 m', r28Mais(p, 'Abrir ›'), { i: 1, alt: 52 })}`, cel)
    : k === 'area' ? r32Car(p, 'Onde moram os membros da Área 2', '', `${[['Vila Nova', '286 · a 0,4 km da igreja'], ['Cidade Jardim', '190 · a 0,3 km'], ['Bela Vista', '151 · a 0,5 km'], ['Primavera', '120 · a 0,6 km'], ['Monte Sião', '88 · a 0,4 km'], ['Nova Carajás', '64 · a igreja mais perto a 3,4 km']].filter((x, i) => !cel || i !== 3).map((x, i) => r28Pes(p, r32Ic(p, 'casa', i === 5 ? 'ouro' : ''), x[0], x[1], '', { i, alt: cel ? 40 : 42 })).join('')}`, cel)
    : r32Car(p, 'Onde falta igreja', r18Etiq(p, '3 bairros', 'ouro'), `${R32_LONGE.map((x, i) => r28Pes(p, r32Ic(p, 'alvo', 'ouro'), x[0], x[1], '', { i, alt: cel ? 42 : 46 })).join('')}${cel ? '' : `<div style="padding-top:8px">${r21Linha(p, 'Simular uma congregação nova', 'mais')}</div>`}`, cel);
  if (cel) return r32EsCel(p, 'Mapa', `${filtros}${r32Mapa(p, 362, k === 'local' ? 330 : 280, k)}${r32Legenda(p, k)}${lado}`);
  const nota = r20Nota(p, k === 'local' ? 'Só a congregação vê os membros dela, um ponto para cada um. A área e a Geral veem só quantos moram em cada bairro.' : 'Só a contagem por bairro, sem nenhum nome. A localização das igrejas vem do site.');
  const tit = r18Tit(p, { local: 'O mapa de Vila Nova', area: 'O mapa da Área 2', geral: 'O mapa da igreja toda' }[k], `${k === 'local' ? 'a congregação, os pontos de culto e onde moram os membros' : 'as congregações, os pontos de culto e quantos membros moram em cada bairro'} · ${R32_HOJE}`, filtros);
  return r32Es(p, k, 'Mapa', `${tit}<div style="display:flex;gap:16px;align-items:flex-start">${r32Mapa(p, 640, 600, k)}${r18Col(r32Legenda(p, k), lado, nota)}</div>`, [k === 'local' ? 'Vila Nova' : k === 'area' ? 'Área 2' : 'Igreja toda', 'Mapa']);
}
const PERFIS32_MAPA = [['local', 'Dirigente de Vila Nova · os membros'], ['area', 'Pastor da Área 2 · por bairro'], ['geral', 'Secretaria Geral · onde falta igreja']];
