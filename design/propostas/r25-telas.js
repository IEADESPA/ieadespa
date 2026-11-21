/* ================================================================ RODADA 25 (21/11/2026) ================================================================ */
// As respostas dele à 24:
// 1. A folha do mural: as linhas COM NOME que vieram do mês anterior ficam iguais às outras (sem "marcada em outubro/novembro"
//    e sem fundo roxo: "não poderia existir"). As tarjas "referente ao mês posterior/anterior" continuam. O quadro das contas
//    termina nos 40% que vão para o centro de custo da congregação: o retido e as despesas dela saíram do relatório.
// 2. O 3º relatório NÃO é conferência de mês: é saber, todo dia, quanto cada congregação tem. Na sede (Pix na conta geral e
//    espécie entregue) e, separado, a espécie que ainda está com ela. Quando um relatório fecha, de qualquer mês, o líquido sai
//    do saldo e se divide sozinho: 60% para a Geral, 40% para o centro de custo da congregação.

/* ---------------- 1. A FOLHA DO MURAL, acertada ---------------- */
const r25SemMarca = nomes => nomes.map(l => (l[3] === 'veio' ? [l[0], l[1], l[2]] : l));
const R25_MURAIS = {
  local: Object.assign({}, R24_MURAIS.local, { nomes: r25SemMarca(R24_MURAIS.local.nomes) }),
  dez: Object.assign({}, R24_MURAIS.dez, { nomes: r25SemMarca(R24_MURAIS.dez.nomes) }),
  area: R24_MURAIS.area
};
// o quadro das contas: até os 40%, que vão para o centro de custo da congregação (o retido não entra mais aqui)
function r25MuralContas(c, nome, tit) {
  const L = (r, v, f) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:2.5px 0;border-top:1px solid #E6EAF0;${f ? 'font-weight:800;font-size:10px;' : ''}"><span>${r}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap">${v}</span></div>`;
  return `<div style="border:1.5px solid #0A2342;border-radius:6px;padding:6px 9px;display:flex;flex-direction:column;font-size:9.2px"><strong style="font-size:10.5px;padding-bottom:3px">${tit}</strong>${L('Total arrecadado (dízimos e ofertas)', c[0], 1)}${L(`(−) Despesas congregacionais: ${c[1]}`, c[2])}${L('(=) Líquido, para dividir', c[3], 1)}${L('Geral (60%)', c[4])}${L(`Congregação (40%): vai para o centro de custo de ${nome}`, c[5])}</div>`;
}
const r25Folhas = k => { const N = R25_MURAIS[k].nomes, F = []; let at = [], n = 0; N.forEach(l => { if (l[3] !== 'div' && n === 50) { F.push(at); at = []; n = 0; } at.push(l); if (l[3] !== 'div') n++; }); if (at.length) F.push(at); return F; };
function r25MuralPag(k, n) {
  const R = R25_MURAIS[k], F = r25Folhas(k), tot = F.length, linhas0 = F[n - 1], ult = n === tot, cod = `${R.qr}-${n}`;
  const so = linhas0.filter(l => l[3] !== 'div'), nl = so.length;
  const cab = r18PpCab(`${R.cong} · relatório de ${R.mes} de 2026`, R.sub, `<span style="font-size:9px;font-weight:800;color:#0A2342;white-space:nowrap;padding:2px 6px;border:1px solid #0A2342;border-radius:4px">folha ${n} de ${tot}</span>`);
  const faixa = R.atrasado ? `<div style="background:#FFF4D1;border:1px solid #E0B43A;border-radius:4px;padding:3px 8px;font-size:9.4px;font-weight:800;color:#5C3D00">Referente aos meses de outubro e novembro</div>` : '';
  const hd = 'font-weight:800;border-bottom:1px solid #0A2342;padding-bottom:1px', lh = nl > 40 ? 8.6 : ult && R.resumo && nl > 12 ? 8.9 : 9.6;
  const corpo = linhas0.map((l, i) => {
    if (l[3] === 'div') return `<span style="grid-column:1 / -1;font-weight:800;font-size:8.8px;color:#0A2342;border-bottom:1px solid #9AA6B8;padding-top:3px;line-height:${lh + 2}px">${l[2]} de 2026</span>`;
    const m = l[3], z = m === 'ant' ? 'background:#F1EAFE;' : m === 'pos' ? 'background:#E6EEFD;' : i % 2 ? 'background:#F3F6FA;' : '';
    const esp = l[2] === 'cancelada' || l[2] === 'arrancada';
    const nome = m === 'ant' || m === 'pos'
      ? `<span style="${z}font-weight:800;font-style:italic;color:${m === 'ant' ? '#6D28D9' : '#1D4ED8'}">referente ao mês ${m === 'ant' ? 'anterior' : 'posterior'}</span>`
      : `<span style="${z}${esp || l[2].startsWith('Oferta') ? 'color:#5B6678;font-style:italic;' : ''}">${esp ? `folha ${l[2]}` : l[2]}</span>`;
    return `<span style="${z}">${l[0]}</span><span style="${z}font-variant-numeric:tabular-nums">${l[1]}</span>${nome}`;
  }).join('');
  const lista = `<div style="display:grid;grid-template-columns:36px 46px 1fr;font-size:8.1px;line-height:${lh}px"><span style="${hd}">Bloco</span><span style="${hd}">Folha</span><span style="${hd}">Nome do dizimista (sem valor)</span>${corpo}</div>`;
  const resumo = R.resumo ? `<div style="border:1px solid #D5DBE5;border-left:3px solid #1D4ED8;border-radius:5px;padding:3px 7px;font-size:7.8px;line-height:1.3;color:#3B4A63"><strong style="color:#0A2342">Folhas de outro mês:</strong> ${R.resumo}</div>` : '';
  const contas = r25MuralContas(R.contas, R.nome, R.atrasado ? 'As contas de outubro e novembro' : `As contas de ${R.mes}`);
  const selo = `<div style="display:flex;align-items:center;gap:8px;border:1px solid #D5DBE5;border-radius:6px;padding:4px 7px">${r18Qr(30, 70 + n)}<div style="flex:1;min-width:0;font-size:7.8px;color:#3B4A63;line-height:1.35"><strong style="font-size:8.8px;color:#0A2342">Folha ${n} de ${tot}</strong> · ${nl} linhas, de ${so[0][1]} a ${so[nl - 1][1]}. Esta folha é verdadeira? Aponte a câmera ou abra <strong>conferir.ieadespa.org.br</strong> e digite <strong style="font-size:8.8px;color:#0A2342;letter-spacing:.04em">${cod}</strong>. As contas e as assinaturas estão na folha ${tot}.</div></div>`;
  const fecho = `${resumo}${contas}<div style="display:flex;gap:12px">${r18Assina('João da Silva', 'Tesoureiro Geral')}${r18Assina(R.assin[0][0], R.assin[0][1])}${r18Assina(R.assin[1][0], R.assin[1][1])}</div>${r18PpQr(42, cod, `<strong style="color:#0A2342">Folha ${n} de ${tot}${tot > 1 ? ', a última' : ''}.</strong> Este relatório é verdadeiro? Aponte a câmera do celular para o código.`)}`;
  return r18Pp(`${cab}${faixa}${lista}<div style="flex:1;min-height:2px"></div>${ult ? fecho : selo}`, '14px 18px');
}
const R25_EXPLICA_MURAL = {
  local: '<strong>Vila Nova, novembro: contínuo da 70.063 à 70.164 (3 folhas).</strong> A 70.063 e a 70.064, que a tesoureira marcou “mês posterior” em outubro, agora são linhas comuns: o nome, sem “marcada em outubro” e sem fundo roxo. A 70.065 continua com a tarja “referente ao mês anterior”, e a 70.161 e a 70.162 com a linha “referente ao mês posterior”. No quadro das contas, o líquido se divide em 60% para a Geral e 40% para o centro de custo de Vila Nova; o retido saiu do relatório.',
  dez: '<strong>Vila Nova, dezembro: começa na 70.161 (2 folhas).</strong> A 70.161 (Carlos) e a 70.162 (Lídia) aparecem como qualquer outra linha, com o nome, e somam em dezembro. A 70.163 e a 70.164 ficam só com a tarja “referente ao mês anterior”. O quadro das contas termina nos 40% que vão para o centro de custo de Vila Nova.',
  area: '<strong>Boa Esperança, o relatório atrasado.</strong> A folha sai “referente aos meses de outubro e novembro”. O quadro das contas é o mesmo das outras: 60% para a Geral e 40% para o centro de custo de Boa Esperança.'
};
function r25Mural(p, k, d) {
  const cel = ehCel(d), R = R25_MURAIS[k], F = r25Folhas(k), tot = F.length, kk = k === 'dez' ? 'local' : k;
  const imp = tot > 1 ? `Imprimir as ${tot} folhas` : 'Imprimir a folha';
  const tit = r18Tit(p, 'Relatório do mês', `a folha do mural de ${R.mes} · ${R.nome}${R.atrasado ? ' · referente aos meses de outubro e novembro' : ''}`, `${r18Troca(p, kk, { nome: R.nome })}${m8Ouro(p, imp, 'impressora', 42)}`);
  const contas = ['banco', `As contas: 60% para a Geral e 40% para o centro de custo de ${R.nome}; o retido não entra no relatório`];
  const P25 = {
    local: [['livro', 'Contínua: 70.063 a 70.164, 50 nomes por folha, sem cortar'], ['seta', 'A 70.161 e a 70.162 (dezembro): só a linha “referente ao mês posterior”, sem nome e sem valor'], ['calendario', 'A 70.063 e a 70.064 têm o nome, como as outras linhas; a 70.065 tem a tarja'], contas, ['qr', `Cada folha com o seu QR e o “folha 1 de ${tot}”; assinam o Tesoureiro Geral, a tesouraria local e o dirigente`]],
    dez: [['livro', 'Começa na 70.161, a 1ª folha marcada “mês posterior” em novembro'], ['seta', 'A 70.161 e a 70.162 têm o nome, como as outras linhas, e somam aqui'], ['calendario', 'A 70.163 e a 70.164 somaram em novembro: só a tarja “referente ao mês anterior”'], contas, ['qr', `Cada folha tem o seu QR, o seu código e o “folha 1 de ${tot}”`], ['lapis', 'Assinam o Tesoureiro Geral, a tesouraria local e o dirigente']],
    area: [['alerta', 'Outubro não foi fechado a tempo: a folha sai “referente aos meses de outubro e novembro”'], ['livro', 'As planilhas de outubro e de novembro, cada uma preenchida, com o mês marcado na lista'], contas, ['qr', 'Uma folha: a lista, as contas, as 3 assinaturas e o QR']]
  }[k];
  const itens = () => P25.map(x => `<div style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.4;color:${p.texto}">${ic(x[0], x[0] === 'calendario' ? r20Rx(p) : x[0] === 'seta' ? r20Az(p) : x[0] === 'qr' || x[0] === 'banco' ? r18F(p) : x[0] === 'alerta' ? (p.e ? '#FCD34D' : '#8A5A00') : p.icone, 16, 2.2)}<span>${x[1]}</span></div>`).join('');
  const leg = k === 'area' ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap">${r23Linha(p, 'pos')}${r23Linha(p, 'ant')}</div>`;
  if (cel) {
    const ab = tot === 1 ? ['Folha 1 (tudo)'] : tot === 2 ? ['Folha 1', 'Folha 2 (contas)'] : ['Folha 1', 'Folha 2', 'Folha 3 (contas)'], at = k === 'local' ? 0 : tot - 1;
    return r20Cel(p, kk, 'Folha do mural', `${r17Sub(p, ['Sistema', 'Mural', 'Espécie e digital', 'Parâmetros'], 1, true)}${r18Escolha(p, ab, at, { alt: 30 })}<div style="display:flex;justify-content:center">${r18Escala(318, r25MuralPag(k, at + 1))}</div>${r21Ouro(p, imp, 'impressora', 44)}`);
  }
  const card = m9Cartao(p, 'Antes de imprimir', `${R.mes} · ${tot} ${tot > 1 ? 'folhas' : 'folha'} · retrato`, `${leg}${itens()}`, 'padding:12px 14px;gap:9px');
  if (tot === 3) return r20Casca(p, kk, 'Relatório do mês', `${tit}${r17Sub(p, R22_SUB_REL, 1)}<div style="display:flex;gap:12px;align-items:flex-start">${[1, 2, 3].map(n => r18Escala(316, r25MuralPag(k, n))).join('')}</div><div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;padding:10px 14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 18px;flex:none">${itens()}${leg}</div>`);
  return r20Casca(p, kk, 'Relatório do mês', `${tit}${r17Sub(p, R22_SUB_REL, 1)}<div style="display:flex;gap:14px;align-items:flex-start">${Array.from({ length: tot }, (_, i) => r18Escala(tot === 2 ? 322 : 392, r25MuralPag(k, i + 1))).join('')}<div style="flex:1;min-width:0">${card}</div></div>`);
}

