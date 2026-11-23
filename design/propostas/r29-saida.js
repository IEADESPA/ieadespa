/* ================= Rodada 29: a saída do membro, refeita com as regras de 23/11/2026 ================= */
// O membro sai sozinho, pelo aplicativo, na hora, seja qual for o cargo; ninguém confirma. Sai com a carta de mudança em PDF
// (os dados mais recentes, o QR e o protocolo, sem linha de assinatura). Cada adulto pede a sua; os filhos menores saem junto
// com quem pediu. Os cargos ficam vagos sozinhos. A secretaria só entra no "não sabe usar" e no abandono. Os dados saem aos
// poucos a partir de 30 dias. Nomes e números de mentira.
const R29_HOJE = '25/11/2026';
// o menu de Membros da 29: em Movimentações, "Saídas", "Abandono" e "Cargos vagos" (no lugar de "Desligamentos")
function r29MbGrupos(k, ativo) {
  const G = [['Painéis', [['grafico', 'Painel executivo']]], ['Membros', [['pessoas', 'Pessoas'], ['filtro', 'Listas'], ['doc', 'Fila de cadastros'], ['mais', 'Cadastrar']]], ['Movimentações', [['seta', 'Transferências'], ['saida', 'Saídas'], ['relogio', 'Abandono'], ['maleta', 'Cargos vagos']]], ['Cuidados com o cadastro', [['pessoas', 'Fichas repetidas'], ['lapis', 'Sugestões de alteração'], ['cartao', 'Carteirinhas']]]];
  return G.map(g => { const tem = g[1].some(f => f[1] === ativo); return [g[0], g[1].map(f => (f[1] === ativo ? f.concat([1]) : f)), tem]; });
}
const R29_DIR = { local: { ini: 'AN', nome: 'Pr. Abel Nogueira', papel: 'Dirigente · Vila Nova' }, area: { ini: 'DT', nome: 'Pr. Davi Teixeira', papel: 'Pastor da Área 2' }, geral: LIDER };
const r29Mb = (p, k, ativo, conteudo, trilha, usu) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'pessoas', { titulo: 'Membros', escopo: R27_MB_ESC[k], grupos: r29MbGrupos(k, ativo), usuario: usu || R27_SEC[k] }), trilha: ['Membros'].concat(trilha || [ativo]), faixa: mc(p, 'pessoas').cor, conteudo }));
// quem saiu: por 30 dias o aplicativo só mostra as cartas
const R29_CARLOS_U = { ini: 'CM', nome: 'Carlos Moreira', papel: 'Membro · Vila Nova' };
const r29Saiu = (p, u, conteudo) => r16bAperta(casca(p, { itens: [{ ic: 'doc', nome: 'Minhas cartas', ativo: 1 }], usuario: u, trilha: ['Minhas cartas'], conteudo }));
const r29SaiuCel = (p, conteudo) => cascaCel(p, { titulo: 'Minhas cartas', conteudo });
// a caixinha de marcar
const r29Caixa = (p, on) => `<span style="width:20px;height:20px;border-radius:6px;flex:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? `background:${p.e ? '#FFB800' : '#0A2342'};` : `border:1.5px solid ${p.campoBorda};`}">${on ? ic('check', p.e ? '#0A2342' : '#FFFFFF', 13, 3) : ''}</span>`;
// no celular, o rótulo do número fica curto (cabe sem cortar)
const r29Curto = L => L.map(x => [x[0], x[1].replace('saídas em novembro', 'saídas · nov').replace('abandono correndo', 'abandono').replace('esperando a Geral', 'na Geral')]);
// os números pequenos no alto de uma lista (notebook) ou em quadradinhos (celular)
const r29Nums = (p, L, cel) => cel
  ? `<div style="display:flex;gap:8px;flex:none">${L.map(x => `<div style="flex:1;min-width:0;background:${p.sup};border:1px solid ${p.borda};border-radius:12px;padding:7px 10px;line-height:1.2"><strong style="font-size:19px;color:${p.titulo}">${x[0]}</strong><div style="font-size:11.5px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]}</div></div>`).join('')}</div>`
  : `<div style="display:flex;gap:10px;flex:none">${L.map(x => `<div style="flex:1;min-width:0;background:${p.sup};border:1px solid ${p.borda};border-radius:14px;padding:10px 14px;line-height:1.25"><strong style="font-size:24px;color:${x[2] ? x[2](p) : p.titulo}">${x[0]}</strong><div style="font-size:12.5px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]}</div></div>`).join('')}</div>`;

