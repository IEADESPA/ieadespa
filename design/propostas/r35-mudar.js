/* ---------------- 6. MUDAR DE ÁREA, FECHAR OU JUNTAR ---------------- */
// Respostas dele (23/11): só a Geral muda uma congregação de área; o passado fica com a área antiga e dali em diante conta
// para a nova. A congregação que fecha ou se junta a outra: a Geral escolhe a que recebe e todos os membros passam de uma
// vez; o histórico e o dinheiro antigos ficam com o nome antigo. Quando congregações fecham, a numeração desce, e o
// histórico guarda o número de cada época. Exemplos: Recanto (nº 30) passa da Área 2 para a Área 5 em 01/03/2027; Monte
// Sião (nº 12), sem dirigente, fecha e se junta a Vila Nova (nº 7) em 28/02/2027.
const R35_MU_HOJE = '15/02/2027';
function r35Mudar(p, cel) {
  const campos = `${r17Campo(p, 'A congregação', 'Recanto (nº 30) · hoje na Área 2', { icone: 'cadeado', auto: 1 })}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Vai para', 'Área 5', { icone: 'igreja', obrig: 1 })}${r17Campo(p, 'A partir de', '01/03/2027', { icone: 'calendario', obrig: 1 })}</div>${r33Texto(p, 'Motivo (fica guardado)', 'Recanto fica do outro lado da PA-275, mais perto das igrejas da Área 5.', cel ? 48 : 52)}`;
  const vai = r28Vai(p, [['relogio', '<strong>Até 28/02, tudo fica com a Área 2:</strong> os números, os relatórios e o dinheiro de antes.'], ['igreja', 'Desde 01/03, Recanto conta para a Área 5, e o pastor da Área 5 passa a cuidar dela.'], ['maleta', 'O dirigente, a diretoria, os membros e os cultos continuam como estão.']], cel);
  if (cel) return r32EsCel(p, 'Mudar de área', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r35Pin(p, 'Mudar com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'Mudar de área: Recanto', `só a Secretaria Geral muda · o passado fica com a área antiga · ${R35_MU_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r32Car(p, 'A mudança', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35Pin(p, 'Mudar de área com o meu PIN')), '1.15fr 1fr')}`, ['Áreas e números', 'Recanto', 'Mudar de área']);
}
// o pastor da área nova vê Recanto chegar
function r35MuArea(p, cel) {
  const L = [['5', 'Esperança', 'Pr. Rubens Melo'], ['11', 'Morada Nova', 'Ev. Tiago Nunes'], ['19', 'Jardim América', 'Pb. Silas Moura'], ['26', 'Liberdade II', 'Ev. Abner Cruz'], ['35', 'Vale Verde', 'Pb. Enoque Leal'], ['40', 'Ipiranga', 'Pr. Jairo Bento'], ['30', 'Recanto', '']];
  const lista = L.map((x, i) => r28Pes(p, r35Num(p, x[0], x[0] === '30'), x[1], x[0] === '30' ? 'chega em 01/03, vinda da Área 2 · Ev. Caio Barbosa' : x[2], '', { i: cel ? i : i > 1, alt: cel ? 40 : 42, sel: x[0] === '30' })).join('');
  const aviso = r16aAviso(p, '<strong>Recanto (nº 30) passa para a sua área em 01/03/2027.</strong> Os relatórios de antes continuam com a Área 2; os de março em diante vêm para você.', 'alerta');
  if (cel) return r32EsCel(p, 'Ficha da área', `${aviso}${r32Car(p, 'A Área 5', '', lista, 1)}`);
  const tit = r18Tit(p, 'As congregações da Área 5', `6, e Recanto chega em 01/03 · ${R35_MU_HOJE}`);
  return r35Es(p, 'area5', 'Ficha da área', `${tit}${aviso}${r32Car(p, 'A Área 5, pelo número', '', `<div style="display:grid;grid-template-columns:1fr 1fr;column-gap:18px">${lista}</div>`)}`, ['Área 5', 'Ficha da área']);
}
// a Geral fecha Monte Sião e junta a Vila Nova
function r35Juntar(p, cel) {
  const campos = `${r17Campo(p, 'Fecha', 'Monte Sião (nº 12) · Área 2 · sem dirigente', { icone: 'cadeado', auto: 1 })}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Quem recebe', 'Vila Nova (nº 7)', { icone: 'igreja', obrig: 1 })}${r17Campo(p, 'Em', '28/02/2027', { icone: 'calendario', obrig: 1 })}</div>`;
  const vai = r28Vai(p, [['pessoas', '<strong>Os 64 membros passam de uma vez para Vila Nova</strong>, com a ficha inteira.'], ['casa', 'O ponto de culto de Monte Sião passa para Vila Nova.'], ['chave', 'Os 4 cargos de Monte Sião acabam, e o acesso deles acaba junto.'], ['doc', 'O histórico e o dinheiro de antes ficam com o nome “Monte Sião (nº 12, fechada em 28/02/2027)”.'], ['igreja', 'A numeração desce: as 34 congregações depois da 12 descem um número.']], cel);
  if (cel) return r32EsCel(p, 'Fechar ou juntar', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r35Pin(p, 'Fechar com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'Fechar ou juntar: Monte Sião', `só a Secretaria Geral · a Geral escolhe a que recebe · ${R35_MU_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r18Col(r32Car(p, 'O que fecha e quem recebe', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r32Car(p, 'Monte Sião hoje', '', r31Fatos(p, [['Membros', '64, todos passam'], ['Ponto de culto', '1, no Morada Verde'], ['Cargos', '4 com acesso (o dirigente está vago)'], ['Número', '12, que sai da lista']])), r28Mais(p, 'Ver a numeração nova ›')), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35Pin(p, 'Fechar e juntar com o meu PIN')), '1fr 1.1fr')}`, ['Áreas e números', 'Monte Sião', 'Fechar ou juntar']);
}
// a numeração nova depois do fechamento
const R35_NUM = [['13', '12', 'São Jorge'], ['14', '13', 'Morada do Sol'], ['15', '14', 'Bela Vista'], ['16', '15', 'Cidade Nova'], ['17', '16', 'Alvorada'], ['18', '17', 'Jardim Ipê'], ['46', '45', 'Nova Carajás']];
function r35Numeros(p, cel) {
  const lin = (x, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 38 : 40}px;${i ? `border-top:1px solid ${p.linha};` : ''}">${r35Num(p, x[0])}<span style="color:${p.suave}">${ic('seta', p.suave, 16, 2)}</span>${r35Num(p, x[1], 1)}<span style="flex:1;min-width:0;font-size:13.5px;font-weight:600;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[2]}</span></div>`;
  const lista = R35_NUM.map((x, i) => (i === 6 ? `<div style="font-size:12px;color:${p.suave};padding:4px 0;border-top:1px solid ${p.linha}">… e mais 27 …</div>` : '') + lin(x, i === 6 ? 0 : i)).join('');
  const hist = r28Vai(p, [['doc', '<strong>O histórico guarda o número de cada época:</strong> o relatório de 2026 mostra Bela Vista como nº 15; o de março de 2027 em diante, como nº 14.'], ['igreja', 'Os números de 1 a 11 não mudam (a Sede continua a 1, Vila Nova a 7).']], cel);
  if (cel) return r32EsCel(p, 'A numeração nova', `${r16aAviso(p, 'Monte Sião (nº 12) fecha em 28/02. Desde 01/03, as que vêm depois descem um número.')}${r32Car(p, 'Antes e depois', '', lista, 1)}${hist}`);
  const tit = r18Tit(p, 'A numeração nova, depois de Monte Sião', `vale desde 01/03/2027 · 45 congregações · ${R35_MU_HOJE}`, m8Linha(p, 'Voltar', 'voltar'));
  return r35Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r32Car(p, 'Antes e depois', r18Etiq(p, '34 descem um número', 'ouro'), lista), r18Col(r32Car(p, 'E o passado', '', hist), r21Ouro(p, 'Está certo', 'check', 42)), '1fr 1fr')}`, ['Áreas e números', 'A numeração nova']);
}
// Vila Nova recebe os membros de Monte Sião
function r35MuLocal(p, cel) {
  const L = [['Célia Santos', 'membro desde 2011'], ['Antônio Reis', 'membro desde 2016'], ['Luana Prado', 'membro desde 2020'], ['Josué Matias', 'membro desde 2019'], ['Ester Lima', 'membro desde 2008']];
  const lista = L.map((x, i) => r28Pes(p, r32Av(p, x[0].split(' ').map(s => s[0]).join(''), 30), x[0], `${x[1]} · veio de Monte Sião`, '', { i, alt: cel ? 42 : 44 })).join('');
  const aviso = r16aAviso(p, '<strong>64 membros chegaram de Monte Sião em 28/02/2027</strong>, quando ela fechou e se juntou a Vila Nova. Já estão no rol de vocês, com a ficha inteira.', 'alerta');
  if (cel) return r32EsCel(p, 'Chegaram de Monte Sião', `${aviso}${r32Car(p, '5 dos 64', r28Mais(p, 'Ver todos'), lista, 1)}`);
  const vai = r28Vai(p, [['casa', 'O ponto de culto de Monte Sião agora é de Vila Nova.'], ['maleta', 'Os cargos de lá acabaram. Quem vai servir em Vila Nova, o dirigente põe no cargo.'], ['cartao', 'A carteirinha de cada um muda sozinha para Vila Nova.']]);
  const tit = r18Tit(p, 'Chegaram de Monte Sião', `64 membros e 1 ponto de culto · ${'01/03/2027'}`);
  return r35Es(p, 'local', 'Ficha da congregação', `${tit}${aviso}${r17Dois(r32Car(p, 'Os que chegaram', r28Mais(p, 'Ver os 64'), lista), r32Car(p, 'O que muda para Vila Nova', '', vai), '1.2fr 1fr')}`, ['Vila Nova', 'Chegaram de Monte Sião'], R32_USU.sec);
}
// o membro de Monte Sião vê a mudança no celular
function r35MuMembro(p, cel) {
  const aviso = r16aAviso(p, '<strong>A partir de 28/02/2027, a sua congregação é Vila Nova (nº 7).</strong> Monte Sião se juntou a ela.', 'alerta');
  const fatos = r31Fatos(p, [['Endereço', 'Rua Quinze, 300 · Vila Nova'], ['Dirigente', 'Pr. Abel Nogueira'], ['Domingo', '18h · e o ponto de culto de Monte Sião continua']], cel);
  if (cel) return r28MvCel(p, 'Minha congregação', `${aviso}${r32Car(p, 'Vila Nova', '', fatos, 1)}${r20Nota(p, 'A sua carteirinha já mostra Vila Nova.')}${r28Mais(p, 'Ver os cultos ›')}`);
  const tit = r18Tit(p, 'Minha congregação', `a mudança de Monte Sião · 01/03/2027`);
  return r28Mv(p, R35_USU.membro, ['Minha congregação'], `${tit}${aviso}${r17Dois(r32Car(p, 'Vila Nova (nº 7)', '', fatos), r32Car(p, 'O que muda para você', '', r28Vai(p, [['cartao', 'A carteirinha já mostra Vila Nova.'], ['dinheiro', 'As suas contribuições de antes continuam no seu histórico.']])), '1.2fr 1fr')}`);
}
const r35MudarTela = (p, k, d) => { const cel = ehCel(d); return k === 'area5' ? r35MuArea(p, cel) : k === 'juntar' ? r35Juntar(p, cel) : k === 'numeros' ? r35Numeros(p, cel) : k === 'local' ? r35MuLocal(p, cel) : k === 'membro' ? r35MuMembro(p, cel) : r35Mudar(p, cel); };
const PERFIS35_MUDAR = [['geral', 'Secretaria Geral · muda Recanto de área'], ['area5', 'Pastor da Área 5 · Recanto chega'], ['juntar', 'Secretaria Geral · fecha Monte Sião e junta'], ['numeros', 'Secretaria Geral · a numeração nova'], ['local', 'Secretaria de Vila Nova · recebe os membros'], ['membro', 'Membro de Monte Sião · a mudança']];
