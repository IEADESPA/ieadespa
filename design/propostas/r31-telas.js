/* ---------------- 3. O PEDIDO DA CARTA, COM A CIDADE ---------------- */
// O destino é só a cidade e o estado (nunca o nome da igreja); em branco, fica Parauapebas - PA. Cada um ganha a carta dele.
const R31_HOJE = '25/11/2026';
// troca um texto do desenho aprovado da 29; se o texto não estiver lá, para (o conferidor acusa)
const r31Troca = (h, pares) => pares.reduce((s, [a, b]) => { if (!s.includes(a)) throw new Error('r31Troca: não achei ' + a.slice(0, 50)); return s.split(a).join(b); }, h);
const r31Nota = (p, t) => `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, t)}</div>`;
const r31Passos = est => [['Para onde e quem vai', 'a cidade e os filhos', est[0]], ['Conferir e confirmar', 'vale na hora', est[1]], ['As cartas prontas', 'em PDF', est[2]]];
const R31_CIDADES = [['Marabá - PA', 1], ['Maracanaú - CE'], ['Maragogi - AL'], ['Marapanim - PA']];
// o campo da cidade: escreve e escolhe da lista das cidades do Brasil (aberta, no passo "a lista aberta")
function r31Cidade(p, cel, aberta, rot = 'Para qual cidade você vai?', val = 'Marabá - PA') {
  const campo = r17Campo(p, rot, aberta ? 'Mara' : val, { icone: 'mapa', nota: cel ? '' : 'cidade e estado' });
  const lista = aberta ? `<div style="position:absolute;left:0;right:0;top:100%;margin-top:4px;background:${p.sup};border:1px solid ${p.borda};border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,${p.e ? 0.5 : 0.18});padding:6px;z-index:5;display:flex;flex-direction:column;gap:2px">${R31_CIDADES.map(x => `<div style="display:flex;align-items:center;gap:9px;min-height:${cel ? 44 : 40}px;padding:0 10px;border-radius:9px;font-size:14px;color:${p.titulo};${x[1] ? `background:${p.e ? '#13294A' : '#EEF4FF'};` : ''}">${ic('mapa', p.suave, 15, 2)}<span><strong>Mara</strong>${x[0].slice(4)}</span></div>`).join('')}</div>` : '';
  return `<div style="position:relative;flex:none">${campo}${lista}</div>`;
}
function r31Pedir(p, cel, aberta) {
  const onde = r27Cartao(p, 'Para onde você vai?', '', `${r31Cidade(p, cel, aberta)}${r31Nota(p, cel ? 'Só a cidade, sem o nome da igreja. Em branco, fica Parauapebas - PA.' : 'Só a cidade e o estado, sem o nome da igreja. Se deixar em branco, fica Parauapebas - PA.')}`, cel ? 'padding:10px 12px;gap:7px;position:relative;z-index:3' : 'gap:8px;position:relative;z-index:3');
  const junto = r27Cartao(p, 'Quem sai com você', '', `<div style="display:flex;flex-direction:column">${r29Filhos(p, cel)}</div>${r20Nota(p, cel ? 'Só os filhos com menos de 18 anos. Cada um ganha a carta dele.' : 'Só os filhos com menos de 18 anos. Cada um ganha a carta dele, com o histórico dele.')}${r16aAviso(p, cel ? 'A Ana Paula pede a carta dela no celular dela.' : '<strong>A Ana Paula, sua esposa, é maior de idade:</strong> ela pede a carta dela no celular dela.')}`, cel ? 'padding:10px 12px;gap:7px' : 'gap:8px');
  const bt = r21Ouro(p, 'Continuar', 'seta', cel ? 44 : 42);
  if (cel) return r28MvCel(p, 'Pedir a minha carta', `${r27Caminho(p, r31Passos(['agora', 'depois', 'depois']), { cel: 1 })}${onde}${junto}${bt}`);
  const voce = r27Cartao(p, 'A carta leva o seu histórico', '', `${r28Quem(p, R29_CARLOS)}${r31Fatos(p, [['Chegada', '12/03/2009, por batismo'], ['Batismos', 'nas águas em 2009 · no Espírito Santo em 2010'], ['Consagrações', 'auxiliar em 2014 · diácono em 2017'], ['Cargos', 'tesoureiro de Vila Nova, professor dos Jovens e mais 1']])}${r20Nota(p, 'Vem da sua ficha, com as datas. Alguma data errada? Peça a correção antes, em “Minha ficha”.')}`, 'gap:8px');
  const tit = r18Tit(p, 'Pedir a minha carta de mudança', `Minha vida · você sai na hora, com a carta em PDF · ninguém precisa aprovar · ${R31_HOJE}`);
  return r28Mv(p, R29_CARLOS_U, ['Pedir a minha carta'], `${tit}${r27Caminho(p, r31Passos(['agora', 'depois', 'depois']))}${r17Dois(r18Col(onde, junto), r18Col(voce, bt), '1.1fr 1fr')}`);
}
// as cartas prontas (a da 29), agora dizendo que cada uma leva o histórico
const r31Pronto = (p, cel) => (cel ? r29Pronto(p, 1) : r31Troca(r29Pronto(p, 0), [['Ela leva os seus dados de hoje: a congregação, desde quando, a situação, o cargo e a função', 'Cada carta leva o histórico de quem sai: a chegada, os batismos, as consagrações e os cargos, com as datas']]));
// a secretaria pede no balcão por quem não usa o aplicativo: a congregação pela dona Maria José; a área pelo seu
// Sebastião, de Monte Sião, que está sem secretária. A cidade no lugar da igreja
const R31_POR_CID = { local: ['ela', 'Belém - PA'], area: ['ele', 'Canaã dos Carajás - PA'] };
function r31PedirPor(p, k, cel) {
  const c = R29_POR[k], aviso = c.aviso, [ele, cid] = R31_POR_CID[k], Ele = ele === 'ela' ? 'Ela' : 'Ele';
  const como = r28Opcao(p, 1, k === 'area' ? 'Ele pediu pessoalmente, aqui na secretaria da área' : 'Ela pediu pessoalmente, aqui na secretaria', 'não precisa de papel nem de prova', cel);
  const cidade = r31Cidade(p, cel, 0, `Para qual cidade ${ele} vai?`, cid);
  const bt = r21Ouro(p, 'Pedir a carta e imprimir', 'imprimir', cel ? 44 : 42);
  if (cel) return r27MbCel(p, 'Pedir a carta por alguém', `${r28Quem(p, c.quem, 1)}${como.replace('flex:1;min-width:0;', 'flex:none;')}${cidade}${r27Cartao(p, 'O que vai acontecer', '', r28Vai(p, [c.vai[0], c.vai[1], ['envelope', aviso]], 1), 'padding:8px 12px;gap:2px')}${r20Nota(p, `Fica registrado: ${c.sec.split(',')[0]}, ${c.hora}.`)}${bt}`);
  const p1 = r27Passo(p, 1, 'ok', 'Quem pediu', 'fica registrado sozinho', `${como}${r31Fatos(p, [['Pedido por', c.sec], ['Quando', c.hora]])}`);
  const p2 = r27Passo(p, 2, 'ok', 'Para onde vai', 'e quem sai junto', `${cidade}${r31Nota(p, 'Só a cidade e o estado, sem o nome da igreja. Em branco, fica Parauapebas - PA. Filhos menores que saem junto: nenhum.')}`);
  const p3 = r27Passo(p, 3, 'agora', 'O que vai acontecer', 'na hora, como pelo aplicativo', `${r28Vai(p, c.vai.concat([['envelope', aviso]]))}${bt}${r20Nota(p, `${Ele} leva a carta impressa, com o histórico; o QR vale do mesmo jeito.`)}`);
  const tit = r18Tit(p, 'Pedir a carta por alguém', `para quem não sabe usar o aplicativo · ${c.sub} · ${R31_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r29Mb(p, k, 'Saídas', `${tit}${r28Quem(p, c.quem)}${r17Dois(r18Col(p1, p2), p3, '1fr 1fr')}`, ['Saídas', 'Pedir a carta por alguém']);
}
// a Geral: quem pediu por quem, agora com a cidade de cada um
const R31_CID = ['Canaã dos Carajás - PA', 'Belém - PA', 'Parauapebas - PA', 'Marabá - PA', 'Imperatriz - MA', 'Curionópolis - PA', 'Parauapebas - PA'];
function r31PedidasGeral(p, cel) {
  const L = R29_PEDIDAS.map((x, i) => [x[0], x[1], R31_CID[i], x[2].replace(' · Novo Horizonte', ' · Área 6'), x[3], x[4]]);
  if (cel) return r27MbCel(p, 'Pedidas pela secretaria', `${r16aAviso(p, 'Quem pediu a carta por quem não sabe usar o aplicativo, e para qual cidade a pessoa foi.')}${r16aListaCel(p, L.slice(0, 6).map(x => [x[0], `${x[2]} · ${x[3].split(' · ')[0]}`, r18Etiq(p, x[5][0].replace(' na ficha', ''), x[5][1])]))}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,0.95fr) minmax(0,1fr) minmax(0,1.05fr) 80px minmax(0,0.85fr)', ['Quem saiu', 'Congregação', 'Vai para', 'Pedida por', 'Quando', 'O aviso foi para'], L.map(x => [x[0], x[1], x[2], x[3], x[4], r18Etiq(p, x[5][0], x[5][1])]));
  const tit = r18Tit(p, 'Cartas pedidas pela secretaria', `em novembro · a congregação, a área ou a Geral pediu por quem não sabe usar o aplicativo · ${R31_HOJE}`, m8Ouro(p, 'Pedir a carta por alguém', 'mais', 40));
  return r29Mb(p, 'geral', 'Saídas', `${tit}${tab}${r31Nota(p, 'Sem prova, mas com trilha: quem pediu, quando e para onde foi o aviso. O aviso manda a pessoa procurar a Secretaria Geral se não foi ela quem pediu. Quem não tem e-mail na ficha não recebe o aviso; a secretaria fica sabendo.')}`, ['Saídas', 'Pedidas pela secretaria']);
}
// o aviso para a pessoa: procurar a Secretaria Geral (nada de "responda este e-mail")
const r31Email = (p, cel) => r31Troca(r29Email(p, cel), [
  ['<strong>Não foi ela quem pediu?</strong> Responda este e-mail ou fale com a Secretaria Geral. Fica registrado quem pediu e quando.', '<strong>Não foi ela quem pediu, ou quer saber mais?</strong> Entre em contato com a Secretaria Geral da IEADESPA: lá ela fica sabendo de tudo e, se for o caso, é reintegrada. Fica registrado quem pediu e quando.'],
  ['IEADESPA · este aviso vai para o e-mail que está na ficha.', 'IEADESPA · este aviso vai para o e-mail que está na ficha. Não precisa responder.']
]);
const r31Pedido = (p, k, d) => { const cel = ehCel(d); return k === 'cidade' ? r31Pedir(p, cel, 1) : k === 'pronto' ? r31Pronto(p, cel) : k === 'local' ? r31PedirPor(p, 'local', cel) : k === 'area' ? r31PedirPor(p, 'area', cel) : k === 'geral' ? r31PedidasGeral(p, cel) : k === 'aviso' ? r31Email(p, cel) : r31Pedir(p, cel, 0); };
const PERFIS31_PEDIDO = [['membro', 'Membro · para qual cidade e quem vai'], ['cidade', 'Membro · a cidade, com a lista aberta'], ['pronto', 'Membro · uma carta para cada um'], ['local', 'Secretaria local · pede pela dona Maria José'], ['area', 'Secretaria da Área 2 · pede pelo seu Sebastião'], ['geral', 'Secretaria Geral · quem pediu por quem, com a cidade'], ['aviso', 'A pessoa · o aviso: procure a Secretaria Geral']];

