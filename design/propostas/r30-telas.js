/* ================= RODADA 30 (24/11/2026): Financeiro › Blocos de recibo ================= */
// Vizinhas aprovadas: r17-blocos, r17-blocos-folhas e r17-blocos-livro (op. 1, 18/11), r27-lote-grafica e r28-lote-chegada.
// Regras dele de 23/11: a devolução é só de bloco cheio (sobrou folha em branco: anula antes); a exceção da folha pode ser
// desfeita só pela Tesouraria Geral, com motivo, e o histórico guarda tudo (nada se apaga; bloco devolvido não muda mais).
// Dados de mentira coerentes com a r28 (o lote 2026 chegou em 05/02/2026; os blocos 1.300 a 1.399 não existem).
// As peças que a poda tirou (abas, botões de escolha, páginas, grade, legenda) vêm do fonte aprovado, com as mesmas medidas.

const R30_ABAS = ['Blocos', 'Folhas do bloco', 'Livro de entrada e saída'];
const r30Mil = n => n.toLocaleString('pt-BR');
const r30Abas = (p, ativa, cel) => cel
  ? `<div style="display:flex;gap:6px;overflow:hidden;margin-right:-14px;flex:none">${R30_ABAS.map((a, i) => `<span style="flex:none;height:30px;padding:0 12px;border-radius:15px;display:flex;align-items:center;font-size:12.5px;font-weight:${i === ativa ? 700 : 600};white-space:nowrap;${i === ativa ? `background:${p.e ? '#5EEAD4' : '#0F766E'};color:${p.e ? '#082B28' : '#FFFFFF'};` : `border:1px solid ${p.borda};color:${p.texto};`}">${a}</span>`).join('')}</div>`
  : `<div style="display:flex;gap:24px;border-bottom:1px solid ${p.borda};overflow:hidden;flex:none">${R30_ABAS.map((a, i) => `<span style="padding:0 2px 10px;font-size:14.5px;white-space:nowrap;font-weight:${i === ativa ? 700 : 500};color:${i === ativa ? p.titulo : p.suave};${i === ativa ? 'box-shadow:inset 0 -3px 0 #FFB800;' : ''}">${a}</span>`).join('')}</div>`;
// o nível à direita do título (aprovado): a Geral e a área escolhem; a congregação vê o cadeado
const r30Nivel = (p, k) => (k === 'local' ? `<span style="height:36px;padding:0 12px;border-radius:10px;border:1px solid ${p.borda};display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:${p.titulo};white-space:nowrap;flex:none">${ic('cadeado', p.suave, 15, 2)}Vila Nova</span>` : m8Nivel(p, k === 'area' ? 'Área 2' : 'Sede administrativa'));
const r30Tit = (p, k, sub, dir = '') => r18Tit(p, 'Blocos de recibo', `${NIV13[k].titulo} · ${sub}`, `${r30Nivel(p, k)}${dir}`);
const r30Pag = (p, txt, cel) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;color:${p.suave}"><span style="white-space:nowrap">${txt}</span><span style="display:flex;gap:5px">${(cel ? ['‹', '1', '2', '3', '›'] : ['‹', '1', '2', '3', '4', '5', '›']).map((t, i) => `<span style="min-width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;${i === 1 ? `background:${p.e ? '#5EEAD4' : '#0F766E'};color:${p.e ? '#082B28' : '#FFFFFF'};font-weight:700;` : `border:1px solid ${p.borda};color:${p.texto};`}">${t}</span>`).join('')}</span></div>`;
const r30Chips = (p, rot, ops, ativa) => `<div style="display:flex;flex-direction:column;gap:5px;min-width:0"><span style="font-size:12.5px;font-weight:600;color:${p.titulo}">${rot}</span><div style="display:flex;gap:6px;flex-wrap:wrap">${ops.map((t, i) => chipFiltro(p, t, i === ativa).replace(/<svg[\s\S]*?<\/svg>/, '').replace('height:32px', 'height:30px')).join('')}</div></div>`;
const r30Desl = h => `<div style="opacity:.5;min-width:0">${h}</div>`;
const r30BotaoDesl = (p, t, icone, alt = 38) => `<span style="height:${alt}px;padding:0 16px;border-radius:10px;background:${p.linha};color:${p.suave};display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:700;white-space:nowrap;flex:none">${ic(icone, p.suave, 18, 2.2)}${t}</span>`;
// o campo com a mensagem do sistema logo embaixo, em vermelho
const r30CampoErro = (p, rot, val, msg, o = {}) => r17Campo(p, rot, val, o).replace(`border:1px solid ${p.campoBorda}`, `border:1.5px solid ${m8Verm(p)}`).replace(/<\/div>$/, `<span style="font-size:12px;font-weight:600;color:${m8Verm(p)};line-height:1.35">${msg}</span></div>`);
// a caixa do rastreio: verde-água (veio sozinho) ou vermelha (o sistema recusa)
const r30Caixa = (p, html, erro) => `<div style="padding:${erro ? '9px 12px' : '10px 12px'};border-radius:11px;background:${erro ? (p.e ? '#3A1414' : '#FDE4E4') : (p.e ? '#0F3D3A' : '#DDF3EF')};${erro ? `border:1px solid ${m8Verm(p)};` : ''}font-size:12.5px;line-height:1.45;color:${p.texto};display:flex;flex-direction:column;gap:8px">${html}</div>`;
// a mensagem que aparece embaixo depois de gravar (a do servidor)
const r30Toast = (p, html, cel) => `<div style="position:absolute;left:50%;bottom:${cel ? 6 : 4}px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:10px 14px;border-radius:12px;background:${p.e ? '#115E59' : '#0F766E'};color:#FFFFFF;font-size:${cel ? 13 : 13.5}px;font-weight:600;line-height:1.35;box-shadow:0 10px 28px rgba(0,0,0,${p.e ? .45 : .22});z-index:4;${cel ? 'width:330px;' : 'white-space:nowrap;'}">${ic('check', '#FFFFFF', 17, 2.4)}<span style="min-width:0">${html}</span></div>`;
const r30Pos = (h, extra, cel) => `<div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;gap:${cel ? 10 : 12}px">${h}${extra || ''}</div>`;
const r30Fecha = p => ic('fechar', p.suave, 18, 2.2);