/* ---------------- 2. QUANTO CADA CONGREGAÇÃO TEM (o 3º relatório, contínuo, sem mês) ---------------- */
// Vila Nova, de 01/11 a 03/12: chegaram R$ 16.390,00 (Pix 7.780,00 + espécie 7.610,00 até 30/11 e Pix 1.000,00 de 01 a 03/12).
// Em 03/12 fechou o relatório de novembro: o líquido (R$ 15.270,00) sai do saldo e se divide sozinho: R$ 9.162,00 (60%) para a
// Geral e R$ 6.108,00 (40%) para o centro de custo de Vila Nova. Ficam R$ 1.120,00 na sede, esperando o próximo relatório.
// Com a congregação: R$ 410,00 em espécie, lançada e ainda não entregue.
// [dia, o que aconteceu, detalhe (Geral), valor (+ entrou, − saiu), na sede depois, detalhe (congregação)]
const R25_MOV = [
  ['01 a 09/11', 'Pix na conta geral', '11 comprovantes · todos no extrato', 2300, 2300],
  ['10/11', 'Espécie entregue', 'Rute Santos · recibo 0412', 3400, 5700],
  ['11 a 19/11', 'Pix na conta geral', '13 comprovantes · todos no extrato', 2820, 8520],
  ['20/11', 'Espécie entregue', 'Rute Santos · recibo 0438', 3100, 11620],
  ['21 a 30/11', 'Pix na conta geral', '9 comprovantes · todos no extrato', 2660, 14280],
  ['30/11', 'Espécie entregue', 'Rute Santos · recibo 0461', 1110, 15390],
  ['01 a 03/12', 'Pix na conta geral', '4 comprovantes · 1 ainda sem folha lançada: conta igual', 1000, 16390, '3 anexados · falta 1 (Hilda Paiva)'],
  ['03/12', 'Relatório de novembro', 'fechado: o líquido, 60% para a Geral (R$ 9.162,00) e 40% para o centro de custo (R$ 6.108,00)', -15270, 1120]
];
// [congregação, na sede, com a congregação (espécie), último relatório fechado, observação]
const R25_LISTA = [
  ['Vila Nova', 1120, 410, 'novembro · 03/12', 'espera o próximo relatório'],
  ['Cidade Jardim', 2340, 0, 'novembro · 30/11', ''],
  ['Bela Vista', -320, 380, 'novembro · 02/12', 'falta: o próximo dinheiro cobre'],
  ['Jardim das Oliveiras', 860, 120, 'novembro · 02/12', ''],
  ['Monte Sião', 0, 1150, 'outubro · 05/11', 'só espécie, ainda com a congregação'],
  ['Boa Esperança', 3980, 640, 'setembro · 08/10', 'o relatório atrasado ainda não fechou']
];
const r25Val = (p, v, t = 13.5) => r20Num(v < 0 ? `− ${r18R(-v)}` : r18R(v), v < 0 ? m8Verm(p) : v === 0 ? p.suave : p.titulo, t);
// os dois números: na sede e com a congregação
function r25Dois(p, sede, comEla, cel) {
  const box = (rot, ico, v, sub, cor) => `<div style="flex:1;min-width:0;border-radius:12px;background:${cor};padding:${cel ? '8px 10px' : '7px 12px'};display:flex;flex-direction:column;gap:1px"><span style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${p.texto}">${ic(ico, p.icone, 14, 2.2)}${rot}</span>${r25Val(p, v, cel ? 18 : 19)}<span style="font-size:11.5px;color:${p.suave};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</span></div>`;
  return `<div style="display:flex;gap:${cel ? 8 : 10}px;flex:none">${box('Na sede', 'banco', sede, cel ? 'Pix e espécie entregue' : 'Pix na conta geral e espécie entregue', r18Claro(p))}${box('Com a congregação', 'dinheiro', comEla, cel ? 'espécie não entregue' : 'espécie lançada e ainda não entregue', p.e ? '#3A2E0B' : '#FFF4D1')}</div>`;
}
// o extrato contínuo de Vila Nova: cada dinheiro que chega soma; cada relatório fechado tira o líquido
function r25Extrato(p, o = {}) {
  const cel = o.cel, loc = o.loc, L = o.so ? R25_MOV.slice(-o.so) : R25_MOV, cols = '74px minmax(0,1fr) 104px 92px';
  const lin = l => {
    const rel = l[3] < 0, fundo = rel ? `background:${r18Claro(p)};` : '';
    const det = loc && l[5] ? l[5] : l[2], corDet = loc && l[5] ? m8Verm(p) : p.suave;
    const val = `<span style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700;color:${rel ? m8Verm(p) : m8Verde(p)}">${rel ? '− ' : '+ '}${r21R(Math.abs(l[3]))}</span>`;
    if (cel) return `<div style="display:flex;align-items:center;gap:8px;min-height:${rel ? 50 : 40}px;border-top:1px solid ${p.linha};${fundo}${rel ? 'margin:0 -12px;padding:0 12px;' : ''}"><div style="flex:1;min-width:0;line-height:1.25"><div style="font-size:13px;font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l[1]}</div><div style="font-size:11.5px;color:${corDet};${rel ? '' : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'}">${l[0]} · ${rel ? '60% Geral · 40% centro de custo' : det}</div></div>${val}</div>`;
    return `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:${rel ? 40 : o.alt || 30}px;align-items:center;border-top:1px solid ${p.linha};font-size:13px;color:${p.texto};${fundo}"><strong style="color:${p.titulo};white-space:nowrap">${l[0]}</strong><div style="min-width:0;line-height:1.25"><div style="font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l[1]}</div><div style="font-size:11.5px;color:${corDet};${rel ? 'line-height:1.3' : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'}">${det}</div></div>${val}<span style="text-align:right">${r25Val(p, l[4], 13)}</span></div>`;
  };
  const cab = cel ? '' : `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;height:28px;align-items:center;font-size:12px;font-weight:700;color:${p.suave};background:${p.fundo}"><span>Dia</span><span>O que aconteceu</span><span style="text-align:right">Entrou / saiu</span><span style="text-align:right">Na sede</span></div>`;
  return `${cab}${L.map(lin).join('')}`;
}
// para onde foram os 40%: o centro de custo da congregação (lá ela lança o retido e as despesas dela)
const r25Centro = (p, cel) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 44 : 42}px;padding:${cel ? '6px 10px' : '6px 12px'};border-radius:10px;border:1px solid ${p.borda};flex:none">${ic('igreja', r18F(p), 16, 2.2)}<div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:12.5px;font-weight:700;color:${p.titulo}">Centro de custo de Vila Nova: + R$ 6.108,00 em 03/12</div><div style="font-size:11.5px;color:${p.suave}">${cel ? 'os 40% de novembro' : 'os 40% de novembro · o retido e as despesas da congregação são lançados lá'}</div></div><span style="font-size:12.5px;font-weight:700;color:${r18F(p)};white-space:nowrap">Abrir ›</span></div>`;
const r25Regra = (p, cel) => r16aAviso(p, cel ? '<strong>Contínuo, sem mês.</strong> Relatório fechado: o líquido sai daqui, 60% para a Geral e 40% para o centro de custo da congregação.' : '<strong>Contínuo: não se separa por mês, nem por dízimo, oferta ou departamento.</strong> Todo dinheiro que chega conta, mesmo sem a folha lançada. Quando um relatório fecha, de qualquer mês, o líquido sai daqui: 60% para a Geral e 40% para o centro de custo da congregação, sozinhos. O que sobra espera o próximo relatório; o que falta, o próximo dinheiro cobre.');
// a lista das congregações (a Geral e a área)
function r25Lista(p, o = {}) {
  // a área (obs) tem a tela inteira: o último relatório e o que está acontecendo em colunas; a Geral divide a tela com
  // Vila Nova aberta: o último relatório (ou a falta) vai embaixo do nome
  const sel = o.sel, obs = o.obs, cols = obs ? 'minmax(0,1.15fr) 116px 116px 128px minmax(0,1.5fr)' : 'minmax(0,1fr) 104px 96px 12px';
  const cab = `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;height:34px;align-items:center;font-size:12px;font-weight:700;color:${p.suave};background:${p.fundo}"><span>Congregação</span><span style="text-align:right">Na sede</span><span style="text-align:right">Com ela</span>${obs ? '<span>Último relatório</span><span>O que está acontecendo</span>' : '<span></span>'}</div>`;
  const linhas = R25_LISTA.map(r => {
    const on = sel && r[0] === 'Vila Nova';
    const fim = obs ? `<span style="font-size:12.5px;color:${p.texto};white-space:nowrap">${r[3]}</span><span style="font-size:12.5px;color:${r[1] < 0 ? m8Verm(p) : p.texto};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[4] || '—'}</span>` : `<span style="color:${on ? r18F(p) : p.suave};font-weight:700">›</span>`;
    const sub = r[1] < 0 ? r[4] : `último relatório: ${r[3]}`;
    return `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:${obs ? 42 : 46}px;align-items:center;border-top:1px solid ${p.linha};font-size:13.5px;color:${p.texto};${on ? `background:${r18Claro(p)};box-shadow:inset 3px 0 0 ${r18F(p)};` : ''}"><div style="min-width:0;line-height:1.25"><div style="font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[0]}</div>${obs ? '' : `<div style="font-size:11.5px;color:${r[1] < 0 ? m8Verm(p) : p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>`}</div><span style="text-align:right">${r25Val(p, r[1])}</span><span style="text-align:right">${r25Val(p, r[2])}</span>${fim}</div>`;
  }).join('');
  const zerado = `<div style="display:flex;align-items:center;padding:0 14px;min-height:36px;border-top:1px solid ${p.linha};font-size:12.5px;color:${p.suave}">+ 6 congregações com tudo zerado (relatório fechado e nada esperando)</div>`;
  return `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none">${cab}${linhas}${zerado}</div>`;
}
const R25_NUM = p => [['R$ 7.980,00', 'Na sede, esperando relatório', 'Pix na conta geral e espécie entregue'], ['R$ 2.700,00', 'Com as congregações', 'espécie lançada e ainda não entregue'], ['− R$ 320,00', 'Falta cobrir', '1 congregação · o próximo dinheiro cobre', m8Verm(p)]];
const PERFIS25_SALDO = [['geral', 'Tesouraria Geral · as congregações e Vila Nova (quinta 03/12, 10h40)'], ['local', 'Tesouraria local · Vila Nova (quinta 03/12, 11h00)'], ['area', 'Tesouraria da Área 2 · acompanha']];
const R25_EXPLICA_SALDO = {
  geral: '<strong>A Tesouraria Geral, quinta 03/12, 10h40.</strong> Para cada congregação da Área 2: o dinheiro que já está na sede (o Pix na conta geral e a espécie entregue no caixa) e, separada, a espécie que ainda está com ela. Não se separa por mês nem por dízimo, oferta ou departamento. Vila Nova, aberta à direita: de 01/11 a 03/12 chegaram R$ 16.390,00. Hoje fechou o relatório de novembro, com R$ 15.270,00 líquidos: saíram do saldo, e foram sozinhos R$ 9.162,00 (60%) para a Geral e R$ 6.108,00 (40%) para o centro de custo de Vila Nova. Ficam R$ 1.120,00 na sede, esperando o próximo relatório. Bela Vista está em − R$ 320,00: o relatório passou do que chegou, e o próximo dinheiro cobre sozinho.',
  local: '<strong>A tesouraria de Vila Nova, quinta 03/12, 11h00.</strong> Fica em “Relatório do mês”, na aba “Espécie e digital”, e mostra o mesmo que a Geral vê: R$ 1.120,00 na sede e R$ 410,00 em espécie com a congregação. Todo Pix conta logo que cai na conta geral, mesmo antes de a folha ser lançada. Ela anexa aqui a foto ou o PDF de cada comprovante: acaba o comprovante pelo telefone. O retido e as despesas dela são lançados no centro de custo de Vila Nova, não no relatório.',
  area: '<strong>A Tesouraria da Área 2 acompanha.</strong> A lista das 12 congregações da área, com o que está na sede, o que está com cada uma e o último relatório fechado. Quem recebe o dinheiro e fecha os relatórios é a Tesouraria Geral.'
};
function r25Saldo(p, k, d) {
  const cel = ehCel(d);
  /* ---------- a tesouraria local: a aba "Espécie e digital" do relatório do mês ---------- */
  if (k === 'local') {
    if (cel) return r20Cel(p, 'local', 'Relatório do mês', `${r17Sub(p, ['Sistema', 'Mural', 'Espécie e digital', 'Parâmetros'], 2, true)}${r25Dois(p, 1120, 410, true)}${m9Cartao(p, 'Vila Nova · contínuo, sem mês', '', r25Extrato(p, { cel: 1, loc: 1, so: 3 }).replace(`border-top:1px solid ${p.linha}`, ''), 'padding:9px 12px 10px;gap:2px')}${r21Ouro(p, 'Mandar o comprovante', 'envelope', 44)}`);
    const esq = `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none;padding-bottom:6px"><div style="display:flex;align-items:baseline;gap:8px;padding:9px 14px 7px"><strong style="font-size:15px;color:${p.titulo};flex:1">Quanto Vila Nova tem</strong><span style="font-size:12px;color:${p.suave}">contínuo: não se corta por mês</span></div><div style="padding:0 14px 8px">${r25Dois(p, 1120, 410)}</div>${r25Extrato(p, { loc: 1, alt: 32 })}</div>`;
    return r20Casca(p, 'local', 'Relatório do mês', `${r18Tit(p, 'Relatório do mês', 'Vila Nova · quanto a congregação tem · quinta, 03/12/2026, 11h00', `${r18Troca(p, 'local')}${m8Ouro(p, 'Mandar o comprovante', 'envelope', 42)}`)}${r17Sub(p, R22_SUB_REL, 2)}${r17Dois(esq, r18Col(r24Anexar(p), r25Centro(p), r25Regra(p)), '1.45fr 1fr')}`);
  }
  /* ---------- a área: acompanha a lista ---------- */
  if (k === 'area') {
    if (cel) return r20Cel(p, 'area', 'Congregações', `${r18Troca(p, 'area', { nome: 'As 12 da Área 2', rot: 'Vendo', cel: true })}${r25Regra(p, true)}${r16aListaCel(p, R25_LISTA.map(r => [r[0], `com ela ${r21R(r[2])} · ${r[3]}`, r25Val(p, r[1], 13.5)]))}`);
    return r20Casca(p, 'area', 'Repasses da área', `${r18Tit(p, 'Quanto cada congregação tem', 'Área 2 · contínuo, sem mês · quinta, 03/12/2026', r18Troca(p, 'area', { nome: 'As 12 da Área 2', rot: 'Vendo' }))}${r16aNum(p, R25_NUM(p), 3)}${r25Lista(p, { obs: 1 })}${r25Regra(p)}`);
  }
  /* ---------- a Tesouraria Geral: a lista à esquerda, Vila Nova aberta à direita ---------- */
  if (cel) return r20Cel(p, 'geral', 'Congregações', `${r18Troca(p, 'geral', { nome: 'Área 2', rot: 'Vendo', cel: true })}${r25Dois(p, 7980, 2700, true).replace('Pix e espécie entregue', 'na Área 2').replace('espécie não entregue', 'na Área 2')}${r16aListaCel(p, R25_LISTA.map(r => [r[0], `com ela ${r21R(r[2])} · ${r[4] || 'em dia'}`, r25Val(p, r[1], 13.5)]))}`);
  const tit = r18Tit(p, 'Quanto cada congregação tem', 'o 3º relatório · contínuo, sem mês · Área 2 · quinta, 03/12/2026, 10h40', r18Troca(p, 'geral', { nome: 'Área 2', rot: 'Vendo' }));
  const dir = m9Cartao(p, 'Vila Nova', 'contínuo, sem mês', `${r25Dois(p, 1120, 410)}<div style="margin:0 -14px;border-bottom:1px solid ${p.linha}">${r25Extrato(p)}</div>${r25Centro(p)}`, 'padding:10px 14px 12px;gap:9px');
  return r20Casca(p, 'geral', 'Saldo das congregações', `${tit}${r16aNum(p, R25_NUM(p), 3)}${r17Dois(r18Col(r25Lista(p, { sel: 1 }), r25Regra(p)), dir, '1fr 1.08fr')}`);
}
// o item "Saldo das congregações" no menu da Geral (Pessoas e repasses), logo depois de "Repasses"
function r25ComMenu(fn) {
  const G = FIN13.tarefa.find(x => x[0] === 'Pessoas e repasses'), guarda = G[1].slice();
  if (!G[1].includes('Saldo das congregações')) G[1].splice(G[1].indexOf('Repasses') + 1, 0, 'Saldo das congregações');
  try { return fn(); } finally { G[1].splice(0, G[1].length, ...guarda); }
}
const r25SaldoTela = (p, k, d) => r25ComMenu(() => r25Saldo(p, k, d));
