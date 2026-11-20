
/* ================================================================ RODADA 20 (Financeiro: a 19 refeita com a realidade do dinheiro, 19/11/2026) ================================================================ */
// A 19 foi reprovada por trazer do Regimento o que não existe. Aqui o pré-repasse se forma pelos LANÇAMENTOS (cada um com o dia e a hora),
// as congregações entregam de dois jeitos (o mês inteiro no último dia, ou repasses semanais e parciais) e "atrasada" só existe depois que o mês acaba.
// Ícones de traço que faltavam aqui, copiados do iconeSvg() da casca (app/modulos/casca.js): o mesmo traço.
I.envelope = I.envelope || 'M3 6h18v12H3zM3 7l9 7 9-7';
I.alvo = I.alvo || 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z';
I.saida = I.saida || 'M3 7h13v10H3zM9.5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 12h4M20 10l2 2-2 2';
I.queda = I.queda || 'M3 7l6 6 4-4 8 8M15 17h6v-6';
I.bandeja = I.bandeja || 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5';
ICO13['Caixa único'] = 'bandeja';
ICO13['Para o contador'] = 'maleta';

// Os itens novos do menu ("Caixa único" no grupo dos repasses, só da Geral; "Para o contador" nos relatórios) só existem nas telas desta rodada.
function r20ComMenu(fn) {
  const G = FIN13.tarefa.find(x => x[0] === 'Pessoas e repasses'), R = FIN13.tarefa.find(x => x[0] === 'Relatórios');
  const guarda = [G[1].slice(), R[1].slice(), VE13.local.slice(), VE13.area.slice()];
  if (!G[1].includes('Caixa único')) G[1].splice(G[1].indexOf('Repasses'), 0, 'Caixa único');
  if (!R[1].includes('Para o contador')) R[1].push('Para o contador');
  [VE13.local, VE13.area].forEach(v => { if (!v.includes('Para o contador')) v.push('Para o contador'); });
  try { return r18ComMenu(fn); } finally {
    G[1].splice(0, G[1].length, ...guarda[0]);
    R[1].splice(0, R[1].length, ...guarda[1]);
    VE13.local.splice(0, VE13.local.length, ...guarda[2]);
    VE13.area.splice(0, VE13.area.length, ...guarda[3]);
  }
}
// a casca aprovada; no nível da Geral quem está no Financeiro é o Tesoureiro Geral
const r20Casca = (p, k, ativo, conteudo) => { const h = r20ComMenu(() => r17Casca(p, k, ativo, conteudo)); return k === 'geral' ? h.split('>Secretaria Geral</span>').join('>Tesoureiro Geral</span>') : h; };
const r20Cel = (p, k, titulo, conteudo) => r17Cel(p, k, titulo, conteudo);
const r20Az = p => (p.e ? '#93C5FD' : '#1D4ED8');
const r20AzF = p => (p.e ? '#13294A' : '#E3ECFD');
const r20Rx = p => (p.e ? '#C4B5FD' : '#6D28D9');
const r20RxF = p => (p.e ? '#2A1D4A' : '#EFE7FD');
const r20Num = (v, cor, t = 13.5) => `<span style="font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700;font-size:${t}px;${cor ? `color:${cor};` : ''}">${v}</span>`;
const r20CxChip = (p, t = 'Caixa único · recebendo') => `<span style="height:40px;padding:0 12px;border-radius:10px;border:1px solid ${p.borda};background:${p.sup};display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:${p.titulo};white-space:nowrap;flex:none"><span style="width:8px;height:8px;border-radius:4px;background:${m8Verde(p)}"></span>${ic('bandeja', p.icone, 16, 2)}${t}</span>`;
const r20Nota = (p, html) => `<span style="font-size:12px;color:${p.suave};line-height:1.4">${html}</span>`;
// a modalidade de cada congregação: parcial (semanal ou quando junta) ou mensal (o mês inteiro no último dia)
const r20Modo = (p, m) => r18Etiq(p, m === 'mensal' ? 'Mensal · 30/11' : 'Parcial', m === 'mensal' ? 'azul' : 'verde');

/* ---- os dados do exemplo de toda a rodada (o exemplo dele, 19/11): Vila Nova anotou R$ 5.000,00; trouxe R$ 1.100,00 em espécie; o Pix de R$ 1.900,00 já estava na conta geral; chegaram R$ 3.000,00 (os 60%); os R$ 2.000,00 ficaram lá ---- */
// cada LANÇAMENTO de dízimos e ofertas, feito a qualquer hora: [dia da semana, data, hora, o que foi lançado, recibos, total, Pix, folhas]
const R20_LANCS = [
  ['qua', '11/11', '10h15', 'Dízimos', 4, 610, 180, '70.067 a 70.070'],
  ['sex', '13/11', '16h30', 'Dízimos', 3, 420, 120, '70.071 a 70.073'],
  ['sáb', '14/11', '10h40', 'Dízimos', 5, 880, 240, '70.074 a 70.078'],
  ['ter', '17/11', '09h20', 'Dízimos e oferta da ceia', 8, 2010.5, 1060, '70.079 a 70.086'],
  ['qua', '18/11', '14h05', 'Dízimos', 5, 499.5, 150, '70.087 a 70.091'],
  ['sex', '20/11', '08h50', 'Dízimos', 6, 580, 150, '70.092 a 70.097']
];
const R20_FORA = ['sex', '20/11', '11h15', 'Dízimo', 1, 150, 150, '70.098'];
const R20_T = { anot: 5000, pix: 1900, esp: 3100, trouxe: 1100, chegou: 3000, retido: 2000, geral: 3000, local: 2000, pagar: 0, diz: 4513.5, ofe: 486.5, rec: 31 };
// os 60% da Geral (Parâmetros, ele em 19/11): Presidente 30%, Tesouro Geral 60%, Convenção 10%; o dízimo do pastor: 10% dos 30% do Presidente vão também para a Convenção
const r20Centros = g => { const pres = g * 0.3, diz = pres * 0.1; return [['Presidente (prebenda)', '30%', pres - diz, 'pessoa', `30% = ${r18R(pres)}, menos o dízimo do pastor`], ['Tesouro Geral', '60%', g * 0.6, 'banco', 'Sede administrativa'], ['Convenção', '10% + dízimo do pastor', g * 0.1 + diz, 'igreja', `fundo convencional ${r18R(g * 0.1)} e dízimo do pastor ${r18R(diz)}`, g * 0.1, diz]]; };