/* ---- as folhas: as cores, a grade e a legenda ---- */
// lançada verde, cancelada vermelha, arrancada amarela (aprovadas); extraviada ROXA com a borda tracejada (nova);
// anulada (em branco) CINZA com o número riscado (nova); livre como o campo; a clicada dourada (aprovada)
const R30_COR = p => ({
  lancada: [p.e ? '#14532D' : '#DCFCE7', p.e ? '#86EFAC' : '#166534'], cancelada: [p.e ? '#4C1717' : '#FEE2E2', p.e ? '#FCA5A5' : '#991B1B'],
  arrancada: [p.e ? '#3D2A05' : '#FEF3C7', p.e ? '#FCD34D' : '#7A4A00'], extraviada: [p.e ? '#2E1A5C' : '#EDE9FE', p.e ? '#D8CCFF' : '#5B21B6', p.e ? '#A78BFA' : '#7C3AED'],
  anulada: [p.e ? '#475569' : '#CBD5E1', p.e ? '#F1F5F9' : '#1E293B'], livre: [p.campo, p.suave], escolhida: ['#FFB800', '#0A2342']
});
const R30_NOME = { lancada: 'lançada', cancelada: 'cancelada', arrancada: 'arrancada', extraviada: 'extraviada', anulada: 'anulada', livre: 'livre', escolhida: 'clicada' };
const R30_OQ = ['Cancelada', 'Arrancada', 'Extraviada', 'Anulada'];
// um bloco de 50: a situação de cada posição (mapa) e a de sempre (padrão); sel = a folha marcada que foi clicada
const r30Bloco = (primeira, mapa, padrao, sel) => Array.from({ length: 50 }, (_, j) => ({ n: primeira + j, i: j + 1, s: mapa[j + 1] || padrao(j + 1), sel: j + 1 === sel }));
// 1.401 de Vila Nova (70.051 a 70.100): 38 com destino (a 17ª cancelada, a 29ª arrancada, a 36ª extraviada), 12 livres
const r30B1401 = (o = {}, sel) => r30Bloco(70051, Object.assign({ 17: 'cancelada', 29: 'arrancada', 36: 'extraviada' }, o), i => (i <= 38 ? 'lancada' : 'livre'), sel);
// 1.288 de Vila Nova (64.401 a 64.450): 46 lançadas, a 22ª cancelada e as 3 últimas em branco (fim = livre, escolhida ou anulada)
const r30B1288 = fim => r30Bloco(64401, { 22: 'cancelada' }, i => (i <= 47 ? 'lancada' : fim));
function r30Folha(p, f, cel) {
  const c = R30_COR(p)[f.s];
  const borda = f.s === 'livre' ? `border:1px solid ${p.campoBorda};` : f.s === 'extraviada' ? `border:1.5px dashed ${c[2]};` : '';
  const anel = f.s === 'escolhida' ? 'box-shadow:0 0 0 3px #0A2342 inset;' : f.sel ? `box-shadow:0 0 0 3px ${p.e ? '#FFB800' : '#0A2342'};` : '';
  return `<span style="height:${cel ? 48 : 46}px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;background:${c[0]};color:${c[1]};${borda}${anel}"><strong style="font-size:${cel ? 13.5 : 14.5}px;font-variant-numeric:tabular-nums;${f.s === 'anulada' ? 'text-decoration:line-through;' : ''}">${r30Mil(f.n)}</strong><span style="font-size:10.5px;font-weight:600">${f.i}ª</span></span>`;
}
const r30Grade = (p, folhas, cel) => `<div style="display:grid;grid-template-columns:repeat(${cel ? 5 : 10},1fr);gap:${cel ? 7 : 8}px">${folhas.map(f => r30Folha(p, f, cel)).join('')}</div>`;
// a legenda: sempre todas as situações, na mesma ordem (no celular, os nomes curtos, em duas linhas)
const R30_LEG = [['lancada', 'lançada na planilha'], ['cancelada', 'cancelada'], ['arrancada', 'arrancada'], ['extraviada', 'extraviada'], ['anulada', 'anulada (em branco)'], ['livre', 'livre'], ['escolhida', 'a que você clicou']];
const r30Legenda = (p, cel) => `<div style="display:flex;gap:${cel ? '5px 11px' : '6px 14px'};flex-wrap:wrap;font-size:${cel ? 11.5 : 12}px;color:${p.texto}">${R30_LEG.map(([s, t]) => { const c = R30_COR(p)[s]; return `<span style="display:flex;align-items:center;gap:5px;white-space:nowrap"><span style="width:12px;height:12px;border-radius:3px;flex:none;background:${c[0]};${s === 'extraviada' ? `border:1.5px dashed ${c[2]};` : `border:1px solid ${p.borda};`}"></span>${cel ? R30_NOME[s] : t}</span>`; }).join('')}</div>`;
const r30Etq = (p, s) => { const c = R30_COR(p)[s]; return `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:13px;font-size:12.5px;font-weight:700;white-space:nowrap;flex:none;background:${c[0]};color:${c[1]};${s === 'extraviada' ? `border:1.5px dashed ${c[2]};` : ''}">${R30_NOME[s]}</span>`; };
const R30_NOTA = '<strong>Normalmente é automático:</strong> a folha lançada na planilha sai daqui sozinha. Esta tela é só para a exceção. Ninguém digita número: clique na folha e o sistema sabe a posição (70.090 = 40ª do bloco 70.051 a 70.100).';