/* ---------------- 4. O ABANDONO: A CONGREGAÇÃO PEDE, A GERAL CONFERE E A CÂMARA DE LIDERANÇA APROVA ---------------- */
// Resposta de 24/11: a Câmara de liderança vem ALÉM da Geral. Só vale aprovado na reunião; no sistema fica só o registro
// ("aprovado na reunião de dd/mm/aaaa, ata nº X"), sem pauta. Até a Câmara aprovar, a pessoa continua no rol.
const r31AbPassos = at => [['A congregação pede', 'a secretaria'], ['O aviso e os 15 dias', 'a pessoa se manifesta'], ['A Geral confere', 'quem pediu não confere'], ['A Câmara aprova', 'na reunião, com a ata'], ['Cabe recurso', 'à Assembleia, em 30 dias']].map((x, i) => x.concat([i < at ? 'ok' : i === at ? 'agora' : 'depois']));
const r31Chip = (p, t, on) => chipFiltro(p, t, on).replace(/<svg[\s\S]*?<\/svg>/, '').replace('height:32px', 'height:28px').replace('padding:0 12px', 'padding:0 10px').replace('font-size:13px', 'font-size:12.5px');
function r31AbConferir(p, cel) {
  const fila = [['NC', 'Senhoras', 'Neide Costa', 'Área 2 · Cidade Jardim · prazo vencido em 04/11', 1], ['AR', 'Varões', 'Arlindo Reis', 'Área 7 · Esperança · prazo vencido em 18/11', 0], ['TB', 'Jovens', 'Tiago Barros', 'Área 4 · Liberdade · prazo vencido em 20/11', 0]];
  const conf = r27Cartao(p, 'Para a Geral conferir', r18Etiq(p, '3', 'ouro'), fila.map((x, i) => r28Pes(p, r28Av(p, x[0], x[1], 30), x[2], cel ? x[3].replace('prazo vencido em', 'venceu em') : x[3], cel ? r28Mais(p, 'Abrir ›') : '', { i, alt: 46, sel: !cel && x[4] })).join(''), cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  if (cel) return r27MbCel(p, 'Abandono', `${r27Caminho(p, r31AbPassos(2), { cel: 1 })}${conf}${r16aAviso(p, 'A Geral confere e leva à Câmara de liderança. Só vale depois de aprovado na reunião.')}`);
  const vai = r28Vai(p, [['escudo', 'O caso vai para a próxima reunião da Câmara de liderança: fica “aguardando a Câmara”'], ['pessoa', 'Até a Câmara aprovar, ela continua no rol de Cidade Jardim'], ['doc', 'Depois da reunião, a Secretaria Geral registra a data e o número da ata']]);
  const aberta = r27Cartao(p, 'Neide Costa · abandono', r18Etiq(p, 'para você conferir', 'ouro'), `${r31Fatos(p, [['Sem comunhão desde', '02/04/2026 (237 dias)'], ['Pedido por', 'Sandra Reis, secretaria de Cidade Jardim, em 20/10'], ['O aviso', 'em 20/10; prazo vencido em 04/11, sem resposta'], ['Tentou contato', '3 vezes: ligações e uma visita']])}<div style="font-size:13px;font-weight:700;color:${p.titulo}">Ao conferir</div>${vai}<div style="display:flex;gap:10px">${r21Ouro(p, 'Conferido: levar à Câmara', 'check', 42).replace('display:flex', 'flex:1.3;display:flex')}${r28Bt(p, 'Devolver', 'voltar')}</div>`, 'gap:8px');
  const tit = r18Tit(p, 'Abandono', `Secretaria Geral · Igreja toda · a Geral confere, e a Câmara de liderança aprova · ${R31_HOJE}`);
  return r29Mb(p, 'geral', 'Abandono', `${tit}${r27Caminho(p, r31AbPassos(2))}${r17Dois(r18Col(conf, r20Nota(p, 'Quem pediu não confere. Devolver: escreva o motivo, e a congregação vê.')), aberta, '1fr 1.25fr')}`);
}
// depois da reunião: a Secretaria Geral registra a data, o número da ata e o resultado de cada caso
const R31_CAMARA = [['NC', 'Senhoras', 'Neide Costa', 'Área 2 · Cidade Jardim · conferido 25/11', 0], ['EP', 'Varões', 'Edson Paiva', 'Área 2 · Vila Nova · conferido 24/11', 0], ['AR', 'Varões', 'Arlindo Reis', 'Área 7 · Esperança · conferido 26/11', 0], ['TB', 'Jovens', 'Tiago Barros', 'Área 4 · Liberdade · conferido 27/11', 2]];
const R31_RES = ['Aprovado', 'Não aprovado', 'Outra reunião'];
function r31AbCamara(p, cel) {
  const linha = (x, i) => `<div style="display:flex;${cel ? 'flex-direction:column;align-items:stretch;gap:6px;padding:8px 0' : 'align-items:center;gap:10px;min-height:54px'};${i ? `border-top:1px solid ${p.linha};` : ''}"><div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">${r28Av(p, x[0], x[1], 30)}<div style="min-width:0;line-height:1.25"><div style="font-size:13.5px;font-weight:700;color:${p.titulo};white-space:nowrap">${x[2]}</div><div style="font-size:11.5px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[3]}</div></div></div><div style="display:flex;gap:5px;flex:none">${R31_RES.map((t, j) => r31Chip(p, t, j === x[4])).join('')}</div></div>`;
  const lista = r27Cartao(p, 'Aguardando a Câmara', r18Etiq(p, '4', 'ouro'), `<div style="display:flex;flex-direction:column">${R31_CAMARA.map(linha).join('')}</div>`, cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  const data = r17Campo(p, 'Data da reunião', '02/12/2026', { obrig: 1, icone: 'calendario' }), ata = r17Campo(p, 'Ata nº', '47', { obrig: 1 });
  const soma = `<div style="font-size:12.5px;color:${p.texto};line-height:1.4"><strong style="color:${p.titulo}">3 aprovados</strong> · 1 fica para outra reunião</div>`;
  const bt = r21Ouro(p, 'Registrar a reunião', 'check', cel ? 44 : 42);
  if (cel) return r27MbCel(p, 'A reunião da Câmara', `${lista}<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:8px">${data}${ata}</div>${soma}${bt}`);
  const form = r27Cartao(p, 'A reunião da Câmara de liderança', '', `<div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px">${data}${ata}</div>${r17Campo(p, 'Registrado por', 'João da Silva · Secretaria Geral (quem está entrando)', { auto: 1, icone: 'cadeado' })}${soma}${bt}${r20Nota(p, 'Só o registro: a pauta e a ata ficam com a Câmara.')}`, 'gap:10px');
  const tit = r18Tit(p, 'A reunião da Câmara de liderança', `Secretaria Geral · o resultado de cada caso, a data e o número da ata · 02/12/2026`, m8Linha(p, 'Voltar', 'voltar'));
  return r29Mb(p, 'geral', 'Abandono', `${tit}${r27Caminho(p, r31AbPassos(3))}${r17Dois(lista, form, '1.9fr 1fr')}`, ['Abandono', 'A reunião da Câmara']);
}
// o caso depois do registro: o que ficou registrado e o que aconteceu
function r31AbFeito(p, cel) {
  const reg = `<div style="display:flex;align-items:center;gap:12px;padding:${cel ? '10px 12px' : '12px 14px'};border-radius:14px;background:${p.e ? '#0F3B2E' : '#E8F6EE'};border:1px solid ${p.e ? '#1F6B50' : '#A9DDBF'};flex:none">${r27Check(p, cel ? 28 : 32)}<div style="min-width:0;line-height:1.35;font-size:${cel ? 13.5 : 14.5}px;color:${p.titulo}"><strong>Abandono aprovado na reunião da Câmara de liderança de 02/12/2026, ata nº 47.</strong></div></div>`;
  const trilha = r27Cartao(p, 'O caminho do caso', '', r31Fatos(p, [['20/10', 'pedido por Sandra Reis, secretaria de Cidade Jardim'], ['04/11', 'o prazo do aviso venceu, sem resposta'], ['25/11', 'conferido por João da Silva, Secretaria Geral'], ['02/12', 'aprovado na Câmara (ata nº 47); registrou João da Silva']]), cel ? 'padding:8px 12px;gap:4px' : 'gap:4px');
  const vai = r27Cartao(p, 'O que aconteceu', '', r28Vai(p, [['pessoa', 'Ela saiu do rol de membros de Cidade Jardim em 02/12/2026'], ['maleta', 'O cargo que tinha ficou vago: era da recepção'], ['doc', 'Não há carta: a volta é pela secretaria, como qualquer um que volta'], ['balanca', 'Cabe recurso à Assembleia até 01/01/2027'], ['relogio', 'A partir de 01/01/2027, os dados começam a ser apagados, aos poucos']], cel), cel ? 'padding:8px 12px;gap:2px' : 'gap:4px');
  if (cel) return r27MbCel(p, 'Neide Costa', r30Pos(`${reg}${trilha}${r27Cartao(p, 'O que aconteceu', '', r28Vai(p, [['pessoa', 'Saiu do rol de Cidade Jardim em 02/12'], ['balanca', 'Recurso à Assembleia até 01/01/2027']], 1), 'padding:8px 12px;gap:2px')}`, r30Toast(p, 'Reunião registrada: 3 aprovados, 1 para outra reunião.', 1), 1));
  const quem = r28Quem(p, { av: ['NC', 'Senhoras'], nome: 'Neide Costa', sub: 'matrícula 4.112 · Cidade Jardim · Área 2', sitHtml: r18Etiq(p, 'aprovado na Câmara', 'verm') });
  const tit = r18Tit(p, 'Neide Costa · abandono', `Secretaria Geral · o caso depois da reunião da Câmara · 02/12/2026`, m8Linha(p, 'Voltar', 'voltar'));
  return r29Mb(p, 'geral', 'Abandono', r30Pos(`${tit}${r27Caminho(p, r31AbPassos(4))}${quem}${reg}${r17Dois(trilha, vai, '1fr 1.1fr')}`, r30Toast(p, 'Reunião de 02/12/2026 registrada: 3 abandonos aprovados e 1 fica para outra reunião.')), ['Abandono', 'Neide Costa']);
}
// a secretaria de Vila Nova: os pedidos dela; o do Edson está aguardando a Câmara
const R31_AB_VN = [['Jonas Ferreira', 'pedido em 25/11', ['15 dias, até 10/12', 'ouro']], ['Edson Paiva', 'conferido pela Geral em 24/11', ['aguardando a Câmara', 'azul'], 1], ['Luís Barbosa', 'aprovado na reunião de 18/11/2026, ata nº 46', ['recurso até 18/12', 'verm']], ['Rita Sales', 'pediu a carta em 12/11', ['arquivado', 'verde']]];
function r31AbLocal(p, cel) {
  const lista = r27Cartao(p, 'Os pedidos de Vila Nova', '', `<div style="display:flex;flex-direction:column">${R31_AB_VN.map((x, i) => r28Pes(p, r28Av(p, x[0].split(' ').map(s => s[0]).join(''), 'Varões', 30), x[0], x[1], r18Etiq(p, x[2][0], x[2][1]), { i, alt: 50, sel: !cel && x[3] })).join('')}</div>`, cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  if (cel) return r27MbCel(p, 'Abandono', `${r27Caminho(p, r31AbPassos(3), { cel: 1 })}${lista}${r16aAviso(p, '<strong>Aguardando a Câmara:</strong> só vale depois de aprovado na reunião. Até lá, ele continua no rol.')}`);
  const caso = r27Cartao(p, 'Edson Paiva · abandono', r18Etiq(p, 'aguardando a Câmara', 'azul'), `${r31Fatos(p, [['Sem comunhão desde', '14/05/2026 (195 dias)'], ['Pedido por', 'Débora Lima, secretaria de Vila Nova, em 06/10'], ['O aviso', 'em 06/10; prazo vencido em 21/10, sem resposta'], ['Conferido', 'pela Secretaria Geral em 24/11'], ['A Câmara', 'vai para a próxima reunião da Câmara de liderança']])}${r16aAviso(p, '<strong>Até a Câmara aprovar, ele continua no rol de Vila Nova.</strong> Se ele voltar a frequentar antes da reunião, avise a Secretaria Geral: o pedido é arquivado.')}`, 'gap:8px');
  const tit = r18Tit(p, 'Abandono', `90 dias sem comunhão: a congregação pede, a Geral confere e a Câmara de liderança aprova · Vila Nova · ${R31_HOJE}`);
  return r29Mb(p, 'local', 'Abandono', `${tit}${r27Caminho(p, r31AbPassos(3))}${r17Dois(lista, caso, '1fr 1.15fr')}`);
}
const R31_AB_AREA = [['Jonas Ferreira', 'Vila Nova', '12/03/2026', ['15 dias correndo, até 10/12', 'ouro']], ['Neide Costa', 'Cidade Jardim', '02/04/2026', ['a Geral está conferindo', 'ouro']], ['Edson Paiva', 'Vila Nova', '14/05/2026', ['aguardando a Câmara', 'azul']], ['Gérson Lima', 'Monte Sião', '18/01/2026', ['aprovado na reunião de 18/11/2026, ata nº 46', 'verm']], ['Luís Barbosa', 'Vila Nova', '20/04/2026', ['aprovado na reunião de 18/11/2026, ata nº 46', 'verm']], ['Kleber Assis', 'Bela Vista', '05/05/2026', ['arquivado: voltou a frequentar', 'verde']], ['Rita Sales', 'Vila Nova', '09/06/2026', ['arquivado: pediu a carta em 12/11', 'verde']]];
function r31AbArea(p, cel) {
  const nums = [['1', '15 dias correndo'], ['2', 'na Geral ou na Câmara'], ['2', 'aprovados'], ['2', 'arquivados']];
  if (cel) return r27MbCel(p, 'Abandono', `${r29Nums(p, [['1', 'correndo'], ['2', 'Geral/Câmara'], ['2', 'aprovados']], 1)}${r16aListaCel(p, R31_AB_AREA.map(x => [x[0], `${x[1]} · desde ${x[2]}`, r18Etiq(p, x[3][0].replace(/ na reunião.*/, '').replace(', até 10/12', '').replace(/: .*/, '').replace('a Geral está conferindo', 'na Geral'), x[3][1])]))}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,0.8fr) 132px minmax(0,1.7fr)', ['Nome', 'Congregação', 'Sem comunhão desde', 'Onde está'], R31_AB_AREA.map(x => [x[0], x[1], x[2], r18Etiq(p, x[3][0], x[3][1])]));
  const tit = r18Tit(p, 'Abandono na Área 2', `a área acompanha; a congregação pede, a Geral confere e a Câmara de liderança aprova · ${R31_HOJE}`, r28Sel(p, 'As 12 da Área 2'));
  return r29Mb(p, 'area', 'Abandono', `${tit}${r27Caminho(p, r31AbPassos(3))}${r29Nums(p, nums)}${tab}`);
}
const r31Abandono = (p, k, d) => { const cel = ehCel(d); return k === 'camara' ? r31AbCamara(p, cel) : k === 'feito' ? r31AbFeito(p, cel) : k === 'local' ? r31AbLocal(p, cel) : k === 'area' ? r31AbArea(p, cel) : r31AbConferir(p, cel); };
const PERFIS31_AB = [['geral', 'Secretaria Geral · conferir e levar à Câmara'], ['camara', 'Secretaria Geral · 02/12: registrar a reunião da Câmara'], ['feito', 'Secretaria Geral · o caso aprovado, com a ata'], ['local', 'Secretaria local · aguardando a Câmara'], ['area', 'Secretaria da Área 2 · acompanha']];

/* ---------------- 5. A VOLTA DE QUEM SAIU, SEM OS CARGOS ---------------- */
// Resposta de 24/11: ninguém decide devolver cargo. Quem sai perde os cargos; para ter cargo de novo, faz o caminho inteiro
// (o protocolo da função). Saem todos os "devolve" da 29 (a volta e os cargos vagos).
const r31Volta = (p, cel) => r31Troca(r29Volta(p, 'volta30', cel), cel
  ? [['nenhum; cada nível decide', 'nenhum: não voltam']]
  : [['nenhum; cada nível decide se devolve', 'nenhum: não voltam'], ['Não volta sozinho', 'Não voltam: ele perdeu na saída'], ['Os cargos ficaram vagos quando ele saiu: quem cuida daquele nível decide se devolve.', 'Quem sai perde os cargos. Para ter um cargo de novo, ele faz o caminho inteiro, como qualquer membro (o protocolo da função).']]);
const r31Vagos = (p, cel) => (cel ? r31Troca(r29Vagos(p, 'local', 'celular'), [['Preencher abre o cargo na Estrutura, onde ficam a diretoria e os cargos.', 'Preencher abre o cargo na Estrutura. Se o Carlos voltar, os cargos não voltam com ele.']]) : r31Troca(r29Vagos(p, 'local', 'notebook'), [['Se o Carlos voltar um dia, é o dirigente quem decide se devolve.', 'Se o Carlos voltar, os cargos não voltam com ele: para ter cargo de novo, ele faz o caminho inteiro.']]));
const r31VoltaTela = (p, k, d) => (k === 'vagos' ? r31Vagos(p, ehCel(d)) : r31Volta(p, ehCel(d)));
const PERFIS31_VOLTA = [['volta30', 'Secretaria local · o Carlos volta 10 dias depois'], ['vagos', 'Dirigente de Vila Nova · os cargos vagos continuam vagos']];