/* ---- a linha do mês (aprovada na rodada 18), com os lançamentos de cada dia e o corte por dia e hora ---- */
const R20_DIAS = { 2: 1, 4: 1, 6: 1, 9: 1, 11: 1, 13: 1, 14: 1, 17: 1, 18: 1, 20: 1 };
function r20Mes(p, cel, o = {}) {
  const w = cel ? 9.5 : 26, h = cel ? 16 : 26, g = cel ? 1.5 : 3;
  const sit = d => (d <= 10 ? 'rec' : d <= 20 ? 'agora' : 'falta');
  const cor = s => ({ rec: m8Verde(p), agora: '#FFB800', falta: 'transparent' }[s]);
  const ponto = (cheio, s) => `<span style="width:${cel ? 4 : 6}px;height:${cel ? 4 : 6}px;border-radius:50%;${cheio ? `background:${s === 'rec' ? m8Verde(p) : p.titulo}` : `box-shadow:inset 0 0 0 1.5px ${p.suave}`}"></span>`;
  let cels = '';
  for (let d = 1; d <= 30; d++) {
    const s = sit(d), n = R20_DIAS[d] || 0;
    cels += `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:none;width:${w}px"><span style="width:${w}px;height:${h}px;border-radius:${cel ? 2 : 5}px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:${cor(s)};${s === 'falta' ? `box-shadow:inset 0 0 0 1px ${p.campoBorda};color:${p.suave};` : s === 'rec' ? `color:${p.e ? '#0B1F3A' : '#FFFFFF'};` : 'color:#0A2342;'}">${cel ? '' : d}</span><span style="display:flex;gap:2px;height:${cel ? 4 : 6}px">${Array.from({ length: n }, () => ponto(true, s)).join('')}${d === 20 && o.corte !== false ? ponto(false, s) : ''}</span></div>`;
    if (d === 20 && o.corte !== false) cels += `<span style="width:0;align-self:stretch;border-left:2px dashed ${p.titulo};margin:-4px ${cel ? 1 : 2}px;flex:none"></span>`;
  }
  const leg = [[m8Verde(p), '01 a 10/11', 'R$ 6.240,00 · recibo nº 2026-1170'], ['#FFB800', '11 a 20/11, até 10h00', o.rotAgora || 'pré-repasse de R$ 5.000,00 · conferindo agora'], ['transparent', '21 a 30/11', 'o resto do mês · vem até 30/11']];
  const legH = leg.map((x, i) => `<div style="display:flex;gap:7px;align-items:flex-start;min-width:0"><span style="width:12px;height:12px;border-radius:3px;margin-top:3px;flex:none;background:${x[0]};${i === 2 ? `box-shadow:inset 0 0 0 1px ${p.campoBorda};` : ''}"></span><div style="min-width:0"><div style="font-size:13px;font-weight:700;color:${p.titulo};white-space:nowrap">${x[1]}</div><div style="font-size:11.5px;color:${p.suave};white-space:nowrap">${x[2]}</div></div></div>`);
  const pontos = `<span style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:${p.suave};white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:${p.titulo}"></span>um lançamento<span style="width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 1.5px ${p.suave};margin-left:6px"></span>depois do corte (11h15)</span>`;
  const corteRot = `<span style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:${p.titulo};white-space:nowrap"><span style="width:14px;border-top:2px dashed ${p.titulo}"></span>fecha em 20/11, às 10h00</span>`;
  const cab = cel ? '' : `<div style="display:flex;align-items:center;gap:14px"><strong style="font-size:15px;color:${p.titulo};flex:1">${o.titulo || 'Novembro de Vila Nova'}</strong>${pontos}${corteRot}</div>`;
  // os lançamentos do período em etiquetas, com o dia e a hora (a opção 1 do detalhe)
  const chips = o.chips && !cel ? `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">${R20_LANCS.concat([R20_FORA]).map((c, i) => { const fora = i === 6; return `<div style="border-radius:9px;padding:4px 9px;${fora ? `border:1px dashed ${p.campoBorda};opacity:.75;` : `background:${p.e ? '#3A2E0B' : '#FFF8E1'};`}min-width:0;line-height:1.3"><div style="font-size:11.5px;color:${fora ? p.suave : p.texto};white-space:nowrap">${c[0]} ${c[1]} · ${c[2]}</div><div style="font-size:12.5px;font-weight:800;color:${p.titulo};white-space:nowrap;font-variant-numeric:tabular-nums">${fora ? 'fica para o próximo' : r18R(c[5])}</div></div>`; }).join('')}</div>` : '';
  return `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;padding:${cel ? '10px 12px' : '12px 16px'};display:flex;flex-direction:column;gap:${cel ? 7 : 9}px;flex:none">${cel ? `<div style="display:flex;align-items:center;gap:8px"><strong style="font-size:14px;color:${p.titulo};flex:1">${o.titulo || 'Novembro'}</strong>${corteRot}</div>` : cab}<div style="display:flex;gap:${g}px;align-items:flex-start">${cels}</div>${chips}<div style="display:grid;grid-template-columns:${cel ? '1fr' : 'repeat(3,minmax(0,1fr))'};gap:${cel ? 4 : 12}px">${cel ? legH.slice(1, 2).join('') : legH.join('')}</div></div>`;
}

/* ---- os lançamentos do período, com o dia e a hora de cada um, e a linha do corte ---- */
function r20Lancs(p, o = {}) {
  const cel = o.cel, alt = o.alt || 34, curta = o.curta, cols = o.cols || (curta ? '116px minmax(0,1fr) 84px' : '106px minmax(0,1fr) 68px 78px 78px 88px');
  const lin = (c, fora) => cel
    ? `<div style="display:flex;align-items:center;gap:8px;min-height:${alt}px;border-top:1px solid ${p.linha};${fora ? 'opacity:.55;' : ''}"><div style="flex:1;min-width:0;line-height:1.25"><div style="font-size:13px;font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c[3]}${fora ? `<span style="font-weight:500;color:${p.suave}"> · fica para o próximo</span>` : ''}</div><div style="font-size:11.5px;color:${p.suave};white-space:nowrap">${c[0]} ${c[1]} · ${c[2]}</div></div>${r20Num(r18R(c[5]).replace('R$ ', ''), p.titulo, 13)}</div>`
    : `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:${alt}px;align-items:center;border-top:1px solid ${p.linha};font-size:13px;color:${p.texto};${fora ? 'opacity:.55;' : ''}"><span style="white-space:nowrap"><strong style="color:${p.titulo}">${c[0]} ${c[1]}</strong> · ${c[2]}</span><span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:${p.titulo}">${c[3]}${fora ? `<span style="font-weight:500;color:${p.suave}"> · ${curta ? 'fica para o próximo' : 'lançado depois do corte: fica para o próximo'}</span>` : ''}</span>${curta ? '' : `<span style="color:${p.suave};white-space:nowrap">${c[4]} ${c[4] === 1 ? 'recibo' : 'recibos'}</span><span style="text-align:right;font-variant-numeric:tabular-nums">${r18R(c[6]).replace('R$ ', '')}</span><span style="text-align:right;font-variant-numeric:tabular-nums">${r18R(c[5] - c[6]).replace('R$ ', '')}</span>`}<span style="text-align:right;font-weight:700;color:${p.titulo};font-variant-numeric:tabular-nums">${r18R(c[5]).replace('R$ ', '')}</span></div>`;
  const corte = `<div style="display:flex;align-items:center;gap:8px;${cel ? '' : 'padding:0 14px;'}height:${cel ? 26 : 28}px;border-top:2px dashed ${p.titulo}"><span style="display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:11px;background:#FFB800;color:#0A2342;font-size:11.5px;font-weight:800;white-space:nowrap">${ic('cadeado', '#0A2342', 12, 2.4)}fecha aqui: 20/11, às 10h00</span>${cel || curta ? '' : `<span style="font-size:12px;color:${p.suave}">o que foi lançado depois fica para o próximo repasse</span>`}</div>`;
  const tot = cel
    ? `<div style="display:flex;align-items:center;gap:8px;min-height:32px;border-top:2px solid ${p.borda};font-size:13px;font-weight:800;color:${p.titulo}"><span style="flex:1">6 lançamentos · 31 recibos</span>${r20Num('R$ 5.000,00', p.titulo, 13.5)}</div>`
    : `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:36px;align-items:center;border-top:2px solid ${p.borda};font-size:13px;font-weight:800;color:${p.titulo}"><span>6 lançamentos</span><span style="font-weight:500;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">folhas 70.067 a 70.097</span><span>31 recibos</span><span style="text-align:right;font-variant-numeric:tabular-nums">1.900,00</span><span style="text-align:right;font-variant-numeric:tabular-nums">3.100,00</span><span style="text-align:right;font-variant-numeric:tabular-nums">5.000,00</span></div>`;
  const cab = cel ? '' : `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;height:34px;align-items:center;font-size:12px;font-weight:700;color:${p.suave};background:${p.fundo};border-radius:14px 14px 0 0"><span>Dia e hora</span><span>${o.rotLanc || 'O que foi lançado'}</span>${curta ? '' : '<span>Recibos</span><span style="text-align:right">Pix</span><span style="text-align:right">Espécie</span>'}<span style="text-align:right">Total</span></div>`;
  const linhas = (o.so ? R20_LANCS.slice(-o.so) : R20_LANCS).map(c => lin(c)).join('');
  const corpo = `${cab}${linhas}${o.corte === false ? '' : corte}${o.fora === false ? '' : lin(R20_FORA, true)}${o.tot === false ? '' : tot}`;
  if (o.nu) return corpo;
  if (cel) return m9Cartao(p, o.titulo || 'Os lançamentos do pré-repasse', '', corpo.replace(`border-top:1px solid ${p.linha}`, ''), 'padding:10px 12px;gap:2px');
  return `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;flex:none">${o.titulo ? `<div style="display:flex;align-items:baseline;gap:8px;padding:10px 14px 8px"><strong style="font-size:15px;color:${p.titulo};flex:1">${o.titulo}</strong><span style="font-size:12px;color:${p.suave}">${o.sub || 'cada lançamento salvo na planilha entra aqui sozinho'}</span></div>` : ''}${o.titulo ? corpo.replace(`border-radius:14px 14px 0 0`, 'border-radius:0') : corpo}</div>`;
}

