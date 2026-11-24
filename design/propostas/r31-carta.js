/* ================= RODADA 31 (24/11/2026): Membros › a saída e a volta, com as respostas dele à 29 ================= */
// Respostas de 24/11: o destino é só a cidade e o estado, nunca o nome da igreja (em branco, Parauapebas - PA); a carta é
// individual e traz o histórico (a chegada e a saída, os batismos, as consagrações e os cargos, com as datas), sem assinatura
// (o QR, o protocolo e os nomes impressos bastam); os filhos menores ganham carta própria; o congregado sai "em Paz";
// "Observação" é só para quem está sem comunhão ou em disciplina, com o tempo e sem o motivo; o QR confere pela impressão
// digital guardada e pelo protocolo e, depois do apagamento, não mostra mais os dados. Nomes e números de mentira.

/* ---------------- 1. A CARTA COM O HISTÓRICO (PDF, A4) ---------------- */
// os fatos em duas colunas, com o valor quebrando a linha (nada cortado com reticências: o histórico aparece inteiro)
const r31Fatos = (p, L, cel) => `<div style="display:flex;flex-direction:column">${L.map((x, i) => `<div style="display:grid;grid-template-columns:${cel ? 96 : 124}px minmax(0,1fr);gap:10px;padding:${cel ? 5 : 6}px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="font-size:12.5px;color:${p.suave};line-height:1.4">${x[0]}</span><span style="font-size:13px;font-weight:600;color:${p.titulo};line-height:1.4;min-width:0">${Array.isArray(x[1]) ? x[1].map(v => `<div>${v}</div>`).join('') : x[1]}</span></div>`).join('')}</div>`;
const R31_CARTA = {
  comunhao: { nome: 'Carlos Moreira', trat: 'o irmão', a: 0, mat: '2.317', membro: 1, cidade: 'Marabá - PA', sit: 'em Comunhão',
    hist: [['Chegada', '12/03/2009, por batismo, na Congregação Vila Nova'], ['Batismo nas águas', '12/03/2009, na Congregação Vila Nova'], ['Batismo no Espírito Santo', '20/09/2010'], ['Consagrações', ['Auxiliar, em 16/04/2014', 'Diácono, em 10/12/2017']], ['Cargos e funções', ['Secretário da Mocidade de Vila Nova, de 03/2012 a 12/2015', 'Professor dos Jovens (EBD), de 02/2016 a 25/11/2026', 'Tesoureiro de Vila Nova, de 01/2021 a 25/11/2026']], ['Estado civil', 'Casado'], ['Saída', '25/11/2026, com esta carta']],
    junto: 'Acompanham o portador os filhos menores Beatriz Moreira (nº 30.641) e Lucas Moreira (nº 30.640), cada um com a sua carta.', pedido: 'a pedido do próprio membro, pelo aplicativo', prot: 'CARTA-2026-0318', cod: 'K7P-4M2', arq: 'carta-carlos-moreira.pdf' },
  filho: { nome: 'Lucas Moreira', trat: 'o menor', a: 0, mat: '30.640', membro: 0, cidade: 'Marabá - PA', sit: 'em Paz',
    hist: [['Chegada', '14/05/2018, apresentado na Congregação Vila Nova'], ['Batismo nas águas', '—'], ['Batismo no Espírito Santo', '—'], ['Consagrações', '—'], ['Cargos e funções', '—'], ['Estado civil', '—'], ['Saída', '25/11/2026, com esta carta, junto com o pai']],
    junto: 'Acompanha o pai, Carlos Moreira (nº 2.317), que pediu esta carta.', pedido: 'a pedido do pai, Carlos Moreira, pelo aplicativo', prot: 'CARTA-2026-0320', cod: 'K7P-4M4', arq: 'carta-lucas-moreira.pdf' },
  observacao: { nome: 'Jair Pinheiro', trat: 'o irmão', a: 0, mat: '3.876', membro: 1, cidade: 'Parauapebas - PA', sit: 'em Observação (em disciplina por 6 meses, até 02/03/2027)',
    hist: [['Chegada', '02/08/2015, por carta de mudança, na Congregação Vila Nova'], ['Batismo nas águas', '15/11/2003, em Imperatriz - MA'], ['Batismo no Espírito Santo', '—'], ['Consagrações', '—'], ['Cargos e funções', ['Recepção de Vila Nova, de 03/2018 a 09/2026']], ['Estado civil', 'Solteiro'], ['Saída', '25/11/2026, com esta carta']],
    junto: '', pedido: 'a pedido do próprio membro, pelo aplicativo', prot: 'CARTA-2026-0301', cod: 'H2Q-9T6', arq: 'carta-jair-pinheiro.pdf' },
  balcao: { nome: 'Maria José Cardoso', trat: 'a irmã', a: 1, mat: '1.208', membro: 1, cidade: 'Belém - PA', sit: 'em Comunhão',
    hist: [['Chegada', '06/01/1991, por batismo, na Congregação Vila Nova'], ['Batismo nas águas', '06/01/1991, na Congregação Vila Nova'], ['Batismo no Espírito Santo', '19/07/1992'], ['Consagrações', '—'], ['Cargos e funções', ['Dirigente do Círculo de Oração de Vila Nova, de 02/2010 a 12/2019']], ['Estado civil', 'Viúva'], ['Saída', '25/11/2026, com esta carta']],
    junto: '', pedido: 'a pedido dela, pela secretaria de Vila Nova (Débora Lima)', prot: 'CARTA-2026-0287', cod: 'M3D-8R1', arq: 'carta-maria-jose-cardoso.pdf' }
};
// a folha A4 (largura W, altura W × 1,414): o modelo de sempre, agora com o quadro do histórico, sem linha de assinatura
function r31Papel(c, W = 470) {
  const marca = on => (on ? '(X)' : '( )'), ela = c.a ? 'a' : 'o';
  const linha = (r, v, i) => `<div style="display:grid;grid-template-columns:116px minmax(0,1fr);gap:8px;padding:3px 0;${i ? 'border-top:1px solid #E6EAF0;' : ''}"><span style="color:#5B6678">${r}</span><span>${Array.isArray(v) ? v.map(x => `<div>${x}</div>`).join('') : v}</span></div>`;
  const prot = `<div style="text-align:right;line-height:1.3;flex:none"><div style="font-size:8px;color:#5B6678">Protocolo</div><strong style="font-size:9.5px">${c.prot}</strong></div>`;
  const corpo = `${r18PpCab('IEADESPA · Secretaria', 'Congregação Vila Nova · Área 2', prot)}
    <div style="text-align:center;font-size:14px;font-weight:800;letter-spacing:.06em">CARTA DE MUDANÇA</div>
    <div>Parauapebas, PA, 25/11/2026.</div><div>Saudações no SENHOR JESUS.</div>
    <div style="text-align:justify">Apresentamos o portador desta carta, ${c.trat} <strong>${c.nome}</strong> (Cartão de Membro nº ${c.mat}), da Congregação Vila Nova, Área 2, que se muda para a cidade de <strong>${c.cidade}</strong>.</div>
    <div><strong>${marca(c.membro)}</strong> Membro &nbsp; <strong>${marca(!c.membro)}</strong> Congregado &nbsp;·&nbsp; Situação: <strong>${c.sit}</strong>.</div>
    <div>Nós ${ela} recomendamos que ${ela} recebais no Senhor, como usam os Santos.</div>
    <div style="border:1px solid #D5DBE5;border-radius:6px;padding:6px 10px"><div style="font-size:9px;font-weight:800;letter-spacing:.06em;padding-bottom:2px">O HISTÓRICO NA IEADESPA</div>${c.hist.map((x, i) => linha(x[0], x[1], i)).join('')}</div>
    ${c.junto ? `<div style="text-align:justify">${c.junto}</div>` : ''}<div style="flex:1"></div>
    <div style="border-top:1px solid #D5DBE5;padding-top:6px;display:flex;flex-direction:column;gap:3px"><div style="font-size:8.8px;color:#3B4A63">Emitida pelo sistema da IEADESPA em 25/11/2026, ${c.pedido}. <strong style="color:#0A2342">Vale sem assinatura: confira pelo QR.</strong></div><div style="display:flex;gap:12px;font-size:9.5px"><span><strong>Pr. Abel Nogueira</strong> · pastor da congregação</span><span><strong>Débora Lima</strong> · secretária</span></div></div>
    ${r18PpQr(52, c.cod, 'Confira se esta carta é verdadeira: aponte a câmera do celular para o código.')}`;
  return `<div style="width:${W}px;height:${Math.round(W * 1.414)}px;flex:none;background:#FFFFFF;color:#0A2342;border:1px solid #D5DBE5;display:flex;flex-direction:column;gap:7px;padding:22px 26px;box-sizing:border-box;overflow:hidden;font-size:9.8px;line-height:1.38">${corpo}</div>`;
}
// no celular: o PDF aberto, na largura da tela (a folha de 470 reduzida para 358)
const r31PapelCel = (p, c) => `<div style="display:flex;align-items:center;gap:8px;flex:none"><span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.arq}</span>${r28Mais(p, 'Baixar')}<span style="color:${p.suave}">·</span>${r28Mais(p, 'Compartilhar')}</div><div style="width:358px;height:506px;flex:none;align-self:center;overflow:hidden;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18)"><div style="zoom:0.7617;width:470px">${r31Papel(c)}</div></div>`;
const R31_LEVA = {
  comunhao: [['pessoa', 'Os dados de hoje: a congregação, a situação e a cidade para onde ele vai (só a cidade, nunca o nome da igreja)'], ['livro', 'O histórico: a chegada, os batismos, as consagrações e os cargos que ele teve no sistema, com as datas'], ['pessoas', 'Quem vai junto: os filhos menores, cada um com a sua carta'], ['qr', 'Sem assinatura: o QR, o protocolo e os nomes do pastor e da secretária impressos']],
  filho: [['pessoa', 'A carta própria do filho menor: ele é congregado, por isso “em Paz”'], ['livro', 'O histórico dele: a chegada, em 2018; o que ele ainda não tem fica com um traço'], ['pessoas', 'Diz com quem ele vai: o pai, que pediu a carta'], ['qr', 'O QR e o protocolo próprios']],
  observacao: [['balanca', 'Em disciplina: “em Observação”, por quanto tempo e até quando, nunca o motivo'], ['mapa', 'Ele não escreveu a cidade: fica Parauapebas - PA, a cidade da nossa igreja'], ['livro', 'O histórico, como em todas as cartas'], ['qr', 'O QR, o protocolo e os nomes impressos']],
  balcao: [['pessoa', 'A carta pedida pela secretaria diz no rodapé quem pediu'], ['livro', 'O histórico dela, como em todas as cartas'], ['doc', 'Sai impressa na hora, para ela levar'], ['qr', 'O QR vale do mesmo jeito']]
};
const r31Leva = (p, k) => r27Cartao(p, 'O que a carta leva', '', `<div style="display:flex;flex-direction:column">${R31_LEVA[k].map((x, i) => `<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="width:26px;height:26px;border-radius:8px;flex:none;background:${p.e ? '#1E3A6E' : '#E3ECFD'};display:flex;align-items:center;justify-content:center">${ic(x[0], r27Azul(p), 15, 2)}</span><span style="flex:1;min-width:0;font-size:13px;line-height:1.35;color:${p.texto};padding-top:3px">${x[1]}</span></div>`).join('')}</div>`, 'gap:4px');
const R31_JAIR_U = { ini: 'JP', nome: 'Jair Pinheiro', papel: 'Saiu de Vila Nova' };
function r31CartaDoc(p, k, cel) {
  const c = R31_CARTA[k];
  if (k === 'balcao') {
    // a secretaria de Vila Nova: a carta que ela pediu pela dona Maria José, aberta na lista das saídas
    if (cel) return r27MbCel(p, 'A carta da Maria José', r31PapelCel(p, c));
    const quem = r27Cartao(p, c.arq, r18Etiq(p, 'impressa', 'verde'), `${r31Fatos(p, [['Pedida por', 'Débora Lima, secretaria de Vila Nova'], ['Quando', '25/11/2026, às 10:12'], ['Protocolo', `${c.prot} · código ${c.cod}`]])}<div style="display:flex;gap:10px">${r21Ouro(p, 'Imprimir de novo', 'doc', 42).replace('display:flex', 'flex:1;display:flex')}${r28Bt(p, 'Baixar o PDF', 'doc')}</div>`, 'gap:8px');
    return r29Mb(p, 'local', 'Saídas', `<div style="display:grid;grid-template-columns:470px minmax(0,1fr);gap:22px;align-items:start">${r31Papel(c)}${r18Col(quem, r31Leva(p, k))}</div>`, ['Saídas', 'Maria José Cardoso']);
  }
  if (cel) return r29SaiuCel(p, r31PapelCel(p, c));
  const arq = r27Cartao(p, c.arq, r18Etiq(p, 'em PDF', 'azul'), `${r31Fatos(p, [['Protocolo', c.prot], ['Código', c.cod], ['Emitida em', R31_HOJE]])}<div style="display:flex;gap:10px">${r21Ouro(p, 'Baixar o PDF', 'doc', 42).replace('display:flex', 'flex:1;display:flex')}${r28Bt(p, 'Imprimir', 'doc')}</div>`, 'gap:8px');
  return r29Saiu(p, k === 'observacao' ? R31_JAIR_U : R29_CARLOS_U, `<div style="display:grid;grid-template-columns:470px minmax(0,1fr);gap:22px;align-items:start">${r31Papel(c)}${r18Col(arq, r31Leva(p, k))}</div>`);
}
const r31Carta = (p, k, d) => r31CartaDoc(p, k, ehCel(d));
const PERFIS31_CARTA = [['comunhao', 'A carta do Carlos · em comunhão, com o histórico'], ['filho', 'A carta do Lucas · filho menor, congregado: em Paz'], ['observacao', 'A carta do Jair · em disciplina: Observação, com o tempo'], ['balcao', 'Secretaria local · a carta pedida no balcão']];

