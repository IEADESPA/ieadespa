/* ---------------- 3. O MAPA: O BAIRRO DA FICHA, NUMA LISTA FIXA, E O ALFINETE QUE SE ARRASTA ---------------- */
// Decidido por ele (25/11): a contagem por bairro usa o bairro da FICHA, não o mapa; a ficha escolhe o bairro numa lista
// fixa de Parauapebas, que a Geral cuida. O ponto de cada membro (só a congregação vê) sai do CEP e do número (erro de
// uns 50 m), e a secretaria pode arrastar o alfinete para o lugar certo. O Regimento põe o trabalho "dentro do município
// de Parauapebas e zonas rurais adjacentes": a lista tem os bairros e as vilas da zona rural (a "cidade" da 32 sai).
// a lista: [bairro, membros pela ficha, ponto no mapa posto?]
const R33_LISTA = [['Altamira', 97, 1], ['Bela Vista', 151, 1], ['Centro', 342, 1], ['Chácaras do Rio', 41, 1], ['Cidade Jardim', 190, 1], ['Jardim Ipê', 76, 1], ['Liberdade', 28, 1], ['Monte Sião', 88, 1], ['Nova Carajás', 64, 0], ['Novo Horizonte', 109, 1], ['Primavera', 120, 1], ['Vale do Sol', 33, 1], ['Vila Nova', 286, 1]];
// o fundo do mapa (o mesmo desenho da 32: o rio e as ruas principais), para as telas pequenas
function r33Fundo(W, H) {
  const X = v => (v * W / 100).toFixed(0), Y = v => (v * H / 100).toFixed(0);
  return `<rect width="${W}" height="${H}" fill="#EEF2E8"/><path d="M0 ${Y(52)} C ${X(20)} ${Y(46)}, ${X(34)} ${Y(66)}, ${X(56)} ${Y(64)} S ${X(84)} ${Y(52)}, ${W} ${Y(58)}" stroke="#A9CFEA" stroke-width="12" fill="none"/>` + [[0, 34, 100, 46], [0, 74, 100, 90], [42, 0, 52, 100], [20, 0, 26, 100], [74, 0, 70, 100], [0, 12, 100, 22]].map(r => `<line x1="${X(r[0])}" y1="${Y(r[1])}" x2="${X(r[2])}" y2="${Y(r[3])}" stroke="#FFFFFF" stroke-width="${r[1] === 34 ? 7 : 4}"/>`).join('');
}
// o alfinete vermelho (o que se arrasta) e o lugar de onde ele saiu
const r33Alfinete = (x, y, t = 1) => `<g transform="translate(${x} ${y}) scale(${t})"><path d="M0 0 C -9 -12, -12 -18, -12 -24 A 12 12 0 1 1 12 -24 C 12 -18, 9 -12, 0 0 Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="2"/><circle cx="0" cy="-24" r="4.5" fill="#FFFFFF"/></g>`;
const r33Arrasto = (x0, y0, x1, y1) => `<circle cx="${x0}" cy="${y0}" r="7" fill="none" stroke="#6B7280" stroke-width="2" stroke-dasharray="3 3"/><path d="M${x0} ${y0} L${x1} ${y1}" stroke="#6B7280" stroke-width="2" stroke-dasharray="5 4" fill="none"/>`;
const r33Rotulo = (x, y, t, W = 170) => `<g transform="translate(${x} ${y})"><rect x="${-W / 2}" y="-26" width="${W}" height="22" rx="7" fill="#0A2342"/><text x="0" y="-11" text-anchor="middle" font-size="11.5" font-weight="700" fill="#FFFFFF">${t}</text></g>`;
// o mapinha da ficha: o meio do bairro e o alfinete arrastado até a casa
function r33MiniMapa(p, W, H, o = {}) {
  const X = v => +(v * W / 100).toFixed(0), Y = v => +(v * H / 100).toFixed(0);
  const nomes = [['Vila Nova', 44, 36], ['Centro', 70, 58], ['Altamira', 18, 80], ['Cidade Jardim', 78, 14]].filter(b => W > 400 || b[0] !== 'Cidade Jardim').map(b => `<text x="${X(b[1])}" y="${Y(b[2])}" text-anchor="middle" font-size="11" fill="#4B5563">${b[0]}</text>`).join('');
  const area = o.bairro ? `<circle cx="${X(40)}" cy="${Y(46)}" r="${(W * 0.2).toFixed(0)}" fill="rgba(29,78,216,.08)" stroke="#1D4ED8" stroke-width="1.5" stroke-dasharray="6 5"/>` : '';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block;flex:none;border-radius:12px;border:1px solid ${p.borda}">${r33Fundo(W, H)}${area}${nomes}${r33Arrasto(X(40), Y(46), X(56), Y(40))}${r33Alfinete(X(56), Y(40), 1.1)}${o.rotulo ? r33Rotulo(X(56), Y(40) - 30, o.rotulo, o.rotW) : ''}</svg>`;
}
// a lista aberta da escolha do bairro
function r33EscolhaBairro(p, cel) {
  const op = (t, sub, sel) => `<div style="display:flex;align-items:center;gap:8px;min-height:${cel ? 36 : 38}px;padding:0 11px;${sel ? `background:#FFF8E1;box-shadow:inset 3px 0 0 #FFB800;` : ''}border-top:1px solid ${p.linha}"><span style="flex:1;font-size:13.5px;font-weight:${sel ? 700 : 500};color:${p.titulo}">${t}</span><span style="font-size:11.5px;color:${p.suave}">${sub}</span>${sel ? ic('check', '#8A5A00', 15, 2.6) : ''}</div>`;
  return `<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12.5px;font-weight:600;color:${p.titulo}">Bairro<span style="font-weight:400;color:${p.suave}"> · escolha na lista de Parauapebas</span></span><div style="border:2px solid #FFB800;border-radius:10px;background:${p.campo};overflow:hidden"><div style="display:flex;align-items:center;gap:8px;height:38px;padding:0 11px">${ic('busca', p.suave, 15, 2)}<span style="font-size:13.5px;color:${p.texto}">vila</span></div>${op('Vila Nova', 'bairro', 1)}${op('Vila Rica', 'bairro')}${op('Vila Sansão', 'zona rural')}<div style="display:flex;align-items:center;gap:8px;min-height:36px;padding:0 11px;border-top:1px solid ${p.linha}">${ic('mais', p.link, 14, 2.4)}<span style="font-size:12.5px;font-weight:700;color:${p.link}">O bairro não está na lista: pedir à Geral</span></div></div></div>`;
}
// a ficha do membro (módulo Membros): o endereço, o bairro da lista e o alfinete
function r33Ficha(p, cel) {
  const end = `<div style="display:grid;grid-template-columns:1fr 0.7fr;gap:10px">${r17Campo(p, 'CEP', '68515-000', { nota: 'o geral da cidade' })}${r17Campo(p, 'Número', '233')}</div>${r17Campo(p, 'Rua', 'Rua Dez')}`;
  const aviso = r16aAviso(p, cel ? 'O CEP é o geral da cidade: o alfinete começou no meio do bairro. Arraste até a casa.' : '<strong>O CEP é o geral da cidade</strong>, que não diz a rua. Por isso o alfinete começou no meio do bairro Vila Nova. Arraste até a casa da Marta: erro de uns 50 m não tem problema.', 'alerta');
  const bt = r21Ouro(p, 'Salvar o endereço', 'check', cel ? 44 : 42);
  if (cel) return r33MembrosCel(p, 'Endereço · Marta Souza', `${end}${r33EscolhaBairro(p, 1)}${r33MiniMapa(p, 362, 150, { rotulo: 'a casa da Marta', rotW: 120 })}${bt}`);
  const esq = r32Car(p, 'Endereço', r18Etiq(p, 'editando', 'ouro'), `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${end}${r33EscolhaBairro(p, 0)}</div>`);
  const dir = r32Car(p, 'O alfinete da casa', r18Etiq(p, 'só a congregação vê', 'azul'), `${r33MiniMapa(p, 432, 330, { bairro: 1, rotulo: 'solte onde é a casa da Marta', rotW: 196 })}${aviso}`);
  const tit = r18Tit(p, 'Marta Souza · endereço', `ficha do membro · o bairro conta para o mapa da área e da Geral · ${R33_HOJE}`, `${m8Linha(p, 'Cancelar', 'voltar')}${bt}`);
  return r33Membros(p, `${tit}${r17Dois(esq, dir, '1fr 1.12fr')}`, ['Marta Souza', 'Endereço']);
}
// a Geral cuida da lista dos bairros (e de onde fica o meio de cada um no mapa)
function r33Lista(p, cel) {
  const linhas = R33_LISTA.map(x => [x[0], `${x[1]} membros`, x[2] ? r18Etiq(p, 'posto', 'verde') : r18Etiq(p, 'falta pôr', 'ouro'), r28Mais(p, 'Mudar')]);
  const pedidos = r32Car(p, 'Pedidos de bairro novo', r18Etiq(p, '2', 'ouro'), `${r28Pes(p, r32Ic(p, 'casas', 'ouro'), 'Jardim dos Ipês', cel ? 'pedido por Bela Vista' : 'pedido por Bela Vista em 30/11', cel ? r28Mais(p, '›') : `<span style="display:flex;gap:10px">${r28Mais(p, 'Pôr na lista')}${r28Mais(p, 'É o mesmo que…')}</span>`, { alt: 46 })}${r28Pes(p, r32Ic(p, 'casas', 'ouro'), 'Jd. Ipê', cel ? 'parece o “Jardim Ipê”' : 'pedido por Shalom · parece “Jardim Ipê”', cel ? r28Mais(p, '›') : r28Mais(p, 'Juntar ao Jardim Ipê'), { i: 1, alt: 46 })}`, cel);
  const velhos = r32Car(p, 'Escritos à mão antes da lista', r18Etiq(p, '412 fichas', 'ouro'), `${r28Pes(p, r32Ic(p, 'lapis'), '“V. Nova”, “vila nova”, “VL Nova”', '183 fichas · parece Vila Nova', r28Mais(p, 'Passar ›'), { alt: 44 })}${r28Pes(p, r32Ic(p, 'lapis'), '“Cid. Jardim”', '61 fichas · parece Cidade Jardim', r28Mais(p, 'Passar ›'), { i: 1, alt: 44 })}${cel ? '' : r20Nota(p, 'Até passar para a lista, essas fichas não entram na contagem por bairro.')}`, cel);
  if (cel) return r32EsCel(p, 'Bairros da cidade', `${r29Nums(p, [r32Num('68', 'na lista'), r32Num('2', 'pedidos'), r32Num('412', 'à mão')], 1)}${pedidos}${velhos}${r16aListaCel(p, linhas.slice(0, 3).map(x => [x[0], x[1], x[2]]))}`);
  const tab = `<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div style="display:flex;gap:8px"><span style="flex:1;height:38px;border:1px solid ${p.campoBorda};border-radius:9px;background:${p.campo};display:flex;align-items:center;gap:8px;padding:0 11px;font-size:13.5px;color:${p.suave}">${ic('busca', p.suave, 15, 2)}Procurar bairro ou vila</span>${r21Ouro(p, 'Bairro novo', 'mais', 38)}</div>${r16aTab(p, 'minmax(0,1.3fr) 104px 96px 56px', ['Bairro ou vila', 'Pela ficha', 'No mapa', ''], linhas.slice(0, 11))}</div>`;
  const ponto = r32Car(p, 'Onde fica Nova Carajás', r18Etiq(p, 'falta pôr', 'ouro'), `${(() => { const W = 380, H = 150; return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="display:block;border-radius:12px;border:1px solid ${p.borda}">${r33Fundo(W, H)}<text x="${W * 0.24}" y="${H * 0.3}" font-size="11" fill="#4B5563">Monte Sião</text><text x="${W * 0.62}" y="${H * 0.86}" font-size="11" fill="#4B5563">Chácaras do Rio</text>${r33Alfinete(W * 0.66, H * 0.56)}</svg>`; })()}${r20Nota(p, 'Arraste o alfinete para o meio do bairro. É ali que o círculo da contagem aparece no mapa da área e da Geral.')}`);
  const tit = r18Tit(p, 'Bairros e vilas de Parauapebas', `a lista fixa que a ficha do membro usa · só a Geral muda · 68 bairros e vilas · ${R33_HOJE}`);
  return r33Es(p, 'geral', 'Bairros da cidade', `${tit}${r17Dois(tab, r18Col(pedidos, velhos, ponto), '1.1fr 1fr')}`, ['Bairros da cidade']);
}
// o mapa da congregação: o ponto de cada membro sai do CEP e do número; a secretaria arrasta o alfinete
function r33MapaLocal(p, cel) {
  const W = cel ? 362 : 620, H = cel ? 262 : 560, X = v => +(v * W / 100).toFixed(0), Y = v => +(v * H / 100).toFixed(0);
  const extra = `${r33Arrasto(X(34), Y(43), X(39), Y(31))}${r33Alfinete(X(39), Y(31), cel ? 0.9 : 1.1)}${r33Rotulo(X(39), Y(31) - (cel ? 28 : 32), cel ? 'Marta Souza' : 'Marta Souza · solte onde é a casa', cel ? 110 : 210)}`;
  const mapa = r32Mapa(p, W, H, 'local').replace(/<\/svg>$/, extra + '</svg>');
  const filtros = r32Pils(p, ['Congregação', 'Pontos de culto', 'Membros', '3 km'], true);
  const lado = r32Car(p, 'Os membros de Vila Nova', '', `${r31Fatos(p, (cel ? [['CEP e número', '236 de 312'], ['Meio do bairro', '38: CEP geral'], ['Sem bairro', '38']] : [['Pelo CEP e número', '236 de 312'], ['No meio do bairro', '38: o CEP é o geral'], ['Sem bairro', '38: falta escolher']]), cel)}${cel ? '' : `${r28Pes(p, r32Ic(p, 'mapa', 'ouro'), 'Conferir os 38 do meio do bairro', 'arraste cada alfinete até a casa', r28Mais(p, 'Abrir ›'), { i: 1, alt: 52 })}${r28Pes(p, r32Ic(p, 'pessoa', 'ouro'), 'Escolher o bairro de 38 fichas', 'na lista de Parauapebas', r28Mais(p, 'Abrir ›'), { i: 1, alt: 52 })}`}`, cel);
  const mov = r32Car(p, 'Movendo: Marta Souza', r18Etiq(p, 'arrastando', 'ouro'), `${r20Nota(p, 'Rua Dez, 233 · Vila Nova. O alfinete estava no meio do bairro.')}<div style="display:flex;gap:10px;padding-top:4px">${r21Ouro(p, 'Salvar o lugar', 'check', cel ? 40 : 38).replace('justify-content:center', 'justify-content:center;flex:1.3')}${r28Bt(p, 'Desfazer', 'voltar')}</div>`, cel);
  if (cel) return r32EsCel(p, 'Mapa', `${filtros}${mapa}${mov}${lado}`);
  const tit = r18Tit(p, 'O mapa de Vila Nova', `o ponto de cada membro sai do CEP e do número · só a congregação vê · ${R33_HOJE}`, filtros);
  return r33Es(p, 'local', 'Mapa', `${tit}<div style="display:flex;gap:16px;align-items:flex-start">${mapa}${r18Col(r32Legenda(p, 'local'), mov, lado)}</div>`, ['Vila Nova', 'Mapa'], R32_USU.sec);
}
// a área e a Geral: a contagem pelo bairro da ficha, sem pessoa
function r33MapaConta(p, k, cel) {
  const filtros = r32Pils(p, ['Congregações', 'Pontos de culto', 'Por bairro'], true);
  const sem = k === 'area' ? ['96', 'fichas da área sem bairro na lista'] : ['412', 'fichas sem bairro na lista'];
  const nota = r16aAviso(p, `<strong>${sem[0]} ${sem[1]}</strong> não entram na contagem${k === 'geral' && !cel ? ' (escritas à mão antes da lista)' : ''}. ${k === 'geral' ? 'Passar para a lista em “Bairros da cidade”.' : 'Cada congregação escolhe o bairro na ficha.'}`);
  const lado = k === 'area'
    ? r32Car(p, 'Membros por bairro', r18Etiq(p, 'pela ficha', 'azul'), [['Vila Nova', '286 · a 0,4 km da igreja'], ['Cidade Jardim', '190 · a 0,3 km'], ['Bela Vista', '151 · a 0,5 km'], ['Primavera', '120 · a 0,6 km'], ['Monte Sião', '88 · a 0,4 km'], ['Nova Carajás', '64 · a igreja mais perto a 3,4 km']].filter((x, i) => !cel || i < 4 || i === 5).map((x, i) => r28Pes(p, r32Ic(p, 'casa', i === 5 ? 'ouro' : ''), x[0], x[1], '', { i, alt: cel ? 38 : 42 })).join(''), cel)
    : r32Car(p, 'Onde falta igreja', r18Etiq(p, '3 bairros', 'ouro'), R32_LONGE.map((x, i) => r28Pes(p, r32Ic(p, 'alvo', 'ouro'), x[0], x[1], '', { i, alt: cel ? 40 : 46 })).join(''), cel);
  if (cel) return r32EsCel(p, 'Mapa', `${filtros}${r32Mapa(p, 362, k === 'area' ? 236 : 246, k)}${nota}${lado}`);
  const tit = r18Tit(p, k === 'area' ? 'O mapa da Área 2' : 'O mapa da igreja toda', `${k === 'area' ? 'as 12 congregações da área e os membros por bairro' : 'Parauapebas e a zona rural, as 45 congregações'} · a contagem é pelo bairro da ficha · ${R33_HOJE}`, filtros);
  return r33Es(p, k, 'Mapa', `${tit}<div style="display:flex;gap:16px;align-items:flex-start">${r32Mapa(p, 620, 580, k)}${r18Col(r32Legenda(p, k), nota, lado)}</div>`, [k === 'area' ? 'Área 2' : 'Igreja toda', 'Mapa']);
}
const r33Mapa = (p, k, d) => { const cel = ehCel(d); return k === 'lista' ? r33Lista(p, cel) : k === 'ficha' ? r33Ficha(p, cel) : k === 'local' ? r33MapaLocal(p, cel) : r33MapaConta(p, k, cel); };
const PERFIS33_MAPA = [['lista', 'Secretaria Geral · a lista dos bairros'], ['ficha', 'Secretaria de Vila Nova · o bairro na ficha'], ['local', 'Secretaria de Vila Nova · arrasta o alfinete'], ['area', 'Pastor da Área 2 · por bairro'], ['geral', 'Secretaria Geral · por bairro']];