/* ---- a conta da conferência: o anotado, o banco, a espécie contada, o que chegou e o retido ---- */
function r20Divisao(p, cel, o = {}) {
  const box = (rot, val, sub, cor, fundo) => `<div style="border-radius:11px;padding:${cel ? '7px 10px' : '8px 12px'};background:${fundo};min-width:0"><div style="font-size:12px;font-weight:700;color:${cor};white-space:nowrap">${rot}</div><div style="font-size:${cel ? 16 : 18}px;font-weight:800;color:${p.titulo};font-variant-numeric:tabular-nums;white-space:nowrap">${val}</div><div style="font-size:11.5px;color:${p.suave};line-height:1.3">${sub}</div></div>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${box('Geral (60%)', 'R$ 3.000,00', o.ro ? 'vai para o rateio' : 'chegou inteiro · vai para o rateio', r18F(p), r18Claro(p))}${box('Vila Nova (40%)', 'R$ 2.000,00', o.ro ? 'volta para Vila Nova; o retido sai daqui' : cel ? 'ficou lá (retido) · a Geral paga R$ 0,00' : 'ficou lá: é o retido · a Geral paga R$ 0,00', r20Rx(p), r20RxF(p))}</div>`;
}
function r20Conta(p, cel, o = {}) {
  const ro = o.ro, L = (r, v, op) => r18Lin(p, r, v, Object.assign({ fs: cel ? 13 : 13.5, alt: cel ? 30 : 32 }, op || {}));
  const esp = ro
    ? L(`${ic('dinheiro', p.suave, 14, 2)} Em espécie: para levar na mão`, 'R$ 3.100,00')
    : `${L(`${ic('dinheiro', p.suave, 14, 2)} Em espécie: anotado`, 'R$ 3.100,00')}${L(`<strong style="color:${p.titulo}">Em espécie: contado agora</strong>`, 'R$ 1.100,00', { cor: p.titulo })}`;
  const corpo = `${L('Anotado no pré-repasse', 'R$ 5.000,00', { forte: 1, topo: false })}${cel || o.curto ? '' : L(`<span style="color:${p.suave}">dízimos R$ 4.513,50 · oferta da ceia R$ 486,50 · 31 recibos</span>`, '')}${L(`${ic('banco', p.suave, 14, 2)} No banco: Pix na conta geral`, `${ro ? '' : `<span style="font-size:11.5px;font-weight:600;color:${m8Verde(p)};margin-right:8px">${ic('check', m8Verde(p), 12, 2.6)} no extrato</span>`}R$ 1.900,00`)}${esp}${ro ? '' : L('Chegou à Tesouraria Geral', 'R$ 3.000,00', { forte: 1 })}${ro ? '' : `<div style="display:flex;align-items:center;gap:10px;min-height:34px;border-radius:9px;background:${r20RxF(p)};padding:0 10px;margin-top:4px"><span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:${r20Rx(p)}">Retido na congregação${cel ? '' : '<span style="font-weight:500"> · sai dos 40% de Vila Nova</span>'}</span>${r20Num('R$ 2.000,00', p.titulo, 13.5)}</div>`}${o.semDiv ? '' : `<div style="margin-top:6px">${r20Divisao(p, cel, o)}</div>`}${o.extra || ''}`;
  if (o.nu) return corpo;
  return m9Cartao(p, o.titulo || (ro ? 'O que o pré-repasse diz' : 'A conta da conferência'), cel ? '' : (o.sub || (ro ? 'é só uma anotação' : 'o sistema registra só o que chegou')), corpo, cel ? 'padding:10px 12px;gap:2px' : 'padding:12px 16px;gap:2px');
}

/* ---- as peças do formulário de conferir ---- */
function r20Form(p, cel) {
  const ate = `<div style="display:flex;flex-direction:column;gap:5px">${r18Rot(p, 'Fechar até (dia e hora)')}<div style="display:grid;grid-template-columns:1fr ${cel ? '96px' : '110px'};gap:8px">${r17Campo(p, '', '20/11/2026, sexta', { icone: 'calendario' }).replace(/<span style="font-size:12.5px;font-weight:600[^>]*><\/span>/, '')}${r17Campo(p, '', '10h00', { icone: 'relogio' }).replace(/<span style="font-size:12.5px;font-weight:600[^>]*><\/span>/, '')}</div>${r18Escolha(p, cel ? ['Tudo do pré-repasse', 'Até 17/11', 'Outra'] : ['Tudo do pré-repasse', 'Até 17/11, 12h00', 'Outra data e hora'], 0, { alt: 30 })}</div>`;
  const quem = r17Campo(p, 'Quem trouxe', 'Rute Santos · tesoureira de Vila Nova', { icone: 'busca', nota: cel ? '' : 'procura no cadastro' });
  const pix = `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 42 : 44}px;padding:0 12px;border-radius:10px;background:${p.e ? '#14532D' : '#DCFCE7'}">${ic('banco', m8Verde(p), 17, 2)}<div style="flex:1;min-width:0;line-height:1.25"><div style="font-size:13px;font-weight:700;color:${p.titulo}">No banco: R$ 1.900,00 em Pix</div><div style="font-size:11.5px;color:${p.e ? '#BBF7D0' : '#166534'}">já na conta geral · achados no extrato: 6 Pix</div></div>${ic('check', m8Verde(p), 18, 2.8)}</div>`;
  const esp = `<div style="display:flex;flex-direction:column;gap:4px">${r18Rot(p, 'Em espécie: o que veio na mão (contado)')}<div style="display:flex;align-items:center;gap:10px"><span style="flex:1;height:42px;border:2px solid ${r18F(p)};border-radius:10px;background:${p.sup};display:flex;align-items:center;padding:0 12px;font-size:16px;font-weight:800;color:${p.titulo};font-variant-numeric:tabular-nums">R$ 1.100,00<span style="width:1px;height:18px;background:${p.titulo};margin-left:2px"></span></span><span style="font-size:12px;color:${p.suave};white-space:nowrap">anotado: R$ 3.100,00</span></div></div>`;
  const ret = `<div style="display:flex;align-items:flex-start;gap:9px;padding:8px 11px;border-radius:10px;background:${r20RxF(p)};font-size:12.5px;line-height:1.4;color:${p.texto}">${ic('casa', r20Rx(p), 16, 2)}<span><strong style="color:${r20Rx(p)}">Não veio: R$ 2.000,00.</strong> Fica “Retido na congregação” e sai dos 40% de Vila Nova${cel ? '.' : ', depois das despesas congregacionais. A Geral registra só o que chegou.'}</span></div>`;
  const botao = `<div style="display:flex;align-items:center;gap:12px;${cel ? 'flex-direction:column;align-items:stretch;gap:5px;' : ''}">${m8Ouro(p, 'Conferir e dar o recibo', 'check', 44).replace('flex:none', cel ? 'justify-content:center' : 'flex:none')}<span style="font-size:12px;color:${p.suave};line-height:1.35">${cel ? 'O recibo sai na hora; o rateio, sozinho.' : 'Sai o recibo (uma via) e o rateio divide sozinho.'}</span></div>`;
  return { ate, quem, pix, esp, ret, botao };
}
// o aviso de quem não confere (a congregação e a área)
const r20AvisoRo = (p, k, cel) => r16aAviso(p, k === 'local'
  ? `<strong>É só uma anotação.</strong> Não vale como repasse até a Tesouraria Geral conferir com o dinheiro na mão.${cel ? '' : ' Leve R$ 3.100,00 em espécie; o Pix (R$ 1.900,00) já está na conta geral. O que não for levado fica “Retido na congregação” e sai dos 40% de Vila Nova.'}`
  : `<strong>A área acompanha.</strong> Quem confere é a Tesouraria Geral, com o dinheiro na mão.${cel ? '' : ' Até lá, o pré-repasse de Vila Nova é só uma anotação.'}`);
