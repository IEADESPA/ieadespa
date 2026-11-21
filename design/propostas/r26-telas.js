/* ================================================================ RODADA 26 (21/11/2026) ================================================================ */
// As respostas dele à 25, conferidas com ele antes de desenhar ("até que enfim, acertamos"):
// 1. A folha do mural: aprovada. Sai só o quadro do fim, "Folhas de outro mês". As tarjas e as linhas "folha arrancada" e
//    "folha cancelada" continuam.
// 2. Quanto cada congregação tem na Geral: UMA conta por congregação, dentro da Geral, como um extrato de banco, sem mês e sem
//    nada de repasse ou de mural. Entra o Pix na conta geral e a espécie entregue. Relatório fechado, de qualquer mês: sai SÓ a
//    parte da Geral, e o resto já é da congregação (sem "40%" e sem saldo "esperando o próximo relatório"). Despesa dela paga
//    pela Geral sai daqui. Se a parte da Geral passar do que ela tem, ela cobre com a espécie. A Geral vê a conta inteira:
//    quanto é das congregações (não pode gastar) e quanto é dela de verdade.

/* ---------------- 1. A FOLHA DO MURAL, sem o quadro do fim ---------------- */
// a 26 usa as folhas da 25 sem o quadro "Folhas de outro mês"; a 25 (respondida, recolhida) continua como ele a viu
function r26SemQuadro(fn) {
  const guarda = ['local', 'dez'].map(k => [k, R25_MURAIS[k].resumo]);
  guarda.forEach(([k]) => { R25_MURAIS[k].resumo = ''; });
  try { return fn(); } finally { guarda.forEach(([k, v]) => { R25_MURAIS[k].resumo = v; }); }
}
// e sem a aba "Espécie e digital" no relatório do mês: o 3º relatório agora fica em "Contas e bancos" (Saldo na Geral)
const r26SemAbaEspecie = h => h.replace(/<span [^>]*>Espécie e digital<\/span>/, '');
const r26Mural = (p, k, d) => r26SemAbaEspecie(r26SemQuadro(() => r25Mural(p, k, d)));
const R26_EXPLICA_MURAL = {
  local: '<strong>Vila Nova, novembro: contínuo da 70.063 à 70.164 (3 folhas).</strong> Saiu o quadro do fim que explicava as folhas de outro mês: a última folha vai direto da lista para as contas, as assinaturas e o QR. Na lista, nada mudou: a 70.065 com a tarja “referente ao mês anterior”, a 70.161 e a 70.162 com a linha “referente ao mês posterior”, e a folha arrancada e a cancelada no lugar delas.',
  dez: '<strong>Vila Nova, dezembro: começa na 70.161 (2 folhas).</strong> Também sem o quadro do fim. A 70.161 e a 70.162 aparecem com o nome, como as outras linhas; a 70.163 e a 70.164 ficam só com a tarja “referente ao mês anterior”.',
  area: '<strong>Boa Esperança, o relatório atrasado.</strong> A folha sai “referente aos meses de outubro e novembro”, com a lista, as contas, as 3 assinaturas e o QR. Esta já não tinha o quadro do fim.'
};

