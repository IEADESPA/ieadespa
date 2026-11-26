/* ---------------- 3. A AGENDA: O ÚLTIMO DOMINGO E A CEIA GERAL (só o acréscimo da 34) ---------------- */
// Decidido por ele (25/11, sobre a 34 aprovada): no último domingo do mês, à tarde, a reunião do Ministério; à noite, a
// ceia local. É o último: o 5º quando o mês tem 5, o 4º quando tem 4 (a agenda tem a regra, não um número fixo). A ceia geral
// é a cada 3 ou 4 meses, nas datas que a Geral marca; naquele domingo não há ceia local (a agenda troca sozinha).
// Sem tela nova: o cartão dos domingos da agenda padrão ganha a regra, a Geral marca as datas, e a congregação vê a troca.
// Os nomes dos outros domingos continuam os de mentira da 34. Hoje, nos desenhos, é 02/12/2026.
// o tipo de cada domingo, agora com o último: [qual, na Sede, nas congregações, linha de baixo]
const R35_DOM = [['1º', 'Culto da família', 'Culto da família'], ['2º', 'Culto de missões', 'Culto de missões'], ['3º', 'Culto da vitória', 'Culto evangelístico'], ['4º', 'Culto de louvor', 'Culto de louvor', 'só quando o mês tem 5 domingos'], ['Último', 'Santa Ceia (a ceia local)', 'Santa Ceia (a ceia local)', 'e à tarde, às 15h, a reunião do Ministério']];
// os próximos meses: [mês, [dia, índice em R35_DOM, ceia geral?]]
const R35_MESES = [['Dezembro de 2026', [['06', 0], ['13', 1], ['20', 2], ['27', 4]]], ['Janeiro de 2027', [['03', 0], ['10', 1], ['17', 2], ['24', 3], ['31', 4]]], ['Fevereiro de 2027', [['07', 0], ['14', 1], ['21', 2], ['28', 4, 1]]]];
const R35_CG = [['28/02/2027', 'marcada'], ['30/05/2027', 'marcada'], ['29/08/2027', 'marcada'], ['28/11/2027', 'nova']];
const r35Num = (p, t, ouro) => `<span style="min-width:46px;height:28px;padding:0 6px;border-radius:8px;flex:none;box-sizing:border-box;background:${ouro ? '#FFF4D1' : '#DCFCE7'};color:${ouro ? '#8A5A00' : R32_VERDE};font-size:12.5px;font-weight:800;display:flex;align-items:center;justify-content:center">${t}</span>`;
// o cartão dos domingos (Geral), com a regra do último
function r35TabDom(p, cel) {
  return R35_DOM.map((x, i) => r28Pes(p, r35Num(p, x[0], i === 4), x[1] === x[2] ? x[2] : (cel ? `${x[2]} · Sede: ${x[1]}` : `${x[2]} · na Sede, ${x[1]}`), x[3] || (x[1] === x[2] ? 'na Sede e nas congregações' : 'nas congregações'), cel ? '' : r32Lapis(p), { i, alt: cel ? 42 : 46, sel: !cel && i === 4 })).join('');
}
// um mês, domingo a domingo (cel: compacto)
const r35Mes = (p, m, col, cel) => `<div style="display:flex;flex-direction:column;min-width:0"><strong style="font-size:13px;color:${p.titulo};padding-bottom:4px">${m[0]}</strong>${m[1].map((d, i) => { const x = R35_DOM[d[1]]; const geral = d[2]; return `<div style="display:flex;gap:8px;align-items:baseline;padding:${cel ? 4 : 5}px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><strong style="width:22px;flex:none;font-size:13px;color:${geral ? '#8A5A00' : R32_VERDE}">${d[0]}</strong><span style="min-width:0;font-size:12.5px;line-height:1.3;color:${p.texto}">${geral ? `<strong style="color:#8A5A00">Ceia geral, na Sede</strong><span style="display:block;font-size:11px;color:${p.suave}">não há ceia local</span>` : d[1] === 4 ? `<strong style="color:${p.titulo}">Santa Ceia</strong><span style="display:block;font-size:11px;color:${p.suave}">último domingo · 15h, Ministério</span>` : x[col]}</span></div>`; }).join('')}</div>`;
function r35AgGeral(p, cel) {
  const regra = r20Nota(p, cel ? 'O último é o 5º quando o mês tem 5, e o 4º quando tem 4.' : 'O último domingo é uma regra, não um número: é o 5º quando o mês tem 5 domingos e o 4º quando tem 4. O 4º com tipo próprio só existe nos meses de 5.');
  const cgs = r32Car(p, 'Ceias gerais de 2027', r28Mais(p, cel ? 'Marcar ›' : '+ Marcar data'), `<div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:2px">${R35_CG.slice(0, 3).map(x => r18Etiq(p, x[0].slice(0, 5), 'ouro')).join('')}</div>${r20Nota(p, 'Naquele domingo, a ceia local sai sozinha da agenda de cada igreja.')}`, cel);
  if (cel) return r32EsCel(p, 'Os domingos do mês', `${r32Car(p, 'O culto das 18h, domingo a domingo', '', r35TabDom(p, 1), 1)}${regra}${cgs}${r21Ouro(p, 'Guardar no rascunho', 'check', 44)}`);
  const esq = r18Col(r32Car(p, 'O culto das 18h: o tipo de cada domingo', r18Etiq(p, 'o último é regra', 'ouro'), `${r35TabDom(p, 0)}<div style="padding-top:6px">${regra}</div>`), cgs);
  const dir = r18Col(r32Car(p, 'Como fica nos próximos meses', r18Etiq(p, 'nas congregações', 'verde'), `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-top:4px">${R35_MESES.map(m => r35Mes(p, m, 2)).join('')}</div>`), r21Ouro(p, 'Guardar no rascunho da agenda', 'check', 42));
  const tit = r18Tit(p, 'Os domingos do mês: o tipo do culto das 18h', `com a regra do último domingo e as ceias gerais · ${R33_HOJE}`, m8Linha(p, 'Voltar à agenda', 'voltar'));
  return r35Es(p, 'geral', 'Agenda padrão', `${tit}${r17Dois(esq, dir, '1.05fr 1fr')}`, ['Agenda padrão', 'Os domingos do mês']);
}
// a Geral marca as datas das ceias gerais
function r35AgCg(p, cel) {
  const lista = r32Car(p, 'As ceias gerais de 2027', r18Etiq(p, 'a cada 3 meses', 'azul'), R35_CG.map((x, i) => r28Pes(p, r32Ic(p, 'calendario', 'ouro'), `${x[0]} · último domingo, 18h`, i === 3 ? 'marcando agora' : 'na Sede · a ceia local sai sozinha', i === 3 ? r18Etiq(p, 'nova', 'ouro') : (cel ? '' : r32Lapis(p)), { i, alt: cel ? 42 : 46, sel: i === 3 })).join(''), cel);
  const campos = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'O domingo', '28/11/2027', { icone: 'calendario', nota: cel ? '' : 'último do mês' })}${r17Campo(p, 'A hora', '18h', { icone: 'relogio' })}</div>${r17Campo(p, 'Onde', 'Na Sede', { icone: 'igreja' })}`;
  const vai = r28Vai(p, [['igreja', '<strong>Em 28/11, a Sede e as 44 congregações não fazem a ceia local:</strong> a agenda de cada uma mostra a ceia geral no lugar.'], ['calendario', 'O site de cada igreja mostra a ceia geral naquele domingo.'], ['relogio', 'A reunião do Ministério, à tarde, continua.']], cel);
  if (cel) return r32EsCel(p, 'Ceias gerais', `${lista}${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r21Ouro(p, 'Marcar a ceia geral', 'check', 44).replace('justify-content:center', 'justify-content:center;flex:none')}`);
  const tit = r18Tit(p, 'As ceias gerais', `a Geral marca as datas · naquele domingo não há ceia local · ${R33_HOJE}`, m8Linha(p, 'Voltar à agenda', 'voltar'));
  return r35Es(p, 'geral', 'Agenda padrão', `${tit}${r17Dois(lista, r18Col(r32Car(p, 'Marcar uma ceia geral', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r32Car(p, 'O que vai acontecer', '', vai), r21Ouro(p, 'Marcar a ceia geral', 'check', 42)), '1fr 1.1fr')}`, ['Agenda padrão', 'Ceias gerais']);
}
// a congregação vê a troca: o último domingo e a ceia geral de fevereiro
function r35AgLocal(p, cel) {
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${r32Car(p, 'Os próximos domingos · 18h', r18Etiq(p, 'veio da Geral', 'azul'), `<div style="display:flex;flex-direction:column;gap:6px">${r35Mes(p, R35_MESES[0], 2, 1)}${r35Mes(p, ['Fevereiro de 2027', R35_MESES[2][1].slice(2)], 2, 1)}</div>`, 1)}${r16aAviso(p, '<strong>28/02: ceia geral, na Sede.</strong> Não há Santa Ceia em Vila Nova nesse domingo.', 'alerta')}`);
  const site = `<div style="border:1px solid ${p.borda};border-radius:12px;overflow:hidden;background:#FFFFFF;flex:none"><div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0A2342">${logo(18)}<span style="font-size:11.5px;color:#C9D4E3">ieadespa.org.br/vila-nova · como aparece no site</span></div><div style="padding:6px 12px;font-size:12.5px;line-height:1.5;color:#3B4A63"><strong style="color:#0A2342">Domingo, 27/12, às 18h: Santa Ceia</strong> · no último domingo de cada mês<br>Domingo, 28/02, às 18h: <strong style="color:#0A2342">Ceia geral, na Sede</strong> (não há Santa Ceia em Vila Nova)</div></div>`;
  const tit = r18Tit(p, 'Os domingos de Vila Nova', `o tipo de cada domingo vem da agenda padrão da Geral · ${R33_HOJE}`);
  return r35Es(p, 'local', 'Cultos e pontos', `${tit}${r32Car(p, 'Os próximos domingos · culto das 18h', r18Etiq(p, 'veio da Geral', 'azul'), `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding-top:4px">${R35_MESES.map(m => r35Mes(p, m, 2)).join('')}</div>`)}${r17Dois(r16aAviso(p, '<strong>28/02/2027: ceia geral, na Sede, às 18h.</strong> Nesse domingo não há Santa Ceia em Vila Nova: a agenda trocou sozinha. A reunião do Ministério, às 15h, continua.', 'alerta'), site, '1fr 1.2fr')}`, ['Vila Nova', 'Cultos e pontos de culto'], R32_USU.sec);
}
// o membro vê, em Minha congregação, os próximos domingos
function r35AgMembro(p, cel) {
  const L = [['27/12', 'Santa Ceia', 'último domingo do mês, às 18h', 0], ['03/01', 'Culto da família', 'às 18h', 0], ['31/01', 'Santa Ceia', 'último domingo do mês, às 18h', 0], ['28/02', 'Ceia geral, na Sede', 'às 18h · não há Santa Ceia em Vila Nova', 1]];
  const lista = L.map((x, i) => r28Pes(p, r32Ic(p, 'calendario', x[3] ? 'ouro' : ''), `${x[0]} · ${x[1]}`, x[2], '', { i, alt: cel ? 44 : 48, sel: x[3] })).join('');
  if (cel) return r28MvCel(p, 'Minha congregação', `${r32Car(p, 'Vila Nova · os próximos domingos', '', lista, 1)}${r20Nota(p, 'A ceia geral é na Sede. Nesse domingo, Vila Nova não tem a Santa Ceia dela.')}${r28Mais(p, 'Ver todos os cultos ›')}`);
  const tit = r18Tit(p, 'Minha congregação: Vila Nova', `os próximos domingos, como no site · ${R33_HOJE}`);
  return r28Mv(p, { ini: 'CS', nome: 'Célia Santos', papel: 'Membro · Vila Nova' }, ['Minha congregação'], `${tit}${r17Dois(r32Car(p, 'Os próximos domingos', '', lista), r32Car(p, 'A ceia geral', r18Etiq(p, '28/02', 'ouro'), r28Vai(p, [['igreja', 'É na Sede, às 18h, com todas as igrejas juntas.'], ['calendario', 'Nesse domingo, Vila Nova não tem a Santa Ceia dela.']])), '1.2fr 1fr')}`);
}
const r35Agenda = (p, k, d) => { const cel = ehCel(d); return k === 'cgeral' ? r35AgCg(p, cel) : k === 'local' ? r35AgLocal(p, cel) : k === 'membro' ? r35AgMembro(p, cel) : r35AgGeral(p, cel); };
const PERFIS35_AGENDA = [['geral', 'Secretaria Geral · os domingos com o último'], ['cgeral', 'Secretaria Geral · marca as ceias gerais'], ['local', 'Secretaria de Vila Nova · a troca na agenda'], ['membro', 'Membro de Vila Nova · os próximos domingos']];