const r20Esperando = p => r18Etiq(p, 'Esperando a Tesouraria Geral', 'ouro');
const r20Sub = k => (k === 'geral' ? 'Vila Nova · Área 2 · repasses parciais · pré-repasse de Rute Santos, sexta 20/11, às 10h05' : k === 'area' ? 'Vila Nova · Área 2 · feito por Rute Santos, sexta 20/11, às 10h05' : 'Vila Nova · feito por você, sexta 20/11, às 10h05');
const r20TitDet = (p, k) => r18Tit(p, k === 'geral' ? 'Conferir o pré-repasse' : k === 'area' ? 'Pré-repasse de Vila Nova' : 'O seu pré-repasse', r20Sub(k), k === 'geral' ? `${r20CxChip(p)}${r18Troca(p, k, { rot: 'Recebendo de' })}` : k === 'area' ? `${r20Esperando(p)}${r18Troca(p, k)}` : `${r20Esperando(p)}${m8Linha(p, 'Mudar', 'lapis')}`);

/* ================================================================ 1. O CAMINHO DO REPASSE, PASSO A PASSO (versão única; troque o passo) ================================================================ */
const PERFIS20_PASSOS = [['p1', '1 · Vila Nova lança (terça, 09h20)'], ['p2', '2 · Vila Nova faz o pré-repasse'], ['p2m', '2 · Ou: o mês inteiro no último dia'], ['p3', '3 · A Geral vê a lista'], ['p4', '4 · A Geral confere'], ['p5', '5 · O recibo e o rateio'], ['area', 'A área acompanha']];
const R20_EXPLICA_PASSOS = {
  p1: '<strong>Passo 1 (tesouraria de Vila Nova, terça 17/11, 09h20).</strong> A tesoureira lança os dízimos que recebeu, a qualquer hora, na planilha já aprovada: o bloco e a folha vêm sozinhos, e o lançamento guarda o DIA e a hora. A oferta só entra quando há, como a oferta da ceia. Ao salvar, o lançamento entra SOZINHO no pré-repasse de Vila Nova. Ninguém digita nada duas vezes.',
  p2: '<strong>Passo 2 (tesouraria de Vila Nova, sexta 20/11, 10h05).</strong> Vila Nova faz repasses parciais: leva o dinheiro quando junta, em geral uma vez por semana. Ao abrir o pré-repasse, o sistema já juntou os lançamentos desde o último repasse (até 10/11), cada um com o dia e a hora, e separou o Pix (já na conta geral) da espécie. Ela confere e manda. É o envelope de hoje, só que no sistema: uma anotação, sem validade até a Tesouraria Geral conferir. A Tesouraria Geral também pode fazer o pré-repasse por ela.',
  p2m: '<strong>A outra modalidade (Bairro da Paz, 30/11, o último dia do mês).</strong> Metade das congregações entrega o mês inteiro de uma vez, no último dia. O pré-repasse vai juntando os lançamentos do mês e vai inteiro em 30/11. Antes de o mês acabar não existe atraso: “atrasada” só aparece se o mês acabar sem repasse.',
  p3: '<strong>Passo 3 (Tesouraria Geral, sexta 20/11, 15h30).</strong> Ao clicar em Repasses, a primeira tela é a lista das congregações com pré-repasse esperando conferência. As mensais aparecem como “entrega em 30/11”, sem atraso. Só fica “atrasada” a congregação cujo mês já acabou sem repasse (no exemplo, Rio Verde, em outubro).',
  p4: '<strong>Passo 4 (Tesouraria Geral, 15h40, com o dinheiro na mão).</strong> Escolhida Vila Nova, abre o detalhe: até que dia e hora fecha (20/11, 10h00; o dízimo lançado às 11h15 fica para o próximo), quem trouxe, o Pix já na conta geral e a espécie contada. A Rute trouxe R$ 1.100,00 dos R$ 3.100,00 em espécie: os R$ 2.000,00 que não vieram ficam “Retido na congregação”. As 4 maneiras de desenhar este passo estão na tela seguinte, “Conferir o pré-repasse”.',
  p5: '<strong>Passo 5 (15h41).</strong> Ao conferir, sai o recibo (uma via só) para a Rute assinar e levar, a espécie entra no caixa único (e vira Pix no mesmo dia) e o rateio divide sozinho os 60% da Geral. Vila Nova vê no sistema dela o recibo, o que já entregou no mês e o retido.',
  area: '<strong>A área (tesouraria da Área 2).</strong> Acompanha os pré-repasses das suas congregações, parciais e mensais, mas não confere: quem confere é a Tesouraria Geral, com o dinheiro na mão.'
};
// a lista dos pré-repasses (a tela inicial de Repasses): [congregação, área, feito por, quando, período, anotado, espécie, situação]
const R20_PRE = [
  ['Vila Nova', 'Área 2', 'Rute Santos', 'sex 20/11, 10h05', '11/11 a 20/11, até 10h00', 5000, 3100, 'esp'],
  ['Cidade Jardim', 'Área 2', 'Marcos Lima', 'qui 19/11, 16h50', '16/11 a 19/11, até 16h45', 4700, 3440, 'esp'],
  ['Jardim das Oliveiras', 'Área 2', 'feito pela Tesouraria Geral', 'sex 20/11, 08h50', '01/11 a 19/11, até 18h00', 2100, 1500, 'geral'],
  ['Congregação Sede', 'Área 1', 'Paulo Reis', 'sex 20/11, 09h30', '15/11 a 20/11, até 09h00', 9860, 5120, 'esp'],
  ['Bela Vista', 'Área 2', 'Sandra Melo', 'qui 19/11, 11h40', '01/11 a 19/11, até 11h30', 3950, 2800, 'esp'],
  ['Monte Hermon', 'Área 3', 'Lucas Andrade', 'sex 20/11, 07h10', '08/11 a 19/11, até 20h00', 1880, 1210, 'esp'],
  ['Bairro da Paz', 'Área 1', '', 'mensal', 'entrega o mês inteiro em 30/11', 0, 0, 'mensal'],
  ['Rio Verde', 'Área 3', '', 'outubro não veio', 'o mês acabou sem repasse', 0, 0, 'atraso']
];
function r20Lista(p, k, cel) {
  const area = k === 'area', L = area ? R20_PRE.filter(r => r[1] === 'Área 2').concat([['Monte Sião', 'Área 2', '', 'nada a levar', 'obra liberada pelo Presidente', 0, 0, 'obra'], ['Nova Esperança', 'Área 2', '', 'mensal', 'entrega o mês inteiro em 30/11', 0, 0, 'mensal']]) : R20_PRE;
  const sit = r => (r[7] === 'atraso' ? chip(p, 'atrasado', 'Outubro não veio') : r[7] === 'obra' ? `<span style="font-size:12.5px;color:${p.suave}">nada a levar</span>` : r[7] === 'mensal' ? r20Modo(p, 'mensal') : r[7] === 'geral' ? chip(p, 'pendente', 'Feito pela Geral') : chip(p, 'pendente', 'Esperando conferir'));
  if (cel) {
    const item = (r, i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;${i === 0 ? `border-radius:11px;background:${r18Claro(p)};box-shadow:inset 3px 0 0 ${r18F(p)};` : `border-top:1px solid ${p.linha};`}"><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[0]}<span style="font-size:11.5px;font-weight:500;color:${p.suave}"> · ${r[1]}</span></div><div style="font-size:11.5px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[4]}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">${r[5] ? r20Num(r18R(r[5]), p.titulo, 13.5) : ''}${r[5] && r[7] !== 'geral' ? `<span style="font-size:11.5px;color:${p.suave}">esperando</span>` : sit(r)}</div></div>`;
    const N = area ? 8 : 7;
    return m9Cartao(p, area ? 'Pré-repasses da Área 2' : 'Pré-repasses esperando conferir', '', `${m8nSoMeu(p, { meu: area ? 4 : 6, tudo: area ? 12 : 45, tudoRot: area ? 'Toda a área' : 'Todas' }, true).replace('Só o que eu preciso resolver', area ? 'Com pré-repasse' : 'Só o que eu preciso resolver')}<div style="display:flex;flex-direction:column">${L.slice(0, N).map(item).join('')}</div>`, 'padding:10px 12px;gap:8px');
  }
  const cols = '1.25fr 1.35fr 1.45fr .95fr .95fr 1.15fr';
  const linhas = L.map(r => [`<span style="display:flex;flex-direction:column;line-height:1.25"><strong style="color:${p.titulo}">${r[0]}</strong><span style="font-size:11.5px;font-weight:400;color:${p.suave}">${r[1]}</span></span>`, r[2] ? `<span style="display:flex;flex-direction:column;line-height:1.25"><span style="color:${p.titulo};font-weight:600">${r[2]}</span><span style="font-size:11.5px;color:${p.suave}">${r[3]}</span></span>` : `<span style="color:${p.suave}">${r[3]}</span>`, `<span style="font-size:12.5px">${r[4]}</span>`, r[5] ? r20Num(r18R(r[5]), p.titulo, 13) : '—', r[6] ? r20Num(r18R(r[6]), p.texto, 13) : '—', sit(r)]);
  const tab = `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none"><div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 16px;height:36px;align-items:center;font-size:12.5px;font-weight:700;color:${p.suave};background:${p.fundo}"><span>Congregação</span><span>Pré-repasse feito por</span><span>Período (até o dia e a hora)</span><span>Anotado</span><span>Espécie a trazer</span><span>Situação</span></div>${linhas.map((l, i) => `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 16px;min-height:${area ? 44 : 44}px;align-items:center;border-top:1px solid ${p.linha};font-size:13px;color:${p.texto};${i === 0 ? `background:${r18Claro(p)};box-shadow:inset 3px 0 0 ${r18F(p)};` : ''}">${l.map(c => `<span style="min-width:0">${c}</span>`).join('')}</div>`).join('')}</div>`;
  return tab;
}