/* ---- o seletor de bloco (novo na congregação e no celular) ---- */
const R30_BLOCOS_VN = [['Bloco 1.401 · em uso', '38 com destino · 12 livres', 1], ['Bloco 1.403 · esperando', 'recebido em 25/11 · 50 livres'], ['Bloco 1.288 · devolvido em 03/11', 'só consulta'], ['Bloco 1.251 · devolvido em 21/07', 'só consulta']];
const r30Lista = (p, cel) => `<div style="position:absolute;top:${cel ? 50 : 46}px;${cel ? 'left:0;right:0;' : 'right:0;width:330px;'}background:${p.sup};border:1px solid ${p.borda};border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,${p.e ? .5 : .18});padding:6px;z-index:5;display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:700;color:${p.suave};padding:6px 10px 4px">Os blocos de Vila Nova</span>${R30_BLOCOS_VN.map(o => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 50 : 46}px;padding:0 10px;border-radius:9px;${o[2] ? `background:${p.e ? '#13294A' : '#EEF4FF'};` : ''}"><div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:13.5px;font-weight:700;color:${p.titulo};white-space:nowrap">${o[0]}</div><div style="font-size:12px;color:${p.suave}">${o[1]}</div></div>${o[2] ? ic('check', p.link, 16, 2.4) : ''}</div>`).join('')}</div>`;
const r30SelBloco = (p, txt, cel, aberto) => cel
  ? `<div style="position:relative;flex:none"><div style="height:44px;border:1px solid ${p.campoBorda};border-radius:10px;background:${p.campo};display:flex;align-items:center;gap:9px;padding:0 12px;font-size:14px;font-weight:600;color:${p.titulo}">${ic('livro', p.icone, 17, 2)}<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${txt}</span>${ic('setaBaixo', p.suave, 16, 2.2)}</div>${aberto ? r30Lista(p, 1) : ''}</div>`
  : `<span style="position:relative;display:flex;flex:none">${m8Linha(p, `${txt}${ic('setaBaixo', p.suave, 15, 2.2)}`, 'livro')}${aberto ? r30Lista(p) : ''}</span>`;
const r30Resumo = (p, txt, dir = '') => `<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${p.texto};flex:none">${ic('check', m8Verde(p), 14, 2.4)}<span style="flex:1;min-width:0">${txt}</span>${dir}</div>`;

/* ---- os formulários das folhas ---- */
// a folha livre clicada (aprovado), agora com a 4ª situação "Anulada"
function r30FormFolha(p, o) {
  if (o.cel) return r27Cartao(p, o.titCel, '', `${r30Chips(p, 'O que aconteceu', R30_OQ, o.chip)}${r17Campo(p, 'Observação', o.obs, o.obs ? {} : { vazio: 1 })}<div style="display:flex;justify-content:flex-end">${m8Ouro(p, o.botao || 'Registrar', 'check', 38)}</div>${o.rodape || ''}`, 'padding:11px 12px;gap:8px');
  return m9Cartao(p, o.tit || 'A folha que você clicou', o.sub || 'só escolha o que aconteceu', `<div style="display:grid;grid-template-columns:minmax(0,0.95fr) minmax(0,2.5fr) minmax(0,1.3fr) auto;gap:12px;align-items:end">${r17Campo(p, o.rotFolha || `Folha (bloco ${o.bloco})`, o.folha, { auto: true, icone: 'livro' })}${r30Chips(p, 'O que aconteceu', R30_OQ, o.chip)}${r17Campo(p, 'Observação', o.obs, o.obs ? {} : { vazio: 1 })}${m8Ouro(p, o.botao || 'Registrar', 'check', 38)}</div>${o.rodape || ''}`);
}
// o histórico da folha: quem marcou, quem desfez, quando e por quê (nada se apaga)
const r30Hist = (p, itens, cel) => `<div style="display:flex;flex-direction:column;gap:3px;padding-top:${cel ? 6 : 8}px;border-top:1px solid ${p.linha}"><span style="font-size:12px;font-weight:700;color:${p.suave}">O histórico da folha</span>${itens.map(x => `<div style="display:flex;gap:8px;font-size:12.5px;line-height:1.4;color:${p.texto}"><strong style="flex:none;width:${cel ? 74 : 92}px;color:${p.titulo};white-space:nowrap">${x[0]}</strong><span style="min-width:0">${x[1]}</span></div>`).join('')}</div>`;
const R30_H_MARCOU = ['12/11 09h40', 'Rute Santos (tesoureira de Vila Nova) marcou como <strong>extraviada</strong>: “Não achei a folha no bloco.”'];
const R30_H_DESFEZ = ['25/11 11h20', 'João da Silva (Tesouraria Geral) desfez: “A folha apareceu, estava com os recibos de outubro.” Voltou a ficar livre.'];
// a folha MARCADA clicada: a Geral desfaz (com o motivo); a área e a congregação só veem o histórico
function r30CardMarcada(p, o) {
  const nao = `<div style="min-height:38px;display:flex;align-items:center;gap:8px;font-size:12.5px;color:${p.suave};line-height:1.35">${ic('cadeado', p.suave, 15, 2)}<span style="min-width:0">${o.trava}</span></div>`;
  if (o.cel) return r27Cartao(p, `Folha ${o.folha}`, r30Etq(p, o.sit), `${o.pode ? `${r17Campo(p, 'Motivo para desfazer', o.motivo, { obrig: 1 })}<div style="display:flex;justify-content:flex-end">${m8Linha(p, 'Desfazer a marcação', 'voltar')}</div>` : nao}${r30Hist(p, o.hist, 1)}`, 'padding:11px 12px;gap:8px');
  const lado = o.pode ? `${r17Campo(p, 'Motivo para desfazer', o.motivo, { obrig: 1, nota: 'fica no histórico' })}${m8Linha(p, 'Desfazer a marcação', 'voltar')}` : `<div style="grid-column:span 2;min-width:0">${nao}</div>`;
  return m9Cartao(p, 'A folha que você clicou', o.pode ? 'desfazer pede o motivo' : 'só a Tesouraria Geral desfaz', `<div style="display:grid;grid-template-columns:minmax(0,0.95fr) auto minmax(0,2.6fr) auto;gap:12px;align-items:end">${r17Campo(p, `Folha (bloco ${o.bloco})`, o.folha, { auto: true, icone: 'livro' })}<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12.5px;font-weight:600;color:${p.titulo}">Está como</span><span style="min-height:38px;display:flex;align-items:center">${r30Etq(p, o.sit)}</span></div>${lado}</div>${r30Hist(p, o.hist)}`);
}