/* ---------------- 1. A SAÍDA PELO APLICATIVO ---------------- */
// O Carlos Moreira (diácono, tesoureiro de Vila Nova e professor dos Jovens) vai morar em Marabá com a esposa, a Ana Paula, e os
// filhos Beatriz (15) e Lucas (8). Cada adulto pede a sua carta: a Ana Paula pede a dela no celular dela. Os filhos menores
// saem junto com ele. Ninguém confirma: vale na hora.
const R29_CARLOS = { av: ['CM', 'Varões'], nome: 'Carlos Moreira', sub: 'matrícula 2.317 · 48 anos · diácono · tesoureiro de Vila Nova', sit: 'membro em comunhão' };
const R29_FILHOS = [['BM', 'Adolescentes', 'Beatriz Moreira', 'filha · 15 anos · congregada'], ['LM', 'Crianças', 'Lucas Moreira', 'filho · 8 anos · congregado']];
const r29Filhos = (p, cel) => R29_FILHOS.map((x, i) => r28Pes(p, r28Av(p, x[0], x[1], cel ? 30 : 32), x[2], x[3], r29Caixa(p, 1), { i, alt: cel ? 44 : 46 })).join('');
const R29_FATOS = [['Congregação', 'Vila Nova · Área 2'], ['Situação', 'membro em comunhão'], ['Na igreja desde', '12/03/2009, por batismo'], ['Cargo', 'diácono'], ['Funções', 'tesoureiro de Vila Nova · professor dos Jovens'], ['Estado civil', 'casado']];
const R29_VAI_HORA = [['pessoa', 'Você sai do rol de membros de Vila Nova hoje, 25/11/2026, junto com a Beatriz e o Lucas'], ['maleta', 'Ficam vagos na hora: tesoureiro de Vila Nova e professor dos Jovens. O dirigente escolhe quem assume'], ['escudo', 'Você deixa de ser diácono, e a credencial de obreiro é recolhida'], ['calendario', 'Sai da escala da recepção: 2 datas ficam sem ninguém, e o líder é avisado'], ['cartao', 'A carteirinha passa a mostrar só o seu nome'], ['envelope', 'Param os comunicados da igreja']];
const R29_VAI_HORA_CEL = [['pessoa', 'Você sai de Vila Nova hoje, com a Beatriz e o Lucas'], ['maleta', 'Ficam vagos: tesoureiro e professor dos Jovens'], ['escudo', 'Deixa de ser diácono; a credencial é recolhida'], ['calendario', 'Sai da escala da recepção (2 datas)'], ['cartao', 'A carteirinha mostra só o seu nome']];
const R29_VAI_DEPOIS = [['doc', 'As 3 cartas ficam aqui por 30 dias, só para baixar, e uma cópia vai para o seu e-mail'], ['relogio', 'A partir de 25/12/2026, os seus dados começam a ser apagados, aos poucos'], ['cadeado', 'Ficam para sempre: o nome, a matrícula, o nascimento, a data da saída e os dízimos e ofertas']];
const r29Passos = est => [['Para onde e quem vai', 'a igreja e os filhos', est[0]], ['Conferir e confirmar', 'vale na hora', est[1]], ['A carta pronta', 'em PDF', est[2]]];
function r29Pedir(p, cel) {
  const destino = `${r17Campo(p, 'A igreja que vai receber você', 'Igreja Evangélica Bom Pastor, em Marabá', { nota: 'se quiser' })}<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, cel ? 'Só quer sair? Deixe em branco: a carta sai igual.' : 'Só quer sair, sem ir para outra igreja? Deixe em branco: a carta sai do mesmo jeito.')}</div>`;
  const onde = r27Cartao(p, 'Para onde você vai?', '', destino, cel ? 'padding:10px 12px;gap:7px' : 'gap:8px');
  const junto = r27Cartao(p, 'Quem sai com você', '', `<div style="display:flex;flex-direction:column">${r29Filhos(p, cel)}</div>${r20Nota(p, cel ? 'Só os filhos com menos de 18 anos. Cada um ganha a carta dele.' : 'Só os filhos com menos de 18 anos. Cada um ganha a carta dele, que vem junto com a sua.')}${r16aAviso(p, cel ? 'A Ana Paula pede a carta dela no celular dela.' : '<strong>A Ana Paula, sua esposa, é maior de idade:</strong> ela pede a carta dela no celular dela.')}`, cel ? 'padding:10px 12px;gap:7px' : 'gap:8px');
  const bt = r21Ouro(p, 'Continuar', 'seta', cel ? 44 : 42);
  if (cel) return r28MvCel(p, 'Pedir a minha carta', `${r27Caminho(p, r29Passos(['agora', 'depois', 'depois']), { cel: 1 })}${onde}${junto}${bt}`);
  const voce = r27Cartao(p, 'A carta leva os seus dados de hoje', '', `${r28Quem(p, R29_CARLOS)}${r28Fatos(p, R29_FATOS)}${r20Nota(p, 'Os dados mais recentes da sua ficha. Se algo estiver errado, peça a correção antes, em “Minha ficha”.')}`, 'gap:8px');
  const tit = r18Tit(p, 'Pedir a minha carta de mudança', `Minha vida · você sai na hora, com a carta em PDF · ninguém precisa aprovar · ${R29_HOJE}`);
  return r28Mv(p, R29_CARLOS_U, ['Pedir a minha carta'], `${tit}${r27Caminho(p, r29Passos(['agora', 'depois', 'depois']))}${r17Dois(r18Col(onde, junto), r18Col(voce, bt), '1.1fr 1fr')}`);
}
function r29Confirmar(p, cel) {
  const pin = r17Campo(p, 'Para confirmar, digite o seu PIN', '• • • •', { icone: 'cadeado' });
  const aviso = r16aAviso(p, cel ? '<strong>Não tem volta pelo aplicativo.</strong> Se mudar de ideia, volta como quem volta, sem os cargos.' : '<strong>Não tem volta pelo aplicativo.</strong> Se mudar de ideia, você volta como qualquer um que volta: a mesma matrícula, sem os cargos.', 'alerta');
  const bt = r21Ouro(p, 'Confirmar a minha saída', 'check', cel ? 44 : 42);
  if (cel) return r28MvCel(p, 'Pedir a minha carta', `${r27Caminho(p, r29Passos(['ok', 'agora', 'depois']), { cel: 1 })}${r27Cartao(p, 'O que acontece na hora', '', r28Vai(p, R29_VAI_HORA_CEL, 1), 'padding:8px 12px;gap:2px')}${r20Nota(p, 'As cartas ficam aqui por 30 dias. Depois, os seus dados começam a ser apagados, aos poucos.')}${aviso}${pin}${bt}`);
  const hora = r27Cartao(p, 'O que acontece na hora', r18Etiq(p, 'vale na hora', 'verde'), r28Vai(p, R29_VAI_HORA), 'gap:4px');
  const depois = r27Cartao(p, 'E depois', '', r28Vai(p, R29_VAI_DEPOIS), 'gap:4px');
  const tit = r18Tit(p, 'Conferir e confirmar', `Minha vida · o Carlos, a Beatriz e o Lucas saem de Vila Nova · ninguém precisa aprovar · ${R29_HOJE}`, m8Linha(p, 'Voltar', 'voltar'));
  return r28Mv(p, R29_CARLOS_U, ['Pedir a minha carta'], `${tit}${r27Caminho(p, r29Passos(['ok', 'agora', 'depois']))}${r17Dois(hora, r18Col(depois, aviso, pin, bt), '1.1fr 1fr')}`);
}
// as cartas prontas: a dele e as dos 2 filhos, cada uma com o protocolo
const R29_CARTAS = [['Carlos Moreira', 'a sua · membro em comunhão', 'CARTA-2026-0318'], ['Beatriz Moreira', 'a filha · congregada', 'CARTA-2026-0319'], ['Lucas Moreira', 'o filho · congregado', 'CARTA-2026-0320']];
function r29Pronto(p, cel) {
  const az = r27Azul(p);
  const lista = R29_CARTAS.map((x, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:${cel ? 50 : 54}px;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="width:34px;height:34px;border-radius:9px;flex:none;background:${p.e ? '#1E3A6E' : '#E3ECFD'};display:flex;align-items:center;justify-content:center">${ic('doc', az, 18, 2)}</span><div style="flex:1;min-width:0;line-height:1.25"><div style="font-size:13.5px;font-weight:700;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Carta de mudança · ${x[0]}</div><div style="font-size:11.5px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]} · ${x[2]}</div></div><span style="font-size:12.5px;font-weight:700;color:${p.link};white-space:nowrap">Baixar PDF</span></div>`).join('');
  const ok = `<div style="display:flex;align-items:center;gap:12px;padding:${cel ? '12px 14px' : '14px 16px'};border-radius:14px;background:${p.e ? '#0F3B2E' : '#E8F6EE'};border:1px solid ${p.e ? '#1F6B50' : '#A9DDBF'};flex:none">${r27Check(p, cel ? 30 : 34)}<div style="min-width:0;line-height:1.35"><div style="font-size:${cel ? 15 : 16}px;font-weight:800;color:${p.titulo}">Pronto: vocês saíram de Vila Nova em 25/11/2026</div><div style="font-size:12.5px;color:${p.texto}">Que Deus abençoe a caminhada da família em Marabá.</div></div></div>`;
  const cartas = r27Cartao(p, 'As 3 cartas', r18Etiq(p, 'em PDF', 'azul'), `<div style="display:flex;flex-direction:column">${lista}</div>${r20Nota(p, 'Mandamos as 3 cartas também para c••••••@gmail.com.')}`, cel ? 'padding:8px 12px;gap:4px' : 'gap:4px');
  const prazo = r16aAviso(p, cel ? '<strong>Até 25/12/2026</strong> você ainda entra aqui, só para baixar as cartas.' : '<strong>Até 25/12/2026</strong> você ainda entra no aplicativo, só para baixar as cartas de novo. Depois disso o acesso acaba.');
  if (cel) return r29SaiuCel(p, `${ok}${cartas}${prazo}<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'Na igreja nova, entregue a carta: lá eles conferem pelo QR.')}</div>`);
  const igreja = r27Cartao(p, 'Na igreja nova', '', `${r28Vai(p, [['doc', 'Entregue a carta impressa ou mande o PDF'], ['qr', 'A igreja que recebe aponta o celular para o QR e vê que a carta é verdadeira'], ['igreja', 'Ela leva os seus dados de hoje: a congregação, desde quando, a situação, o cargo e a função']])}`, 'gap:4px');
  const tit = r18Tit(p, 'Minhas cartas', `o acesso fica aberto só para as cartas, até 25/12/2026 · ${R29_HOJE}`);
  return r29Saiu(p, R29_CARLOS_U, `${tit}${ok}${r17Dois(r18Col(cartas, prazo), r18Col(igreja, `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'Se mudar de ideia um dia, procure a secretaria de qualquer congregação: você volta com a mesma matrícula.')}</div>`), '1.1fr 1fr')}`);
}
// a secretaria, a área e a Geral só acompanham: a lista das saídas, sem nada para confirmar
const R29_SAIDAS_VN = [['Carlos Moreira', 'carta pelo aplicativo', 'com os 2 filhos menores', '25/11'], ['Ana Paula Moreira', 'carta pelo aplicativo', 'a esposa, no celular dela', '25/11'], ['Beatriz Moreira', 'junto com o pai', '15 anos', '25/11'], ['Lucas Moreira', 'junto com o pai', '8 anos', '25/11'], ['Maria José Cardoso', 'carta pedida pela secretaria', 'não usa o aplicativo', '25/11'], ['Rute Almeida', 'carta pelo aplicativo', 'só quis sair', '18/11'], ['José Ribeiro', 'faleceu', 'a ficha fica guardada', '18/11']];
function r29SaidasLocal(p, cel) {
  const novo = r16aAviso(p, cel ? '<strong>Hoje:</strong> o Carlos Moreira saiu com carta, com os 2 filhos. 2 cargos ficaram vagos.' : '<strong>Hoje, 25/11:</strong> o Carlos Moreira saiu com carta, levando os filhos Beatriz e Lucas; a Ana Paula pediu a dela. Os cargos de tesoureiro e de professor dos Jovens ficaram vagos, e o dirigente já foi avisado.');
  const nums = [['7', 'saídas em novembro'], ['2', 'cargos vagos', r27Azul], ['1', 'abandono correndo']];
  if (cel) return r27MbCel(p, 'Saídas', `${novo}${r29Nums(p, r29Curto(nums), 1)}${r16aListaCel(p, R29_SAIDAS_VN.slice(0, 6).map(x => [x[0], `${x[1]} · ${x[3]}`, x[1] === 'faleceu' ? '' : r28Mais(p, 'Carta ›')]))}`);
  const tab = r16aTab(p, 'minmax(0,1.1fr) minmax(0,1.5fr) 50px 64px', ['Nome', 'Como saiu', 'Data', ''], R29_SAIDAS_VN.map(x => [x[0], r28Duas(p, x[1], x[2]), x[3], x[1] === 'faleceu' ? `<span style="color:${p.suave}">—</span>` : r28Mais(p, 'Carta ›')]));
  const dir = `${m8Linha(p, 'Registrar um falecimento', 'livro')}${m8Ouro(p, 'Pedir a carta por alguém', 'mais', 40)}`;
  const tit = r18Tit(p, 'Saídas de Vila Nova', `pelo aplicativo, na hora; aqui você acompanha · ${R29_HOJE}`, dir);
  const vagos = r27Cartao(p, 'Ficaram vagos', r18Etiq(p, '2', 'azul'), `${r28Vai(p, [['maleta', 'Tesoureiro de Vila Nova'], ['livro', 'Professor dos Jovens (EBD)']])}${r28Mais(p, 'Ver os cargos vagos ›')}`, 'gap:4px');
  return r29Mb(p, 'local', 'Saídas', `${tit}${novo}${r29Nums(p, nums)}${r17Dois(tab, r18Col(vagos, r20Nota(p, 'A secretaria só faz alguma coisa em dois casos: quando a pessoa não sabe usar o aplicativo (você pede a carta por ela) e no abandono.')), '2.1fr 1fr')}`);
}
const R29_SAIDAS_AREA = [['Carlos Moreira', 'Vila Nova', 'carta pelo aplicativo', '+ 2 filhos menores', '25/11'], ['Ana Paula Moreira', 'Vila Nova', 'carta pelo aplicativo', 'a esposa', '25/11'], ['Sebastião Freitas', 'Monte Sião', 'pela secretaria da área', 'não usa o aplicativo', '25/11'], ['Maria José Cardoso', 'Vila Nova', 'pela secretaria', 'não usa o aplicativo', '25/11'], ['Rute Almeida', 'Vila Nova', 'carta pelo aplicativo', 'só quis sair', '18/11'], ['José Ribeiro', 'Vila Nova', 'faleceu', 'a ficha fica guardada', '18/11'], ['Sílvia Matos', 'Cidade Jardim', 'carta pelo aplicativo', 'era secretária da área', '16/11'], ['Gérson Lima', 'Monte Sião', 'abandono confirmado', 'sem carta', '10/11']];
function r29SaidasArea(p, cel) {
  const nums = [['16', 'saídas em novembro'], ['11', 'pelo aplicativo'], ['2', 'pela secretaria'], ['1', 'abandono'], ['2', 'falecimentos']];
  if (cel) return r27MbCel(p, 'Saídas da área', `${r29Nums(p, r29Curto(nums.slice(0, 3)), 1)}${r16aListaCel(p, R29_SAIDAS_AREA.slice(0, 7).map(x => [x[0], `${x[2]} · ${x[1]} · ${x[4]}`, '']))}`);
  const filtros = `<div style="display:flex;gap:10px;align-items:center">${r28Sel(p, 'Como saiu: todas')}${r28Sel(p, 'As 12 da Área 2')}${r28Sel(p, 'Novembro de 2026')}<span style="flex:1"></span>${m8Ouro(p, 'Pedir a carta por alguém', 'mais', 36)}</div>`;
  const tab = r16aTab(p, 'minmax(0,1.1fr) minmax(0,0.8fr) minmax(0,1.4fr) 50px', ['Nome', 'Congregação', 'Como saiu', 'Data'], R29_SAIDAS_AREA.map(x => [x[0], x[1], r28Duas(p, x[2], x[3]), x[4]]));
  const tit = r18Tit(p, 'Saídas da Área 2', `a área acompanha as 12 congregações; ninguém confirma · ${R29_HOJE}`);
  return r29Mb(p, 'area', 'Saídas', `${tit}${r29Nums(p, nums)}${filtros}${tab}`);
}
const R29_GERAL_AREAS = [['Área 1', 9, 1, 0, 1], ['Área 2', 11, 2, 1, 2], ['Área 3', 6, 0, 0, 2], ['Área 4', 7, 1, 1, 0], ['Área 5', 4, 0, 0, 1], ['Área 6', 5, 1, 0, 0], ['Área 7', 3, 0, 1, 1], ['Área 8', 6, 2, 0, 0], ['Área 9', 2, 0, 0, 1]];
function r29SaidasGeral(p, cel) {
  const soma = c => R29_GERAL_AREAS.reduce((a, x) => a + x[c], 0), tot = x => x[1] + x[2] + x[3] + x[4];
  const total = R29_GERAL_AREAS.reduce((a, x) => a + tot(x), 0);
  const nums = [[String(total), 'saídas em novembro'], [String(soma(1)), 'pelo aplicativo'], [String(soma(2)), 'pela secretaria'], [String(soma(3)), 'abandonos'], [String(soma(4)), 'falecimentos']];
  if (cel) return r27MbCel(p, 'Saídas', `${r29Nums(p, r29Curto(nums.slice(0, 3)), 1)}${r16aListaCel(p, R29_GERAL_AREAS.slice(0, 6).map(x => [x[0], `${x[1]} pelo aplicativo · ${x[2]} pela secretaria`, `<strong style="font-size:16px;color:${p.titulo}">${tot(x)}</strong>`]))}${r20Nota(p, 'O total de cada área também conta os abandonos e os falecimentos.')}`);
  const tab = r16aTab(p, 'minmax(0,0.8fr) repeat(4,minmax(0,1fr)) 60px', ['Área', 'Pelo aplicativo', 'Pela secretaria', 'Abandono', 'Falecimento', 'Total'], R29_GERAL_AREAS.map(x => [x[0], x[1], x[2], x[3], x[4], `<strong>${tot(x)}</strong>`]));
  const pedidas = r27Cartao(p, 'Cartas pedidas pela secretaria', r18Etiq(p, String(soma(2)), 'ouro'), `${r20Nota(p, 'Quem não sabe usar o aplicativo pede na secretaria. Aqui fica quem pediu e quando: se alguém disser que não pediu, a trilha mostra.')}${r28Mais(p, 'Ver quem pediu ›')}`, 'gap:6px');
  const tit = r18Tit(p, 'Saídas da Igreja toda', `ninguém confirma: a Geral acompanha por área · ${R29_HOJE}`, r28Sel(p, 'Novembro de 2026'));
  return r29Mb(p, 'geral', 'Saídas', `${tit}${r29Nums(p, nums)}${r17Dois(tab, r18Col(pedidas, r20Nota(p, 'O abandono continua com a Geral: é o único caso em que alguém confirma.')), '2.1fr 1fr')}`);
}
const r29Saida = (p, k, d) => { const cel = ehCel(d); return k === 'pedir' ? r29Pedir(p, cel) : k === 'confirmar' ? r29Confirmar(p, cel) : k === 'pronto' ? r29Pronto(p, cel) : k === 'local' ? r29SaidasLocal(p, cel) : k === 'area' ? r29SaidasArea(p, cel) : r29SaidasGeral(p, cel); };
const PERFIS29_SAIDA = [['pedir', 'Membro · pedir a carta'], ['confirmar', 'Membro · conferir e confirmar'], ['pronto', 'Membro · as cartas prontas'], ['local', 'Secretaria local · acompanha'], ['area', 'Secretaria da Área 2 · acompanha'], ['geral', 'Secretaria Geral · acompanha']];
const R29_EXPLICA_SAIDA = {
  pedir: '<strong>O Carlos pede a carta de mudança no próprio celular, em 3 passos.</strong> Ele é diácono, tesoureiro de Vila Nova e professor dos Jovens, e vai morar em Marabá. 1) Para onde vai: o nome da igreja, se quiser. 2) Quem sai com ele: os filhos menores de idade, Beatriz (15) e Lucas (8), que já vêm marcados. A esposa, Ana Paula, é maior de idade e pede a dela no celular dela. Do lado, os dados de hoje que vão na carta. <em>Para conferir: a igreja de destino é opcional (quem só quer sair deixa em branco); cada filho menor ganha a carta dele, que vem junto com a do pai.</em>',
  confirmar: '<strong>Antes de confirmar, ele vê o que acontece na hora,</strong> em palavras simples: sai do rol, os cargos ficam vagos (o dirigente escolhe quem assume), deixa de ser diácono e a credencial é recolhida, sai da escala, a carteirinha passa a mostrar só o nome. E depois: as cartas ficam 30 dias no aplicativo e o apagamento começa aos poucos; o que fica para sempre. Não tem volta pelo aplicativo. Ninguém aprova: nem a secretaria, nem a Geral. <em>Para conferir: ele confirma com o PIN dele, para ninguém sair pelo celular de outro.</em>',
  pronto: '<strong>Pronto: as 3 cartas em PDF</strong> (a dele e as dos 2 filhos), cada uma com o protocolo, e a cópia no e-mail. Por 30 dias o aplicativo só mostra as cartas; depois, o acesso acaba. <em>Para conferir: a frase de que ele pode voltar um dia, pela secretaria de qualquer congregação.</em>',
  local: '<strong>A secretaria de Vila Nova só acompanha:</strong> não há caixa “para confirmar”. Ela vê quem saiu, como (pelo aplicativo, pela secretaria, falecimento) e a carta de cada um, e o aviso dos cargos que ficaram vagos. Ela só faz alguma coisa quando a pessoa não sabe usar o aplicativo (“Pedir a carta por alguém”), no abandono e no falecimento.',
  area: '<strong>A área acompanha as 12 congregações:</strong> quantas saídas, como cada uma aconteceu e de onde. Ela também pode pedir a carta por quem não sabe usar o aplicativo, quando a congregação não faz.',
  geral: '<strong>A Geral acompanha a Igreja toda, por área.</strong> As cartas pedidas pela secretaria ficam à parte, com quem pediu e quando, para proteger quem saiu (se alguém disser que não pediu, a trilha mostra). O abandono é o único caso em que alguém confirma.'
};

/* ---------------- 2. A CARTA EM PDF ---------------- */
// O modelo de sempre (o que o sistema já faz), sem as linhas de assinatura: o QR de validade, o protocolo e os nomes do pastor e
// da secretária impressos. A situação verdadeira: Comunhão, Paz (sem comunhão) ou Observação (congregado), nunca o motivo.
const R29_CARTA = {
  comunhao: { nome: 'Carlos Moreira', o: 'o', mat: '2.317', membro: 1, desde: '12/03/2009', sit: 'Comunhão', destino: 'Igreja Evangélica Bom Pastor, em Marabá', funcao: 'Tesoureiro', cargo: 'Diácono', civil: 'Casado', junto: 'Acompanham o portador os filhos menores Beatriz Moreira (nº 30.641) e Lucas Moreira (nº 30.640), cada um com a sua carta.', prot: 'CARTA-2026-0318', cod: 'K7P-4M2' },
  filho: { nome: 'Lucas Moreira', o: 'o', trat: 'o menor', mat: '30.640', membro: 0, desde: '14/05/2018', sit: 'Observação', destino: 'Igreja Evangélica Bom Pastor, em Marabá', funcao: '—', cargo: '—', civil: '—', junto: 'Acompanha o pai, Carlos Moreira (nº 2.317), que pediu esta carta.', prot: 'CARTA-2026-0320', cod: 'K7P-4M4' },
  paz: { nome: 'Jair Pinheiro', o: 'o', mat: '3.876', membro: 1, desde: '02/08/2015', sit: 'Paz', destino: '', funcao: '—', cargo: '—', civil: 'Solteiro', junto: '', prot: 'CARTA-2026-0301', cod: 'H2Q-9T6' }
};
function r29Papel(c) {
  const marca = on => (on ? '(X)' : '( )');
  const ap = c.destino ? `Apresentamos à ${c.destino}, o portador desta carta, ${c.trat || 'o Sr.'} ${c.nome} (Cartão de Membro nº ${c.mat}).` : `Apresentamos o portador desta carta, ${c.trat || 'o Sr.'} ${c.nome} (Cartão de Membro nº ${c.mat}).`;
  const prot = `<div style="text-align:right;line-height:1.3;flex:none"><div style="font-size:8px;color:#5B6678">Protocolo</div><strong style="font-size:9.5px">${c.prot}</strong></div>`;
  const corpo = `${r18PpCab('IEADESPA · Secretaria', 'Congregação Vila Nova · Área 2', prot)}
    <div style="text-align:center;font-size:14px;font-weight:800;letter-spacing:.06em;padding-top:2px">CARTA DE MUDANÇA</div>
    <div>Parauapebas, PA, 25/11/2026.</div><div>Saudações no SENHOR JESUS.</div><div style="text-align:justify">${ap}</div>
    <div><strong>${marca(c.membro)}</strong> Membro &nbsp;&nbsp; <strong>${marca(!c.membro)}</strong> Congregado</div>
    <div>Nesta Igreja desde ${c.desde}, por se achar em: <strong>${c.sit}</strong>.</div>
    <div>Nós o recomendamos que o recebais no Senhor, como usam os Santos.</div>
    <div>Função: ${c.funcao} &nbsp;·&nbsp; Cargo: ${c.cargo} &nbsp;·&nbsp; Estado civil: ${c.civil}</div>
    ${c.junto ? `<div style="text-align:justify">${c.junto}</div>` : ''}<div style="flex:1"></div>
    <div style="border-top:1px solid #D5DBE5;padding-top:7px;display:flex;flex-direction:column;gap:3px"><div style="font-size:9px;color:#3B4A63">Emitida pelo sistema da IEADESPA em 25/11/2026, a pedido do próprio membro. <strong style="color:#0A2342">Vale sem assinatura: confira pelo QR.</strong></div><div style="display:flex;gap:12px;font-size:9.5px"><span><strong>Pr. Abel Nogueira</strong> · pastor da congregação</span><span><strong>Débora Lima</strong> · secretária</span></div></div>
    ${r18PpQr(54, c.cod, 'Confira se esta carta é verdadeira: aponte a câmera do celular para o código.')}`;
  return r18Pp(corpo, '20px 24px', 594);
}
// a carta no celular: o PDF aberto, do tamanho da tela
const r29PapelCel = (p, c, arq) => `<div style="display:flex;align-items:center;gap:8px;flex:none"><span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${arq}</span>${r28Mais(p, 'Baixar')}<span style="color:${p.suave}">·</span>${r28Mais(p, 'Compartilhar')}</div><div style="width:358px;height:507px;flex:none;align-self:center;overflow:hidden;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18)"><div style="zoom:0.852;width:420px">${r29Papel(c)}</div></div>`;
const R29_CARTA_LEVA = {
  comunhao: [['igreja', 'Os dados mais recentes da ficha: a congregação, desde quando, a situação, a função, o cargo e o estado civil', 0], ['seta', 'A igreja de destino, que ele escreveu (é opcional)', 1], ['pessoas', 'Quem vai junto: os filhos menores, cada um com a sua carta', 1], ['qr', 'Sem linha de assinatura: vale pelo QR, com o protocolo e os nomes do pastor e da secretária impressos', 0]],
  filho: [['pessoa', 'A carta do filho menor: congregado, por isso “Observação”, a situação verdadeira', 0], ['pessoas', 'Diz com quem ele vai: o pai, que pediu a carta', 1], ['doc', 'Vem junto com a do pai, no celular dele', 1], ['qr', 'O QR e o protocolo próprios', 0]],
  paz: [['balanca', 'Sem comunhão: a carta diz “Paz”, a situação verdadeira, e nunca o motivo', 0], ['seta', 'Ele só quis sair, sem indicar outra igreja: a frase não cita igreja nenhuma, e a carta sai do mesmo jeito', 0], ['qr', 'O QR, o protocolo e os nomes impressos, como em todas', 0]]
};
const R29_ARQ = { comunhao: 'carta-carlos-moreira.pdf', filho: 'carta-lucas-moreira.pdf', paz: 'carta-jair-pinheiro.pdf' };
const R29_JAIR_U = { ini: 'JP', nome: 'Jair Pinheiro', papel: 'Saiu de Vila Nova' };
function r29CartaDoc(p, k, cel) {
  const c = R29_CARTA[k];
  if (cel) return r29SaiuCel(p, r29PapelCel(p, c, R29_ARQ[k]));
  const leva = r27Cartao(p, 'O que a carta leva', '', `<div style="display:flex;flex-direction:column">${R29_CARTA_LEVA[k].map((x, i) => `<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="width:26px;height:26px;border-radius:8px;flex:none;background:${p.e ? '#1E3A6E' : '#E3ECFD'};display:flex;align-items:center;justify-content:center">${ic(x[0], r27Azul(p), 15, 2)}</span><span style="flex:1;min-width:0;font-size:13px;line-height:1.35;color:${p.texto};padding-top:3px">${x[1]}</span>${x[2] ? '' : ''}</div>`).join('')}</div>`, 'gap:4px');
  const acoes = `<div style="display:flex;gap:10px">${r21Ouro(p, 'Baixar o PDF', 'doc', 42).replace('display:flex', 'flex:1;display:flex')}${r28Bt(p, 'Imprimir', 'imprimir')}</div>`;
  const tit = r18Tit(p, R29_ARQ[k], `a carta de mudança, como sai em PDF · ${R29_HOJE}`);
  return r29Saiu(p, k === 'paz' ? R29_JAIR_U : R29_CARLOS_U, `${tit}<div style="display:grid;grid-template-columns:420px minmax(0,1fr);gap:22px;align-items:start">${r29Papel(c)}${r18Col(leva, acoes, r20Nota(p, 'A carta não tem linha de assinatura: ninguém precisa assinar nem confirmar. Quem recebe confere pelo QR, que abre a página da IEADESPA com os dados desta carta.'))}</div>`);
}
// a página que o QR abre (pública, sem entrar): a carta é verdadeira, com os dados dela; depois de 30 dias, só o que fica para sempre
const r29Publico = (p, conteudo) => `<div style="width:390px;height:844px;display:flex;flex-direction:column;background:${p.fundo};color:${p.texto};overflow:hidden"><div style="background:#0A2342">${statusBar('#FFFFFF')}</div><div style="height:60px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:#0A2342">${logo(34)}<div style="line-height:1.2"><div style="font-size:15px;font-weight:800;color:#FFFFFF;letter-spacing:.04em">IEADESPA</div><div style="font-size:12px;color:#C9D4E3">Conferir um documento</div></div></div><div style="flex:1;min-height:0;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:12px">${conteudo}</div></div>`;
const r29PublicoNote = (p, conteudo) => `<div style="width:1280px;height:800px;display:flex;flex-direction:column;background:${p.fundo};color:${p.texto}"><header style="height:64px;flex:none;display:flex;align-items:center;gap:12px;padding:0 32px;background:#0A2342">${logo(38)}<span style="font-size:16px;font-weight:800;color:#FFFFFF;letter-spacing:.04em">IEADESPA</span><span style="font-size:14px;color:#C9D4E3">· Conferir um documento</span></header><div style="flex:1;min-height:0;display:flex;justify-content:center;align-items:flex-start;padding:28px 32px;gap:20px;overflow:hidden">${conteudo}</div></div>`;
const R29_QR_FATOS = [['Documento', 'Carta de mudança'], ['Protocolo', 'CARTA-2026-0318'], ['Emitida em', '25/11/2026, a pedido do próprio membro'], ['Nome', 'Carlos Moreira'], ['Matrícula', '2.317'], ['Saiu de', 'Congregação Vila Nova · Área 2'], ['Situação', 'Comunhão'], ['Vão junto', '2 filhos menores, com cartas próprias']];
function r29Qr(p, cel) {
  const verde = `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:${p.e ? '#0F3B2E' : '#E8F6EE'};border:1px solid ${p.e ? '#1F6B50' : '#A9DDBF'};flex:none">${r27Check(p, 32)}<div style="line-height:1.3"><div style="font-size:16px;font-weight:800;color:${p.titulo}">Esta carta é verdadeira</div><div style="font-size:12.5px;color:${p.texto}">Confira se os dados abaixo são os mesmos do papel.</div></div></div>`;
  const fatos = r27Cartao(p, 'Os dados da carta', '', r28Fatos(p, cel ? R29_QR_FATOS.slice(0, 7) : R29_QR_FATOS), cel ? 'padding:8px 12px;gap:4px' : 'gap:4px');
  const depois = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, cel ? 'Depois de 25/12/2026, a página mostra só o nome, a matrícula e a data da saída.' : 'Até 25/12/2026 a página mostra os dados da carta. Depois, mostra só o nome, a matrícula e a data da saída, que a igreja guarda para sempre.')}</div>`;
  if (cel) return r29Publico(p, `${verde}${fatos}${r16aAviso(p, 'Se algo no papel estiver diferente, a carta foi alterada: não a aceite.', 'alerta')}${depois}`);
  const mini = r27Cartao(p, 'Depois de 25/12/2026', r18Etiq(p, 'o que fica para sempre', 'azul'), `${r28Fatos(p, [['Documento', 'Carta de mudança · CARTA-2026-0318'], ['Nome', 'Carlos Moreira'], ['Matrícula', '2.317'], ['Data da saída', '25/11/2026']])}${r20Nota(p, 'A carta continua verdadeira; os outros dados já foram apagados.')}`, 'gap:6px');
  return r29PublicoNote(p, `<div style="width:520px;display:flex;flex-direction:column;gap:12px">${verde}${fatos}${r16aAviso(p, 'Se algo no papel estiver diferente destes dados, a carta foi alterada: não a aceite.', 'alerta')}</div><div style="width:440px;display:flex;flex-direction:column;gap:12px">${mini}${depois}</div>`);
}
const r29Carta = (p, k, d) => (k === 'qr' ? r29Qr(p, ehCel(d)) : r29CartaDoc(p, k, ehCel(d)));
const PERFIS29_CARTA = [['comunhao', 'A carta do Carlos · em comunhão, com destino'], ['filho', 'A carta do Lucas · filho menor, congregado'], ['paz', 'A carta do Jair · sem comunhão, só quis sair'], ['qr', 'A igreja que recebe · confere pelo QR']];
const R29_EXPLICA_CARTA = {
  comunhao: '<strong>A carta de mudança é o modelo de sempre, o que o sistema já faz,</strong> com os dados mais recentes da ficha: a congregação, desde quando, a situação (“Comunhão”), a função, o cargo e o estado civil. <strong>Sem linhas de assinatura:</strong> vale pelo QR de validade, com o protocolo e os nomes do pastor da congregação e da secretária impressos. <em>Para conferir: a igreja de destino entra na frase quando ele a escreve; a carta do pai diz quais filhos menores vão junto.</em>',
  filho: '<strong>A carta do filho menor:</strong> o Lucas, de 8 anos, é congregado, por isso “Observação”, a situação verdadeira. A carta diz “o menor” no lugar de “o Sr.”, diz com quem ele vai e tem o QR e o protocolo dela. <em>Para conferir: cada filho menor tem a sua carta, que chega junto com a do pai.</em>',
  paz: '<strong>Quem está sem comunhão também sai com carta,</strong> com a situação verdadeira: “Paz”. O motivo nunca aparece. O Jair só quis sair, sem ir para outra igreja: a frase não cita igreja nenhuma, e a carta sai do mesmo jeito.',
  qr: '<strong>A igreja que recebe aponta o celular para o QR</strong> e abre a página de conferência da IEADESPA, sem entrar no sistema: “Esta carta é verdadeira”, com os dados dela, para comparar com o papel. <em>Para conferir: depois de 30 dias, quando os dados começam a ser apagados, a página mostra só o nome, a matrícula e a data da saída (o que fica para sempre), e a carta continua verdadeira.</em>'
};

/* ---------------- 3. A SECRETARIA PEDE A CARTA POR QUEM NÃO SABE USAR ---------------- */
// Sem prova: fica registrado quem pediu e quando, e a pessoa recebe um aviso. Podem pedir a congregação, a área e a Geral.
const R29_POR = {
  local: { quem: { av: ['MC', 'Senhoras'], nome: 'Maria José Cardoso', sub: 'matrícula 1.208 · 79 anos · Senhoras · não usa o aplicativo', sit: 'membro em comunhão' }, sec: 'Débora Lima, secretaria de Vila Nova', hora: '25/11/2026, às 10:12', destino: ['Ela ainda não sabe o nome da igreja em Belém', 1], aviso: 'Ela recebe um aviso no e-mail da filha, que é o contato da ficha', vai: [['pessoa', 'Ela sai do rol de membros de Vila Nova hoje, 25/11/2026'], ['maleta', 'Não tinha cargo: nada fica vago'], ['cartao', 'A carteirinha passa a mostrar só o nome'], ['relogio', 'A partir de 25/12/2026, os dados começam a ser apagados, aos poucos']], sub: 'Congregação Vila Nova · ela veio à secretaria' },
  area: { quem: { av: ['SF', 'Varões'], nome: 'Sebastião Freitas', sub: 'matrícula 5.530 · 83 anos · Varões · Monte Sião · não usa o aplicativo', sit: 'membro em comunhão' }, sec: 'Elias Prado, secretaria da Área 2', hora: '25/11/2026, às 15:40', destino: ['Igreja Evangélica Shalom, em Canaã dos Carajás', 0], aviso: 'Ele recebe um aviso no e-mail do neto, que é o contato da ficha', vai: [['pessoa', 'Ele sai do rol de membros de Monte Sião hoje, 25/11/2026'], ['maleta', 'Era porteiro de Monte Sião: o cargo fica vago, e o dirigente é avisado'], ['cartao', 'A carteirinha passa a mostrar só o nome'], ['relogio', 'A partir de 25/12/2026, os dados começam a ser apagados, aos poucos']], sub: 'Área 2 · Monte Sião está sem secretária, e a área faz' }
};
function r29PedirPor(p, k, cel) {
  const c = R29_POR[k];
  const como = r28Opcao(p, 1, k === 'area' ? 'Ele pediu pessoalmente, aqui na secretaria da área' : 'Ela pediu pessoalmente, aqui na secretaria', 'não precisa de papel nem de prova', cel);
  const reg = r28Fatos(p, [['Pedido por', c.sec], ['Quando', c.hora]]);
  const destino = r17Campo(p, 'A igreja que vai receber', c.destino[0], { nota: 'se souber', vazio: c.destino[1] });
  const vai = r28Vai(p, c.vai.concat([['envelope', c.aviso]]), cel);
  const bt = r21Ouro(p, 'Pedir a carta e imprimir', 'imprimir', cel ? 44 : 42);
  if (cel) return r27MbCel(p, 'Pedir a carta por alguém', `${r28Quem(p, c.quem, 1)}${como.replace('flex:1;min-width:0;', 'flex:none;')}${destino}${r27Cartao(p, 'O que vai acontecer', '', r28Vai(p, [c.vai[0], c.vai[1], ['envelope', c.aviso]], 1), 'padding:8px 12px;gap:2px')}${r20Nota(p, `Fica registrado: ${c.sec.split(',')[0]}, ${c.hora}.`)}${bt}`);
  const p1 = r27Passo(p, 1, 'ok', 'Quem pediu', 'fica registrado sozinho', `${como}${reg}<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'Sem papel e sem prova: o sistema guarda quem pediu e quando, e a pessoa recebe um aviso.')}</div>`);
  const p2 = r27Passo(p, 2, 'ok', 'Para onde vai', 'e quem sai junto', `${destino}${r20Nota(p, 'Filhos menores que saem junto: nenhum.')}`);
  const p3 = r27Passo(p, 3, 'agora', 'O que vai acontecer', 'na hora, como pelo aplicativo', `${vai}${bt}${r20Nota(p, 'A pessoa leva a carta impressa; o QR vale do mesmo jeito.')}`);
  const tit = r18Tit(p, 'Pedir a carta por alguém', `para quem não sabe usar o aplicativo · ${c.sub} · ${R29_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r29Mb(p, k, 'Saídas', `${tit}${r28Quem(p, c.quem)}${r17Dois(r18Col(p1, p2), p3, '1fr 1fr')}`, ['Saídas', 'Pedir a carta por alguém']);
}
// a Geral: a trilha das cartas pedidas pela secretaria (protege quem saiu), e ela também pode pedir
const R29_PEDIDAS = [['Sebastião Freitas', 'Monte Sião', 'Elias Prado · Área 2', '25/11 15:40', ['e-mail do neto', 'verde']], ['Maria José Cardoso', 'Vila Nova', 'Débora Lima · Vila Nova', '25/11 10:12', ['e-mail da filha', 'verde']], ['Raimunda Alves', 'Área 6 · Novo Horizonte', 'Lívia Castro · Novo Horizonte', '19/11 09:05', ['e-mail', 'verde']], ['Osvaldo Brito', 'Área 8 · Boa Esperança', 'Rosa Melo · Boa Esperança', '14/11 16:20', ['sem e-mail na ficha', 'ouro']], ['Antônia Prates', 'Área 8 · Nova Vida', 'João da Silva · Geral', '09/11 11:00', ['e-mail', 'verde']], ['Benedito Souza', 'Área 1 · Sede', 'Marta Lins · Sede', '06/11 14:32', ['e-mail', 'verde']], ['Zilda Moura', 'Área 4 · Liberdade', 'Paulo Vaz · Área 4', '03/11 10:48', ['e-mail', 'verde']]];
function r29PedidasGeral(p, cel) {
  if (cel) return r27MbCel(p, 'Pedidas pela secretaria', `${r16aAviso(p, 'Quem pediu a carta por quem não sabe usar o aplicativo. Se alguém disser que não pediu, a trilha mostra.')}${r16aListaCel(p, R29_PEDIDAS.slice(0, 6).map(x => [x[0], `${x[2]} · ${x[3]}`, r18Etiq(p, x[4][0].replace(' na ficha', ''), x[4][1])]))}`);
  const tab = r16aTab(p, 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) 84px minmax(0,0.9fr)', ['Quem saiu', 'Congregação', 'Pedida por', 'Quando', 'O aviso foi para'], R29_PEDIDAS.map(x => [x[0], x[1], x[2], x[3], r18Etiq(p, x[4][0], x[4][1])]));
  const tit = r18Tit(p, 'Cartas pedidas pela secretaria', `em novembro · a congregação, a área ou a Geral pediu por quem não sabe usar o aplicativo · ${R29_HOJE}`, m8Ouro(p, 'Pedir a carta por alguém', 'mais', 40));
  const nota = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'Sem prova, mas com trilha: quem pediu, quando e para onde foi o aviso. Se a pessoa disser que não pediu, a Geral vê aqui quem fez. Quem não tem e-mail na ficha não recebe o aviso; a secretaria fica sabendo.')}</div>`;
  return r29Mb(p, 'geral', 'Saídas', `${tit}${tab}${nota}`, ['Saídas', 'Pedidas pela secretaria']);
}
// o aviso que chega para a pessoa (no e-mail que está na ficha)
function r29Email(p, cel) {
  const corpo = `<div style="font-size:${cel ? 13 : 14}px;line-height:1.5;color:${p.texto};display:flex;flex-direction:column;gap:${cel ? 8 : 10}px"><div>A paz do Senhor.</div><div>A secretaria da congregação <strong style="color:${p.titulo}">Vila Nova</strong> pediu hoje, <strong style="color:${p.titulo}">25/11/2026, às 10:12</strong>, a carta de mudança de <strong style="color:${p.titulo}">Maria José Cardoso</strong> (matrícula 1.208), a pedido dela. Ela saiu do rol de membros e levou a carta impressa.</div><div>A carta vai anexa, em PDF.</div>${r16aAviso(p, '<strong>Não foi ela quem pediu?</strong> Responda este e-mail ou fale com a Secretaria Geral. Fica registrado quem pediu e quando.', 'alerta')}<div style="color:${p.suave};font-size:12px">IEADESPA · este aviso vai para o e-mail que está na ficha.</div></div>`;
  const cab = `<div style="display:flex;align-items:center;gap:10px">${logo(cel ? 34 : 40)}<div style="flex:1;min-width:0;line-height:1.3"><div style="font-size:${cel ? 14 : 15}px;font-weight:700;color:${p.titulo}">IEADESPA · Secretaria</div><div style="font-size:12px;color:${p.suave};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">para: cl••••@gmail.com (a filha) · 25/11/2026 10:12</div></div></div><div style="font-size:${cel ? 16 : 18}px;font-weight:800;color:${p.titulo};line-height:1.3">A carta de mudança de Maria José Cardoso foi pedida</div>`;
  const anexo = r28Anexo(p, 'carta-maria-jose-cardoso.pdf', 'carta de mudança · CARTA-2026-0287');
  if (cel) return cascaCel(p, { titulo: 'E-mail', voltar: 1, conteudo: `${cab}${corpo}${anexo}` });
  return `<div style="width:1280px;height:800px;display:flex;align-items:flex-start;justify-content:center;padding:40px;box-sizing:border-box;background:${p.fundo};color:${p.texto}"><div style="width:680px;background:${p.sup};border:1px solid ${p.borda};border-radius:16px;padding:24px 28px;display:flex;flex-direction:column;gap:14px">${r18Etiq(p, 'O e-mail que chega para a pessoa', 'azul')}${cab}${corpo}${anexo}</div></div>`;
}
const r29Por = (p, k, d) => { const cel = ehCel(d); return k === 'geral' ? r29PedidasGeral(p, cel) : k === 'aviso' ? r29Email(p, cel) : r29PedirPor(p, k, cel); };
const PERFIS29_POR = [['local', 'Secretaria local · a dona Maria José no balcão'], ['area', 'Secretaria da Área 2 · pede por alguém de Monte Sião'], ['geral', 'Secretaria Geral · quem pediu por quem'], ['aviso', 'A pessoa · o aviso que chega']];
const R29_EXPLICA_POR = {
  local: '<strong>A dona Maria José, de 79 anos, não usa o aplicativo.</strong> Vai morar com a filha em Belém e pede a carta na secretaria de Vila Nova. A secretária abre “Pedir a carta por alguém”: quem pediu e quando ficam registrados sozinhos; a igreja de destino, se ela souber; e o que vai acontecer, na hora, como pelo aplicativo. A carta sai impressa, e o QR vale do mesmo jeito. <em>Para conferir: sem papel e sem prova; a pessoa recebe um aviso no e-mail da ficha.</em>',
  area: '<strong>A área também pede,</strong> quando a congregação não faz: Monte Sião está sem secretária, e o seu Sebastião, de 83 anos, foi à secretaria da área. É a mesma tela, com o nome de quem pediu. Ele era porteiro de Monte Sião: o cargo fica vago, e o dirigente é avisado. <em>Para conferir: a congregação, a área e a Geral podem pedir (se a congregação não faz, a área faz).</em>',
  geral: '<strong>A Geral vê quem pediu por quem.</strong> É a proteção de quem saiu: sem prova, mas com trilha. Se alguém disser “não fui eu que pedi”, aqui está quem fez, quando e para onde foi o aviso. A Geral também pode pedir. <em>Para conferir: quem não tem e-mail na ficha não recebe o aviso, e a tela mostra isso.</em>',
  aviso: '<strong>O aviso que chega para a pessoa,</strong> no e-mail que está na ficha (aqui, o da filha): quem pediu, quando, e o que fazer se não foi ela. A carta vai anexa.'
};
