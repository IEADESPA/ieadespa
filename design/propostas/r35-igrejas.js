/* ---------------- 5. AS ÁREAS, OS NÚMEROS, A CONGREGAÇÃO NOVA E O PONTO DE CULTO NOVO ---------------- */
// O que a 32 deixou para depois (respostas dele de 23 e 24/11): a Geral cadastra a congregação nova direto, quando o
// Presidente decide, num formulário simples (sem pedido nem espera); o número é o de abertura ("número de filial"), a Sede
// é a 1 e a ordem é pelo número; a Sede fica na Área 1 ("Distrito Sede"), área de uma congregação só (a regra das 3
// congregações não vale); os níveis acima da área ficam dormindo, e só a Geral vê que existem; o ponto de culto guarda o
// bairro, o dia e a hora, o responsável e o endereço da casa, que só a liderança vê. Hoje, nos desenhos, é 07/02/2027.
const R35_IG_HOJE = '07/02/2027';
// as 9 áreas: [nº, nome, pastor, congregações]
const R35_AREAS = [['1', 'Área 1 · Distrito Sede', 'Pr. Elias Cunha', 1], ['2', 'Área 2', 'Pr. Davi Teixeira', 12], ['3', 'Área 3', 'Pr. Josias Rocha', 6], ['4', 'Área 4', 'Pr. Daniel Freitas', 5], ['5', 'Área 5', 'Pr. Natan Barros', 6], ['6', 'Área 6', 'Pr. Levi Santana', 5], ['7', 'Área 7', 'Pr. Otoniel Dias', 4], ['8', 'Área 8', 'Pr. Gideão Ramos', 3], ['9', 'Área 9', 'Pr. Calebe Souto', 3]];
const R35_A2 = [['7', 'Vila Nova', 'Pr. Abel Nogueira'], ['9', 'Cidade Jardim', 'Ev. Marcos Pinto'], ['12', 'Monte Sião', 'sem dirigente'], ['15', 'Bela Vista', 'Pb. Sérgio Alves'], ['18', 'Jardim Ipê', 'Ev. Hélio Martins'], ['21', 'Nova Esperança', 'Pb. Gilmar Sousa'], ['24', 'Primavera', 'Pr. Josué Lima'], ['27', 'Betel', 'Pb. Adão Ferreira'], ['30', 'Recanto', 'Ev. Caio Barbosa'], ['33', 'Novo Brasil', 'Pb. Hugo Lemos'], ['38', 'Esplanada', 'Ev. Davi Rocha'], ['42', 'Altamira', 'Pb. Saulo Teles']];
const R35_DORMINDO_TXT = 'região, quadrante e distrito'; // R35_DORMINDO: os níveis do Regimento, só neste cartão da Geral
function r35AreasGeral(p, cel) {
  const lista = R35_AREAS.map((x, i) => r28Pes(p, r35Num(p, x[0], i === 0), x[1], `${x[2]} · ${x[3]} ${x[3] === 1 ? 'congregação' : 'congregações'}`, cel ? r28Mais(p, '›') : '', { i, alt: cel ? 40 : 42, sel: !cel && i === 1 })).join('');
  const dorm = r32Car(p, 'Os níveis acima da área', r18Etiq(p, 'desligados', 'roxo'), `<span style="font-size:12.5px;line-height:1.45;color:${p.texto}">O Regimento prevê ${R35_DORMINDO_TXT}. Estão desligados: ninguém vê, só a Secretaria Geral, que pode ligar um dia.</span>`, cel); // R35_DORMINDO
  if (cel) return r32EsCel(p, 'Áreas e números', `${r29Nums(p, [r32Num('9', 'áreas'), r32Num('45', 'congregações'), r32Num('46', 'o próximo nº')], 1)}${r32Car(p, 'As áreas', r28Mais(p, '+ Área'), lista, 1)}${dorm}`);
  const aberta = r32Car(p, 'Área 2 · 12 congregações, pelo número', r28Mais(p, 'Mudar o pastor'), `<div style="display:grid;grid-template-columns:1fr 1fr;column-gap:18px">${R35_A2.map((x, i) => r28Pes(p, r35Num(p, x[0]), x[1], x[2], '', { i: i > 1, alt: 40 })).join('')}</div>${r20Nota(p, 'A ordem é pelo número de abertura, não pelo nome. Cada congregação tem “Mudar de área” e “Fechar ou juntar” na ficha.')}`);
  const tit = r18Tit(p, 'As áreas e os números', `9 áreas · 45 congregações · o próximo número é o 46 · ${R35_IG_HOJE}`, `${m8Linha(p, '+ Área nova', '')}${r21Ouro(p, 'Congregação nova', 'mais', 40)}`);
  return r35Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r32Car(p, 'As áreas', '', lista), r18Col(aberta, dorm), '1fr 1.45fr')}`, ['Áreas e números']);
}
// a Geral cadastra a congregação nova: um formulário simples
function r35Nova(p, cel) {
  const campos = `<div style="display:grid;grid-template-columns:${cel ? '1fr 92px' : '1fr 110px'};gap:10px">${r17Campo(p, 'Nome', 'Nova Carajás', { obrig: 1 })}${r17Campo(p, 'Número', '46', { icone: 'cadeado', auto: 1 })}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Área', 'Área 2', { icone: 'igreja', obrig: 1 })}${r17Campo(p, 'Abertura', '07/02/2027', { icone: 'calendario', obrig: 1 })}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'CEP e número', '68515-000, 120', { icone: 'mapa' })}${r17Campo(p, 'Bairro', 'Nova Carajás', { icone: 'casas', nota: cel ? '' : 'da lista' })}</div>${r17Campo(p, 'Veio de um ponto de culto?', 'Sim: o de Nova Carajás, de Vila Nova', { icone: 'casa' })}`;
  const vai = r28Vai(p, [['calendario', 'Recebe a agenda padrão da Geral sozinha, e entra no site e no mapa.'], ['maleta', 'A diretoria começa vaga: o pastor da Área 2 põe o dirigente, e o painel cobra.'], ['casa', 'O ponto de culto de Nova Carajás sai da lista de Vila Nova.']], cel);
  if (cel) return r32EsCel(p, 'Congregação nova', `${campos}${r32Car(p, 'O que vai acontecer', '', vai, 1)}${r35Pin(p, 'Cadastrar com o meu PIN', 1)}`);
  const tit = r18Tit(p, 'Congregação nova', `a Geral cadastra direto, quando o Presidente decide · ${R35_IG_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'geral', 'Áreas e números', `${tit}${r17Dois(r32Car(p, 'Os dados', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'O que vai acontecer', '', vai), r35Pin(p, 'Cadastrar com o meu PIN')), '1.25fr 1fr')}`, ['Áreas e números', 'Congregação nova']);
}
// a congregação cadastra o ponto de culto novo
function r35Ponto(p, cel) {
  const campos = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${r17Campo(p, 'Bairro', 'Jardim Canadá', { icone: 'casas', nota: cel ? '' : 'da lista', obrig: 1 })}${r17Campo(p, 'Dia e hora', 'Terça, 19h30', { icone: 'relogio', obrig: 1 })}</div>${r17Campo(p, 'Responsável', 'Dc. Otávio Lima', { icone: 'pessoa', obrig: 1 })}${r17Campo(p, 'Endereço da casa', 'Rua das Acácias, 18 · casa da irmã Rosa', { icone: 'cadeado', nota: 'só a liderança vê' })}`;
  const site = `<div style="border:1px solid ${p.borda};border-radius:12px;overflow:hidden;background:#FFFFFF;flex:none"><div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0A2342">${logo(18)}<span style="font-size:11.5px;color:#C9D4E3">como aparece no site</span></div><div style="padding:6px 12px;font-size:12.5px;line-height:1.5;color:#3B4A63"><strong style="color:#0A2342">Ponto de culto no Jardim Canadá</strong> · terça, às 19h30<br>Sem o endereço da casa.</div></div>`;
  if (cel) return r32EsCel(p, 'Ponto de culto novo', `${campos}${site}${r21Ouro(p, 'Cadastrar o ponto', 'check', 44)}`);
  const tit = r18Tit(p, 'Ponto de culto novo', `um culto no lar, ligado a Vila Nova · ${R35_IG_HOJE}`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'local', 'Cultos e pontos', `${tit}${r17Dois(r32Car(p, 'O ponto de culto', '', `<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">${campos}</div>`), r18Col(r32Car(p, 'Os pontos de Vila Nova', r18Etiq(p, '2 + o novo', 'azul'), R32_PONTOS_VN.map((x, i) => r28Pes(p, r32Ic(p, 'casa'), `${x[0]} · ${x[1]}`, `${x[3]} · ${x[2]}`, '', { i, alt: 42 })).join('')), site, r21Ouro(p, 'Cadastrar o ponto', 'check', 42)), '1.2fr 1fr')}`, ['Vila Nova', 'Ponto de culto novo'], R32_USU.sec);
}
// a área vê a congregação nova chegar, sem dirigente
function r35IgArea(p, cel) {
  const lista = R35_A2.slice(0, cel ? 5 : 12).concat([['46', 'Nova Carajás']]).map((x, i) => r28Pes(p, r35Num(p, x[0], x[0] === '46'), x[1], x[0] === '46' ? 'nova, aberta hoje · sem dirigente' : x[2], x[0] === '46' ? r28Mais(p, 'Pôr o dirigente') : '', { i: cel ? i : i > 1, alt: cel ? 40 : 38, sel: x[0] === '46' })).join('');
  const aviso = r16aAviso(p, '<strong>Congregação nova na sua área:</strong> Nova Carajás (nº 46), aberta hoje pela Secretaria Geral. A diretoria começa vaga.', 'alerta');
  if (cel) return r32EsCel(p, 'Ficha da área', `${aviso}${r32Car(p, 'As congregações da Área 2', '', lista, 1)}`);
  const tit = r18Tit(p, 'As congregações da Área 2', `agora 13, pelo número de abertura · ${R35_IG_HOJE}`);
  return r35Es(p, 'area', 'Ficha da área', `${tit}${aviso}${r32Car(p, '13 congregações', '', `<div style="display:grid;grid-template-columns:1fr 1fr;column-gap:18px">${lista}</div>`)}`, ['Área 2', 'Ficha da área']);
}
const r35Igrejas = (p, k, d) => { const cel = ehCel(d); return k === 'nova' ? r35Nova(p, cel) : k === 'ponto' ? r35Ponto(p, cel) : k === 'area' ? r35IgArea(p, cel) : r35AreasGeral(p, cel); };
const PERFIS35_IGREJAS = [['geral', 'Secretaria Geral · as áreas e os números'], ['nova', 'Secretaria Geral · a congregação nova'], ['area', 'Pastor da Área 2 · a nova chega'], ['ponto', 'Secretaria de Vila Nova · ponto de culto novo']];
