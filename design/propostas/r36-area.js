/* ---------------- 5. A ÁREA NOVA E TROCAR O PASTOR DE ÁREA (o que a 35 deixou sem desenho próprio) ---------------- */
// A 35 deixou sem desenho só o que era pequeno: a área nova e trocar o pastor de área (formulários de 2 ou 3 campos, como
// a congregação nova). Como a 36 é a última rodada de telas novas, entram aqui. Só a Geral cria a área e troca o pastor;
// mudar uma congregação de área segue o aprovado na 35 (o passado fica com a antiga). O exemplo: a Área 13 nasce com 3
// congregações; na Área 5, o Pr. Natan Barros dá lugar ao Pr. Elton Freitas a partir de 01/03/2027.
// a tela da Estrutura para quem não está nos mapas da 32 à 35 (um dirigente da Área 5, o pastor novo)
const r36EsOutro = (p, k, escopo, usu, ativo, conteudo, trilha) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'estrutura', { titulo: 'Estrutura', escopo, grupos: r35Grupos(k, ativo), usuario: usu }), trilha: ['Estrutura'].concat(trilha || [ativo]), faixa: R32_VERDE, conteudo }));
const R36_NOVAS = [['40 · Novo Horizonte', 'hoje na Área 9', 1], ['42 · Vale do Sol', 'hoje na Área 9', 1], ['44 · Esperança', 'hoje na Área 11', 1], ['38 · Boa Vista', 'hoje na Área 9', 0]];
const r36Marca = (p, on) => `<span style="width:20px;height:20px;border-radius:6px;flex:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? 'background:#0A2342;' : `border:1.5px solid ${p.campoBorda};`}">${on ? ic('check', '#FFFFFF', 13, 3) : ''}</span>`;
function r36AreaNova(p, cel) {
  const campos = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Nome', 'Área 13', { icone: 'igreja' })}${r17Campo(p, 'Número', '13', { icone: 'cadeado', auto: 1, nota: cel ? '' : 'o próximo' })}</div>${r17Campo(p, 'Pastor de área', 'Pr. Otávio Reis · membro desde 2005', { icone: 'busca' })}`;
  const congs = R36_NOVAS.map((x, i) => r28Pes(p, r36Marca(p, x[2]), x[0], x[1], '', { i, alt: cel ? 40 : 42 })).join('');
  const vai = r28Vai(p, [['igreja', 'A Área 13 nasce hoje, com as 3 congregações marcadas. O passado delas fica com a área antiga.'], ['doc', 'O Pr. Otávio recebe o termo de posse de pastor de área. O acesso vale desde o aceite.'], ['mapa', 'O mapa e o site mostram a área nova.']], cel);
  if (cel) return r32EsCel(p, 'Área nova', `${campos}${r32Car(p, 'As congregações da área', r18Etiq(p, '3', 'azul'), congs, 1)}${r35Pin(p, 'Criar a área com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'A área nova', `só a Geral cria · nasce com o pastor e as congregações · ${R36_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r36Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r18Col(r32Car(p, 'A área', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r32Car(p, 'As congregações que passam para ela', r18Etiq(p, '3 marcadas', 'azul'), congs)), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35Pin(p, 'Criar a área com o meu PIN'), r20Nota(p, 'Mudar uma congregação de área depois segue o caminho aprovado: só a Geral, e o passado fica com a antiga.')), '1.2fr 1fr')}`, ['Áreas e números', 'Área nova']);
}
function r36Trocar(p, cel) {
  const campos = `${r17Campo(p, 'A área', 'Área 5 · 6 congregações', { icone: 'cadeado', auto: 1 })}${r17Campo(p, 'O pastor de hoje', 'Pr. Natan Barros · desde 2024', { icone: 'cadeado', auto: 1 })}${r17Campo(p, 'O pastor novo', 'Pr. Elton Freitas · membro desde 2008', { icone: 'busca' })}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'A partir de', '01/03/2027', { icone: 'calendario' })}${r17Campo(p, 'Decidido por', 'a Presidência', { icone: 'escudo' })}</div>`;
  const vai = r28Vai(p, [['doc', 'O Pr. Elton recebe o termo de posse de pastor da Área 5. O acesso de pastor vale desde o aceite, a partir de 01/03.'], ['relogio', 'O cargo do Pr. Natan acaba em 01/03. Se ele tem outro cargo, esse continua.'], ['igreja', 'As 6 congregações da área veem o pastor novo na ficha e no site.']], cel);
  if (cel) return r32EsCel(p, 'Trocar o pastor', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r35Pin(p, 'Trocar com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'Trocar o pastor da Área 5', `só a Geral · a troca tem data · ${R36_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r36Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r32Car(p, 'A troca', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35Pin(p, 'Trocar com o meu PIN')), '1.15fr 1fr')}`, ['Áreas e números', 'Trocar o pastor']);
}
// o pastor novo: o cargo que vem, à espera do termo
function r36PastorNovo(p, cel) {
  const u = { ini: 'EF', nome: 'Pr. Elton Freitas', papel: 'Pastor da Área 5 a partir de 01/03' };
  const aviso = r16aAviso(p, '<strong>Você foi posto como pastor da Área 5</strong>, a partir de 01/03/2027, pela Presidência. Assine o termo de posse para o acesso valer nesse dia.', 'alerta');
  const fatos = r31Fatos(p, [['O cargo', 'Pastor da Área 5'], ['Começa', '01/03/2027, com o termo assinado'], ['Alcance', 'as 6 congregações da Área 5'], ['Você vai ver', 'Membros e Estrutura da área']], cel);
  if (cel) return r28MvCel(p, 'Meu acesso', `${aviso}${r32Car(p, 'O cargo que vem', r35Sit(p, 'termo'), fatos, 1)}${r21Ouro(p, 'Assinar o termo', 'doc', 44)}`);
  const tit = r18Tit(p, 'O meu acesso no sistema', `o cargo novo, à espera do termo · ${R36_HOJE}`);
  return r28Mv(p, u, ['Meu acesso'], `${tit}${aviso}${r17Dois(r32Car(p, 'O cargo que vem', r35Sit(p, 'termo'), fatos), r18Col(r21Ouro(p, 'Assinar o termo de posse', 'doc', 42), r20Nota(p, 'Até 01/03, o pastor da área continua o Pr. Natan, com o acesso dele.')), '1.3fr 1fr')}`);
}
// um dirigente da Área 5 vê a troca marcada
function r36AreaLocal(p, cel) {
  const u = { ini: 'GA', nome: 'Ev. Gilson Alves', papel: 'Dirigente · Primavera' };
  const fatos = r31Fatos(p, [['Área', 'Área 5 · 6 congregações'], ['Pastor da área', 'Pr. Natan Barros, até 28/02'], ['A partir de 01/03', 'Pr. Elton Freitas']], cel);
  const aviso = r16aAviso(p, '<strong>A partir de 01/03, o pastor da Área 5 é o Pr. Elton Freitas.</strong> Os pedidos que sobem para a área passam a ir para ele nesse dia.');
  if (cel) return r32EsCel(p, 'Ficha da congregação', `${aviso}${r32Car(p, 'Primavera (nº 33)', '', fatos, 1)}`);
  const tit = r18Tit(p, 'Primavera (nº 33)', `a ficha da congregação · ${R36_HOJE}`);
  return r36EsOutro(p, 'local', 'Congregação Primavera · nº 33', u, 'Ficha da congregação', `${tit}${aviso}${r17Dois(r32Car(p, 'A área da congregação', '', fatos), r20Nota(p, 'A troca do pastor de área é da Geral. Para a congregação, nada muda além do nome.'), '1.3fr 1fr')}`, ['Primavera', 'Ficha da congregação']);
}
const r36AreaTela = (p, k, d) => { const cel = ehCel(d); return k === 'trocar' ? r36Trocar(p, cel) : k === 'area' ? r36PastorNovo(p, cel) : k === 'local' ? r36AreaLocal(p, cel) : r36AreaNova(p, cel); };
const PERFIS36_AREA = [['geral', 'Secretaria Geral · cria a área nova'], ['trocar', 'Secretaria Geral · troca o pastor de área'], ['area', 'O pastor novo · o cargo que vem'], ['local', 'Dirigente da Área 5 · vê a troca']];