/* ---- as telas montadas: Folhas (notebook e celular) e Livro ---- */
function r30Folhas(p, k, cel, o) {
  if (cel) return r20Cel(p, k, 'Blocos de recibo', r30Pos(`${r30Abas(p, 1, 1)}${o.sel ? r30SelBloco(p, o.sel, 1, o.aberto) : ''}${r30Resumo(p, o.resumoCel || '1ª a 35ª: todas com destino', o.linkCel || '')}${r30Grade(p, o.folhas.slice(35), 1)}${r30Legenda(p, 1)}${o.form}`, o.toast ? r30Toast(p, o.toast, 1) : '', 1));
  const grade = m9Cartao(p, `As 50 folhas do bloco ${o.bloco}`, o.resumo, `${r30Grade(p, o.folhas)}${r30Legenda(p)}`);
  return r20Casca(p, k, 'Blocos de recibo', r30Pos(`${r30Tit(p, k, 'as folhas de um bloco', `${o.dir || ''}${o.sel ? r30SelBloco(p, o.sel, 0, o.aberto) : ''}`)}${r30Abas(p, 1)}${o.form}${grade}${o.nota === undefined ? r16aAviso(p, R30_NOTA) : o.nota}`, o.toast ? r30Toast(p, o.toast) : ''));
}
const r30Livro = (p, linhas, total, cel) => m9Cartao(p, 'O livro', 'entradas, saídas e cadastros', `${linhas.slice(0, cel ? 3 : 5).map((e, i) => `<div style="display:flex;gap:10px;padding:6px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="width:42px;flex:none;font-size:12px;color:${p.suave}">${e[0]}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:${p.titulo}">${e[1]}</div><div style="font-size:11.5px;color:${p.suave}">${e[2]}</div></div></div>`).join('')}${r30Pag(p, `1 a ${cel ? 3 : 5} de ${total} registros`, cel)}`, cel ? 'padding:11px 12px;gap:6px' : '');
const r30Botoes = (p, ativo, cel) => `<div style="display:flex;gap:10px;flex:none;${cel ? 'flex-direction:column;' : ''}">${ativo === 'saida' ? `${m8Linha(p, 'Registrar entrada', 'voltar')}${m8Ouro(p, 'Registrar saída', 'seta', 40)}` : `${m8Ouro(p, 'Registrar entrada', 'voltar', 40)}${m8Linha(p, 'Registrar saída', 'seta')}`}</div>`;
const r30TelaLivro = (p, k, esq, livro, toast) => r20Casca(p, k, 'Blocos de recibo', r30Pos(`${r30Tit(p, k, 'o livro de entrada e saída')}${r30Abas(p, 2)}${r17Dois(esq, livro, '1fr 1.15fr')}`, toast ? r30Toast(p, toast) : ''));
const r30CelLivro = (p, k, corpo, toast) => r20Cel(p, k, 'Blocos de recibo', r30Pos(`${r30Abas(p, 2, 1)}${corpo}`, toast ? r30Toast(p, toast, 1) : '', 1));

// o livro (as linhas de cada nível)
const R30_L = {
  s1403: ['25/11', 'Saída: bloco 1.403 entregue a Rute Santos (Vila Nova)', 'registrou João da Silva · Tesouraria Geral'],
  s1404: ['25/11', 'Saída: bloco 1.404 entregue a Ezequiel Ramos (Monte Sião)', 'levado pela área, sem ficar com ela'],
  s1402: ['17/11', 'Saída: bloco 1.402 entregue a Lia Fontes (Bela Vista)', 'registrou João da Silva · Tesouraria Geral'],
  e1288: ['03/11', 'Entrada: bloco 1.288 devolvido por Vila Nova', 'recebeu João da Silva · 46 lançadas, 1 cancelada, 3 anuladas'],
  s1400: ['27/10', 'Saída: bloco 1.400 entregue a Ezequiel Ramos (Monte Sião)', 'levado pela área, sem ficar com ela'],
  s1401: ['20/10', 'Saída: bloco 1.401 entregue a Rute Santos (Vila Nova)', 'registrou João da Silva · Tesouraria Geral'],
  e1270: ['13/10', 'Entrada: bloco 1.270 devolvido pela congregação Sede', 'recebeu João da Silva · 50 lançadas'],
  s1298: ['06/10', 'Saída: bloco 1.298 entregue a Davi Moura (Cidade Jardim)', 'registrou João da Silva · Tesouraria Geral'],
  e1262: ['29/09', 'Entrada: bloco 1.262 devolvido por Bela Vista', 'recebeu João da Silva · 48 lançadas, 2 anuladas']
};
const R30_LG = ['s1402', 'e1288', 's1400', 's1401', 'e1270'].map(x => R30_L[x]);
const R30_LG_DEPOIS = [R30_L.s1403].concat(R30_LG);
const R30_LD = ['s1400', 's1401', 'e1270', 's1298', 'e1262'].map(x => R30_L[x]);
const R30_LA = ['s1404', 's1403', 's1402', 'e1288', 's1400'].map(x => R30_L[x]);
const R30_LL = [R30_L.s1403, ['03/11', 'Entrada: bloco 1.288 devolvido por Rute Santos', 'recebeu João da Silva · 46 lançadas, 1 cancelada, 3 anuladas'], ['20/10', 'Saída: bloco 1.401 entregue a Rute Santos', 'registrou João da Silva · Tesouraria Geral'], ['08/09', 'Saída: bloco 1.288 entregue a Rute Santos', 'registrou João da Silva · Tesouraria Geral'], ['21/07', 'Entrada: bloco 1.251 devolvido por Rute Santos', 'recebeu João da Silva · 49 lançadas, 1 arrancada']];
// os avisos da área e da congregação (aprovados) ganham a regra do bloco cheio
const R30_AVISO = {
  area: '<strong>Entrada e saída de blocos quem registra é a Tesouraria Geral.</strong> A área é só intermediária: o bloco nunca fica com a área. Só bloco cheio volta: se sobrar folha em branco, a congregação anula antes de levar.',
  local: '<strong>Entrada e saída de blocos quem registra é a Tesouraria Geral.</strong> Para pedir um bloco novo, fale com ela. Só bloco cheio volta: se sobrar folha em branco, anule em “Folhas do bloco” antes de levar.',
  areaCel: 'Quem registra é a Tesouraria Geral; o bloco nunca fica com a área. Só bloco cheio volta.',
  localCel: 'Quem registra é a Tesouraria Geral. Só bloco cheio volta: sobrou folha em branco, anule antes de levar.'
};
const r30Agora = (p, k, zero) => m9Cartao(p, k === 'area' ? 'Blocos da área agora' : 'Seus blocos agora', '', r16aNum(p, k === 'area' ? [[zero ? '0' : '9', 'em uso'], [zero ? '0' : '3', 'esperando'], [zero ? '0' : '1', 'a devolver']] : [[zero ? '0' : '1', 'em uso'], [zero ? '0' : '1', 'esperando']], k === 'area' ? 3 : 2));