/* ---------------- 2. A PÁGINA QUE O QR ABRE: antes e depois do apagamento ---------------- */
// Pública, sem entrar. Até 30 dias depois da saída, mostra os dados da carta para comparar com o papel; depois do apagamento,
// só que a carta é verdadeira (o protocolo e a impressão digital guardada no dia da emissão), sem o nome nem o histórico.
const r31Caixa = (p, ok, tit, sub) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:${ok ? (p.e ? '#0F3B2E' : '#E8F6EE') : (p.e ? '#3A1414' : '#FDE4E4')};border:1px solid ${ok ? (p.e ? '#1F6B50' : '#A9DDBF') : m8Verm(p)};flex:none">${ok ? r27Check(p, 32) : `<span style="width:32px;height:32px;border-radius:16px;flex:none;background:${m8Verm(p)};display:flex;align-items:center;justify-content:center">${ic('fechar', '#FFFFFF', 18, 2.6)}</span>`}<div style="line-height:1.3;min-width:0"><div style="font-size:16px;font-weight:800;color:${p.titulo}">${tit}</div><div style="font-size:12.5px;color:${p.texto}">${sub}</div></div></div>`;
const R31_QR_FATOS = [['Documento', 'Carta de mudança'], ['Protocolo', 'CARTA-2026-0318'], ['Emitida em', '25/11/2026, a pedido do próprio membro'], ['Nome', 'Carlos Moreira'], ['Matrícula', '2.317'], ['Saiu de', 'Congregação Vila Nova · Área 2'], ['Vai para', 'Marabá - PA'], ['Situação', 'Comunhão']];
const R31_QR_HIST = [['Chegada', '12/03/2009, por batismo'], ['Batismos', ['nas águas em 12/03/2009', 'no Espírito Santo em 20/09/2010']], ['Consagrações', ['auxiliar em 16/04/2014', 'diácono em 10/12/2017']], ['Cargos', ['secretário da Mocidade, de 2012 a 2015', 'professor dos Jovens, de 2016 a 2026', 'tesoureiro de Vila Nova, de 2021 a 2026']]];
const R31_QR_HIST_CEL = [['Chegada', '12/03/2009'], ['Batismos', 'águas em 2009 · Espírito Santo em 2010'], ['Consagrações', 'auxiliar em 2014 · diácono em 2017'], ['Cargos', ['secretário da Mocidade, 2012 a 2015', 'professor dos Jovens, 2016 a 2026', 'tesoureiro de Vila Nova, 2021 a 2026']]];
function r31Qr(p, k, cel) {
  const pad = cel ? 'padding:8px 12px;gap:4px' : 'gap:4px';
  if (k === 'antes') {
    const caixa = r31Caixa(p, 1, 'Esta carta é verdadeira', cel ? 'Confira se os dados são os mesmos do papel.' : 'A impressão digital confere com a carta guardada em 25/11/2026. Confira se os dados abaixo são os mesmos do papel.');
    const fatos = r27Cartao(p, 'Os dados da carta', '', r31Fatos(p, cel ? R31_QR_FATOS.filter(x => x[0] !== 'Matrícula').map(x => (x[0] === 'Emitida em' ? [x[0], '25/11/2026'] : x)) : R31_QR_FATOS, cel), pad);
    const alerta = r16aAviso(p, cel ? 'Algo diferente no papel? A carta foi alterada: não a aceite.' : 'Se algo no papel estiver diferente destes dados, a carta foi alterada: não a aceite.', 'alerta');
    const ate = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, cel ? 'Até 25/12/2026. Depois, os dados são apagados.' : 'Até 25/12/2026 a página mostra os dados da carta. Depois, eles são apagados, e a página diz só se a carta é verdadeira.')}</div>`;
    if (cel) return r29Publico(p, `${caixa}${fatos}${r27Cartao(p, 'O histórico da carta', '', r31Fatos(p, R31_QR_HIST_CEL, 1), pad)}${alerta}`);
    const hist = r27Cartao(p, 'O histórico da carta', '', r31Fatos(p, R31_QR_HIST), 'gap:4px');
    return r29PublicoNote(p, `<div style="width:500px;display:flex;flex-direction:column;gap:12px">${caixa}${fatos}${alerta}</div><div style="width:460px;display:flex;flex-direction:column;gap:12px">${hist}${ate}</div>`);
  }
  if (k === 'depois') {
    const caixa = r31Caixa(p, 1, 'Esta carta é verdadeira', cel ? 'O protocolo e a impressão digital conferem.' : 'O protocolo existe, e a impressão digital deste QR é a da carta guardada no dia da emissão.');
    const fatos = r27Cartao(p, 'O que ainda dá para conferir', '', r31Fatos(p, [['Documento', 'Carta de mudança'], ['Protocolo', 'CARTA-2026-0318'], ['Emitida em', '25/11/2026'], ['Por', 'secretaria de Vila Nova · Área 2']]), pad);
    const apagou = r16aAviso(p, cel ? '<strong>Os dados da pessoa já foram apagados,</strong> como manda a lei. Confira o nome e o histórico no papel.' : '<strong>Os dados da pessoa já foram apagados,</strong> como manda a lei de proteção de dados. Por isso a página não mostra mais o nome nem o histórico: confira esses dados no papel.');
    const geral = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'Precisa confirmar com a igreja? Fale com a Secretaria Geral da IEADESPA, com o protocolo da carta.')}</div>`;
    if (cel) return r29Publico(p, `${caixa}${fatos}${apagou}${geral}`);
    const confere = r27Cartao(p, 'O que esta página confere', '', r28Vai(p, [['qr', 'O protocolo existe e foi emitido pela IEADESPA'], ['digital', 'A impressão digital do QR é a da carta guardada no dia: o QR não foi trocado'], ['cadeado', 'Os dados da pessoa não aparecem mais: saíram com o apagamento, 30 dias depois da saída']]), 'gap:4px');
    return r29PublicoNote(p, `<div style="width:500px;display:flex;flex-direction:column;gap:12px">${caixa}${fatos}${apagou}</div><div style="width:460px;display:flex;flex-direction:column;gap:12px">${confere}${geral}</div>`);
  }
  if (k === 'codigo') {
    // sem câmera: o código do rodapé, digitado à mão
    const campo = r30CampoErro(p, 'Código do documento', 'K7P-4M9', cel ? 'Nenhum documento tem esse código. Confira no rodapé.' : 'Nenhum documento tem o código K7P-4M9. Confira as letras e os números no rodapé do papel.', { icone: 'busca' });
    const form = r27Cartao(p, 'Conferir sem a câmera', '', `<span style="font-size:13px;color:${p.texto};line-height:1.45">Digite o código que está no rodapé do documento, ao lado do QR.</span>${campo}${r21Ouro(p, 'Conferir', 'check', cel ? 44 : 42)}`, cel ? 'padding:12px 14px;gap:10px' : 'gap:12px');
    const onde = `<div style="display:flex;align-items:flex-start;gap:8px">${r20Nota(p, 'O código tem 3 letras ou números, um traço e mais 3, como K7P-4M2.')}</div>`;
    if (cel) return r29Publico(p, `${form}${onde}`);
    return r29PublicoNote(p, `<div style="width:520px;display:flex;flex-direction:column;gap:12px">${form}${onde}</div>`);
  }
  // a carta que não confere: o protocolo existe, mas a impressão digital do QR é outra
  const caixa = r31Caixa(p, 0, 'Esta carta não confere', cel ? 'A impressão digital deste QR não é a da carta.' : 'O protocolo CARTA-2026-0318 existe, mas a impressão digital deste QR não é a da carta guardada.');
  const fazer = r27Cartao(p, 'O que fazer', '', r28Vai(p, [['fechar', 'Não aceite a carta: o papel pode ter sido alterado'], ['pessoa', 'Peça à pessoa a carta original, em PDF ou impressa'], ['igreja', 'Na dúvida, fale com a Secretaria Geral da IEADESPA']], cel), cel ? 'padding:8px 12px;gap:2px' : 'gap:4px');
  if (cel) return r29Publico(p, `${caixa}${fazer}`);
  return r29PublicoNote(p, `<div style="width:560px;display:flex;flex-direction:column;gap:12px">${caixa}${fazer}</div>`);
}
const r31QrTela = (p, k, d) => r31Qr(p, k, ehCel(d));
const PERFIS31_QR = [['antes', 'A igreja que recebe · até 30 dias: os dados da carta'], ['depois', 'Depois do apagamento · só que é verdadeira'], ['codigo', 'Sem a câmera · o código digitado à mão'], ['falsa', 'Uma carta que não confere']];