/* ---- passo 1: a planilha salva, com o lançamento entrando no pré-repasse ---- */
function r20PreForma(p, cel) {
  const L = R20_LANCS.slice(0, 4);
  const lin = (c, i) => `<div style="display:flex;align-items:center;gap:9px;min-height:${cel ? 36 : 38}px;${i ? `border-top:1px solid ${p.linha};` : ''}${i === 3 ? `margin:0 -8px;padding:0 8px;border-radius:9px;background:${r18Claro(p)};` : ''}"><span style="width:${cel ? 92 : 104}px;flex:none;font-size:12px;color:${p.suave};white-space:nowrap">${c[0]} ${c[1]} · ${c[2]}</span><span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c[3]}${i === 3 ? `<span style="font-weight:700;color:${r18F(p)}"> · agora</span>` : ''}</span>${r20Num(r18R(c[5]).replace('R$ ', ''), p.titulo, 13)}</div>`;
  return m9Cartao(p, 'O pré-repasse de Vila Nova', cel ? '' : 'vai se formando sozinho', `${L.map(lin).join('')}<div style="display:flex;justify-content:space-between;border-top:2px solid ${p.borda};padding-top:7px;font-size:13.5px;font-weight:800;color:${p.titulo}"><span>Desde 11/11 · 4 lançamentos</span><span style="font-variant-numeric:tabular-nums">R$ 3.920,50</span></div><span style="display:flex;align-items:center;gap:8px">${r18Etiq(p, 'Só uma anotação', 'ouro')}<span style="font-size:12px;color:${p.suave}">não vale até a Geral conferir</span></span>`, cel ? 'padding:10px 13px;gap:2px' : 'padding:12px 16px;gap:2px');
}
const r20Salvo = (p, cel) => `<div style="display:flex;align-items:center;gap:10px;padding:${cel ? '9px 12px' : '10px 14px'};border-radius:12px;background:${p.e ? '#14532D' : '#DCFCE7'};color:${p.e ? '#BBF7D0' : '#166534'};font-size:13px;line-height:1.35;flex:none">${ic('check', p.e ? '#BBF7D0' : '#166534', 18, 2.8)}<span><strong>Salvo às 09h20.</strong> ${cel ? 'O lançamento entrou no pré-repasse.' : 'O lançamento de terça (R$ 2.010,50, folhas 70.079 a 70.086) entrou sozinho no pré-repasse de Vila Nova.'}</span></div>`;
function r20Passo1(p, d) {
  const cel = ehCel(d), k = 'local';
  if (cel) return r20Cel(p, k, 'Lançar', `<span style="font-size:12.5px;color:${p.suave}">Terça, 17/11, 09h20 · 8 folhas · <strong style="color:${p.titulo}">R$ 2.010,50</strong></span>${r20Salvo(p, true)}${r20PreForma(p, true)}${m8Linha(p, 'Ver o pré-repasse', 'envelope').replace('flex:none', 'justify-content:center')}`);
  const pl = r20Planilha(p, { sugere: false, cols: '72px minmax(0,2.1fr) minmax(0,1fr) minmax(0,.75fr) 86px', rotQuem: 'Quem deu', curto: 1, alt: 35, semAtiva: 1 });
  const tot = `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;height:38px;border-top:2px solid ${p.borda};font-size:13.5px;font-weight:800;color:${p.titulo}"><span>Total deste lançamento · 8 folhas</span><span style="font-variant-numeric:tabular-nums">R$ 2.010,50</span></div></div>`;
  return r20Casca(p, k, 'Lançamentos', `${r18Tit(p, 'Lançar dízimos e ofertas', 'terça, 17/11/2026, 09h20 · Vila Nova · a hora entra sozinha ao salvar', `${segModo(p, 'planilha')}${m8Linha(p, 'Salvo', 'check')}`)}${r20Salvo(p)}${r20BlocoDia(p)}${r17Dois(pl.replace(/<\/div>$/, tot), r18Col(r20PreForma(p), r16aAviso(p, '<strong>A ligação:</strong> cada lançamento salvo na planilha entra sozinho no pré-repasse da congregação, com o dia e a hora.')), '1.62fr 1fr')}`);
}
/* ---- passo 2: a congregação faz o pré-repasse (uma anotação) ---- */
function r20Passo2(p, d) {
  const cel = ehCel(d), k = 'local';
  const env = m9Cartao(p, 'Mandar à Tesouraria Geral', '', `${r17Campo(p, 'Até quando', cel ? '20/11, às 10h00' : '20/11/2026, sexta, às 10h00', { icone: 'relogio', nota: cel ? '' : 'o último lançamento' })}${cel ? '' : r17Campo(p, 'Quem vai levar', 'Rute Santos · tesoureira', { icone: 'pessoa' })}${r18Lin(p, `${ic('banco', p.suave, 14, 2)} Pix: já na conta geral`, 'R$ 1.900,00', { topo: false, alt: cel ? 28 : 32 })}${r18Lin(p, `${ic('dinheiro', p.suave, 14, 2)} Espécie: levar na mão`, 'R$ 3.100,00', { alt: cel ? 28 : 32 })}${cel ? '' : r18Lin(p, 'Total do pré-repasse', 'R$ 5.000,00', { forte: 1 })}${m8Ouro(p, 'Mandar o pré-repasse', 'envelope', 44).replace('flex:none', 'justify-content:center')}`, cel ? 'padding:10px 13px;gap:6px' : 'padding:12px 16px;gap:9px');
  const aviso = r16aAviso(p, `<strong>É só uma anotação.</strong> ${cel ? 'Não vale até a Tesouraria Geral conferir.' : 'Não vale como repasse até a Tesouraria Geral conferir com o dinheiro na mão. A Tesouraria Geral também pode fazer o pré-repasse por vocês.'}`);
  if (cel) return r20Cel(p, k, 'Pré-repasse', `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:12.5px;color:${p.suave}">Vila Nova entrega por partes</span>${r20Modo(p, 'parcial')}</div>${r20Lancs(p, { cel: true, alt: 35, fora: false, corte: false, titulo: 'Desde o último repasse (10/11)' })}${env}`);
  return r20Casca(p, k, 'Repasses', `${r18Tit(p, 'Fazer o pré-repasse', 'Vila Nova · sexta, 20/11/2026, às 10h05 · desde o último repasse (até 10/11)', `${r20Modo(p, 'parcial')}${r18Troca(p, k)}`)}${aviso}${r17Dois(r20Lancs(p, { titulo: 'O que foi lançado desde o último repasse', sub: 'cada lançamento salvo entra sozinho', fora: false }), env, '2.05fr 1fr')}`);
}
/* ---- passo 2, a outra modalidade: o mês inteiro no último dia ---- */
const R20_MENSAL = [['ter', '03/11', '10h30', 'Dízimos', 6, 1240, 520], ['qui', '05/11', '15h10', 'Dízimos e oferta da ceia', 9, 1980, 640], ['ter', '10/11', '09h45', 'Dízimos', 5, 860, 300], ['sex', '13/11', '11h20', 'Dízimos', 4, 610, 260], ['qua', '18/11', '16h00', 'Dízimos', 7, 1150, 410]];
function r20PassoMensal(p, d) {
  const cel = ehCel(d), k = 'local', tot = R20_MENSAL.reduce((a, x) => a + x[5], 0), pix = R20_MENSAL.reduce((a, x) => a + x[6], 0);
  const lin = (c, i) => `<div style="display:grid;grid-template-columns:${cel ? '112px minmax(0,1fr) 76px' : '120px minmax(0,1fr) 80px 110px'};gap:10px;align-items:center;min-height:${cel ? 36 : 38}px;${i ? `border-top:1px solid ${p.linha};` : ''}font-size:13px"><span style="color:${p.suave};white-space:nowrap">${c[0]} ${c[1]} · ${c[2]}</span><span style="font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c[3]}</span>${cel ? '' : `<span style="color:${p.suave}">${c[4]} recibos</span>`}<span style="text-align:right;font-weight:700;color:${p.titulo};font-variant-numeric:tabular-nums">${r18R(c[5]).replace('R$ ', '')}</span></div>`;
  const lista = m9Cartao(p, 'O mês até agora', cel ? '' : 'vai juntando sozinho até 30/11', `${R20_MENSAL.map(lin).join('')}<div style="display:flex;justify-content:space-between;border-top:2px solid ${p.borda};padding-top:7px;font-size:13.5px;font-weight:800;color:${p.titulo}"><span>5 lançamentos · 31 recibos</span><span style="font-variant-numeric:tabular-nums">${r18R(tot)}</span></div>`, cel ? 'padding:10px 13px;gap:2px' : 'padding:12px 16px;gap:2px');
  const quando = m9Cartao(p, 'Quando vai', '', `${r18Lin(p, `${ic('calendario', p.suave, 14, 2)} O mês inteiro, de uma vez`, '30/11', { topo: false, fs: 13 })}${r18Lin(p, `${ic('banco', p.suave, 14, 2)} Pix: já na conta geral`, r18R(pix), { fs: 13 })}${r18Lin(p, `${ic('dinheiro', p.suave, 14, 2)} Espécie até agora`, r18R(tot - pix), { fs: 13 })}<div style="display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border-radius:10px;background:${r20AzF(p)};font-size:12.5px;line-height:1.4;color:${p.texto}">${ic('check', r20Az(p), 16, 2.4)}<span><strong style="color:${p.titulo}">Em dia.</strong> Antes de o mês acabar não existe atraso. Só fica “atrasada” se 30/11 passar sem o repasse.</span></div>`, cel ? 'padding:10px 13px;gap:4px' : 'padding:12px 16px;gap:6px');
  if (cel) return r20Cel(p, k, 'Pré-repasse', `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:12.5px;color:${p.suave}">Bairro da Paz · novembro</span>${r20Modo(p, 'mensal')}</div>${lista}${quando}`);
  return r20Casca(p, k, 'Repasses', `${r18Tit(p, 'O pré-repasse do mês', 'Bairro da Paz · novembro de 2026 · entrega o mês inteiro em 30/11', `${r20Modo(p, 'mensal')}${r18Troca(p, k, { nome: 'Bairro da Paz' })}`)}${r16aAviso(p, '<strong>Metade das congregações entrega assim:</strong> o mês inteiro, no último dia. A outra metade entrega por partes, quando junta (como Vila Nova). As duas modalidades usam o mesmo pré-repasse.')}${r17Dois(lista, quando, '1.6fr 1fr')}`).split('Congregação Vila Nova').join('Congregação Bairro da Paz').split('Tesoureira · Vila Nova').join('Tesoureira · Bairro da Paz').split('Rute Santos').join('Marta Lima').split('>RS<').join('>ML<');
}
/* ---- passo 3: a lista (a tela inicial de Repasses) ---- */
function r20Passo3(p, d, k = 'geral') {
  const cel = ehCel(d), area = k === 'area';
  if (cel) return r20Cel(p, k, 'Repasses', `${area ? r18Troca(p, k, { nome: 'As 12 da Área 2', rot: 'Vendo', cel: true }) : ''}${r20Lista(p, k, true)}`);
  const nums = area ? r16aNum(p, [['4 de 12', 'com pré-repasse esperando'], ['R$ 15.750,00', 'anotados na área'], ['5 mensais', 'entregam em 30/11']], 3) : r16aNum(p, [['6', 'pré-repasses esperando'], ['R$ 27.490,00', 'anotados'], ['R$ 17.170,00', 'em espécie a receber'], ['22 mensais', 'entregam o mês em 30/11']], 4);
  return r20Casca(p, k, area ? 'Repasses da área' : 'Repasses', `${r18Tit(p, area ? 'Repasses da área' : 'Repasses', area ? 'Área 2 · sexta, 20/11/2026 · quem confere é a Tesouraria Geral' : 'sexta, 20/11/2026, 15h30 · os pré-repasses esperando conferência', area ? r18Troca(p, k, { nome: 'As 12 da área', rot: 'Vendo' }) : `${r20CxChip(p)}${m8Linha(p, 'Fazer um pré-repasse', 'mais')}`)}${area ? r20AvisoRo(p, 'area') : ''}${m8nSoMeu(p, { meu: area ? 4 : 6, tudo: area ? 12 : 45, tudoRot: area ? 'Toda a área' : 'Todas' }).replace('Só o que eu preciso resolver', area ? 'Com pré-repasse esperando' : 'Só o que eu preciso resolver')}${r20Lista(p, k, false)}${nums}`);
}
/* ---- passo 5: conferido (o recibo, o caixa e o rateio) ---- */
function r20Passo5(p, d) {
  const cel = ehCel(d), k = 'geral', C = r20Centros(3000);
  const feito = (t, s) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid ${p.linha}">${ic('check', m8Verde(p), 17, 2.8)}<div style="min-width:0"><div style="font-size:13.5px;font-weight:700;color:${p.titulo}">${t}</div><div style="font-size:12px;color:${p.suave};line-height:1.35">${s}</div></div></div>`;
  const lista = `${feito('O recibo nº 2026-1191 saiu para a Rute assinar', 'uma via só, com o QR de validade')}${feito('R$ 1.100,00 em espécie entraram no caixa único', 'na conta Espécie; viram Pix no depósito da tarde')}${feito('O rateio dividiu os R$ 3.000,00 da Geral', `Presidente ${r18R(C[0][2])} · Tesouro Geral ${r18R(C[1][2])} · Convenção ${r18R(C[2][2])}`)}${feito('Os 40% de Vila Nova ficaram lá (retido)', 'R$ 2.000,00 · a Geral não paga nada deste repasse')}`;
  if (cel) return r20Cel(p, k, 'Repasse conferido', `<span style="font-size:12.5px;color:${p.suave}">Vila Nova · 11 a 20/11 · conferido às 15h41</span><div style="display:flex;justify-content:center">${r18Escala(236, r20PapelRec())}</div>${m9Cartao(p, 'O que aconteceu sozinho', '', [['Saiu o recibo nº 2026-1191', 'uma via, para a Rute assinar'], ['R$ 1.100,00 entraram no caixa único', 'na conta Espécie'], ['O rateio dividiu os R$ 3.000,00', 'Presidente, Tesouro Geral e Convenção'], ['R$ 2.000,00 ficaram retidos', 'em Vila Nova: os 40%']].map((x, i) => `<div style="display:flex;gap:9px;align-items:flex-start;padding:5px 0;${i ? `border-top:1px solid ${p.linha};` : ''}">${ic('check', m8Verde(p), 16, 2.8)}<div style="min-width:0;line-height:1.25"><div style="font-size:13px;font-weight:700;color:${p.titulo}">${x[0]}</div><div style="font-size:11.5px;color:${p.suave}">${x[1]}</div></div></div>`).join(''), 'padding:8px 13px;gap:0')}`);
  return r20Casca(p, k, 'Repasses', `${r18Tit(p, 'Repasse conferido', 'Vila Nova · 11/11 a 20/11, até 10h00 · conferido às 15h41', `${r20CxChip(p)}${m8Ouro(p, 'Imprimir o recibo', 'impressora', 40)}`)}<div style="display:flex;gap:20px;align-items:flex-start"><div style="flex:none">${r18Escala(400, r20PapelRec())}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px">${m9Cartao(p, 'O que aconteceu sozinho', 'ao tocar em “Conferir e dar o recibo”', lista.replace(`border-top:1px solid ${p.linha}`, ''), 'gap:0')}${r16aAviso(p, '<strong>Vila Nova vê no sistema dela</strong> o recibo, o que já entregou em novembro e o retido.')}<div style="display:flex;gap:10px;align-items:center">${m8Linha(p, 'Próximo da lista: Monte Hermon', 'seta')}</div></div></div>`);
}
function r20Fluxo(p, k, d) {
  if (k === 'p1') return r20Passo1(p, d);
  if (k === 'p2') return r20Passo2(p, d);
  if (k === 'p2m') return r20PassoMensal(p, d);
  if (k === 'p3') return r20Passo3(p, d, 'geral');
  if (k === 'p4') return r20Detalhe('linha')(p, 'geral', d);
  if (k === 'p5') return r20Passo5(p, d);
  return r20Passo3(p, d, 'area');
}