/* =============== 1. REGISTRAR SAÍDA (a Tesouraria Geral entrega um bloco a uma congregação) =============== */
// o servidor (entregar): a primeira folha, a congregação (só as ativas), uma pessoa (do cadastro ou nome escrito),
// "levado pela área" e a data (não antes da chegada do bloco, nem depois de hoje). Quem registra entra sozinho.
const r30Chave = (p, on) => `<span style="width:40px;height:24px;border-radius:12px;flex:none;position:relative;background:${on ? (p.e ? '#14B8A6' : '#0F766E') : (p.e ? '#3C5A82' : '#C9CFD8')}"><span style="position:absolute;top:3px;${on ? 'right' : 'left'}:3px;width:18px;height:18px;border-radius:9px;background:#FFFFFF"></span></span>`;
const r30Levado = (p, on, cong, cel) => `<div style="display:flex;align-items:center;gap:10px;padding:${cel ? '7px 10px' : '8px 12px'};border-radius:10px;border:1px solid ${on ? (p.e ? '#14B8A6' : '#0F766E') : p.campoBorda};${on ? `background:${p.e ? '#0F3D3A' : '#DDF3EF'};` : ''}">${r30Chave(p, on)}<div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:13.5px;font-weight:600;color:${p.titulo}">Levado pela área</div><div style="font-size:12px;color:${p.suave}">${on ? `A Área 2 leva até ${cong}; o bloco não fica com ela.` : (cel ? 'Marque se a Área 2 vai levar.' : `Marque se a Área 2 vai levar o bloco até ${cong}.`)}</div></div></div>`;
const R30_SAIDA = {
  vn: { folha: '70.151', bloco: '1.403', faixa: '70.151 a 70.200', cong: 'Vila Nova', pessoa: 'Rute Santos · tesoureira de Vila Nova ▾', area: 0 },
  ms: { folha: '70.201', bloco: '1.404', faixa: '70.201 a 70.250', cong: 'Monte Sião', pessoa: 'Ezequiel Ramos · dirigente de Monte Sião ▾', area: 1 }
};
function r30FormSaida(p, o, cel) {
  const S = R30_SAIDA[o.caso || 'vn'], vazio = o.vazio;
  const folha = r17Campo(p, 'Primeira folha do bloco', vazio ? 'o número impresso na 1ª folha' : S.folha, { obrig: 1, icone: 'busca', vazio });
  const caixa = vazio ? '' : r30Caixa(p, cel ? `<span><strong style="color:${p.titulo}">Bloco ${S.bloco}</strong> (veio sozinho): folhas ${S.faixa} · chegou em 05/02/2026 · na Tesouraria Geral</span>` : `<span><strong style="color:${p.titulo}">Bloco ${S.bloco}</strong> (veio sozinho): folhas ${S.faixa} · chegou em 05/02/2026 · está na Tesouraria Geral</span>`);
  const cong = r17Campo(p, 'Congregação', vazio ? 'Escolha ▾' : `${S.cong} ▾`, { obrig: 1, vazio, nota: cel ? '' : 'só as ativas' });
  const data = o.dataErro ? r30CampoErro(p, cel ? 'Data' : 'Data da entrega', '25/01/2026', cel ? 'Antes da chegada (05/02/2026).' : 'Antes da chegada do bloco (05/02/2026).', { obrig: 1, icone: 'calendario' }) : r17Campo(p, cel ? 'Data' : 'Data da entrega', '25/11/2026', { obrig: 1, icone: 'calendario' });
  const pessoa = r17Campo(p, 'Entregue a', vazio ? 'primeiro, a congregação' : S.pessoa, { obrig: 1, vazio, nota: cel ? '' : 'a liderança dela ou outra pessoa' });
  const levado = r30Levado(p, !vazio && S.area, vazio ? 'a congregação' : S.cong, cel);
  if (cel) return r27Cartao(p, 'Registrar saída', r30Fecha(p), `${folha}${caixa}<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:8px;align-items:start">${cong}${data}</div>${pessoa}${levado}${r21Ouro(p, 'Registrar a saída', 'check', 44)}<span style="font-size:12px;color:${p.suave};line-height:1.35">Entregue por João da Silva (quem está entrando).</span>`, 'padding:11px 12px;gap:8px');
  return m9Cartao(p, 'Registrar saída', 'o bloco vai para uma congregação', `${folha}${caixa}<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:10px;align-items:start">${cong}${data}</div>${pessoa}${levado}${r17Campo(p, 'Entregue por', 'João da Silva · Tesouraria Geral (quem está entrando)', { auto: 1, icone: 'cadeado' })}<div style="display:flex;justify-content:flex-end">${m8Ouro(p, 'Registrar a saída', 'check', 38)}</div>`, 'gap:9px');
}
function r30Saida(p, k, d) {
  const cel = ehCel(d);
  if (k === 'area' || k === 'local') {
    const linhas = k === 'area' ? R30_LA : R30_LL, total = k === 'area' ? 96 : 18;
    if (cel) return r30CelLivro(p, k, `${r16aAviso(p, R30_AVISO[k + 'Cel'])}${r30Livro(p, linhas, total, 1)}`);
    return r30TelaLivro(p, k, r18Col(r16aAviso(p, R30_AVISO[k]), r30Agora(p, k)), r30Livro(p, linhas, total));
  }
  const o = { geral: {}, geralArea: { caso: 'ms' }, geralErro: { dataErro: 1 }, feito: { vazio: 1 } }[k] || {};
  const toast = k === 'feito' ? 'Bloco 1.403 entregue a Vila Nova. Está no livro.' : '';
  const linhas = k === 'feito' ? R30_LG_DEPOIS : R30_LG;
  if (cel) return k === 'feito' ? r30CelLivro(p, 'geral', `${r30Botoes(p, 'saida', 1)}${r30Livro(p, linhas, 413, 1)}`, toast) : r30CelLivro(p, 'geral', r30FormSaida(p, o, 1));
  return r30TelaLivro(p, 'geral', r18Col(r30Botoes(p, 'saida'), r30FormSaida(p, o)), r30Livro(p, linhas, k === 'feito' ? 413 : 412), toast);
}
const PERFIS30_SAIDA = [['geral', 'Tesouraria Geral · a saída para Vila Nova'], ['geralArea', 'Tesouraria Geral · levado pela área (Monte Sião)'], ['geralErro', 'Tesouraria Geral · o que o sistema confere'], ['feito', 'Tesouraria Geral · depois de registrar'], ['area', 'Tesouraria da Área 2 · o que a área vê'], ['local', 'Tesouraria local (Vila Nova) · o que a congregação vê']];

