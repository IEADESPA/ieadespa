/* ---------------- 7. OS TERMOS GUARDADOS ---------------- */
// O que a 32 deixou para depois: os termos de posse de cada ano ficam guardados e se acham pelo nome, pelo ano, pelo cargo e
// pela congregação. O PDF (com CPF e endereço) continua só para os quatro da 34 (a pessoa, quem a pôs no cargo, o Presidente
// e o Secretário Geral); os outros veem a situação e a página do QR. O prazo de guarda não está no plano: o desenho mostra
// 5 anos depois do fim do mandato, para ele conferir com o advogado. Hoje, nos desenhos, é 15/01/2028.
const R35_GU_HOJE = '15/01/2028';
// [quem, cargo, onde, ano, situação, tom, fim]
const R35_TERMOS = [['Débora Lima', '1ª secretária', 'Vila Nova (7)', '2028', 'valendo', 'verde', 'até 31/12/2028'], ['Débora Lima', '1ª secretária', 'Vila Nova (7)', '2027', 'encerrado no fim do ano', 'azul', '31/12/2027'], ['Marcos Vieira', '1º tesoureiro', 'Vila Nova (7)', '2027', 'encerrado: outro foi posto', 'azul', '30/04/2027'], ['Paulo Mendes', '2º secretário', 'Vila Nova (7)', '2027', 'não aceito por ele', 'verm', '20/01/2027'], ['Pb. Rui Andrade', 'dirigente', 'Monte Sião (12)', '2027', 'encerrado: a congregação fechou', 'azul', '28/02/2027'], ['Ana Paula Reis', 'sem cargo, pela Geral', 'Vila Nova (7)', '2027', 'encerrado no prazo', 'azul', '31/03/2027']];
function r35GuGeral(p, cel) {
  if (cel) return r32EsCel(p, 'Termos guardados', `${r17Campo(p, '', 'Buscar pelo nome', { icone: 'busca', vazio: 1 })}${r32Pils(p, ['2028', '2027', 'Todos os cargos'], '2027')}${r16aListaCel(p, R35_TERMOS.slice(1).map(x => [`${x[0]} · ${x[1]}`, `${x[2]} · ${x[4]}`, r28Mais(p, 'PDF')])).replace(/min-height:52px/g, 'min-height:48px')}${r20Nota(p, 'Guardados por 5 anos depois do fim do mandato.')}`);
  const tab = r16aTab(p, 'minmax(0,1.05fr) minmax(0,1fr) minmax(0,.9fr) 50px minmax(0,1.5fr) 94px', ['Quem', 'Cargo', 'Onde', 'Ano', 'Situação', ''], R35_TERMOS.map(x => [`<strong style="color:${p.titulo}">${x[0]}</strong>`, x[1], x[2], x[3], r18Etiq(p, `${x[4]}${x[5] === 'verde' ? '' : ' · ' + x[6].slice(0, 5)}`, x[5]), r28Mais(p, 'Baixar PDF')])).replace(/min-height:44px/g, 'min-height:46px');
  const filtros = `<div style="display:flex;gap:10px;align-items:center">${`<div style="width:300px;flex:none">${r17Campo(p, '', 'Buscar pelo nome', { icone: 'busca', vazio: 1 })}</div>`.replace('<span style="font-size:12.5px;font-weight:600', '<span style="display:none;font-size:12.5px;font-weight:600')}${r32Pils(p, ['Todos os anos', '2028', '2027'], 'Todos os anos')}${r32Pils(p, ['Todas as situações', 'Valendo', 'Encerrados', 'Não aceitos'], 'Todas as situações')}</div>`;
  const tit = r18Tit(p, 'Os termos guardados', `todos os anos, de todo mundo que trabalha e usa o sistema · ${R35_GU_HOJE}`);
  return r35Es(p, 'geral', 'Termos de posse', `${tit}${r29Nums(p, [r32Num('331', 'termos de 2028'), r32Num('318', 'termos de 2027, encerrados'), r32Num('12', 'não aceitos em 2027'), r32Num('5 anos', 'guardados depois do fim')], 0)}${filtros}${tab}${r20Nota(p, 'Mostra 6 de 661. O termo encerrado continua conferível pelo QR, que mostra “encerrado em” com a data. Depois dos 5 anos, o termo se apaga, e fica só o registro de que existiu.')}`, ['Termos de posse', 'Guardados']);
}
// a congregação: os termos dela, por ano
function r35GuLocal(p, cel) {
  const anos = [['2028', 7, '7 valendo · 6 da diretoria e a EBD'], ['2027', 9, '6 no fim do ano · 1 trocado · 1 não aceito · 1 sem cargo']];
  const L = R35_TERMOS.filter(x => x[2] === 'Vila Nova (7)' && x[3] === '2027');
  const lista = L.map((x, i) => r28Pes(p, r32Ic(p, 'doc', x[5] === 'verm' ? 'verm' : ''), `${x[0]} · ${x[1]}`, `${x[4]} · ${x[6]}`, cel ? '' : r28Mais(p, x[0] === 'Ana Paula Reis' ? 'Só o QR' : 'Baixar PDF'), { i, alt: cel ? 44 : 46 })).join('');
  if (cel) return r32EsCel(p, 'Termos de posse', `${r29Nums(p, anos.map(x => r32Num(String(x[1]), `termos de ${x[0]}`)), 1)}${r32Pils(p, ['2028', '2027'], '2027')}${r32Car(p, '2027 em Vila Nova', '', lista, 1)}`);
  const tit = r18Tit(p, 'Os termos de posse de Vila Nova', `de cada ano · o PDF de quem você pôs no cargo · ${R35_GU_HOJE}`);
  return r35Es(p, 'local', 'Termos de posse', `${tit}${r17Dois(r32Car(p, 'Por ano', '', anos.map((x, i) => r28Pes(p, r35Num(p, x[0], i === 1), `${x[1]} termos`, x[2], '', { i, alt: 50, sel: i === 1 })).join('')), r18Col(r32Car(p, '2027, encerrados', r18Etiq(p, 'guardados até 2032', 'azul'), lista), r20Nota(p, 'O termo da Ana Paula foi dado pela Geral: o dirigente vê a situação e o QR, e o PDF baixam ela, a Geral, o Presidente e o Secretário Geral.')), '1fr 1.5fr')}`, ['Vila Nova', 'Termos de posse', 'Guardados']);
}
// a área: os termos das congregações, por ano
function r35GuArea(p, cel) {
  const L = [['Vila Nova (7)', 9, 7], ['Cidade Jardim (9)', 8, 7], ['Monte Sião (12)', 4, 0], ['Bela Vista (15)', 9, 8], ['Jardim Ipê (18)', 7, 7]];
  if (cel) return r32EsCel(p, 'Termos de posse', `${r29Nums(p, [r32Num('101', 'de 2028'), r32Num('96', 'de 2027')], 1)}${r16aListaCel(p, L.map(x => [x[0], `2027: ${x[1]} · 2028: ${x[2]}`, r28Mais(p, '›')]))}${r20Nota(p, 'O PDF só de quem você pôs no cargo; dos outros, a situação e o QR.')}`);
  const tab = r16aTab(p, 'minmax(0,1.4fr) 110px 110px minmax(0,1.3fr)', ['Congregação', 'Termos 2027', 'Termos 2028', 'Observação'], L.map(x => [`<strong style="color:${p.titulo}">${x[0]}</strong>`, String(x[1]), String(x[2]), x[2] ? 'em dia' : 'fechada em 28/02/2027']));
  const tit = r18Tit(p, 'Os termos guardados da Área 2', `por congregação e por ano · ${R35_GU_HOJE}`);
  return r35Es(p, 'area', 'Termos de posse', `${tit}${r29Nums(p, [r32Num('101', 'termos de 2028 na área'), r32Num('96', 'termos de 2027'), r32Num('9', 'que você pôs no cargo')], 0)}${tab}${r20Nota(p, 'Mostra 5 das 13. O PDF você baixa só de quem pôs no cargo; dos outros, vê a situação e a página do QR, como na 34.')}`, ['Área 2', 'Termos de posse', 'Guardados']);
}
// a pessoa: os meus termos
function r35GuPessoa(p, cel) {
  const L = R35_TERMOS.filter(x => x[0] === 'Débora Lima');
  const lista = L.map((x, i) => r28Pes(p, r32Ic(p, 'doc'), `${x[3]} · ${x[1]} de Vila Nova`, `${x[4]} · ${x[6]}`, r28Mais(p, 'PDF'), { i, alt: 48 })).join('');
  if (cel) return r28MvCel(p, 'Meus termos', `${r32Car(p, 'Os meus termos de posse', '', lista, 1)}${r20Nota(p, 'Cada termo tem o QR, para conferir que é verdadeiro.')}`);
  const tit = r18Tit(p, 'Os meus termos de posse', `um por ano, com o QR · ${R35_GU_HOJE}`);
  return r28Mv(p, R34_USU.debora, ['Meus termos'], `${tit}${r17Dois(r32Car(p, 'Os meus termos', '', lista), r32Car(p, 'Guardados', '', r28Vai(p, [['doc', 'O PDF fica com você, com o QR: qualquer um confere que é verdadeiro.'], ['relogio', 'O termo encerrado fica guardado por 5 anos depois do fim do mandato.']])), '1.3fr 1fr')}`);
}
const r35Guardados = (p, k, d) => { const cel = ehCel(d); return k === 'local' ? r35GuLocal(p, cel) : k === 'area' ? r35GuArea(p, cel) : k === 'pessoa' ? r35GuPessoa(p, cel) : r35GuGeral(p, cel); };
const PERFIS35_GUARDADOS = [['geral', 'Secretaria Geral · todos os termos'], ['local', 'Dirigente de Vila Nova · os termos dela'], ['area', 'Pastor da Área 2 · os termos da área'], ['pessoa', 'A Débora · os meus termos']];
