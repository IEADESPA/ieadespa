/* ---------------- 4. A AGENDA: A CEIA GERAL É NO SÁBADO (só a correção da 35) ---------------- */
// Ele (26/11, sobre a 35 aprovada): a ceia geral é no SÁBADO, não no domingo. No fim de semana dela, o domingo da
// congregação não tem a ceia local: é um culto local comum (o "culto alternativo"). O resto da agenda da 35 continua.
// Decidido pela sessão (para conferir): a Geral marca o sábado que vem antes do último domingo; a ceia geral é às 19h, na
// Sede; a reunião do Ministério, no domingo à tarde, continua. Hoje, nos desenhos, é 02/12/2026.
// as ceias gerais de 2027: [sábado, o domingo seguinte, situação]
const R36_CG = [['27/02/2027', '28/02', 'marcada'], ['29/05/2027', '30/05', 'marcada'], ['28/08/2027', '29/08', 'marcada'], ['27/11/2027', '28/11', 'nova']];
// o fim de semana da ceia geral, como cada igreja vê: [dia, hora, o quê, detalhe, tom]
const R36_FDS = [['Sáb 27/02', '19h', 'Ceia geral, na Sede', 'todas as igrejas juntas', 'ouro'], ['Dom 28/02', '15h', 'Reunião do Ministério', 'como em todo último domingo', ''], ['Dom 28/02', '18h', 'Culto local (o culto alternativo)', 'não há ceia local neste domingo', 'verde']];
const r36Fds = (p, cel) => R36_FDS.map((x, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 48 : 52}px;${i ? `border-top:1px solid ${p.linha};` : ''}">${r35Num(p, x[0].slice(0, 3), x[4] === 'ouro')}<div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:13.5px;font-weight:700;color:${x[4] === 'ouro' ? '#8A5A00' : p.titulo}">${x[2]}</div><div style="font-size:12px;color:${p.suave}">${x[0].slice(4)}, às ${x[1]} · ${x[3]}</div></div></div>`).join('');
function r36AgGeral(p, cel) {
  const lista = r32Car(p, 'As ceias gerais de 2027', r18Etiq(p, 'sempre no sábado', 'ouro'), R36_CG.slice(cel ? 1 : 0).map((x, j, A) => { const i = cel ? j + 1 : j; return r28Pes(p, r32Ic(p, 'calendario', 'ouro'), `Sábado, ${x[0]} · 19h, na Sede`, i === 3 ? 'marcando agora' : `no domingo ${x[1]}, culto local, sem ceia local`, i === 3 ? r18Etiq(p, 'nova', 'ouro') : (cel ? '' : r32Lapis(p)), { i: j, alt: cel ? 42 : 46, sel: i === 3 }); }).join(''), cel);
  const campos = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'O sábado', '27/11/2027', { icone: 'calendario', nota: cel ? '' : 'antes do último domingo' })}${r17Campo(p, 'A hora', '19h', { icone: 'relogio' })}</div>${r17Campo(p, 'Onde', 'Na Sede', { icone: 'igreja' })}`;
  const vai = r28Vai(p, [['igreja', '<strong>Sábado, 27/11:</strong> a ceia geral na Sede, com todas as igrejas.'], ['calendario', '<strong>Domingo, 28/11:</strong> a Sede e as 44 congregações não fazem a ceia local. O culto das 18h vira um culto local comum (o culto alternativo).'], ['relogio', 'A reunião do Ministério, no domingo à tarde, continua.']], cel);
  if (cel) return r32EsCel(p, 'Ceias gerais', `${lista}${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r21Ouro(p, 'Marcar a ceia geral', 'check', 44).replace('justify-content:center', 'justify-content:center;flex:none')}`);
  const tit = r18Tit(p, 'As ceias gerais', `a Geral marca o sábado · no domingo seguinte não há ceia local · ${R33_HOJE}`, m8Linha(p, 'Voltar à agenda', 'voltar'));
  return r36Es(p, 'geral', 'Agenda padrão', `${tit}${r17Dois(lista, r18Col(r32Car(p, 'Marcar uma ceia geral', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r32Car(p, 'O que vai acontecer', '', vai), r21Ouro(p, 'Marcar a ceia geral', 'check', 42)), '1fr 1.1fr')}`, ['Agenda padrão', 'Ceias gerais']);
}
// a congregação: o fim de semana da ceia geral e os próximos domingos
const R36_DOMS = [['31/01', 'Santa Ceia (a ceia local)', 'último domingo do mês'], ['07/02', 'Culto da família', '1º domingo'], ['14/02', 'Culto de missões', '2º domingo'], ['21/02', 'Culto evangelístico', '3º domingo'], ['28/02', 'Culto local (o culto alternativo)', 'último domingo · sem ceia local']];
function r36AgLocal(p, cel) {
  const doms = R36_DOMS.map((x, i) => r28Pes(p, r35Num(p, x[0].slice(0, 2), i === 4), x[1], x[2], '', { i, alt: cel ? 42 : 46, sel: i === 4 })).join('');
  const fds = r32Car(p, 'O fim de semana da ceia geral', r18Etiq(p, '27 e 28/02', 'ouro'), r36Fds(p, cel), cel);
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${fds}${r32Car(p, 'Os próximos domingos · 18h', r18Etiq(p, 'veio da Geral', 'azul'), doms, 1)}`);
  const site = `<div style="border:1px solid ${p.borda};border-radius:12px;overflow:hidden;background:#FFFFFF;flex:none"><div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0A2342">${logo(18)}<span style="font-size:11.5px;color:#C9D4E3">ieadespa.org.br/vila-nova · como aparece no site</span></div><div style="padding:6px 12px;font-size:12.5px;line-height:1.5;color:#3B4A63"><strong style="color:#0A2342">Sábado, 27/02, às 19h: Ceia geral, na Sede</strong><br>Domingo, 28/02, às 18h: culto em Vila Nova (não há ceia local)</div></div>`;
  const tit = r18Tit(p, 'Os domingos de Vila Nova', `o tipo de cada domingo vem da agenda padrão da Geral · ${R33_HOJE}`);
  return r35Es(p, 'local', 'Cultos e pontos', `${tit}${r17Dois(r18Col(fds, site), r32Car(p, 'Os próximos domingos · culto das 18h', r18Etiq(p, 'veio da Geral', 'azul'), doms), '1fr 1.1fr')}`, ['Vila Nova', 'Cultos e pontos de culto'], R32_USU.sec);
}
// o membro vê, em Minha congregação, o fim de semana da ceia geral
function r36AgMembro(p, cel) {
  const L = [['31/01', 'Santa Ceia', 'domingo, às 18h, em Vila Nova', 0], ['27/02', 'Ceia geral, na Sede', 'sábado, às 19h · todas as igrejas juntas', 1], ['28/02', 'Culto em Vila Nova', 'domingo, às 18h · não há ceia local', 0]];
  const lista = L.map((x, i) => r28Pes(p, r32Ic(p, 'calendario', x[3] ? 'ouro' : ''), `${x[0]} · ${x[1]}`, x[2], '', { i, alt: cel ? 44 : 48, sel: x[3] })).join('');
  if (cel) return r28MvCel(p, 'Minha congregação', `${r32Car(p, 'Vila Nova · os próximos', '', lista, 1)}${r20Nota(p, 'A ceia geral é no sábado, na Sede. No domingo seguinte, Vila Nova tem culto, sem ceia local.')}${r28Mais(p, 'Ver todos os cultos ›')}`);
  const tit = r18Tit(p, 'Minha congregação: Vila Nova', `os próximos cultos, como no site · ${R33_HOJE}`);
  return r28Mv(p, { ini: 'CS', nome: 'Célia Santos', papel: 'Membro · Vila Nova' }, ['Minha congregação'], `${tit}${r17Dois(r32Car(p, 'Os próximos', '', lista), r32Car(p, 'A ceia geral', r18Etiq(p, 'sábado, 27/02', 'ouro'), r28Vai(p, [['igreja', 'É no sábado, na Sede, às 19h, com todas as igrejas juntas.'], ['calendario', 'No domingo seguinte, Vila Nova tem o culto das 18h, sem ceia local.']])), '1.2fr 1fr')}`);
}
const r36Agenda = (p, k, d) => { const cel = ehCel(d); return k === 'local' ? r36AgLocal(p, cel) : k === 'membro' ? r36AgMembro(p, cel) : r36AgGeral(p, cel); };
const PERFIS36_AGENDA = [['geral', 'Secretaria Geral · marca a ceia geral no sábado'], ['local', 'Secretaria de Vila Nova · o fim de semana da ceia geral'], ['membro', 'Membro de Vila Nova · os próximos cultos']];