/* =============== 2. A DEVOLUÇÃO SÓ DE BLOCO CHEIO (a recusa, anular as em branco e o bloco cheio voltando) =============== */
// Vila Nova traz o bloco 1.288 na terça 03/11 com 3 folhas em branco (64.448 a 64.450): a entrada recusa e leva a anular.
function r30FormEntrada(p, o, cel) {
  const folha = r17Campo(p, 'Primeira folha do bloco', '64.401', { obrig: 1, icone: 'busca' });
  const botaoAnular = m8Ouro(p, 'Anular as 3 em branco', 'seta', 34);
  const caixa = o.cheio
    ? r30Caixa(p, `<span><strong style="color:${p.titulo}">Bloco 1.288</strong> (veio sozinho): folhas 64.401 a 64.450 · entregue a Vila Nova em 08/09 · 46 lançadas, 1 cancelada, 3 anuladas · <strong style="color:${p.titulo}">cheio</strong>, nenhuma em branco</span>`)
    : r30Caixa(p, `<span><strong style="color:${m8Verm(p)}">O bloco 1.288 ainda tem 3 folhas em branco:</strong> 64.448, 64.449 e 64.450. Só bloco cheio volta para a Tesouraria Geral. ${cel ? 'Anule as que sobraram e registre a entrada.' : 'Anule as que sobraram; depois, registre a entrada.'}</span><div style="display:flex">${botaoAnular}</div>`, 1);
  const recebido = r17Campo(p, 'Recebido por', cel ? 'João da Silva (quem está entrando)' : 'João da Silva · Tesouraria Geral (quem está entrando)', { auto: 1, icone: 'cadeado' });
  const devolvido = o.cheio ? r17Campo(p, 'Devolvido por', 'Rute Santos · tesoureira de Vila Nova ▾') : r30Desl(r17Campo(p, 'Devolvido por', 'primeiro, anule as folhas em branco', { vazio: 1 }));
  const bt = o.cheio ? (cel ? r21Ouro(p, 'Registrar a entrada', 'check', 44) : m8Ouro(p, 'Registrar a entrada', 'check', 38)) : r30BotaoDesl(p, 'Registrar a entrada', 'check', cel ? 44 : 38);
  if (cel) return r27Cartao(p, 'Registrar entrada', r30Fecha(p), `${folha}${caixa}${recebido}${devolvido}${bt}`, 'padding:11px 12px;gap:8px');
  return m9Cartao(p, 'Registrar entrada', 'o bloco volta para a Tesouraria Geral', `${folha}${caixa}${recebido}${devolvido}<div style="display:flex;justify-content:flex-end">${bt}</div>`);
}
// anular as que sobraram: as 3 em branco já vêm escolhidas e "Anulada" marcada (a Geral, vinda da recusa; ou a congregação, antes de levar)
function r30Anular(p, k, cel) {
  const geral = k === 'geral', marcar = `<span style="font-size:12px;font-weight:700;color:${p.link};white-space:nowrap">marcar as 3 em branco</span>`;
  const voltar = `<span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:${p.link}">${ic('voltar', p.link, 14, 2.4)}Voltar à entrada do bloco 1.288</span>`;
  const form = r30FormFolha(p, { cel, bloco: '1.288', rotFolha: 'Folhas (bloco 1.288)', folha: '48ª a 50ª', chip: 3, obs: 'Sobraram em branco', botao: 'Anular as 3', tit: 'As folhas em branco que você escolheu', sub: geral ? voltar : 'anular antes de levar', titCel: 'Folhas 64.448 a 64.450 · 48ª a 50ª' });
  const nota = r16aAviso(p, `<strong>Só bloco cheio volta para a Tesouraria Geral.</strong> Escolha “Anulada” e clique nas folhas em branco que sobraram (ou em “marcar as 3 em branco”). ${geral ? 'Depois, volte ao livro e registre a entrada.' : 'Depois, leve o bloco à Tesouraria Geral.'}`);
  return r30Folhas(p, k, cel, { bloco: '1.288', folhas: r30B1288('escolhida'), resumo: `64.401 a 64.450 · 47 com destino · 3 em branco · ${marcar}`, sel: geral ? 'Bloco 1.288 · Vila Nova' : 'Bloco 1.288 · em uso', form, nota, resumoCel: '1ª a 35ª: todas com destino', linkCel: marcar });
}
function r30Devolver(p, k, d) {
  const cel = ehCel(d);
  if (k === 'anular' || k === 'local') return r30Anular(p, k === 'local' ? 'local' : 'geral', cel);
  if (k === 'area') {
    if (cel) return r30CelLivro(p, 'area', `${r16aAviso(p, R30_AVISO.areaCel)}${r30Livro(p, [R30_L.e1288].concat(R30_LD.slice(0, 2)), 91, 1)}`);
    return r30TelaLivro(p, 'area', r18Col(r16aAviso(p, R30_AVISO.area), r30Agora(p, 'area')), r30Livro(p, [R30_L.e1288].concat(['s1400', 's1401', 's1298'].map(x => R30_L[x]), [['22/09', 'Saída: bloco 1.297 entregue a Lia Fontes (Bela Vista)', 'registrou João da Silva · Tesouraria Geral']]), 91));
  }
  const cheio = k === 'cheio';
  if (cel) return r30CelLivro(p, 'geral', r30FormEntrada(p, { cheio }, 1));
  return r30TelaLivro(p, 'geral', r18Col(r30Botoes(p, 'entrada'), r30FormEntrada(p, { cheio })), r30Livro(p, R30_LD, 410), '');
}
const PERFIS30_DEV = [['recusa', 'Tesouraria Geral · 03/11: o bloco com folhas em branco'], ['anular', 'Tesouraria Geral · anular as que sobraram'], ['cheio', 'Tesouraria Geral · o bloco cheio volta'], ['local', 'Tesouraria local (Vila Nova) · anular antes de levar'], ['area', 'Tesouraria da Área 2 · o que a área vê']];

