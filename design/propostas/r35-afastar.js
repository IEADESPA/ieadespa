/* ---------------- 2. AFASTAR DO CARGO ---------------- */
// Decidido por ele (25/11): afastar do cargo tira só o acesso do cargo, e a pessoa continua membro ativo (entra no
// aplicativo: a carteirinha, as contribuições). Quem afasta é a secretaria do nível daquele cargo (o local, a secretaria
// local; o de área, a área; o geral, a Geral), com o motivo anotado; a Geral também pode tirar (volta 5). O cargo continua.
// Afastar do rol (afastado, licença, inativo) é outra coisa e tira também a entrada de membro. O exemplo: a secretaria de
// Vila Nova afasta o Marcos Vieira, 1º tesoureiro, em 01/02/2027; a 2ª tesoureira, Sueli, continua com o acesso.
const R35_MOTIVO = 'Pediu para se afastar até o fim de abril: vai trabalhar embarcado e fica 15 dias fora de cada vez.';
function r35AfastarForm(p, cel) {
  const campos = `${r17Campo(p, 'Quem', 'Marcos Vieira · 1º tesoureiro de Vila Nova', { icone: 'pessoa' })}${r17Campo(p, 'O cargo', '1º tesoureiro · mandato até 31/12/2027', { icone: 'cadeado', auto: 1 })}${r33Texto(p, 'Motivo (obrigatório; fica guardado e ele vê)', R35_MOTIVO, cel ? 56 : 58)}`;
  const vai = r28Vai(p, [['chave', '<strong>Ele perde na hora o acesso de 1º tesoureiro.</strong> Se estiver com o sistema aberto, sai do Financeiro.'], ['maleta', 'O cargo continua dele, marcado “afastado”. Depois, a secretaria devolve o acesso ou o dirigente põe outro no cargo.'], ['dinheiro', 'A 2ª tesoureira, Sueli Rocha, continua com o acesso dela e lança no lugar dele.']], cel);
  if (cel) return r32EsCel(p, 'Afastar do cargo', `${campos}${r35NaoRol(p, 1)}${r35Pin(p, 'Afastar com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'Afastar do cargo', `tira só o acesso do cargo · quem afasta é a secretaria de Vila Nova · ${R35_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'local', 'Diretoria e cargos', `${tit}${r17Dois(r32Car(p, 'Quem e por quê', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35NaoRol(p), r35Pin(p, 'Afastar com o meu PIN')), '1.15fr 1fr')}`, ['Vila Nova', 'Diretoria e cargos', 'Afastar do cargo'], R27_SEC.local);
}
// depois de afastar: a diretoria de 2027 com o cargo marcado e os dois caminhos (devolver ou pôr outro)
const R35_DIR_VN = [['Dirigente', 'Pr. Abel Nogueira', 'ok'], ['Vice-dirigente', 'Pb. Ivan Castro', 'ok'], ['1º secretário', 'Débora Lima', 'ok'], ['2º secretário', 'Paulo Mendes', 'termo'], ['1º tesoureiro', 'Marcos Vieira', 'afast'], ['2º tesoureiro', 'Sueli Rocha', 'ok']];
function r35Feito(p, cel) {
  const lin = (x, i) => r28Pes(p, r32Ic(p, x[2] === 'afast' ? 'alerta' : 'maleta', x[2] === 'afast' ? 'verm' : ''), `${x[0]} · ${x[1]}`, cel ? (x[2] === 'afast' ? 'afastado em 01/02' : x[2] === 'termo' ? 'posto em 05/01' : 'até 31/12/2027') : x[2] === 'afast' ? 'afastado em 01/02 · sem o acesso do cargo' : x[2] === 'termo' ? 'posto em 05/01 · esperando o termo' : 'até 31/12/2027 · acesso valendo', r35Sit(p, x[2], cel && x[2] === 'termo' ? 'termo' : undefined), { i, alt: cel ? 44 : 46, sel: x[2] === 'afast' });
  const lista = r32Car(p, cel ? 'Diretoria de 2027' : 'A diretoria de Vila Nova em 2027', '', R35_DIR_VN.map(lin).join(''), cel);
  const aberto = r32Car(p, 'Marcos Vieira · afastado', r18Etiq(p, 'desde 01/02, 10h14', 'verm'), `${r31Fatos(p, [['Afastado por', 'Débora Lima, secretaria de Vila Nova'], ['Motivo', R35_MOTIVO], ['Continua', 'membro ativo: carteirinha e contribuições']], cel)}<div style="display:${cel ? 'grid;grid-template-columns:1fr 1fr' : 'flex'};gap:8px;padding-top:6px">${r28Bt(p, 'Devolver o acesso', 'chave')}${r28Bt(p, 'Pôr outro no cargo', 'pessoa')}</div>${cel ? '' : r20Nota(p, 'Devolver o acesso vale na hora, com o termo que ele já aceitou. Pôr outro no cargo encerra o cargo dele.')}`, cel);
  const toast = r30Toast(p, 'Afastado. O acesso de 1º tesoureiro do Marcos acabou agora.', cel);
  if (cel) return r32EsCel(p, 'Diretoria e cargos', `${aberto}${lista}`);
  const tit = r18Tit(p, 'Diretoria e cargos de Vila Nova', `o cargo afastado continua na diretoria, sem o acesso · ${R35_HOJE}`);
  return r35Es(p, 'local', 'Diretoria e cargos', `${tit}${r17Dois(lista, aberto, '1.1fr 1fr')}<div style="position:relative;height:56px;flex:none">${toast}</div>`, ['Vila Nova', 'Diretoria e cargos'], R27_SEC.local);
}
// o Marcos no celular: continua membro, com o aviso do afastamento
function r35Membro(p, cel) {
  const aviso = r16aAviso(p, `<strong>Você foi afastado do cargo de 1º tesoureiro</strong> em 01/02/2027, pela secretaria de Vila Nova. Motivo: “${R35_MOTIVO}”`, 'alerta');
  const continua = r28Vai(p, [['cartao', 'A sua carteirinha continua valendo.'], ['dinheiro', 'As suas contribuições e o recibo continuam aqui.'], ['igreja', 'Minha vida, a agenda e os avisos da igreja, como sempre.']], cel);
  const saiu = r20Nota(p, cel ? 'Saiu do menu: Trabalho (o Financeiro de Vila Nova).' : 'Saiu do menu o Trabalho (o Financeiro de Vila Nova). Quando a secretaria devolver o acesso, ele volta sozinho.');
  if (cel) return r28MvCel(p, 'Início', `${aviso}${r32Car(p, 'Você continua membro ativo', r35Sit(p, 'ok', 'membro'), continua, 1)}${saiu}`);
  const tit = r18Tit(p, 'Bom dia, Marcos', `membro de Vila Nova · ${R35_HOJE}`);
  return r28Mv(p, R35_USU.marcosV, ['Início'], `${tit}${aviso}${r17Dois(r32Car(p, 'Você continua membro ativo', r35Sit(p, 'ok', 'membro'), continua), r18Col(r32Car(p, 'O seu cargo', '', r31Fatos(p, [['Cargo', '1º tesoureiro de Vila Nova'], ['Situação', 'afastado desde 01/02/2027'], ['Acesso', 'sem o acesso do cargo']])), saiu), '1fr 1fr')}`);
}
// a área: afasta só os cargos da área; vê os afastamentos das congregações
const R35_AFAST_A2 = [['Marcos Vieira', '1º tesoureiro', 'Vila Nova (7)', 'secretaria de Vila Nova', '01/02'], ['Pb. Davi Lopes', 'vice-dirigente', 'Bela Vista (15)', 'secretaria de Bela Vista', '20/01'], ['Ana Lúcia Prado', '2º secretário', 'Betel (27)', 'secretaria de Betel', '18/01']];
function r35AfArea(p, cel) {
  const dir = r32Car(p, 'A diretoria da área', r18Etiq(p, 'você afasta', 'azul'), [['Secretário da área', 'Elias Prado'], ['Tesoureiro da área', 'Rita Gomes']].map((x, i) => r28Pes(p, r32Ic(p, 'maleta'), `${x[0]} · ${x[1]}`, 'acesso valendo · até 31/12/2027', r28Mais(p, 'Afastar'), { i, alt: 44 })).join(''), cel);
  const lista = r32Car(p, 'Afastados nas congregações da área', r18Etiq(p, '3', 'verm'), R35_AFAST_A2.map((x, i) => r28Pes(p, r32Ic(p, 'alerta', 'verm'), `${x[0]} · ${x[1]}`, `${x[2]} · por ${x[3]}, em ${x[4]}`, cel ? '' : r28Mais(p, 'Ver o motivo'), { i, alt: 46 })).join(''), cel);
  const regra = r20Nota(p, 'Os cargos de cada congregação, quem afasta é a secretaria dela, sem esperar a área nem a Geral. A área vê e acompanha.');
  if (cel) return r32EsCel(p, 'Afastados do cargo', `${dir}${lista}${regra}`);
  const tit = r18Tit(p, 'Afastar do cargo: a Área 2', `a área afasta os cargos da área · ${R35_HOJE}`);
  return r35Es(p, 'area', 'Diretoria e cargos', `${tit}${r17Dois(r18Col(dir, regra), lista, '1fr 1.2fr')}`, ['Área 2', 'Diretoria e cargos']);
}
// a Geral: os afastados da igreja toda; afasta os cargos gerais e pode tirar o acesso de qualquer um
const R35_AFAST_G = [['Marcos Vieira', '1º tesoureiro', 'Vila Nova (7) · Área 2', 'secretaria local', '01/02', 'vai trabalhar embarcado'], ['Pb. Davi Lopes', 'vice-dirigente', 'Bela Vista (15) · Área 2', 'secretaria local', '20/01', 'pedido dele, por saúde'], ['Ana Lúcia Prado', '2º secretário', 'Betel (27) · Área 2', 'secretaria local', '18/01', 'mudou de cidade'], ['Ev. Jairo Matos', 'tesoureiro da área', 'Área 6', 'secretaria da Área 6', '12/01', 'conferência das contas'], ['Rute Campos', '1º tesoureiro', 'Liberdade (31) · Área 4', 'Secretaria Geral', '08/01', 'conferência das contas']];
function r35AfGeral(p, cel) {
  if (cel) return r32EsCel(p, 'Afastados do cargo', `${r29Nums(p, [r32Num('9', 'afastados'), r32Num('5', 'neste mês'), r32Num('1', 'pela Geral')], 1)}${r16aListaCel(p, R35_AFAST_G.map(x => [`${x[0]} · ${x[1]}`, `${x[2].split(' · ')[0]} · ${x[4]}`, r28Mais(p, '›')])).replace(/min-height:52px/g, 'min-height:46px')}${r20Nota(p, 'Cada nível afasta os seus cargos; a Geral afasta qualquer um.')}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,.9fr) minmax(0,1.25fr) minmax(0,1fr) 54px minmax(0,1.25fr)', ['Quem', 'Cargo', 'Onde', 'Afastado por', 'Em', 'Motivo'], R35_AFAST_G.map(x => [`<strong style="color:${p.titulo}">${x[0]}</strong>`, x[1], x[2], x[3], x[4], x[5]]));
  const tit = r18Tit(p, 'Afastados do cargo: a igreja toda', `cada nível afasta os seus cargos; a Secretaria Geral afasta qualquer um · ${R35_HOJE}`, m8Linha(p, 'Afastar um cargo', 'chave'));
  return r35Es(p, 'geral', 'Diretoria e cargos', `${tit}${r29Nums(p, [r32Num('9', 'afastados do cargo hoje'), r32Num('5', 'afastados neste mês'), r32Num('1', 'afastado pela Geral'), r32Num('2', 'acessos devolvidos')], 0)}${r32Pils(p, ['Todos', 'Na congregação', 'Na área', 'Na Geral'], 'Todos')}${tab}${r20Nota(p, 'Mostra 5 dos 9. Tocar numa linha abre o motivo inteiro, com “Devolver o acesso”. Os afastados continuam membros ativos.')}`, ['Diretoria e cargos', 'Afastados do cargo']);
}
const r35Afastar = (p, k, d) => { const cel = ehCel(d); return k === 'feito' ? r35Feito(p, cel) : k === 'membro' ? r35Membro(p, cel) : k === 'area' ? r35AfArea(p, cel) : k === 'geral' ? r35AfGeral(p, cel) : r35AfastarForm(p, cel); };
const PERFIS35_AFASTAR = [['local', 'Secretaria de Vila Nova · afasta o 1º tesoureiro'], ['feito', 'Secretaria de Vila Nova · depois de afastar'], ['membro', 'O Marcos · continua membro'], ['area', 'Pastor da Área 2 · os afastados da área'], ['geral', 'Secretaria Geral · a igreja toda']];