/* ================================================================ 2. CONFERIR O PRÉ-REPASSE (o detalhe; 4 maneiras, todas no mesmo fluxo) ================================================================ */
function r20Detalhe(estilo) {
  return (p, k, d) => {
    const cel = ehCel(d), geral = k === 'geral', ro = !geral, f = r20Form(p, cel);
    const ativo = k === 'area' ? 'Repasses da área' : 'Repasses';
    const topoCel = geral ? r18Troca(p, k, { rot: 'Recebendo de', cel: true }) : k === 'area' ? r18Troca(p, k, { cel: true }) : `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:12.5px;color:${p.suave}">feito por você · 20/11, 10h05</span>${r20Esperando(p)}</div>`;
    if (estilo === 'linha') {
      // a linha do mês no alto; embaixo, o formulário e a conta
      if (cel) return r20Cel(p, k, geral ? 'Conferir' : 'Pré-repasse', geral ? `${topoCel}${r20Mes(p, true)}${f.ate}${f.pix}${f.esp}${f.ret}${f.botao}` : `${topoCel}${r20Mes(p, true, { rotAgora: 'pré-repasse de R$ 5.000,00 · esperando' })}${r20AvisoRo(p, k, true)}${r20Conta(p, true, { ro: 1, semDiv: 1 })}${r20Lancs(p, { cel: true, so: 3, fora: false, corte: false, tot: false, titulo: 'Os últimos lançamentos' })}`);
      const esq = geral ? m9Cartao(p, 'Conferir com o dinheiro na mão', '', `${f.ate}${f.quem}${f.pix}${f.esp}${f.botao}`, 'padding:12px 16px;gap:10px') : r18Col(r20AvisoRo(p, k), r20Conta(p, false, { ro: 1, semDiv: 1, curto: 1 }));
      const dir = geral ? r20Conta(p, false, { curto: 1 }) : m9Cartao(p, 'A divisão, quando a Geral conferir', 'pelos Parâmetros', `${r20Divisao(p, false, { ro: 1 })}${r20Nota(p, 'O que não for levado em espécie fica “Retido na congregação” e sai dos 40% de Vila Nova, depois das despesas congregacionais. Os 60% da Geral vão para o rateio: Presidente, Tesouro Geral e Convenção.')}`, 'padding:12px 16px;gap:8px');
      return r20Casca(p, k, ativo, `${r20TitDet(p, k)}${r20Mes(p, false, Object.assign({ chips: 1 }, ro ? { rotAgora: 'pré-repasse de R$ 5.000,00 · esperando a Geral' } : {}))}${r17Dois(esq, dir, geral ? '1fr 1.08fr' : '1fr 1fr')}`);
    }
    if (estilo === 'passos') {
      // em 4 passos numerados, de cima para baixo; à direita, os lançamentos e a conta
      const passo = (n, tit, corpo, est) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:${cel ? '8px 0' : '9px 0'};${n > 1 ? `border-top:1px solid ${p.linha};` : ''}">${r17Bola(p, n, est || 'ok', cel ? 24 : 26)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px"><strong style="font-size:14px;color:${p.titulo}">${tit}</strong>${corpo}</div></div>`;
      const ateCurto = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${r18Escolha(p, cel ? ['Tudo: 20/11, 10h00', 'Outra'] : ['Tudo do pré-repasse: 20/11, às 10h00', 'Até 17/11, 12h00', 'Outra data e hora'], 0, { alt: 30 })}</div>`;
      const passos = geral
        ? `${passo(1, 'Até que dia e hora fecha', ateCurto)}${passo(2, 'Quem trouxe', `<span style="font-size:13.5px;color:${p.texto}">Rute Santos · tesoureira de Vila Nova ${cel ? '' : `<span style="color:${p.link};font-weight:600">trocar</span>`}</span>`)}${passo(3, 'O Pix e a espécie', `${f.pix}${f.esp.replace(r18Rot(p, 'Em espécie: o que veio na mão (contado)'), '')}`, 'agora')}${passo(4, 'O que não veio fica retido', f.ret, 'depois')}`
        : `${passo(1, 'Até que dia e hora', `<span style="font-size:13.5px;color:${p.texto}">20/11/2026, às 10h00 · o último lançamento</span>`)}${passo(2, 'Quem vai levar', `<span style="font-size:13.5px;color:${p.texto}">Rute Santos · tesoureira de Vila Nova</span>`)}${passo(3, 'A Tesouraria Geral confere o Pix e a espécie', `<span style="font-size:13px;color:${p.texto};line-height:1.4">Pix na conta geral: <strong>R$ 1.900,00</strong> · espécie para levar: <strong>R$ 3.100,00</strong></span>`, 'agora')}${passo(4, 'O que não for levado fica retido', `<span style="font-size:13px;color:${p.texto};line-height:1.4">Sai dos 40% de Vila Nova. O sistema registra só o que chegou.</span>`, 'depois')}`;
      if (cel) return r20Cel(p, k, geral ? 'Conferir' : 'Pré-repasse', `${topoCel}${ro ? r20AvisoRo(p, k, true) : ''}${m9Cartao(p, geral ? 'Vila Nova · R$ 5.000,00 anotados' : 'R$ 5.000,00 anotados', '', passos, 'padding:4px 13px;gap:0')}${geral ? f.botao : ''}`);
      const dir = r18Col(r20Lancs(p, { titulo: 'Os lançamentos do pré-repasse', sub: 'com o dia e a hora', curta: 1, alt: 30, tot: false }), geral ? m9Cartao(p, 'A conta', '', r20Divisao(p, false), 'padding:12px 16px;gap:8px') : r20Conta(p, false, { ro: 1, curto: 1 }));
      return r20Casca(p, k, ativo, `${r20TitDet(p, k)}${ro ? r20AvisoRo(p, k, true) : ''}${r17Dois(r18Col(m9Cartao(p, geral ? 'Conferir em 4 passos' : 'Como vai ser conferido', geral ? 'com o dinheiro na mão' : '', passos, 'padding:8px 16px;gap:0'), geral ? f.botao : ''), dir, '1.2fr 1fr')}`);
    }
    if (estilo === 'corte') {
      // a lista dos lançamentos, com a linha de corte por dia e hora; embaixo, quem trouxe e a conta
      if (cel) return r20Cel(p, k, geral ? 'Conferir' : 'Pré-repasse', `${topoCel}${ro ? r20AvisoRo(p, k, true) : ''}${r20Lancs(p, { cel: true, alt: 33, titulo: geral ? 'Os lançamentos · arraste o corte' : 'Os lançamentos do pré-repasse' })}${geral ? `${f.esp}${f.ret}${f.botao}` : r20Conta(p, true, { ro: 1, semDiv: 1 }).replace(r18Lin(p, 'Anotado no pré-repasse', 'R$ 5.000,00', { fs: 13, alt: 30, forte: 1, topo: false }), '')}`);
      const quem = geral ? m9Cartao(p, 'Quem trouxe e o dinheiro', '', `${f.quem}${f.esp}${f.botao}`, 'padding:12px 16px;gap:10px') : r18Col(r20AvisoRo(p, k));
      return r20Casca(p, k, ativo, `${r20TitDet(p, k)}${r20Lancs(p, { titulo: geral ? 'Até onde fecha: arraste a linha do corte' : 'Os lançamentos do pré-repasse', sub: geral ? 'o dia e a hora de cada lançamento' : 'com o dia e a hora', alt: 28 })}${r17Dois(quem, r20Conta(p, false, { ro, curto: 1, semDiv: 1, titulo: geral ? 'A conta' : undefined, extra: r18Lin(p, 'Geral (60%) · Vila Nova (40%)', 'R$ 3.000,00 · R$ 2.000,00', { fs: 13 }) }).replace(r18Lin(p, 'Anotado no pré-repasse', 'R$ 5.000,00', { fs: 13.5, alt: 32, forte: 1, topo: false }), ''), '1fr 1.15fr')}`);
    }
    // 'lado': anotado pela congregação × conferido pela Tesouraria Geral, linha por linha
    const linhas = [
      ['Até quando', '20/11, às 10h00', '20/11, às 10h00', 'ok'],
      ['Quem traz', 'Rute Santos', 'Rute Santos', 'ok'],
      ['Dízimos e ofertas', 'R$ 5.000,00', 'R$ 5.000,00', 'ok'],
      ['No banco (Pix)', 'R$ 1.900,00', 'R$ 1.900,00 no extrato', 'ok'],
      ['Em espécie', 'R$ 3.100,00', 'R$ 1.100,00 contados', 'dif'],
      ['Chegou à Geral', '—', 'R$ 3.000,00', 'tot'],
      ['Retido na congregação', '—', 'R$ 2.000,00', 'ret']
    ];
    const cols = cel ? '1fr 1fr' : '170px 1fr 1.25fr 1.15fr';
    const cel2 = (l) => l[3] === 'ok' ? r18Ok(p, 'bate') : l[3] === 'dif' ? `<span style="font-size:12.5px;font-weight:700;color:${r20Rx(p)}">não veio: R$ 2.000,00</span>` : l[3] === 'ret' ? `<span style="font-size:12.5px;color:${r20Rx(p)};font-weight:600">sai dos 40% de Vila Nova</span>` : `<span style="font-size:12.5px;color:${p.suave}">os 60% da Geral</span>`;
    const conf = (l) => (ro ? `<span style="color:${p.suave}">a conferir</span>` : `<strong style="color:${l[3] === 'ret' ? r20Rx(p) : p.titulo}">${l[2]}</strong>`);
    if (cel) {
      const itens = linhas.slice(2).map((l, i) => `<div style="display:flex;flex-direction:column;gap:3px;padding:7px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="font-size:12.5px;font-weight:700;color:${l[3] === 'ret' ? r20Rx(p) : p.titulo}">${l[0]}</span><div style="display:grid;grid-template-columns:${cols};gap:8px;font-size:13px"><span style="color:${p.texto}">${l[1]}</span><span style="text-align:right">${conf(l)}</span></div></div>`).join('');
      return r20Cel(p, k, geral ? 'Conferir' : 'Pré-repasse', `${topoCel}${ro ? r20AvisoRo(p, k, true) : ''}${m9Cartao(p, 'Anotado × chegou', '', `<div style="display:grid;grid-template-columns:${cols};gap:8px;font-size:11.5px;font-weight:700;color:${p.suave}"><span>Vila Nova anotou</span><span style="text-align:right">A Geral conferiu</span></div>${itens}`, 'padding:10px 13px;gap:2px')}${geral ? `${f.esp}${f.botao}` : ''}`);
    }
    const tab = `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none"><div style="display:grid;grid-template-columns:${cols};gap:12px;padding:0 16px;height:38px;align-items:center;font-size:12.5px;font-weight:700;color:${p.suave};background:${p.fundo}"><span></span><span>Vila Nova anotou (pré-repasse)</span><span>A Tesouraria Geral conferiu</span><span></span></div>${linhas.map(l => `<div style="display:grid;grid-template-columns:${cols};gap:12px;padding:0 16px;min-height:${l[3] === 'tot' ? 44 : 42}px;align-items:center;border-top:${l[3] === 'tot' ? 2 : 1}px solid ${l[3] === 'tot' ? p.borda : p.linha};font-size:13.5px;color:${p.texto};font-variant-numeric:tabular-nums;${l[3] === 'ret' ? `background:${r20RxF(p)};` : ''}"><span style="font-weight:700;color:${l[3] === 'ret' ? r20Rx(p) : p.titulo}">${l[0]}</span><span>${l[1]}</span><span>${conf(l)}</span><span>${ro ? '' : cel2(l)}</span></div>`).join('')}</div>`;
    const baixo = geral ? r17Dois(m9Cartao(p, 'O dinheiro na mão', '', `${f.esp}${f.botao}`, 'padding:12px 16px;gap:10px'), r18Col(r20Divisao(p, false), r20Lancs(p, { curta: 1, alt: 26, tot: false, fora: false, corte: false, so: 3, rotLanc: 'Os últimos lançamentos (são 6)' })), '1fr 1.1fr') : r17Dois(r20AvisoRo(p, k), r20Divisao(p, false, { ro: 1 }), '1fr 1fr');
    return r20Casca(p, k, ativo, `${r20TitDet(p, k)}${tab}${baixo}`);
  };
}
