/* ---------------- 3. O PAINEL: O QUE ESTÁ DESATUALIZADO ---------------- */
// A primeira tela do módulo, "quem precisa de atenção primeiro": o cargo vago, o cargo vencendo, o dado velho e o termo de
// posse pendente. Cada nível vê os seus tipos de aviso, como no Financeiro, e o filtro "só o que eu preciso resolver".
const R32_PRECISA = {
  local: [['maleta', 'verm', '1º tesoureiro vago', 'desde 25/11 · o Carlos saiu · você põe', 'Preencher ›'], ['calendario', 'ouro', 'A diretoria de 2027', 'os 6 cargos vencem em 31/12 · faltam 29 dias · nenhum pronto', 'Montar ›'], ['relogio', 'ouro', 'Cultos e pontos de culto', 'conferidos em 14/05 · passou dos 6 meses', 'Conferir ›'], ['livro', 'ouro', 'Professor dos Jovens (EBD)', 'outro cargo · vago desde 25/11', 'Preencher ›']],
  area: [['igreja', 'verm', 'Dirigente de Monte Sião', 'vago desde 02/11 · você ou a Geral põe', 'Pôr o dirigente ›'], ['maleta', 'verm', 'Tesoureiro da Área 2', 'vago desde 16/11 · a Sílvia Matos saiu', 'Preencher ›'], ['calendario', 'ouro', 'A diretoria da área de 2027', 'os 3 cargos vencem em 31/12 · faltam 29 dias', 'Montar ›']],
  geral: [['doc', 'ouro', '2 termos de dirigente', 'esperam o Presidente confirmar · Área 4 e Área 6', 'Ver ›'], ['igreja', 'verm', 'Boa Sorte (Área 7) sem dirigente', 'desde 20/10 · a Geral ou o pastor de área põe', 'Pôr o dirigente ›'], ['calendario', 'ouro', 'A diretoria geral de 2027', 'os cargos da Geral vencem em 31/12', 'Montar ›']]
};
const R32_NUMS = {
  local: [r32Num('1', 'cargo vago', 'verm'), r32Num('5', 'cargos vencem em 31/12'), r32Num('0', 'termos pendentes'), r32Num('1', 'dado para conferir', 'ouro')],
  area: [r32Num('9', 'cargos vagos', 'verm'), r32Num('1', 'congregação sem dirigente', 'verm'), r32Num('1', 'termo pendente', 'ouro'), r32Num('3', 'para conferir', 'ouro')],
  geral: [r32Num('23', 'cargos vagos', 'verm'), r32Num('2', 'congregações sem dirigente', 'verm'), r32Num('3', 'termos pendentes', 'ouro'), r32Num('11', 'para conferir', 'ouro'), r32Num('4 de 45', 'com a diretoria de 2027')]
};
const r32Precisa = (p, k, cel) => r32Car(p, 'Precisa de você', r18Etiq(p, String(R32_PRECISA[k].length), 'ouro'), R32_PRECISA[k].map((x, i) => r28Pes(p, r32Ic(p, x[0], x[1]), x[2], x[3], r28Mais(p, cel ? '›' : x[4]), { i, alt: cel ? 50 : 54 })).join(''), cel);
// a virada do ano em Vila Nova: quem vence em 31/12 e o acesso que perde se não estiver na diretoria de 2027
const R32_VENCE = [['AN', 'Pr. Abel Nogueira', 'Dirigente', 'o acesso de dirigente'], ['IC', 'Pb. Ivan Castro', 'Vice-dirigente', 'o acesso de vice'], ['DL', 'Débora Lima', '1º secretário', 'a secretaria de Vila Nova'], ['PM', 'Paulo Mendes', '2º secretário', 'a secretaria de Vila Nova'], ['SR', 'Sueli Rocha', '2º tesoureiro', 'a tesouraria de Vila Nova']];
const R32_ATENCAO_A2 = [['12 · Monte Sião', 'sem dirigente desde 02/11 · 2 outros vagos · cultos há 7 meses', 'verm', 'sem dirigente'], ['27 · Betel', 'os 2 tesoureiros vagos desde 03/11', 'ouro', '2 vagos'], ['21 · Nova Esperança', 'endereço e cultos há 8 meses · 1 vago', 'ouro', 'conferir'], ['7 · Vila Nova', '1º tesoureiro vago · cultos há 6 meses', 'ouro', '1 vago'], ['9 · Cidade Jardim', 'o novo secretário não aceitou o termo (desde 28/11)', 'ouro', 'termo'], ['36 · Recanto', 'secretário vago desde 19/11', 'ouro', '1 vago']];
function r32Painel(p, k, d) {
  const cel = ehCel(d), N = R32_NUMS[k];
  if (cel) {
    const resto = k === 'local' ? r16aListaCel(p, [['A virada do ano', '5 pessoas vencem em 31/12 · nenhuma na diretoria de 2027', r18Etiq(p, '29 dias', 'ouro')]])
      : k === 'area' ? r16aListaCel(p, R32_ATENCAO_A2.slice(0, 4).map(x => [x[0], x[1], r18Etiq(p, x[3], x[2])]))
      : r16aListaCel(p, R32_AREAS.filter(x => x[5] > 1).slice(0, 4).map(x => [x[0], `${x[5]} vagos · ${x[7]} termos · ${x[4]} para conferir`, x[6] ? r18Etiq(p, 'sem dirigente', 'verm') : '']));
    return r32EsCel(p, 'Estrutura', `${r29Nums(p, N.slice(0, 3).map(x => [x[0], x[1].replace(/congregaç(ão|ões) sem dirigente/, 'sem dirigente').replace('cargos vencem em 31/12', 'vencem em 31/12').replace('termos pendentes', 'termos').replace('termo pendente', 'termo')]), 1)}${r32Filtro(p, 1)}${r32Precisa(p, k, 1)}<strong style="font-size:14.5px;color:${p.titulo};flex:none">${k === 'local' ? 'Vem aí' : k === 'area' ? 'Quem precisa de atenção primeiro' : 'As áreas com mais coisa'}</strong>${resto}`);
  }
  let dir;
  if (k === 'local') dir = r32Car(p, 'A virada do ano: vencem em 31/12', r18Etiq(p, 'faltam 29 dias', 'ouro'), `${R32_VENCE.map((x, i) => r28Pes(p, r32Av(p, x[0]), x[1], `${x[2]} · se não estiver em 2027, perde ${x[3]}`, '', { i, alt: 46 })).join('')}${r20Nota(p, 'Quem continua em 2027 entra na diretoria de 2027 antes da virada, e ninguém fica sem acesso no dia 01/01.')}`);
  else if (k === 'area') dir = r18Col(`<strong style="font-size:14.5px;color:${p.titulo}">As congregações: quem precisa de atenção primeiro</strong>`, r16aTab(p, 'minmax(0,0.9fr) minmax(0,2fr) 110px', ['Congregação', 'O que está desatualizado', ''], R32_ATENCAO_A2.map(x => [x[0], x[1], r18Etiq(p, x[3], x[2])])), r20Nota(p, 'E mais 6 congregações em dia. A diretoria de cada congregação, o dirigente põe; a área acompanha e cobra.'));
  else dir = r18Col(`<strong style="font-size:14.5px;color:${p.titulo}">As áreas</strong>`, r16aTab(p, 'minmax(0,1.5fr) 54px 100px 62px 96px 80px', ['Área', 'Vagos', 'Sem dirigente', 'Termos', 'Para conferir', '2027 pronta'], R32_AREAS.map(x => [x[0], r32N(p, x[5], 'verm'), r32N(p, x[6], 'verm'), r32N(p, x[7], 'ouro'), r32N(p, x[4], 'ouro'), `${x[8]} de ${x[1]}`])));
  const onde = { local: 'em Vila Nova', area: 'na Área 2', geral: 'na igreja toda' }[k];
  const tit = r18Tit(p, `O que está desatualizado ${onde}`, `o cargo vago, o cargo vencendo, o dado velho e o termo de posse pendente · ${R32_HOJE}`, r32Filtro(p));
  return r32Es(p, k, 'Painel da estrutura', `${tit}${r29Nums(p, N)}${r17Dois(r32Precisa(p, k), dir, k === 'geral' ? '0.8fr 1.5fr' : k === 'area' ? '0.9fr 1.4fr' : '1fr 1fr')}`, ['Painel']);
}
const PERFIS32_PAINEL = [['local', 'Dirigente de Vila Nova'], ['area', 'Pastor da Área 2'], ['geral', 'Secretaria Geral']];
