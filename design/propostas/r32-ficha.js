/* ---------------- 1. A FICHA DA CONGREGAÇÃO (E A DA ÁREA) ---------------- */
// Uma página por congregação: o número de abertura, a diretoria com o mandato, os cultos, os pontos de culto, o endereço
// e os números de pessoas. Cada um vê a sua parte: o membro, o endereço, os horários e o dirigente; a secretaria, os números
// de pessoas; o dinheiro e o patrimônio, só a tesouraria e a Geral. O pastor de área abre a ficha da área.
const R32_CONG_A2_MAIS = [['30', 'Morada do Sol', 'Ev. Rogério Dias', 0, 'em dia', 'verde'], ['33', 'Shalom', 'Pb. Natan Ribeiro', 0, 'em dia', 'verde'], ['36', 'Recanto', 'Ev. Caio Barbosa', 1, 'secretário vago', 'ouro'], ['40', 'Morro Verde', 'Pb. Lauro Freitas', 0, 'em dia', 'verde']];
const r32Abas = (p, itens, ativo) => `<div style="display:flex;gap:2px;border-bottom:1px solid ${p.borda};flex:none">${itens.map(t => `<span style="height:36px;padding:0 14px;display:flex;align-items:center;white-space:nowrap;font-size:14px;font-weight:${t === ativo ? 700 : 500};color:${t === ativo ? p.titulo : p.suave};${t === ativo ? `box-shadow:inset 0 -3px 0 ${R32_VERDE};` : ''}">${t}</span>`).join('')}</div>`;
const r32Pils = (p, itens, ativo) => `<div style="display:flex;gap:6px;flex:none;overflow:hidden">${itens.map(t => r31Chip(p, t, ativo === true || t === ativo)).join('')}</div>`;
const r32Av = (p, ini, t) => r28Av(p, ini, 'Crianças', t);
function r32DirLinhas(p, L, cel, vagoSub) {
  return L.map((x, i) => (x[1]
    ? r28Pes(p, r32Av(p, x[2], cel ? 30 : 32), x[1], x[0], cel ? '' : r20Nota(p, 'até 31/12/2026'), { i, alt: cel ? 42 : 44 })
    : r28Pes(p, r32Ic(p, 'maleta', 'verm'), x[0], vagoSub || 'vago desde 25/11 · o Carlos saiu', r28Mais(p, 'Preencher ›'), { i, alt: cel ? 42 : 44 }))).join('');
}
const r32CultoLinhas = (p, L, cel) => L.map((x, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 34 : 38}px;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="width:${cel ? 104 : 112}px;flex:none;font-size:13px;font-weight:700;color:${p.titulo}">${x[0]}, ${x[1]}</span><span style="flex:1;min-width:0;font-size:13px;color:${p.texto};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[2]}</span></div>`).join('');
// o ponto de culto: a liderança vê o responsável e a casa; o membro e o site, só o bairro e o horário
const r32PontoLinhas = (p, cel, lider) => R32_PONTOS_VN.map((x, i) => r28Pes(p, r32Ic(p, 'casa'), `${x[0]} · ${x[1]}`, lider ? `${x[3]} · ${x[2]}` : 'culto no lar ligado a Vila Nova', '', { i, alt: cel ? 44 : 46 })).join('');
const r32Grade3 = (a, b, c, prop = '1.1fr 1fr 0.9fr') => `<div style="display:grid;grid-template-columns:${prop.split(' ').map(x => `minmax(0,${x})`).join(' ')};gap:14px;align-items:start">${a}${b}${c}</div>`;
const R32_END = [['Endereço', 'Rua Sete, 410 · bairro Vila Nova'], ['Cidade', 'Parauapebas - PA · 68515-000'], ['Telefone', '(94) 99100-0707 · secretaria'], ['No site', 'ieadespa.org.br/vila-nova']];
// a ficha no notebook: a congregação (local e Geral) ou a área (o pastor de área)
function r32FichaNote(p, k) {
  if (k === 'area') return r32FichaArea(p);
  const geral = k === 'geral';
  const dir = r32Car(p, 'Diretoria de 2026', r18Etiq(p, '1 vago', 'verm'), `${r32DirLinhas(p, R32_DIR_VN)}${r20Nota(p, 'Todo cargo vence em 31/12. Em dezembro, monte a diretoria de 2027.')}`);
  const cultos = r32Car(p, 'Cultos', r28Mais(p, 'Editar ›'), r32CultoLinhas(p, R32_CULTOS_VN));
  const pontos = r32Car(p, 'Pontos de culto', r18Etiq(p, '2', 'verde'), r32PontoLinhas(p, 0, 1));
  const end = r32Car(p, 'Endereço e contato', r28Mais(p, 'Editar ›'), r31Fatos(p, R32_END));
  const gente = r32Car(p, 'As pessoas', r20Nota(p, 'o dirigente e a secretaria veem'), r31Fatos(p, geral ? [['Pessoas', '312 membros · 41 congregados · 58 crianças']] : [['Membros', '312, em comunhão 296'], ['Congregados', '41'], ['Crianças', '58']]));
  const din = geral
    ? r32Car(p, 'Dinheiro e patrimônio', '', `${r31Fatos(p, [['Novembro', 'R$ 18.420,00 repassados · fechado'], ['Patrimônio', 'templo próprio e 1 terreno']])}${r20Nota(p, 'Só a tesouraria e a Geral veem.')}`)
    : r16aAviso(p, 'O dinheiro e o patrimônio de Vila Nova ficam no Financeiro, para a tesouraria e a Geral.');
  const acoes = geral ? `${m8Linha(p, 'Mudar de área', 'transferir')}${m8Linha(p, 'Fechar ou juntar', 'saida')}` : m8Linha(p, 'Ver no site', 'globo');
  const tit = r18Tit(p, 'Vila Nova · congregação nº 7', `Área 2 · aberta em 14/03/1998 · dados conferidos em 14/05/2026${geral ? ' · você vê tudo, como a Geral' : ''}`, acoes);
  return r32Es(p, k, 'Ficha da congregação', `${tit}${r32Abas(p, ['Resumo', 'Diretoria', 'Outros cargos', 'Cultos e pontos de culto', 'Endereço e site', 'Histórico'], 'Resumo')}${r32Grade3(r18Col(dir), r18Col(cultos, pontos), r18Col(end, gente, din))}`, geral ? ['Congregações', 'Vila Nova'] : ['Vila Nova']);
}
// a ficha da área, para o pastor de área: a diretoria da área e as 12 congregações pelo número
function r32FichaArea(p) {
  const dirA = r32Car(p, 'Diretoria da Área 2', r18Etiq(p, '1 vago', 'verm'), `${r32DirLinhas(p, [['Pastor de área', 'Pr. Davi Teixeira', 'DT'], ['Secretário da área', 'Elias Prado', 'EP'], ['Tesoureiro da área', '', '']], 0, 'vago desde 16/11 · a Sílvia saiu')}${r20Nota(p, 'A diretoria da área, o pastor de área põe; o dirigente que falta, você ou a Geral.')}`);
  const info = r32Car(p, 'A área', '', r31Fatos(p, [['Número', 'Área 2 · 12 congregações'], ['Pontos de culto', '19, em 11 congregações'], ['Pessoas', '2.104 membros e 266 congregados']]));
  const L = R32_CONG_A2.concat(R32_CONG_A2_MAIS).sort((a, b) => a[0] - b[0]);
  const tab = r16aTab(p, '40px minmax(0,1fr) minmax(0,1.1fr) 52px minmax(0,1.25fr)', ['Nº', 'Congregação', 'Dirigente', 'Vagos', 'Situação'], L.map(x => [x[0], x[1], x[2] || r18Etiq(p, 'sem dirigente', 'verm'), x[3] ? r18Etiq(p, String(x[3]), x[5] === 'verm' ? 'verm' : 'ouro') : '0', r18Etiq(p, x[4], x[5])]));
  const tit = r18Tit(p, 'Área 2 · ficha da área', `12 congregações, pela ordem do número de abertura · ${R32_HOJE}`, m8Linha(p, 'Ver no mapa', 'mapa'));
  return r32Es(p, 'area', 'Ficha da área', `${tit}${r17Dois(r18Col(dirA, info), tab, '0.85fr 1.6fr')}`, ['Área 2']);
}
// o membro: o endereço, os horários e o dirigente (da dele e das outras, como no site)
function r32FichaMembro(p, cel) {
  const end = r32Car(p, 'Onde fica', r28Mais(p, 'Como chegar ›'), `${r31Fatos(p, [['Endereço', 'Rua Sete, 410 · bairro Vila Nova'], ['Dirigente', 'Pr. Abel Nogueira'], ['Secretaria', '(94) 99100-0707']], cel)}`, cel);
  const cultos = r32Car(p, 'Os cultos', '', r32CultoLinhas(p, R32_CULTOS_VN, cel), cel);
  const pontos = r32Car(p, 'Os pontos de culto', '', r32PontoLinhas(p, cel, 0), cel);
  const outras = r32Car(p, 'As outras congregações', '', `${r17Campo(p, '', 'Procurar pelo nome ou pelo bairro', { icone: 'busca', vazio: 1 })}${[['Cidade Jardim · nº 9', '1,8 km · Ev. Marcos Pinto'], ['Bela Vista · nº 15', '2,6 km · Pb. Sérgio Alves'], ['Sede · nº 1', '4,1 km · Área 1, Distrito Sede']].map((x, i) => r28Pes(p, r32Ic(p, 'igreja'), x[0], x[1], r28Mais(p, 'Ver ›'), { i: i + 1, alt: 42 })).join('')}`, cel);
  if (cel) return r28MvCel(p, 'Minha congregação', `<div style="line-height:1.25;flex:none"><div style="font-size:18px;font-weight:800;color:${p.titulo}">Vila Nova</div><div style="font-size:12.5px;color:${p.suave}">congregação nº 7 · Área 2</div></div>${end}${cultos}${pontos}`);
  const tit = r18Tit(p, 'Minha congregação: Vila Nova', 'congregação nº 7 · Área 2 · o que você vê é o mesmo que está no site', m8Linha(p, 'Ver no site', 'globo'));
  return r28Mv(p, R32_MARTA, ['Minha congregação'], `${tit}${r32Grade3(r18Col(end, pontos), r18Col(cultos), r18Col(outras), '1fr 1fr 1fr')}`);
}
function r32FichaCel(p, k) {
  if (k === 'area') {
    const dirA = r32Car(p, 'Diretoria da Área 2', r18Etiq(p, '1 vago', 'verm'), r32DirLinhas(p, [['Pastor de área', 'Pr. Davi Teixeira', 'DT'], ['Secretário da área', 'Elias Prado', 'EP'], ['Tesoureiro da área', '', '']], 1, 'vago desde 16/11'), 1);
    const L = R32_CONG_A2.slice(0, 6).map(x => [`${x[0]} · ${x[1]}`, x[2] || 'sem dirigente', r18Etiq(p, x[4].replace(' desde 02/11', '').replace('sem conferir há 8 meses', 'conferir').replace('conferido há 6 meses', 'conferir'), x[5])]);
    return r32EsCel(p, 'Ficha da área', `${dirA}<div style="display:flex;align-items:center;flex:none"><strong style="flex:1;font-size:14.5px;color:${p.titulo}">As 12 congregações</strong>${r28Mais(p, 'Ver todas ›')}</div>${r16aListaCel(p, L)}`);
  }
  const geral = k === 'geral';
  const cab = `<div style="line-height:1.25;flex:none"><div style="font-size:18px;font-weight:800;color:${p.titulo}">Vila Nova · nº 7</div><div style="font-size:12.5px;color:${p.suave}">Área 2 · conferida em 14/05/2026</div></div>`;
  const dir = r32Car(p, 'Diretoria de 2026', r18Etiq(p, '1 vago', 'verm'), r32DirLinhas(p, R32_DIR_VN, 1), 1);
  const resto = r16aListaCel(p, [['Cultos', '5 por semana · domingo, terça, quinta e sábado', r28Mais(p, '›')], ['Pontos de culto', 'Altamira e Nova Carajás', r28Mais(p, '›')], geral ? ['Dinheiro e patrimônio', 'novembro: R$ 18.420,00 · fechado', r28Mais(p, '›')] : ['As pessoas', '312 membros · 41 congregados', r28Mais(p, '›')]]);
  return r32EsCel(p, 'Ficha da congregação', `${cab}${r32Pils(p, ['Resumo', 'Diretoria', 'Cultos', 'Endereço'], 'Resumo')}${dir}${resto}`);
}
const r32Ficha = (p, k, d) => (k === 'membro' ? r32FichaMembro(p, ehCel(d)) : ehCel(d) ? r32FichaCel(p, k) : r32FichaNote(p, k));
const PERFIS32_FICHA = [['membro', 'Membro · a minha congregação'], ['local', 'Dirigente de Vila Nova · a ficha dela'], ['area', 'Pastor da Área 2 · a ficha da área'], ['geral', 'Secretaria Geral · a ficha com o dinheiro']];