/* ---------------- 2. QUANTO CADA CONGREGAÇÃO TEM NA GERAL (um extrato por congregação, sem mês) ---------------- */
// Vila Nova, de 31/10 a 03/12. Já era dela: R$ 2.450,00 (o que ficou depois do relatório de outubro). Entraram R$ 16.390,00 (Pix
// 8.780,00 e espécie 7.610,00). Saiu a conta de luz dela, paga pela Geral (R$ 380,00). Em 03/12 fechou o relatório de novembro:
// saiu só a parte da Geral (R$ 9.162,00). Ficam R$ 9.298,00, que são de Vila Nova. Com a congregação: R$ 410,00 em espécie.
// [dia, o que aconteceu, detalhe (Geral), valor (+ entrou, − saiu; null = só o saldo), saldo depois, detalhe (congregação)]
// (na Geral, o extrato fica num cartão estreito: o dia vai na 2ª linha, e o detalhe longo só aparece na congregação)
const R26_MOV = [
  ['31/10', 'Já era de Vila Nova', 'depois do relatório de outubro', null, 2450],
  ['01 a 09/11', 'Pix na conta geral', '11 comprovantes', 2300, 4750, '11 comprovantes · todos no extrato'],
  ['10/11', 'Espécie entregue', 'recibo 0412', 3400, 8150, 'Rute Santos · recibo 0412'],
  ['11 a 19/11', 'Pix na conta geral', '13 comprovantes', 2820, 10970, '13 comprovantes · todos no extrato'],
  ['20/11', 'Espécie entregue', 'recibo 0438', 3100, 14070, 'Rute Santos · recibo 0438'],
  ['21/11', 'Conta de luz', 'paga pela Geral', -380, 13690, 'paga pela Geral · nota 88.412'],
  ['21 a 30/11', 'Pix na conta geral', '9 comprovantes', 2660, 16350, '9 comprovantes · todos no extrato'],
  ['30/11', 'Espécie entregue', 'recibo 0461', 1110, 17460, 'Rute Santos · recibo 0461'],
  ['01 a 03/12', 'Pix na conta geral', '4 comprovantes', 1000, 18460, '3 anexados · falta 1 (Hilda Paiva)', 1],
  ['03/12', 'Relatório de novembro', 'saiu só a parte da Geral', -9162, 9298, 'fechado: saiu só a parte da Geral']
];
// [congregação, é dela na Geral, com ela (espécie), o último movimento (curto, na lista da Geral), o último movimento (longo, na
// lista da área), observação]
const R26_LISTA = [
  ['Vila Nova', 9298, 410, 'relatório em 03/12', '03/12 · relatório de novembro: − R$ 9.162,00', ''],
  ['Cidade Jardim', 5340, 0, 'relatório em 30/11', '30/11 · relatório de novembro: − R$ 6.020,00', ''],
  ['Bela Vista', -320, 380, 'relatório em 02/12', '02/12 · relatório de novembro: − R$ 4.860,00', 'faltou: cobre com a espécie'],
  ['Jardim das Oliveiras', 3860, 120, 'conta de água em 02/12', '02/12 · conta de água: − R$ 145,00', ''],
  ['Monte Sião', 1200, 1150, 'Pix em 28/11', '28/11 · Pix: + R$ 300,00', 'a espécie ainda está com ela'],
  ['Boa Esperança', 7980, 640, 'Pix em 01/12', '01/12 · Pix: + R$ 850,00', 'relatório atrasado em aberto']
];
// os dois números: o que é dela na Geral e a espécie que ainda está com ela
function r26Dois(p, naGeral, comEla, o = {}) {
  const cel = o.cel, box = (rot, ico, v, sub, cor) => `<div style="flex:1;min-width:0;border-radius:12px;background:${cor};padding:${cel ? '8px 10px' : '7px 12px'};display:flex;flex-direction:column;gap:1px"><span style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${p.texto};white-space:nowrap">${ic(ico, p.icone, 14, 2.2)}${rot}</span>${r25Val(p, v, cel ? 18 : 19)}<span style="font-size:11.5px;color:${p.suave};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</span></div>`;
  return `<div style="display:flex;gap:${cel ? 8 : 10}px;flex:none">${box(o.rot1 || 'É dela, na Geral', 'banco', naGeral, o.sub1 || (cel ? 'a Geral não gasta' : 'a Geral não pode gastar'), r18Claro(p))}${box(o.rot2 || 'Com a congregação', 'dinheiro', comEla, o.sub2 || (cel ? 'espécie não entregue' : 'espécie lançada e não entregue'), p.e ? '#3A2E0B' : '#FFF4D1')}</div>`;
}
// o extrato de Vila Nova: entra o Pix e a espécie; sai a despesa dela e, quando um relatório fecha, só a parte da Geral
function r26Extrato(p, o = {}) {
  // loc: a congregação (tela larga, com a coluna do dia e o detalhe longo); sem loc: a Geral (cartão estreito, o dia na 2ª linha)
  const cel = o.cel, loc = o.loc, L = o.so ? R26_MOV.slice(-o.so) : R26_MOV, comDia = loc && !cel, cols = comDia ? '74px minmax(0,1fr) 100px 96px' : 'minmax(0,1fr) 80px 90px';
  const lin = l => {
    const rel = l[1].startsWith('Relatório'), fundo = rel ? `background:${r18Claro(p)};` : '';
    const det = loc && !cel && l[5] ? l[5] : loc && l[6] ? l[5] : l[2], corDet = loc && l[6] ? m8Verm(p) : p.suave;
    const val = l[3] === null ? `<span style="text-align:right;color:${p.suave}">—</span>` : `<span style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700;color:${l[3] < 0 ? m8Verm(p) : m8Verde(p)}">${l[3] < 0 ? '− ' : '+ '}${r21R(Math.abs(l[3]))}</span>`;
    const tex = `<div style="min-width:0;line-height:1.25"><div style="${cel ? 'font-size:13px;' : ''}font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l[1]}</div><div style="font-size:11.5px;color:${corDet};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${comDia ? '' : `${l[0]} · `}${det}</div></div>`;
    if (cel) return `<div style="display:flex;align-items:center;gap:8px;min-height:${rel ? 48 : 40}px;border-top:1px solid ${p.linha};${fundo}${rel ? 'margin:0 -12px;padding:0 12px;' : ''}"><div style="flex:1;min-width:0">${tex}</div>${val}</div>`;
    return `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:${rel ? 38 : o.alt || 29}px;align-items:center;border-top:1px solid ${p.linha};font-size:13px;color:${p.texto};${fundo}">${comDia ? `<strong style="color:${p.titulo};white-space:nowrap">${l[0]}</strong>` : ''}${tex}${val}<span style="text-align:right">${r25Val(p, l[4], 13)}</span></div>`;
  };
  const cab = cel ? '' : `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;height:28px;align-items:center;font-size:12px;font-weight:700;color:${p.suave};background:${p.fundo}">${comDia ? '<span>Dia</span>' : ''}<span>O que aconteceu</span><span style="text-align:right">${comDia ? 'Entrou / saiu' : 'Entrou/saiu'}</span><span style="text-align:right">Saldo</span></div>`;
  return `${cab}${L.map(lin).join('')}`;
}
const r26Regra = (p, cel) => r16aAviso(p, cel ? '<strong>Como um extrato, sem mês.</strong> Relatório fechado: sai só a parte da Geral; o resto é da congregação.' : '<strong>Como um extrato de banco, sem mês.</strong> Entra o Pix na conta geral e a espécie entregue. Quando um relatório fecha, de qualquer mês, sai só a parte da Geral: o resto já é da congregação. A despesa dela paga pela Geral sai daqui. Se faltar, a congregação cobre com a espécie.');
// a despesa da congregação: a Geral paga e sai deste saldo
const r26Despesa = (p, cel) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 44 : 42}px;padding:${cel ? '6px 10px' : '6px 12px'};border-radius:10px;border:1px solid ${p.borda};flex:none">${ic('doc', r18F(p), 16, 2.2)}<div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:12.5px;font-weight:700;color:${p.titulo}">Uma despesa de Vila Nova</div><div style="font-size:11.5px;color:${p.suave}">a Geral paga e sai deste saldo</div></div><span style="font-size:12.5px;font-weight:700;color:${r18F(p)};white-space:nowrap">Cadastrar ›</span></div>`;
// a lista das congregações (a Geral, com Vila Nova aberta; a área, com a tela inteira)
function r26Lista(p, o = {}) {
  const sel = o.sel, obs = o.obs, cols = obs ? 'minmax(0,1fr) 112px 100px minmax(0,1.7fr) minmax(0,1.1fr)' : 'minmax(0,1fr) 104px 92px 12px';
  const cab = `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;height:34px;align-items:center;font-size:12px;font-weight:700;color:${p.suave};background:${p.fundo}"><span>Congregação</span><span style="text-align:right">Na Geral</span><span style="text-align:right">Com ela</span>${obs ? '<span>Último movimento</span><span>Observação</span>' : '<span></span>'}</div>`;
  const linhas = R26_LISTA.map(r => {
    const on = sel && r[0] === 'Vila Nova';
    const fim = obs ? `<span style="font-size:12.5px;color:${p.texto};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[4]}</span><span style="font-size:12.5px;color:${r[1] < 0 ? m8Verm(p) : p.texto};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[5] || '—'}</span>` : `<span style="color:${on ? r18F(p) : p.suave};font-weight:700">›</span>`;
    const sub = r[1] < 0 ? r[5] : r[3];
    return `<div style="display:grid;grid-template-columns:${cols};gap:10px;padding:0 14px;min-height:${obs ? 42 : 46}px;align-items:center;border-top:1px solid ${p.linha};font-size:13.5px;color:${p.texto};${on ? `background:${r18Claro(p)};box-shadow:inset 3px 0 0 ${r18F(p)};` : ''}"><div style="min-width:0;line-height:1.25"><div style="font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[0]}</div>${obs ? '' : `<div style="font-size:11.5px;color:${r[1] < 0 ? m8Verm(p) : p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>`}</div><span style="text-align:right">${r25Val(p, r[1])}</span><span style="text-align:right">${r25Val(p, r[2])}</span>${fim}</div>`;
  }).join('');
  const mais = `<div style="display:flex;align-items:center;padding:0 14px;min-height:36px;border-top:1px solid ${p.linha};font-size:12.5px;color:${p.suave}">+ 6 congregações da Área 2, com R$ 14.302,00 na Geral e nenhuma espécie parada</div>`;
  return `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none">${cab}${linhas}${mais}</div>`;
}
// a conta geral inteira: quanto é das congregações (a Geral não pode gastar) e quanto é da Geral de verdade
const R26_NUM_GERAL = p => [['R$ 186.540,00', 'Conta geral e caixa', 'a conta na Cora e o caixa da Geral'], ['R$ 112.870,00', 'É das congregações', 'as 48 · a Geral não pode gastar'], ['R$ 73.670,00', 'É da Geral', 'o que a Geral pode usar', m8Verde(p)]];
const R26_NUM_AREA = p => [['R$ 41.660,00', 'É das 12, na Geral', 'o que cada uma tem lá'], ['R$ 2.700,00', 'Com as congregações', 'espécie lançada e não entregue'], ['− R$ 320,00', 'Falta cobrir', 'Bela Vista · cobre com a espécie', m8Verm(p)]];
const PERFIS26_SALDO = [['geral', 'Tesouraria Geral · a conta geral e as congregações (quinta 03/12, 10h40)'], ['local', 'Tesouraria local · Vila Nova (quinta 03/12, 11h00)'], ['area', 'Tesouraria da Área 2 · acompanha']];
const R26_EXPLICA_SALDO = {
  geral: '<strong>A Tesouraria Geral, quinta 03/12, 10h40.</strong> No alto, a conta geral inteira (a Cora e o caixa): quanto é das congregações, que a Geral não pode gastar, e quanto é da Geral de verdade. Embaixo, as congregações da Área 2, cada uma com o que é dela na Geral e a espécie que ainda está com ela. Vila Nova, aberta à direita, é um extrato de banco: já tinha R$ 2.450,00; entraram o Pix e a espécie; saiu a conta de luz dela, que a Geral pagou; hoje fechou o relatório de novembro e saiu só a parte da Geral (R$ 9.162,00). Os R$ 9.298,00 que ficam são de Vila Nova. Bela Vista está em − R$ 320,00: a parte da Geral passou do que ela tinha aqui, e ela cobre com a espécie.',
  local: '<strong>A tesouraria de Vila Nova, quinta 03/12, 11h00.</strong> Fica em “Contas e bancos”, no item “Saldo na Geral”, fora do relatório do mês. Mostra o mesmo extrato que a Geral vê: R$ 9.298,00 de Vila Nova na Geral e R$ 410,00 em espécie com a congregação. Todo Pix conta logo que cai na conta geral, mesmo antes de a folha ser lançada. Ela anexa aqui a foto ou o PDF de cada comprovante e cadastra a despesa que a Geral vai pagar.',
  area: '<strong>A Tesouraria da Área 2 acompanha.</strong> As 12 congregações da área, com o que é de cada uma na Geral, a espécie que está com ela e o último movimento. Quem recebe o dinheiro e paga as despesas é a Tesouraria Geral.'
};
// o item no menu "Contas e bancos": "Saldo das congregações" (Geral e área) ou "Saldo na Geral" (a congregação)
function r26ComMenu(k, fn) {
  const nome = k === 'local' ? 'Saldo na Geral' : 'Saldo das congregações', G = FIN13.tarefa.find(x => x[0] === 'Contas e bancos'), V = VE13[k];
  const guarda = [G[1].slice(), V ? V.slice() : null];
  if (!G[1].includes(nome)) G[1].push(nome);
  if (V && !V.includes(nome)) V.push(nome);
  try { return fn(nome); } finally { G[1].splice(0, G[1].length, ...guarda[0]); if (V) V.splice(0, V.length, ...guarda[1]); }
}
function r26Saldo(p, k, d, ativo) {
  const cel = ehCel(d);
  /* ---------- a tesouraria local: o extrato de Vila Nova, fora do relatório do mês ---------- */
  if (k === 'local') {
    if (cel) return r20Cel(p, 'local', 'Saldo na Geral', `${r26Dois(p, 9298, 410, { cel: 1, rot1: 'É nosso, na Geral' })}${m9Cartao(p, 'Vila Nova · como um extrato', '', r26Extrato(p, { cel: 1, loc: 1, so: 4 }).replace(`border-top:1px solid ${p.linha}`, ''), 'padding:9px 12px 10px;gap:2px')}${r26Regra(p, true)}${r21Ouro(p, 'Mandar o comprovante', 'envelope', 44)}`);
    const esq = `<div style="background:${p.sup};border:1px solid ${p.borda};border-radius:14px;overflow:hidden;flex:none;padding-bottom:6px"><div style="display:flex;align-items:baseline;gap:8px;padding:9px 14px 7px"><strong style="font-size:15px;color:${p.titulo};flex:1">O extrato de Vila Nova na Geral</strong><span style="font-size:12px;color:${p.suave}">sem mês</span></div><div style="padding:0 14px 8px">${r26Dois(p, 9298, 410, { rot1: 'É nosso, na Geral' })}</div>${r26Extrato(p, { loc: 1, alt: 31 })}</div>`;
    return r20Casca(p, 'local', ativo, `${r18Tit(p, 'Quanto Vila Nova tem na Geral', 'como um extrato de banco, sem mês · quinta, 03/12/2026, 11h00', `${r18Troca(p, 'local')}${m8Ouro(p, 'Mandar o comprovante', 'envelope', 42)}`)}${r17Dois(esq, r18Col(r24Anexar(p), r26Despesa(p), r26Regra(p)), '1.45fr 1fr')}`);
  }
  /* ---------- a área: acompanha a lista ---------- */
  if (k === 'area') {
    if (cel) return r20Cel(p, 'area', 'Saldo das congregações', `${r18Troca(p, 'area', { nome: 'As 12 da Área 2', rot: 'Vendo', cel: true })}${r26Regra(p, true)}${r16aListaCel(p, R26_LISTA.map(r => [r[0], r[1] < 0 ? r[5] : `com ela ${r21R(r[2])}`, r25Val(p, r[1], 13.5)]))}`);
    return r20Casca(p, 'area', ativo, `${r18Tit(p, 'Quanto cada congregação tem na Geral', 'Área 2 · como um extrato, sem mês · quinta, 03/12/2026', r18Troca(p, 'area', { nome: 'As 12 da Área 2', rot: 'Vendo' }))}${r16aNum(p, R26_NUM_AREA(p), 3)}${r26Lista(p, { obs: 1 })}${r26Regra(p)}`);
  }
  /* ---------- a Tesouraria Geral: a conta inteira no alto, a lista à esquerda e Vila Nova aberta à direita ---------- */
  if (cel) return r20Cel(p, 'geral', 'Saldo das congregações', `${r26Dois(p, 112870, 73670, { cel: 1, rot1: 'Das congregações', sub1: 'a Geral não gasta', rot2: 'Da Geral', sub2: 'pode usar' }).replace(p.e ? '#3A2E0B' : '#FFF4D1', p.e ? '#12331F' : '#E3F4EA')}${r18Troca(p, 'geral', { nome: 'Área 2', rot: 'Vendo', cel: true })}${r16aListaCel(p, R26_LISTA.map(r => [r[0], r[1] < 0 ? r[5] : `com ela ${r21R(r[2])}`, r25Val(p, r[1], 13.5)]))}`);
  const tit = r18Tit(p, 'Quanto cada congregação tem na Geral', 'como um extrato de banco, sem mês · quinta, 03/12/2026, 10h40', r18Troca(p, 'geral', { nome: 'Área 2', rot: 'Vendo' }));
  const dir = m9Cartao(p, 'Vila Nova', 'o extrato, sem mês', `${r26Dois(p, 9298, 410)}<div style="margin:0 -14px;border-bottom:1px solid ${p.linha}">${r26Extrato(p)}</div>`, 'padding:10px 14px 12px;gap:9px');
  return r20Casca(p, 'geral', ativo, `${tit}${r16aNum(p, R26_NUM_GERAL(p), 3)}${r17Dois(r18Col(r26Lista(p, { sel: 1 }), r26Regra(p)), dir, '1fr 1.08fr')}`);
}
const r26SaldoTela = (p, k, d) => r26ComMenu(k, ativo => r26Saldo(p, k, d, ativo));
