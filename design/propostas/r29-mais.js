/* ---------------- 4. O ABANDONO: A CONGREGAÇÃO PEDE, A GERAL CONFIRMA ---------------- */
// O caminho que já existe desde a fase 1: a lista dos 90 dias sem comunhão; a secretaria da congregação pede; a pessoa recebe o
// aviso e tem 15 dias; a Geral confirma (quem pediu não confirma); cabe recurso à Assembleia em 30 dias. Depois, não há carta.
const R29_RADAR = [['JF', 'Varões', 'Jonas Ferreira', 'sem comunhão desde 12/03/2026 · 258 dias', 1], ['KR', 'Senhoras', 'Kátia Rocha', 'sem comunhão desde 20/07/2026 · 128 dias', 0], ['WP', 'Jovens', 'Wesley Pinto', 'sem comunhão desde 01/08/2026 · 116 dias', 0]];
const r29AbPassos = at => [['A congregação pede', 'a secretaria', at > 0 ? 'ok' : 'agora'], ['O aviso e os 15 dias', 'a pessoa se manifesta', at > 1 ? 'ok' : at === 1 ? 'agora' : 'depois'], ['A Geral confirma', 'quem pediu não confirma', at === 2 ? 'agora' : 'depois'], ['Cabe recurso', 'à Assembleia, em 30 dias', 'depois']];
function r29AbLocal(p, cel) {
  const radar = r27Cartao(p, 'Passaram de 90 dias sem comunhão', r18Etiq(p, '3', 'ouro'), `<div style="display:flex;flex-direction:column">${R29_RADAR.map((x, i) => r28Pes(p, r28Av(p, x[0], x[1], 30), x[2], x[3], r28Mais(p, 'Pedir ›'), { i, alt: 46, sel: !cel && x[4] })).join('')}</div>`, cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  const fatos = r28Fatos(p, [['Sem comunhão desde', '12/03/2026 (258 dias)'], ['Tentou contato', '2 vezes: ligação em 15/09 e visita em 02/10'], ['Cargo', 'nenhum'], ['Pedido por', 'Débora Lima, secretaria de Vila Nova']]);
  const bt = r21Ouro(p, 'Pedir o abandono do Jonas', 'seta', cel ? 44 : 42);
  const vai = r28Vai(p, [['envelope', 'O Jonas recebe o aviso e tem 15 dias, até 10/12/2026, para se manifestar'], ['pessoa', 'Se ele voltar a frequentar ou pedir a carta, o pedido é arquivado'], ['escudo', 'Depois dos 15 dias, a Secretaria Geral confirma; quem pediu não confirma']], cel);
  if (cel) return r27MbCel(p, 'Abandono', `${r27Caminho(p, r29AbPassos(0), { cel: 1 })}${radar}${r27Cartao(p, 'Pedir o abandono do Jonas', '', vai, 'padding:8px 12px;gap:2px')}${bt}`);
  const pedido = r27Cartao(p, 'Pedir o abandono do Jonas Ferreira', r18Etiq(p, 'você pede', 'ouro'), `${fatos}<div style="font-size:13px;font-weight:700;color:${p.titulo};padding-top:2px">Ao pedir</div>${vai}${bt}`, 'gap:8px');
  const tit = r18Tit(p, 'Abandono', `90 dias sem comunhão: a congregação pede, a Geral confirma · o caminho que já existe · Vila Nova · ${R29_HOJE}`);
  return r29Mb(p, 'local', 'Abandono', `${tit}${r27Caminho(p, r29AbPassos(0))}${r17Dois(r18Col(radar, r20Nota(p, 'A lista sai sozinha: quem está sem comunhão há mais de 90 dias. Só a secretaria da congregação pede.')), pedido, '1fr 1.15fr')}`);
}
// o Jonas recebe o aviso no aplicativo: pode voltar, conversar ou pedir a carta (enquanto o abandono não é confirmado, ele ainda é membro)
const R29_JONAS_U = { ini: 'JF', nome: 'Jonas Ferreira', papel: 'Membro · Vila Nova' };
function r29AbMembro(p, cel) {
  const aviso = r27Cartao(p, 'Um aviso da sua congregação', r18Etiq(p, 'até 10/12/2026', 'ouro'), `<div style="font-size:${cel ? 13 : 13.5}px;line-height:1.45;color:${p.texto}">A congregação <strong style="color:${p.titulo}">Vila Nova</strong> pediu o registro de abandono, porque você está há mais de 90 dias sem comunhão. <strong style="color:${p.titulo}">Você tem 15 dias, até 10/12/2026, para se manifestar.</strong> Sentimos a sua falta.</div>`, cel ? 'padding:10px 12px;gap:6px' : 'gap:8px');
  const op = [['Quero voltar a frequentar', 'o pedido é arquivado, e a secretaria fala com você'], ['Quero conversar com o pastor', 'o Pr. Abel Nogueira recebe o seu recado'], ['Quero a minha carta de mudança', 'você sai na hora, com a carta, como qualquer membro']];
  const opcoes = `<div style="display:flex;flex-direction:column;gap:8px">${op.map((x, i) => r28Opcao(p, i === 0, x[0], x[1], cel)).join('')}</div>`;
  const depois = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, cel ? 'Sem resposta até 10/12, a Geral pode confirmar o abandono. Depois disso, não há carta.' : 'Se você não se manifestar até 10/12/2026, a Secretaria Geral pode confirmar o abandono. Depois de confirmado, não há carta: a volta é pela secretaria, como qualquer um que volta.')}</div>`;
  const bt = r21Ouro(p, 'Responder', 'seta', cel ? 44 : 42);
  if (cel) return r28MvCel(p, 'Avisos', `${aviso}${opcoes}${bt}${depois}`);
  const tit = r18Tit(p, 'Avisos', `Minha vida · um aviso que pede a sua resposta · ${R29_HOJE}`);
  return r16bAperta(casca(p, { itens: [{ ic: 'casa', nome: 'Início' }, { ic: 'igreja', nome: 'Minha vida' }, { ic: 'sino', nome: 'Avisos', ativo: 1 }, { ic: 'pessoa', nome: 'Meu Perfil' }], usuario: R29_JONAS_U, trilha: ['Avisos'], conteudo: `${tit}${r17Dois(r18Col(aviso, depois), r18Col(opcoes, bt), '1fr 1fr')}` }));
}
const R29_AB_AREA = [['Jonas Ferreira', 'Vila Nova', '12/03/2026', ['15 dias correndo, até 10/12', 'ouro']], ['Neide Costa', 'Cidade Jardim', '02/04/2026', ['esperando a Geral', 'ouro']], ['Gérson Lima', 'Monte Sião', '18/01/2026', ['confirmado em 10/11 · recurso até 10/12', 'verm']], ['Kleber Assis', 'Bela Vista', '05/05/2026', ['arquivado: voltou a frequentar', 'verde']], ['Rita Sales', 'Vila Nova', '22/02/2026', ['arquivado: pediu a carta', 'verde']]];
function r29AbArea(p, cel) {
  const nums = [['2', 'correndo'], ['1', 'esperando a Geral'], ['2', 'arquivados']];
  if (cel) return r27MbCel(p, 'Abandono', `${r29Nums(p, r29Curto(nums), 1)}${r16aListaCel(p, R29_AB_AREA.map(x => [x[0], `${x[1]} · desde ${x[2]}`, r18Etiq(p, x[3][0].split(',')[0].split(' · ')[0], x[3][1])]))}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,0.8fr) 92px minmax(0,1.6fr)', ['Nome', 'Congregação', 'Sem comunhão desde', 'Onde está'], R29_AB_AREA.map(x => [x[0], x[1], x[2], r18Etiq(p, x[3][0], x[3][1])]));
  const tit = r18Tit(p, 'Abandono na Área 2', `a área acompanha; quem pede é a secretaria da congregação, e quem confirma é a Geral · ${R29_HOJE}`, r28Sel(p, 'As 12 da Área 2'));
  return r29Mb(p, 'area', 'Abandono', `${tit}${r27Caminho(p, r29AbPassos(1))}${r29Nums(p, nums)}${tab}`);
}
function r29AbGeral(p, cel) {
  const fila = [['NC', 'Senhoras', 'Neide Costa', 'Cidade Jardim · prazo vencido em 04/11 · sem resposta', 1], ['AR', 'Varões', 'Arlindo Reis', 'Área 7 · Esperança · prazo vencido em 18/11', 0], ['TB', 'Jovens', 'Tiago Barros', 'Área 4 · Liberdade · prazo vencido em 20/11', 0]];
  const conf = r27Cartao(p, 'Esperando a Geral', r18Etiq(p, '3', 'ouro'), fila.map((x, i) => r28Pes(p, r28Av(p, x[0], x[1], 30), x[2], x[3], cel ? r28Mais(p, 'Abrir ›') : '', { i, alt: 46, sel: !cel && x[4] })).join(''), cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  if (cel) return r27MbCel(p, 'Abandono', `${conf}${r16aAviso(p, 'Quem pediu não confirma: a Geral confirma. Depois, cabe recurso à Assembleia em 30 dias.')}`);
  const vai = r28Vai(p, [['pessoa', 'Ela sai do rol de membros de Cidade Jardim hoje'], ['maleta', 'Os cargos que tinha ficam vagos: era da recepção'], ['doc', 'Não há carta: a volta é pela secretaria, como qualquer um que volta'], ['balanca', 'Cabe recurso à Assembleia até 25/12/2026'], ['relogio', 'A partir de 25/12/2026, os dados começam a ser apagados, aos poucos']]);
  const aberta = r27Cartao(p, 'Neide Costa · abandono', r18Etiq(p, 'esperando você', 'ouro'), `${r28Fatos(p, [['Sem comunhão desde', '02/04/2026 (237 dias)'], ['Pedido por', 'Sandra Reis, secretaria de Cidade Jardim, em 20/10'], ['O aviso', 'em 20/10; prazo vencido em 04/11, sem resposta'], ['Tentou contato', '3 vezes: ligações e uma visita']])}<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:${p.titulo}">Ao confirmar</div>${vai}<div style="display:flex;gap:10px">${r21Ouro(p, 'Confirmar o abandono', 'check', 42).replace('display:flex', 'flex:1.3;display:flex')}${r28Bt(p, 'Devolver', 'voltar')}</div>`, 'gap:8px');
  const tit = r18Tit(p, 'Abandono', `Secretaria Geral · Igreja toda · o único caso em que alguém confirma · ${R29_HOJE}`);
  return r29Mb(p, 'geral', 'Abandono', `${tit}${r17Dois(r18Col(conf, r20Nota(p, 'Quem pediu não confirma (os dois olhos). Devolver: escreva o motivo, e a congregação vê.')), aberta, '1fr 1.25fr')}`);
}
const r29Abandono = (p, k, d) => { const cel = ehCel(d); return k === 'membro' ? r29AbMembro(p, cel) : k === 'area' ? r29AbArea(p, cel) : k === 'geral' ? r29AbGeral(p, cel) : r29AbLocal(p, cel); };
const PERFIS29_AB = [['local', 'Secretaria local · os 90 dias e o pedido'], ['membro', 'Membro · o aviso dos 15 dias'], ['area', 'Secretaria da Área 2 · acompanha'], ['geral', 'Secretaria Geral · confirmar']];
const R29_EXPLICA_AB = {
  local: '<strong>O abandono segue o caminho que já existe desde a fase 1.</strong> A lista sai sozinha: quem está sem comunhão há mais de 90 dias. A secretaria da congregação abre o pedido, com as tentativas de contato. O Jonas recebe o aviso e tem 15 dias para se manifestar; se voltar a frequentar, o pedido é arquivado. Quem pediu não confirma: a Geral confirma. <em>Para conferir: quem pede é a secretaria da congregação; depois de confirmado o abandono, não há carta (a volta é pela secretaria, como qualquer um que volta).</em>',
  membro: '<strong>O Jonas recebe o aviso no aplicativo,</strong> com o prazo de 15 dias, e responde: quer voltar a frequentar, quer conversar com o pastor ou quer a carta. <em>Para conferir: enquanto o abandono não é confirmado, ele ainda é membro, então pode pedir a carta e sair na hora, como qualquer um; o pedido de abandono é arquivado. Depois de confirmado, não há carta.</em>',
  area: '<strong>A área acompanha:</strong> onde está cada pedido das 12 congregações (os 15 dias correndo, esperando a Geral, confirmado com o prazo do recurso, arquivado).',
  geral: '<strong>A Geral confirma.</strong> Abre o pedido, vê desde quando a pessoa está sem comunhão, quem pediu, o aviso e o prazo, e confirma ou devolve com o motivo. Quem pediu não confirma. Ao confirmar: sai do rol, os cargos ficam vagos, não há carta, cabe recurso à Assembleia em 30 dias. <em>Para conferir: o apagamento começa 30 dias depois da confirmação, quando acaba o prazo do recurso.</em>'
};

/* ---------------- 5. OS CARGOS QUE FICARAM VAGOS ---------------- */
// Quem sai deixa os cargos vagos na hora. A diretoria e os cargos são cadastrados na Estrutura (módulo 3): o "Preencher" daqui
// leva ao cadastro do cargo lá (desenhado no módulo 3, não aqui). Quem preenche: a diretoria da congregação, o dirigente; a da
// área, o pastor da área; a geral, a Geral; o dirigente da congregação, o pastor da área ou a Geral, direto (respostas de 23/11).
const r29IcCargo = (p, nome) => `<span style="width:32px;height:32px;border-radius:9px;flex:none;background:${p.e ? '#1E3A6E' : '#E3ECFD'};display:flex;align-items:center;justify-content:center">${ic(nome, r27Azul(p), 17, 2)}</span>`;
const r29Preencher = p => r28Mais(p, 'Preencher ›');
const r29NotaEstr = (p, cel, extra) => r20Nota(p, cel ? 'Preencher abre o cargo na Estrutura, onde ficam a diretoria e os cargos.' : `Preencher abre o cargo na Estrutura, onde ficam cadastrados a diretoria e os cargos.${extra ? ' ' + extra : ''}`);
function r29VagosLocal(p, cel) {
  const vagos = [['maleta', 'Tesoureiro de Vila Nova', 'desde 25/11 · o Carlos saiu'], ['livro', 'Professor dos Jovens (EBD)', 'desde 25/11 · o Carlos saiu']];
  const lista = r27Cartao(p, 'Cargos vagos', r18Etiq(p, '2', 'azul'), vagos.map((x, i) => r28Pes(p, r29IcCargo(p, x[0]), x[1], x[2], r29Preencher(p), { i, alt: cel ? 50 : 54 })).join(''), cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  const escala = r27Cartao(p, 'Escalas com datas sem ninguém', r18Etiq(p, '2 datas', 'ouro'), `${r28Vai(p, [['calendario', 'Recepção: 29/11 e 06/12. O líder da recepção já foi avisado e repõe']], cel)}`, cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
  const nota = r29NotaEstr(p, cel, 'Se o Carlos voltar um dia, é o dirigente quem decide se devolve.');
  if (cel) return r27MbCel(p, 'Cargos vagos', `${lista}${escala}${nota}`);
  const tit = r18Tit(p, 'Cargos vagos de Vila Nova', `quem sai deixa o cargo vago na hora; a diretoria da congregação, o dirigente preenche · ${R29_HOJE}`);
  return r29Mb(p, 'local', 'Cargos vagos', `${tit}${r17Dois(r18Col(lista, nota), r18Col(escala), '1fr 1fr')}`, null, R29_DIR.local);
}
const R29_VAGOS_AREA = [['Monte Sião', '3', 'dirigente, desde 02/11 (você ou a Geral põe)', 'verm'], ['Vila Nova', '2', 'tesoureiro, desde 25/11', 'ouro'], ['Cidade Jardim', '1', 'recepção, desde 25/11', 'ouro'], ['Bela Vista', '0', '—', 'verde'], ['Jardim Ipê', '0', '—', 'verde'], ['Nova Esperança', '1', 'porteiro, desde 12/10', 'ouro']];
function r29VagosArea(p, cel) {
  const meus = [['dinheiro', 'Tesoureira da Área 2', 'desde 16/11 · a Sílvia Matos saiu'], ['igreja', 'Dirigente de Monte Sião', 'desde 02/11 · o dirigente saiu']];
  const meu = r27Cartao(p, 'Os que você preenche', r18Etiq(p, '2', 'azul'), `${meus.map((x, i) => r28Pes(p, r29IcCargo(p, x[0]), x[1], x[2], r29Preencher(p), { i, alt: cel ? 50 : 52 })).join('')}${r20Nota(p, cel ? 'O dirigente que falta, você ou a Geral põe, direto.' : 'Os cargos da área, o pastor da área preenche. O dirigente que falta numa congregação, você ou a Geral põe, direto.')}`, cel ? 'padding:8px 12px;gap:2px' : 'gap:4px');
  if (cel) return r27MbCel(p, 'Cargos vagos', `${meu}${r16aListaCel(p, R29_VAGOS_AREA.slice(1, 5).map(x => [x[0], x[2], r18Etiq(p, x[1], x[3])]))}${r29NotaEstr(p, 1)}`);
  const tab = r16aTab(p, 'minmax(0,1fr) 70px minmax(0,2fr)', ['Congregação', 'Vagos', 'O mais antigo'], R29_VAGOS_AREA.map(x => [x[0], r18Etiq(p, x[1], x[3]), x[2]]));
  const nota = r29NotaEstr(p, 0, 'A diretoria de cada congregação, o dirigente preenche; a área acompanha.');
  const tit = r18Tit(p, 'Cargos vagos da Área 2', `os da área e o dirigente que falta, o pastor da área; a diretoria das congregações, cada dirigente · ${R29_HOJE}`);
  return r29Mb(p, 'area', 'Cargos vagos', `${tit}${r17Dois(r18Col(meu, nota), r18Col(`<span style="font-size:14.5px;font-weight:700;color:${p.titulo}">As congregações da área</span>`, tab), '1fr 1.4fr')}`, null, R29_DIR.area);
}
const R29_VAGOS_GERAL = [['Área 1', 2, 0], ['Área 2', 8, 1], ['Área 3', 3, 0], ['Área 4', 5, 1], ['Área 5', 1, 0], ['Área 6', 2, 0], ['Área 7', 4, 2], ['Área 8', 0, 0], ['Área 9', 1, 0]];
function r29VagosGeral(p, cel) {
  const gerais = [['dinheiro', '2º Tesoureiro Geral', 'desde 05/11 · o titular saiu'], ['igreja', 'Dirigente de Monte Sião (Área 2)', 'desde 02/11 · o dirigente saiu'], ['igreja', 'Dirigente de Esperança (Área 7)', 'desde 20/11 · o dirigente faleceu']];
  const lista = r27Cartao(p, 'Os que a Geral pode preencher', r18Etiq(p, '3', 'azul'), `${gerais.map((x, i) => r28Pes(p, r29IcCargo(p, x[0]), x[1], x[2], r29Preencher(p), { i, alt: cel ? 50 : 52 })).join('')}${r20Nota(p, 'O dirigente que falta, a Geral ou o pastor da área põe, direto.')}`, cel ? 'padding:8px 12px;gap:2px' : 'gap:4px');
  if (cel) return r27MbCel(p, 'Cargos vagos', `${lista}${r16aListaCel(p, R29_VAGOS_GERAL.slice(0, 4).map(x => [x[0], `${x[1]} vagos · ${x[2]} há mais de 30 dias`, '']))}${r29NotaEstr(p, 1)}`);
  const tab = r16aTab(p, 'minmax(0,1fr) 80px minmax(0,1.3fr)', ['Área', 'Vagos', 'Há mais de 30 dias'], R29_VAGOS_GERAL.map(x => [x[0], String(x[1]), x[2] ? r18Etiq(p, String(x[2]), 'verm') : `<span style="color:${p.suave}">0</span>`]));
  const nota = r29NotaEstr(p, 0, 'A Geral preenche os cargos gerais e pode pôr o dirigente que falta; a diretoria das congregações e das áreas, quem cuida daquele nível.');
  const tit = r18Tit(p, 'Cargos vagos da Igreja toda', `quem saiu deixou o cargo vago sozinho; quem cuida de cada nível preenche · ${R29_HOJE}`);
  return r29Mb(p, 'geral', 'Cargos vagos', `${tit}${r17Dois(r18Col(lista, nota), r18Col(`<span style="font-size:14.5px;font-weight:700;color:${p.titulo}">Por área (os das congregações e das áreas)</span>`, tab), '1fr 1.2fr')}`, null, R29_DIR.geral);
}
const r29Vagos = (p, k, d) => { const cel = ehCel(d); return k === 'area' ? r29VagosArea(p, cel) : k === 'geral' ? r29VagosGeral(p, cel) : r29VagosLocal(p, cel); };
const PERFIS29_VAGOS = [['local', 'Dirigente de Vila Nova · a diretoria da congregação'], ['area', 'Pastor da Área 2 · os da área e o dirigente'], ['geral', 'Secretaria Geral · os gerais e o panorama']];
const R29_EXPLICA_VAGOS = {
  local: '<strong>O Carlos saiu, e os cargos dele ficaram vagos na hora:</strong> tesoureiro de Vila Nova e professor dos Jovens. O dirigente vê a lista e toca em “Preencher”, que abre o cargo na Estrutura: é lá que a diretoria e os cargos são cadastrados (essa tela será desenhada no módulo 3). As datas da escala que ficaram sem ninguém aparecem à parte. <em>Para conferir: se o Carlos voltar, quem decide se devolve o cargo é o dirigente.</em>',
  area: '<strong>O pastor da área preenche os cargos da área</strong> (a tesoureira da área saiu com carta) <strong>e pode pôr o dirigente que falta</strong> numa congregação (Monte Sião), direto, como você respondeu. A diretoria de cada congregação, o dirigente preenche; a área acompanha, do mais antigo para o mais novo. O “Preencher” abre o cargo na Estrutura.',
  geral: '<strong>A Geral preenche os cargos gerais e também pode pôr o dirigente que falta</strong> numa congregação (o pastor da área também pode). Vê os vagos por área, com os que passam de 30 dias em vermelho. O “Preencher” abre o cargo na Estrutura. Nesta rodada, a vaga nasce só da saída do membro.'
};

/* ---------------- 6. O QUE FICA GUARDADO E A VOLTA DE QUEM SAIU ---------------- */
// Em 30 dias: os cargos, as escalas, os contatos e a família. Em 1 ano: o resto do histórico (o batismo e o casamento juntos).
// Para sempre: o nome, a matrícula, o nascimento, a data da saída e os dízimos e ofertas.
const R29_REGUA = [
  ['25/11/2026', 'A saída', 'sai do rol; os cargos ficam vagos; o acesso fica só para as cartas', ['A ficha inteira, só para consulta'], 'azul', 0],
  ['25/12/2026', '30 dias', 'a 1ª leva do apagamento', ['Cargos e funções', 'Escalas', 'Telefone, e-mail e endereço', 'A família'], 'ouro', 1],
  ['25/11/2027', '1 ano', 'o resto do histórico', ['A linha do tempo', 'A EBD e os cursos', 'O batismo e o casamento', 'O resto da ficha'], 'ouro', 1],
  ['para sempre', 'Fica guardado', 'para reconhecer quem volta, e o que a lei manda', ['Nome', 'Matrícula', 'Nascimento', 'Data da saída', 'Dízimos e ofertas'], 'verde', 0]
];
const R29_TONS = { azul: p => r27Azul(p), ouro: () => '#FFB800', verde: p => m8Verde(p) };
function r29Regua(p, cel) {
  const ch = (t, risca) => `<span style="display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap;border:1px solid ${p.borda};color:${risca ? p.suave : p.titulo};background:${p.campo}">${risca ? ic('fechar', p.suave, 11, 2.4) + '&nbsp;' : ''}${t}</span>`;
  if (cel) return `<div style="display:flex;flex-direction:column;gap:0">${R29_REGUA.map((x, i) => `<div style="display:flex;gap:10px"><div style="display:flex;flex-direction:column;align-items:center;flex:none;width:14px"><span style="width:12px;height:12px;border-radius:6px;background:${R29_TONS[x[4]](p)};margin-top:4px;flex:none"></span>${i < R29_REGUA.length - 1 ? `<span style="flex:1;width:2px;background:${p.borda}"></span>` : ''}</div><div style="flex:1;min-width:0;padding-bottom:10px;display:flex;flex-direction:column;gap:5px"><div style="display:flex;align-items:center;gap:6px"><strong style="font-size:13.5px;color:${p.titulo}">${x[1]}</strong><span style="font-size:12px;color:${p.suave}">· ${x[0]}</span>${x[5] ? '' : ''}</div><div style="display:flex;flex-wrap:wrap;gap:5px">${x[3].map(t => ch(t, i === 1 || i === 2)).join('')}</div></div></div>`).join('')}</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">${R29_REGUA.map((x, i) => `<div style="background:${p.sup};border:1px solid ${p.borda};border-top:4px solid ${R29_TONS[x[4]](p)};border-radius:14px;padding:11px 13px;display:flex;flex-direction:column;gap:7px;min-width:0"><div style="display:flex;align-items:center;gap:6px"><strong style="font-size:15px;color:${p.titulo}">${x[1]}</strong><span style="flex:1"></span>${x[5] ? '' : ''}</div><div style="font-size:12.5px;font-weight:700;color:${p.texto}">${x[0]}</div><div style="font-size:12px;color:${p.suave};line-height:1.35;min-height:32px">${x[2]}</div><div style="display:flex;flex-wrap:wrap;gap:5px">${x[3].map(t => ch(t, i === 1 || i === 2)).join('')}</div></div>`).join('')}</div>`;
}
function r29Guardado(p, cel) {
  const quem = { av: ['CM', 'Varões'], nome: 'Carlos Moreira', sub: 'matrícula 2.317 · saiu em 25/11/2026 com carta, com os 2 filhos', sitHtml: r27Neutro(p, 'fora do rol desde 25/11/2026') };
  const hoje = r16aAviso(p, cel ? '<strong>Até 25/12/2026</strong> a ficha está inteira: se ele voltar, encontra tudo, menos os cargos.' : '<strong>Hoje, a ficha está inteira, só para consulta.</strong> Até 25/12/2026, se ele voltar, encontra tudo, menos os cargos (que ficaram vagos). O apagamento é sozinho, sem ninguém precisar mandar.');
  if (cel) return r27MbCel(p, 'Quem saiu', `${r28Quem(p, quem, 1)}${r29Regua(p, 1)}${hoje}`);
  const tit = r18Tit(p, 'O que fica guardado de quem saiu', `a ficha do Carlos Moreira · Vila Nova · ${R29_HOJE}`);
  return r29Mb(p, 'local', 'Saídas', `${tit}${r28Quem(p, quem)}${r29Regua(p)}${hoje}${r20Nota(p, 'Os dízimos e ofertas em nome da pessoa ficam para a contabilidade e a lei: só a tesouraria vê os valores.')}`, ['Saídas', 'Carlos Moreira']);
}
const R29_GUARD_AREA = [['Carlos Moreira', 'Vila Nova', '25/11/2026', ['em 25/12', 'neutro'], ['em 25/11/2027', 'neutro']], ['Sílvia Matos', 'Cidade Jardim', '16/11/2026', ['em 16/12', 'neutro'], ['em 16/11/2027', 'neutro']], ['Gérson Lima', 'Monte Sião', '10/11/2026', ['em 10/12', 'neutro'], ['em 10/11/2027', 'neutro']], ['Valter Nunes', 'Bela Vista', '03/09/2026', ['feito em 03/10', 'verde'], ['em 03/09/2027', 'neutro']], ['Ana Clara Souza', 'Bela Vista', '12/11/2025', ['feito', 'verde'], ['feito em 12/11', 'verde']], ['Elza Prado', 'Jardim Ipê', '20/06/2025', ['feito', 'verde'], ['feito', 'verde']]];
function r29GuardArea(p, cel) {
  const et = x => (x[1] === 'neutro' ? r27Neutro(p, x[0]) : r18Etiq(p, x[0], x[1]));
  if (cel) return r27MbCel(p, 'Quem saiu', `${r16aAviso(p, 'O apagamento é sozinho: em 30 dias e em 1 ano. A área só acompanha.')}${r16aListaCel(p, R29_GUARD_AREA.map(x => [x[0], `${x[1]} · saiu em ${x[2]}`, et(x[3])]))}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,0.9fr) 92px minmax(0,0.9fr) minmax(0,1fr)', ['Nome', 'Congregação', 'Saiu em', '30 dias', '1 ano'], R29_GUARD_AREA.map(x => [x[0], x[1], x[2], et(x[3]), et(x[4])]));
  const tit = r18Tit(p, 'Quem saiu da Área 2', `o apagamento é sozinho: em 30 dias e em 1 ano; ficam para sempre o nome, a matrícula, o nascimento e a data da saída · ${R29_HOJE}`);
  return r29Mb(p, 'area', 'Saídas', `${tit}${r29Regua(p)}${tab}`, ['Saídas', 'Quem saiu']);
}
function r29GuardGeral(p, cel) {
  const fica = r27Cartao(p, 'O que ficou', r18Etiq(p, 'para sempre', 'verde'), `${r28Fatos(p, [['Nome', 'Paulo Henrique Rocha'], ['Matrícula', '3.977'], ['Nascimento', '14/06/1980'], ['Data da saída', '03/10/2024 · com carta']])}<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'A busca ainda o acha pelo nome e pela matrícula, para reconhecer se ele voltar.')}</div>`, cel ? 'padding:10px 12px;gap:6px' : 'gap:8px');
  const diz = r27Cartao(p, 'Dízimos e ofertas em nome dele', r18Etiq(p, 'a lei manda guardar', 'azul'), `${r28Fatos(p, [['Os anos', 'de 2015 a 2024'], ['Os valores', 'só a tesouraria vê']])}`, cel ? 'padding:10px 12px;gap:6px' : 'gap:8px');
  const saiu = r27Cartao(p, 'O que já foi apagado', '', `<div style="display:flex;flex-wrap:wrap;gap:6px">${['Telefone', 'E-mail', 'Endereço', 'A família', 'Os cargos', 'As escalas', 'A linha do tempo', 'A EBD e os cursos', 'O batismo', 'O casamento'].map(t => `<span style="display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:12px;font-size:12px;border:1px solid ${p.borda};color:${p.suave};text-decoration:line-through">${t}</span>`).join('')}</div>`, cel ? 'padding:10px 12px;gap:6px' : 'gap:8px');
  if (cel) return r27MbCel(p, 'Quem saiu', `${fica}${diz}${saiu}`);
  const tit = r18Tit(p, 'A ficha de quem saiu há mais de 1 ano', `Paulo Henrique Rocha · saiu de Bela Vista em 03/10/2024 · ${R29_HOJE}`);
  return r29Mb(p, 'geral', 'Saídas', `${tit}${r17Dois(r18Col(fica, diz), saiu, '1fr 1fr')}`, ['Saídas', 'Paulo Henrique Rocha']);
}
// a volta: dentro dos 30 dias (a ficha inteira) e depois de anos (só o que fica para sempre)
function r29Volta(p, k, cel) {
  const v30 = k === 'volta30';
  const rec = r16aAviso(p, v30 ? (cel ? '<strong>O sistema reconheceu:</strong> é o Carlos Moreira, que saiu há 10 dias. A ficha ainda está inteira.' : '<strong>O sistema reconheceu:</strong> este cadastro do site é do Carlos Moreira, matrícula 2.317, que saiu em 25/11/2026 com carta. Faz 10 dias: a ficha ainda está inteira.') : (cel ? '<strong>O sistema reconheceu:</strong> é o Marcos Antunes, que saiu em 2019.' : '<strong>O sistema reconheceu</strong> pelo nome e pelo nascimento: este cadastro do site é do Marcos Antunes, matrícula 3.402, que saiu em 2019 com carta. Faz muitos anos: sobrou só o que fica para sempre.'));
  const cargo = v30 ? (cel ? 'nenhum; cada nível decide' : 'nenhum; cada nível decide se devolve') : 'nenhum';
  const como = r27Cartao(p, 'Como ele volta', '', r28Fatos(p, [['Matrícula', `${v30 ? '2.317' : '3.402'}, a mesma (é para sempre)`], ['Situação', r28Sit(p, 'membro em comunhão')], ['Data de entrada', `${v30 ? '05/12/2026' : '05/12/2026'}, a data nova`], ['Como entrou', 'Reconciliação'], ['Cargos', cargo], ['Integração', cel ? 'passa de novo' : 'passa de novo, como um membro novo']]), cel ? 'padding:10px 12px;gap:6px' : 'gap:8px');
  const filhos = v30 ? r27Cartao(p, 'Os filhos que saíram com ele', '', `${r29Filhos(p, cel)}${r20Nota(p, 'Voltam junto, se ele marcar.')}`, cel ? 'padding:8px 12px;gap:2px' : 'gap:4px') : '';
  const bt = r21Ouro(p, 'Confirmar a volta', 'check', cel ? 44 : 42);
  if (cel) return r27MbCel(p, 'Uma volta', `${rec}${como}${filhos}${bt}`);
  const grupo = (t, cor, L) => `<div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:${p.titulo}"><span style="width:8px;height:8px;border-radius:4px;background:${cor}"></span>${t}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${L.map(x => r27Neutro(p, x)).join('')}</div></div>`;
  const ficha = v30
    ? r27Cartao(p, 'A ficha dele', '', `${grupo('Estava guardado: volta tudo, como era', m8Verde(p), ['Nome', 'Matrícula', 'Nascimento', 'Contatos', 'Endereço', 'A família', 'Batismo', 'Casamento', 'A linha do tempo'])}${grupo('Não volta sozinho', '#FFB800', ['Tesoureiro', 'Professor dos Jovens', 'Diácono'])}${r20Nota(p, 'Os cargos ficaram vagos quando ele saiu: quem cuida daquele nível decide se devolve.')}`, 'gap:10px')
    : r27Cartao(p, 'A ficha dele', '', `${grupo('Estava guardado: para sempre', m8Verde(p), ['Nome', 'Matrícula', 'Nascimento', 'Data da saída'])}${grupo('Veio agora, do cadastro do site', r27Azul(p), ['Telefone', 'E-mail', 'Endereço'])}${grupo('Preencher de novo: foi apagado com o tempo', '#FFB800', ['Batismo', 'Estado civil', 'A família', 'CPF', 'O resto da ficha'])}`, 'gap:10px');
  const tit = r18Tit(p, v30 ? 'Uma volta dentro dos 30 dias' : 'Uma volta depois de muitos anos', `Congregação Vila Nova · chegou pelo “Quero me cadastrar” · 05/12/2026`, m8Linha(p, 'Não é ele', 'voltar'));
  const quem = r28Quem(p, v30 ? { av: ['CM', 'Varões'], nome: 'Carlos Moreira', sub: 'matrícula 2.317 · 48 anos · saiu em 25/11/2026 com carta', sitHtml: r27Neutro(p, 'fora do rol há 10 dias') } : { av: ['MA', 'Varões'], nome: 'Marcos Antunes', sub: 'matrícula 3.402 · 52 anos · saiu em 2019 com carta', sitHtml: r27Neutro(p, 'fora do rol desde 2019') });
  return r29Mb(p, 'local', 'Fila de cadastros', `${tit}${rec}${quem}${r17Dois(r18Col(como, filhos), r18Col(ficha, bt), '1fr 1fr')}`, ['Fila de cadastros', v30 ? 'Carlos Moreira' : 'Marcos Antunes']);
}
const r29Fica = (p, k, d) => { const cel = ehCel(d); return k === 'area' ? r29GuardArea(p, cel) : k === 'depois' ? r29GuardGeral(p, cel) : k === 'volta30' || k === 'volta' ? r29Volta(p, k, cel) : r29Guardado(p, cel); };
const PERFIS29_FICA = [['regua', 'Secretaria local · a régua de quem saiu'], ['area', 'Secretaria da Área 2 · quem saiu e quando apaga'], ['depois', 'Secretaria Geral · a ficha depois de 1 ano'], ['volta30', 'Secretaria local · a volta dentro dos 30 dias'], ['volta', 'Secretaria local · a volta depois de anos']];
const R29_EXPLICA_FICA = {
  regua: '<strong>A régua do que fica e do que sai, com as datas do Carlos.</strong> Na saída, a ficha fica inteira, só para consulta. Em 30 dias saem os cargos e as funções, as escalas, os contatos e a família. Em 1 ano sai o resto do histórico: a linha do tempo, a EBD e os cursos, o batismo e o casamento. Ficam para sempre: o nome, a matrícula, o nascimento, a data da saída e os dízimos e ofertas. O apagamento é sozinho. <em>Para conferir: os prazos de 30 dias e de 1 ano, e o batismo e o casamento saindo com o histórico (a sua lista do que fica para sempre não fala deles).</em>',
  area: '<strong>A área vê quem saiu das 12 congregações</strong> e quando cada leva do apagamento acontece (ou já aconteceu), sem mexer em nada.',
  depois: '<strong>A ficha de quem saiu há mais de 1 ano:</strong> sobrou o nome, a matrícula, o nascimento e a data da saída, e os dízimos e ofertas em nome dele (os valores, só a tesouraria vê). O resto foi apagado. <em>Para conferir: a ficha guarda também “com carta” junto da data da saída, e a busca ainda acha a pessoa pelo nome e pela matrícula, para reconhecer quem volta.</em>',
  volta30: '<strong>O Carlos se arrependeu e voltou 10 dias depois.</strong> Não se desfaz a saída: ele volta como qualquer um que volta, com a mesma matrícula, a data de entrada nova e sem os cargos, e passa pela integração. Como faz menos de 30 dias, a ficha ainda está inteira e volta como era. Os cargos ficaram vagos: quem cuida daquele nível decide se devolve. <em>Para conferir: os filhos que saíram com ele voltam junto, se ele marcar.</em>',
  volta: '<strong>A volta depois de muitos anos:</strong> o sistema reconhece pelo nome e pelo nascimento (o que fica para sempre). A matrícula é a mesma; o resto é preenchido de novo, e o que veio pelo cadastro do site já entra. É como um membro novo: passa pela integração.'
};

/* ---------------- 7. O FALECIMENTO (como na rodada 28) ---------------- */
// Sem redesenho: a data e quem informou, a certidão opcional, e o que o sistema faz sozinho. A ficha de quem faleceu fica guardada
// inteira e não se apaga aos poucos: é a memória da igreja.
const R29_FALEC = { av: ['JR', 'Varões'], nome: 'José Ribeiro', sub: 'matrícula 1.044 · 81 anos · Varões', sit: 'membro em comunhão' };
function r29FalecLocal(p, cel) {
  const vai = [['cadeado', 'A ficha fica guardada inteira e não se apaga com o tempo: é a memória da igreja'], ['pessoas', 'Sai das contagens de membros e do grupo dos Varões'], ['cartao', 'A carteirinha deixa de valer'], ['envelope', 'Para de receber os comunicados; a família não recebe mensagem automática'], ['livro', 'Entra na linha do tempo da ficha: “Falecimento”']];
  const vaiCel = [vai[0], vai[1], vai[2]];
  const bt = r21Ouro(p, 'Confirmar o falecimento', 'check', cel ? 44 : 42);
  if (cel) return r27MbCel(p, 'Registrar um falecimento', `${r28Quem(p, R29_FALEC, 1)}<div style="font-size:12px;color:${p.suave};line-height:1.35">faleceu em 18/11/2026 · informou: a filha, Márcia</div>${r27Cartao(p, 'O que vai acontecer', '', r28Vai(p, vaiCel, 1), 'padding:8px 12px;gap:2px')}${r28Viuva(p, 1)}${bt}`);
  const campos = `<div style="display:grid;grid-template-columns:140px minmax(0,1fr);gap:10px">${r17Campo(p, 'Data do falecimento', '18/11/2026', { obrig: 1 })}${r17Campo(p, 'Quem informou', 'Márcia Ribeiro, a filha, por telefone', { obrig: 1 })}</div>${r17Campo(p, 'Certidão de óbito', `${ic('clipe', p.suave, 15, 2)}Anexar, só se a família entregar`, { nota: 'não é obrigatória', vazio: 1 })}`;
  const p1 = r27Passo(p, 1, 'ok', 'A data e quem informou?', '', campos);
  const p3 = r27Passo(p, 2, 'agora', 'O que vai acontecer', 'o sistema faz sozinho, ao confirmar', `${r28Vai(p, vai)}<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'A ficha de quem faleceu não entra no apagamento aos poucos.')}</div>${r28Viuva(p)}${bt}`);
  const tit = r18Tit(p, 'Registrar um falecimento', `Congregação Vila Nova · ${R29_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r29Mb(p, 'local', 'Saídas', `${tit}${r28Quem(p, R29_FALEC)}${r17Dois(r18Col(p1, r20Nota(p, 'Como na rodada 28: a data e quem informou bastam; a certidão é opcional, porque a família nem sempre entrega.')), p3, '1fr 1.15fr')}`, ['Saídas', 'José Ribeiro']);
}
function r29FalecFicha(p, cel) {
  const lt = [['1971', 'Batismo nas águas, em Vila Nova'], ['1975', 'Casamento com a Zélia'], ['1988', 'Consagrado a diácono'], ['2004', 'Tesoureiro de Vila Nova, por 12 anos'], ['18/11/2026', 'Falecimento']];
  const linha = r27Cartao(p, 'A linha do tempo', r18Etiq(p, 'guardada', 'verde'), `<div style="display:flex;flex-direction:column">${lt.map((x, i) => `<div style="display:grid;grid-template-columns:${cel ? '78px' : '92px'} minmax(0,1fr);gap:10px;align-items:center;min-height:32px;${i ? `border-top:1px solid ${p.linha};` : ''}font-size:13px"><span style="color:${p.suave};font-weight:600">${x[0]}</span><span style="color:${p.titulo};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]}</span></div>`).join('')}</div>`, cel ? 'padding:8px 12px;gap:2px' : 'gap:4px');
  const fica = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, cel ? 'Não se apaga aos poucos: é a memória da igreja.' : 'A ficha de quem faleceu não se apaga aos poucos: fica inteira, como a memória da igreja. Só quem tem acesso àquela congregação a vê.')}</div>`;
  const quem = { av: ['JR', 'Varões'], nome: 'José Ribeiro', sub: 'matrícula 1.044 · Vila Nova · faleceu em 18/11/2026, aos 81 anos', sitHtml: r27Neutro(p, 'faleceu') };
  if (cel) return r27MbCel(p, 'José Ribeiro', `${r28Quem(p, quem, 1)}${linha}${fica}`);
  const dados = r27Cartao(p, 'A ficha', '', r28Fatos(p, [['Família', 'a Zélia (viúva), 3 filhos, 7 netos'], ['Batismo', '1971, em Vila Nova'], ['Cargo', 'diácono, desde 1988'], ['Informou', 'Márcia Ribeiro, a filha, em 18/11/2026']]), 'gap:4px');
  const tit = r18Tit(p, 'A ficha de quem faleceu', `fica guardada inteira · Secretaria Geral · ${R29_HOJE}`);
  return r29Mb(p, 'geral', 'Saídas', `${tit}${r28Quem(p, quem)}${r17Dois(r18Col(dados, fica), linha, '1fr 1.1fr')}`, ['Saídas', 'José Ribeiro']);
}
const r29Falecimento = (p, k, d) => (k === 'ficha' ? r29FalecFicha(p, ehCel(d)) : r29FalecLocal(p, ehCel(d)));
const PERFIS29_FALEC = [['local', 'Secretaria local · registrar'], ['ficha', 'Secretaria Geral · a ficha guardada']];
const R29_EXPLICA_FALEC = {
  local: '<strong>O falecimento, como estava na rodada 28:</strong> a data e quem informou bastam (a filha, por telefone); a certidão de óbito é opcional. O sistema faz o resto sozinho e pergunta se a esposa, Zélia, passa a viúva. <em>Para conferir: a ficha de quem faleceu fica guardada inteira e não entra no apagamento aos poucos.</em>',
  ficha: '<strong>A ficha de quem faleceu fica inteira,</strong> com a família, o batismo, os cargos e a linha do tempo: é a memória da igreja. <em>Para conferir: não se apaga com o tempo, ao contrário da ficha de quem saiu.</em>'
};
