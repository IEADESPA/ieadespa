/* ---------------- 1. OS CULTOS: A AGENDA PADRÃO DA GERAL ---------------- */
// Decidido por ele (24/11): a Geral monta a agenda padrão da semana e manda para todas as congregações; a congregação
// não mexe no padrão. Ela pode ACRESCENTAR cultos, que entram na hora (a Geral vê no painel). Para MUDAR um culto do
// padrão, a congregação pede, e a Geral aceita ou recusa. Os 5 cultos de Vila Nova continuam os da 32 (a ficha aprovada):
// 4 do padrão e o dos jovens, acrescentado por ela.
const R33_PADRAO = [['Domingo', '8h30', 'Escola Bíblica Dominical'], ['Domingo', '18h', 'Culto da família'], ['Terça', '19h30', 'Culto de oração'], ['Quinta', '19h30', 'Culto de ensino']];
const R33_ACRESC_VN = [['Sábado', '19h30', 'Jovens · 1º e 3º sábados', 'acrescentado em 10/03/2026']];
// os pedidos de mudança que esperam a Geral: [congregação, área, culto do padrão, o pedido, quem pediu, quando]
const R33_PEDIDOS = [['Vila Nova', 'Área 2', 'Quinta, 19h30 · Culto de ensino', 'passar para as 20h', 'Débora Lima, secretária', '28/11'], ['Liberdade', 'Área 4', 'Domingo, 18h · Culto da família', 'passar para as 18h30', 'Ev. Tomé Rocha, dirigente', '29/11'], ['Recanto', 'Área 2', 'Terça, 19h30 · Culto de oração', 'não fazer aqui (a casa é emprestada)', 'Ev. Caio Barbosa, dirigente', '01/12']];
const R33_ACRESC_SEMANA = [['Bela Vista · Área 2', 'Sexta, 15h · Círculo de oração', '30/11'], ['Novo Horizonte · Área 6', 'Sábado, 9h · Culto das crianças', '01/12']];
const r33Culto = (p, x, i, dir, o = {}) => r28Pes(p, r32Ic(p, 'relogio', o.tom), `${x[0]}, ${x[1]}`, o.sub || x[2], dir, { i, alt: o.alt || 42, sel: o.sel });
// a Geral monta a agenda padrão (a semana inteira) e manda para todas
function r33Padrao(p, cel) {
  const dias = [['Dom', [R33_PADRAO[0], R33_PADRAO[1]]], ['Seg', []], ['Ter', [['', '19h', 'Culto de oração', 1]]], ['Qua', []], ['Qui', [R33_PADRAO[3]]], ['Sex', []], ['Sáb', []]];
  const card = (x) => `<div style="border-radius:10px;padding:8px 9px;display:flex;flex-direction:column;gap:2px;${x[3] ? 'background:#FFF8E1;border:2px solid #FFB800;' : `background:${p.sup};border:1px solid ${p.borda};`}"><strong style="font-size:14px;color:${p.titulo}">${x[1]}</strong><span style="font-size:12px;line-height:1.3;color:${p.texto}">${x[2]}</span>${x[3] ? `<span style="font-size:11px;font-weight:700;color:#8A5A00">era 19h30</span>` : ''}</div>`;
  const sem = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">${dias.map(d => `<div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${p.suave};text-align:center">${d[0]}</span>${d[1].map(card).join('')}<span style="height:32px;border:1px dashed ${p.campoBorda};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:${p.link}">+ Culto</span></div>`).join('')}</div>`;
  const rasc = r16aAviso(p, cel ? '<strong>1 mudança ainda não mandada:</strong> o culto de oração passa para as 19h.' : '<strong>Rascunho com 1 mudança, ainda não mandada:</strong> o culto de oração de terça passa das 19h30 para as 19h. As congregações só veem depois de “Mandar”.', 'alerta');
  const vai = r28Vai(p, [['envelope', '<strong>As 45 congregações recebem a agenda nova</strong>, que vale a partir de domingo, 06/12. O site muda sozinho.'], ['check', 'As mudanças que a Geral já aceitou continuam: 3 congregações têm uma.'], ['mais', 'Os cultos que cada congregação acrescentou continuam: 18 congregações têm algum.'], ['sino', 'Cada dirigente recebe um aviso do que mudou.']], cel);
  const bt = r21Ouro(p, 'Mandar para as 45 congregações', 'envelope', cel ? 44 : 42);
  const nums = r29Nums(p, [r32Num('4', 'cultos no padrão'), r32Num('3', 'com mudança aceita'), r32Num('18', 'com culto acrescentado'), r32Num('3', 'pedidos esperando', 'ouro')].slice(cel ? 1 : 0), cel);
  if (cel) return r32EsCel(p, 'Agenda padrão', `${rasc}${r32Car(p, 'A semana de todas as congregações', r28Mais(p, '+ Culto'), [R33_PADRAO[0], R33_PADRAO[1], ['Terça', '19h', 'Culto de oração · era 19h30'], R33_PADRAO[3]].map((x, i) => r33Culto(p, x, i, r32Lapis(p), { sel: i === 2, alt: 44 })).join(''), 1)}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${bt}`);
  const tit = r18Tit(p, 'A agenda padrão da semana', `a Geral monta e manda para todas as congregações · elas não mexem no padrão · ${R33_HOJE}`, m8Linha(p, 'Pedidos de mudança · 3', 'bandeja'));
  return r33Es(p, 'geral', 'Agenda padrão', `${tit}${nums}${rasc}${r17Dois(r32Car(p, 'A semana de todas as congregações', r18Etiq(p, 'tocar num culto muda', 'azul'), sem), r18Col(r32Car(p, 'O que vai acontecer', '', vai), bt), '2.1fr 1fr')}`, ['Agenda padrão']);
}
// a congregação: o padrão travado, os acrescentados por ela e os pontos de culto
function r33CultosLocal(p, cel) {
  const pad = R33_PADRAO.map((x, i) => r33Culto(p, x, i, i === 3 ? r18Etiq(p, cel ? 'pedido: 20h' : 'pedido: 20h · esperando a Geral', 'ouro') : (cel ? r33Trava(p) : r28Mais(p, 'Pedir mudança')), { alt: cel ? 40 : 42 })).join('');
  const padrao = r32Car(p, 'Agenda padrão da Geral', cel ? r33Trava(p) : r18Etiq(p, 'não se mexe aqui', 'azul'), `${pad}${r20Nota(p, cel ? 'Para mudar um, toque nele e peça à Geral.' : 'Veio da Geral, igual para todas as congregações. Para mudar um culto, toque em “Pedir mudança”: a Geral aceita ou recusa.')}`, cel);
  const acr = r32Car(p, 'Acrescentados por Vila Nova', r28Mais(p, '+ Acrescentar culto'), R33_ACRESC_VN.map((x, i) => r33Culto(p, x, i, cel ? '' : r32Lapis(p), { sub: cel ? x[2] : `${x[2]} · ${x[3]}`, alt: cel ? 40 : 42 })).join(''), cel);
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${padrao}${acr}${r32PontosEdit(p, 1)}${r21Ouro(p, 'Está tudo certo', 'check', 44)}`);
  const dir = `<div style="display:flex;flex-direction:column;gap:6px"><strong style="font-size:14.5px;color:${p.titulo}">Como aparece no site</strong>${r32Site(p)}${r20Nota(p, 'O padrão e os acrescentados, juntos. Enquanto a Geral não responde, o site mostra a quinta às 19h30.')}<div style="display:flex;align-items:center;gap:10px;padding-top:4px"><span style="flex:1;font-size:12.5px;color:${p.suave}">Conferido pela última vez em 14/05/2026</span>${r21Ouro(p, 'Está tudo certo', 'check', 40)}</div></div>`;
  const tit = r18Tit(p, 'Cultos e pontos de culto de Vila Nova', `a agenda padrão vem da Geral · a congregação acrescenta os dela · ${R33_HOJE}`);
  return r33Es(p, 'local', 'Cultos e pontos', `${tit}${r17Dois(r18Col(padrao, acr, r32PontosEdit(p, 0)), dir, '1.15fr 1fr')}`, ['Vila Nova', 'Cultos e pontos de culto'], R32_USU.sec);
}
// a congregação pede para mudar um culto do padrão
function r33Pedir(p, cel) {
  const campos = `${r17Campo(p, 'O culto do padrão', 'Quinta, 19h30 · Culto de ensino', { icone: 'cadeado', auto: 1 })}<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12.5px;font-weight:600;color:${p.titulo}">O que mudar</span>${r33Esc(p, ['A hora', 'O dia', 'Não fazer aqui'], 'A hora')}</div>${r17Campo(p, 'A hora nova', '20h', { icone: 'relogio', nota: 'era 19h30' })}${r33Texto(p, 'Por quê (a Geral lê)', 'Muitos irmãos saem do turno da mina às 19h e não chegam a tempo. Às 20h a igreja enche.', cel ? 58 : 60)}`;
  const vai = r28Vai(p, [['envelope', 'O pedido vai para a Secretaria Geral.'], ['relogio', 'Até ela responder, vale o padrão: quinta, às 19h30.'], ['check', 'Aceito, só Vila Nova muda, e o site mostra as 20h sozinho.'], ['fechar', 'Recusado, você vê o motivo que a Geral escreveu.']], cel);
  const bt = r21Ouro(p, 'Mandar o pedido à Geral', 'envelope', cel ? 44 : 42);
  if (cel) return r32EsCel(p, 'Pedir mudança', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${bt}`);
  const tit = r18Tit(p, 'Pedir mudança de um culto do padrão', `quem decide é a Secretaria Geral · ${R33_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r33Es(p, 'local', 'Cultos e pontos', `${tit}${r17Dois(r32Car(p, 'O pedido', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), bt), '1.15fr 1fr')}`, ['Vila Nova', 'Pedir mudança'], R32_USU.sec);
}
// a congregação acrescenta um culto: entra na hora
function r33Acrescentar(p, cel) {
  const campos = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Dia', 'Sexta', { icone: 'calendario' })}${r17Campo(p, 'Hora', '15h', { icone: 'relogio' })}</div>${r17Campo(p, 'Nome do culto', 'Círculo de oração')}${r17Campo(p, 'Repete', 'Toda semana')}`;
  const vai = r28Vai(p, [['check', '<strong>Entra na hora</strong>, sem esperar ninguém, e o site já mostra.'], ['grafico', 'A Geral vê no painel que Vila Nova acrescentou um culto.'], ['lapis', 'Os acrescentados, a própria congregação muda ou tira quando quiser.']], cel);
  const bt = r21Ouro(p, 'Acrescentar', 'mais', cel ? 44 : 42);
  const toast = r30Toast(p, 'Acrescentado. O site já mostra sexta, às 15h.', cel);
  if (cel) return r32EsCel(p, 'Acrescentar culto', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${bt}${toast}`).replace('padding:12px 14px;display:flex;flex-direction:column;gap:10px">', 'padding:12px 14px;display:flex;flex-direction:column;gap:10px;position:relative">');
  const tit = r18Tit(p, 'Acrescentar um culto em Vila Nova', `fora do padrão da Geral, só desta congregação · ${R33_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r33Es(p, 'local', 'Cultos e pontos', `${tit}${r17Dois(r32Car(p, 'O culto novo', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), bt), '1.15fr 1fr')}${toast}`, ['Vila Nova', 'Acrescentar culto'], R32_USU.sec);
}
// a área acompanha as 12 congregações (quem responde aos pedidos é a Geral)
function r33CultosArea(p, cel) {
  const extra = { '7': ['1 acrescentado', '1 esperando a Geral'], '15': ['1 acrescentado', ''], '36': ['', '1 esperando a Geral'], '24': ['', 'aceito: domingo, 18h30'], '33': ['2 acrescentados', ''] };
  const L = R32_CONG_A2.concat(R32_CONG_A2_MAIS).sort((a, b) => a[0] - b[0]).map(x => { const e = extra[x[0]] || ['', '']; return [x[0], x[1], e[0] || '<span style="opacity:.55">nenhum</span>', e[1] ? r18Etiq(p, e[1], /esperando/.test(e[1]) ? 'ouro' : 'verde') : '<span style="opacity:.55">segue o padrão</span>']; });
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${r16aAviso(p, '2 pedidos de mudança da Área 2 esperam a Geral. Quem responde é ela.')}${r16aListaCel(p, L.filter(x => /acresc|esper|aceito/.test(x[2] + x[3])).map(x => [`${x[0]} · ${x[1]}`, x[2].replace(/<[^>]*>/g, ''), x[3].startsWith('<span style="opacity') ? '' : x[3]]))}`);
  const tab = r16aTab(p, '44px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr)', ['Nº', 'Congregação', 'Acrescentados', 'Mudança do padrão'], L);
  const tit = r18Tit(p, 'Cultos e pontos de culto da Área 2', `o padrão vem da Geral · aqui, o que cada congregação acrescentou ou pediu · ${R33_HOJE}`);
  return r33Es(p, 'area', 'Cultos e pontos', `${tit}${r16aAviso(p, '<strong>2 pedidos de mudança da Área 2 esperam a Geral</strong> (Vila Nova e Recanto). A área acompanha; quem aceita ou recusa é a Secretaria Geral.')}${tab}`, ['Área 2', 'Cultos e pontos de culto']);
}
// a Geral aceita ou recusa um pedido de mudança
function r33Pedidos(p, cel) {
  const lista = r32Car(p, 'Pedidos de mudança', r18Etiq(p, '3', 'ouro'), R33_PEDIDOS.map((x, i) => r28Pes(p, r32Ic(p, 'relogio', 'ouro'), `${x[0]} · ${x[1]}`, cel ? x[3] : `${x[2].split(' · ')[0]} → ${x[3]}`, cel ? r28Mais(p, '›') : '', { i, alt: 50, sel: !cel && i === 0 })).join(''), cel);
  const aberto = (c) => `${r31Fatos(p, [['Do padrão', 'quinta, 19h30 · Culto de ensino'], ['O pedido', '<strong>passar para as 20h</strong>, só em Vila Nova'], ['Por quê', 'Muitos irmãos saem do turno da mina às 19h e não chegam a tempo. Às 20h a igreja enche.'], ['Pedido por', 'Débora Lima, secretária, em 28/11']], c)}`;
  const bts = `${r21Ouro(p, 'Aceitar', 'check', cel ? 44 : 42)}${r21Linha(p, 'Recusar', 'fechar')}`;
  const acr = r32Car(p, 'Cultos acrescentados nesta semana', r18Etiq(p, 'só para saber', 'azul'), R33_ACRESC_SEMANA.map((x, i) => r28Pes(p, r32Ic(p, 'mais'), x[0], `${x[1]} · em ${x[2]}`, '', { i, alt: 44 })).join(''), cel);
  if (cel) return r32EsCel(p, 'Pedidos de mudança', `${r32Car(p, 'Vila Nova · Área 2', r18Etiq(p, 'para responder', 'ouro'), aberto(1), 1)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${bts}</div>${r16aListaCel(p, R33_PEDIDOS.slice(1).map(x => [`${x[0]} · ${x[1]}`, x[3], r28Mais(p, '›')]))}`);
  const abertoCar = r32Car(p, 'Vila Nova · Área 2', r18Etiq(p, 'para responder', 'ouro'), `${aberto(0)}<div style="display:flex;gap:10px;padding-top:6px">${bts.replace('justify-content:center', 'justify-content:center;flex:1.4')}</div>${r20Nota(p, 'Aceito, só Vila Nova muda; as outras congregações continuam no padrão, e o site muda sozinho. “Recusar” pede o motivo, que a secretaria de Vila Nova vê.')}`);
  const tit = r18Tit(p, 'Pedidos de mudança da agenda padrão', `as congregações pedem, e a Geral aceita ou recusa · ${R33_HOJE}`);
  return r33Es(p, 'geral', 'Agenda padrão', `${tit}${r17Dois(r18Col(lista, acr), abertoCar, '1fr 1.2fr')}`, ['Agenda padrão', 'Pedidos de mudança']);
}
const r33Cultos = (p, k, d) => { const cel = ehCel(d); return k === 'geral' ? r33Padrao(p, cel) : k === 'pedidos' ? r33Pedidos(p, cel) : k === 'pedir' ? r33Pedir(p, cel) : k === 'acrescentar' ? r33Acrescentar(p, cel) : k === 'area' ? r33CultosArea(p, cel) : r33CultosLocal(p, cel); };
const PERFIS33_CULTOS = [['geral', 'Secretaria Geral · monta a agenda padrão'], ['local', 'Secretaria de Vila Nova · a agenda'], ['acrescentar', 'Vila Nova · acrescenta um culto'], ['pedir', 'Vila Nova · pede uma mudança'], ['pedidos', 'Secretaria Geral · aceita ou recusa'], ['area', 'Pastor da Área 2 · acompanha']];