/* =============== 3. AS FOLHAS: a cor da extraviada e da anulada, a legenda e o seletor de bloco =============== */
function r30FolhasCor(p, k, d) {
  const cel = ehCel(d), local = k === 'local' || k === 'localSel' || k === 'devolvido', nivel = local ? 'local' : k;
  if (k === 'devolvido') {
    const fechado = `<div style="display:flex;align-items:flex-start;gap:10px;padding:${cel ? '10px 12px' : '12px 14px'};border-radius:12px;border:1px solid ${p.borda};background:${p.sup};font-size:13px;line-height:1.45;color:${p.texto}">${ic('cadeado', p.suave, 17, 2)}<span style="min-width:0"><strong style="color:${p.titulo}">O bloco 1.288 voltou à Tesouraria Geral em 03/11.</strong> As folhas dele não mudam mais: ficam só para consulta. ${cel ? '' : 'Clique numa folha para ver o histórico dela.'}</span></div>`;
    return r30Folhas(p, 'local', cel, { bloco: '1.288', folhas: r30B1288('anulada'), resumo: '64.401 a 64.450 · cheio: 46 lançadas, 1 cancelada, 3 anuladas', sel: 'Bloco 1.288 · devolvido', form: fechado, nota: '', resumoCel: '1ª a 35ª: todas com destino' });
  }
  const sel = local ? 'Bloco 1.401 · em uso' : 'Bloco 1.401 · Vila Nova';
  const form = r30FormFolha(p, { cel, bloco: '1.401', folha: '70.090 · 40ª', chip: 1, obs: 'Rasgou na hora de preencher', titCel: 'Folha 70.090 · a 40ª' });
  return r30Folhas(p, nivel, cel, { bloco: '1.401', folhas: r30B1401({ 40: 'escolhida' }), resumo: '70.051 a 70.100 · 38 com destino · 12 livres', sel, aberto: k === 'localSel', form });
}
const PERFIS30_FOLHAS = [['geral', 'Tesouraria Geral'], ['area', 'Tesouraria da Área 2'], ['local', 'Tesouraria local (Vila Nova)'], ['localSel', 'Tesouraria local (Vila Nova) · o seletor aberto'], ['devolvido', 'Tesouraria local (Vila Nova) · um bloco devolvido']];

/* =============== 4. DESFAZER A EXCEÇÃO DA FOLHA (só a Tesouraria Geral, com motivo) e o histórico =============== */
function r30Desfazer(p, k, d) {
  const cel = ehCel(d), nivel = k === 'feito' ? 'geral' : k;
  const sel = k === 'local' ? 'Bloco 1.401 · em uso' : 'Bloco 1.401 · Vila Nova';
  if (k === 'feito') {
    // no celular, o cartão da folha (agora livre) com o histórico; o formulário abre ao tocar em "Marcar o que aconteceu"
    const form = cel ? r27Cartao(p, 'Folha 70.086 · a 36ª', r30Etq(p, 'livre'), `${r30Hist(p, [R30_H_MARCOU, R30_H_DESFEZ], 1)}<div style="display:flex;justify-content:flex-end">${m8Linha(p, 'Marcar o que aconteceu', 'lapis')}</div>`, 'padding:11px 12px;gap:8px')
      : r30FormFolha(p, { bloco: '1.401', folha: '70.086 · 36ª', chip: -1, obs: '', rodape: r30Hist(p, [R30_H_MARCOU, R30_H_DESFEZ]) });
    return r30Folhas(p, 'geral', cel, { bloco: '1.401', folhas: r30B1401({ 36: 'escolhida' }), resumo: '70.051 a 70.100 · 37 com destino · 13 livres', sel, form, nota: '', toast: cel ? 'A folha 70.086 voltou a ficar livre.' : 'A folha 70.086 voltou a ficar livre. O histórico guarda quem marcou, quem desfez e por quê.' });
  }
  const pode = k === 'geral';
  const card = r30CardMarcada(p, { cel, pode, bloco: '1.401', folha: cel ? '70.086 · a 36ª' : '70.086 · 36ª', sit: 'extraviada', motivo: 'A folha apareceu, estava com os recibos de outubro', hist: [R30_H_MARCOU], trava: cel ? 'Marcou errado? Só a Tesouraria Geral desfaz, com o motivo.' : 'Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela.' });
  return r30Folhas(p, nivel, cel, { bloco: '1.401', folhas: r30B1401({}, 36), resumo: '70.051 a 70.100 · 38 com destino · 12 livres', sel, form: card, nota: cel ? undefined : '' });
}
const PERFIS30_DESF = [['geral', 'Tesouraria Geral · desfazer, com o motivo'], ['feito', 'Tesouraria Geral · depois de desfazer'], ['area', 'Tesouraria da Área 2 · só o histórico'], ['local', 'Tesouraria local (Vila Nova) · só o histórico']];

/* =============== 5. OS TEXTOS DAS TELAS: as listas vazias em cada nível =============== */
const r30Vazio = (p, tit, txt, acao, cel) => `<div style="background:${p.sup};border:1px dashed ${p.campoBorda};border-radius:14px;padding:${cel ? '22px 16px' : '30px 24px'};display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;flex:none">${ic('livro', p.suave, cel ? 28 : 32, 1.8)}<strong style="font-size:${cel ? 15 : 16}px;color:${p.titulo}">${tit}</strong><span style="font-size:13px;color:${p.suave};max-width:440px;line-height:1.45">${txt}</span>${acao || ''}</div>`;
const R30_VAZIO = {
  folhasGeral: ['Nenhum bloco saiu para as congregações ainda.', 'Para entregar um bloco, use “Registrar saída”, no livro de entrada e saída.'],
  folhasArea: ['Nenhuma congregação da Área 2 está com bloco agora.', 'Os blocos saem da Tesouraria Geral. Quando um chegar a uma congregação da área, as folhas dele aparecem aqui.'],
  folhasLocal: ['Vila Nova está sem bloco de recibo agora.', 'Para receber um bloco, fale com a Tesouraria Geral. Quando ele chegar, as folhas aparecem aqui.'],
  livroGeral: ['O livro ainda está vazio.', 'O primeiro registro aparece quando a Tesouraria Geral cadastra o lote da gráfica, na aba Blocos.'],
  livroArea: ['Nenhum bloco saiu para as congregações da Área 2 ainda.', 'Quando a Tesouraria Geral entregar um bloco a uma delas, a saída fica registrada aqui.'],
  livroLocal: ['Nenhum bloco saiu para Vila Nova ainda.', 'Quando a Tesouraria Geral entregar um bloco a vocês, a saída fica registrada aqui.'],
  blocosGeral: ['Nenhum bloco ainda.', 'Os blocos aparecem quando o lote da gráfica chega. Comece em “Cadastrar lote da gráfica”.']
};
function r30Vazios(p, k, d) {
  const cel = ehCel(d), V = R30_VAZIO[k], nivel = /Geral$/.test(k) ? 'geral' : /Area$/.test(k) ? 'area' : 'local';
  if (k.startsWith('folhas')) {
    const acao = nivel === 'geral' ? m8Linha(p, 'Ir ao livro de entrada e saída', 'seta') : '';
    if (cel) return r20Cel(p, nivel, 'Blocos de recibo', r30Pos(`${r30Abas(p, 1, 1)}${r30Vazio(p, V[0], V[1], acao, 1)}`, '', 1));
    return r20Casca(p, nivel, 'Blocos de recibo', r30Pos(`${r30Tit(p, nivel, 'as folhas de um bloco')}${r30Abas(p, 1)}${r30Vazio(p, V[0], V[1], acao)}`));
  }
  if (k.startsWith('livro')) {
    const cartao = m9Cartao(p, 'O livro', 'entradas, saídas e cadastros', r30Vazio(p, V[0], V[1], '', cel).replace(`border:1px dashed ${p.campoBorda};`, 'border:0;').replace(/padding:(22px 16px|30px 24px)/, 'padding:14px 8px'), cel ? 'padding:11px 12px;gap:6px' : '');
    if (cel) return r30CelLivro(p, nivel, `${nivel === 'geral' ? r30Botoes(p, 'entrada', 1) : r16aAviso(p, R30_AVISO[nivel + 'Cel'])}${cartao}`);
    const esq = nivel === 'geral' ? r18Col(r30Botoes(p, 'entrada'), m9Cartao(p, 'Registrar entrada', 'o bloco volta para a Tesouraria Geral', `${r17Campo(p, 'Primeira folha do bloco', 'o número impresso na 1ª folha', { obrig: 1, icone: 'busca', vazio: 1 })}${r17Campo(p, 'Recebido por', 'João da Silva · Tesouraria Geral (quem está entrando)', { auto: 1, icone: 'cadeado' })}${r30Desl(r17Campo(p, 'Devolvido por', 'primeiro, a folha do bloco', { vazio: 1 }))}<div style="display:flex;justify-content:flex-end">${r30BotaoDesl(p, 'Registrar a entrada', 'check')}</div>`)) : r18Col(r16aAviso(p, R30_AVISO[nivel]), r30Agora(p, nivel, 1));
    return r30TelaLivro(p, nivel, esq, cartao);
  }
  // a aba Blocos da Geral antes do primeiro lote
  const busca = `<div style="height:40px;border:1px solid ${p.campoBorda};border-radius:10px;background:${p.campo};display:flex;align-items:center;gap:8px;padding:0 12px;font-size:13.5px;color:${p.suave};${cel ? '' : 'width:250px;'}flex:none">${ic('busca', p.suave, 16, 2)}Nº do bloco ou de uma folha</div>`;
  const chips = `<div style="display:flex;gap:6px;flex-wrap:wrap">${['Todos', 'Em uso', 'Esperando', 'Fechado'].slice(0, cel ? 3 : 4).map((t, i) => chipFiltro(p, t, i === 0).replace(/<svg[\s\S]*?<\/svg>/, '')).join('')}</div>`;
  const lote = m9Cartao(p, 'Lote da gráfica', '', `<span style="font-size:13px;color:${p.texto};line-height:1.45">Nenhum lote da gráfica cadastrado ainda. Use o botão “Cadastrar lote da gráfica”, no alto.</span>`);
  // no celular não há o cadastro do lote (como no aprovado): o texto não aponta para o botão
  if (cel) return r20Cel(p, 'geral', 'Blocos de recibo', r30Pos(`${r30Abas(p, 0, 1)}${busca}${chips}${r30Vazio(p, V[0], 'Os blocos aparecem quando o lote da gráfica chega.', '', 1)}`, '', 1));
  return r20Casca(p, 'geral', 'Blocos de recibo', r30Pos(`${r30Tit(p, 'geral', 'os blocos', m8Ouro(p, 'Cadastrar lote da gráfica', 'mais', 40))}${r30Abas(p, 0)}<div style="display:flex;gap:12px;align-items:center">${busca}${chips}</div>${r17Dois(r30Vazio(p, V[0], V[1]), r18Col(lote, r16aAviso(p, '<strong>Bloco só fica com a Tesouraria Geral ou com a congregação.</strong> A área é só intermediária.')), '1.55fr 1fr')}`));
}
const PERFIS30_VAZIO = [['folhasGeral', 'Folhas do bloco · Tesouraria Geral'], ['folhasArea', 'Folhas do bloco · Tesouraria da Área 2'], ['folhasLocal', 'Folhas do bloco · Tesouraria local (Vila Nova)'], ['livroGeral', 'Livro · Tesouraria Geral'], ['livroArea', 'Livro · Tesouraria da Área 2'], ['livroLocal', 'Livro · Tesouraria local (Vila Nova)'], ['blocosGeral', 'Blocos · Tesouraria Geral, antes do 1º lote']];
