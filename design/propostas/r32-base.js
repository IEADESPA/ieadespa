/* ================= RODADA 32: ESTRUTURA E TERRITÓRIOS (MÓDULO 3), O COMEÇO ================= */
// A base comum das telas da 32: a casca do módulo (a cor verde do território), quem está vendo em cada nível e os dados
// de mentira que continuam os da 29 e da 31 (Vila Nova sem tesoureiro desde 25/11, quando o Carlos saiu; Monte Sião sem
// dirigente desde 02/11). Hoje, nos desenhos, é 02/12/2026: o mês do aviso de "cargo vencendo".
const R32_HOJE = '02/12/2026';
CORES_MOD.estrutura = p => ({ menu: '#0E4D2C', ativo: '#16663F', cor: '#15803D', cab: 'rgba(255,255,255,.12)', sub: '#BBF0CD' });
const R32_VERDE = '#15803D';
const R32_ESC = { local: 'Congregação Vila Nova · nº 7', area: 'Área 2 · 12 congregações', geral: 'Secretaria Geral · 45 congregações' };
const R32_USU = { local: R29_DIR.local, area: R29_DIR.area, geral: LIDER, sec: R27_SEC.local, pres: { ini: 'SA', nome: 'Pr. Samuel Araújo', papel: 'Presidente' } };
const R32_MARTA = { ini: 'MS', nome: 'Marta Souza', papel: 'Membro · Vila Nova' };
// o menu do módulo: o painel, as igrejas, a diretoria e, só para a Geral, a estrutura da igreja
function r32Grupos(k, ativo) {
  const G = [['Painel', [['grafico', 'Painel da estrutura']]], ['Igrejas', [['igreja', k === 'area' ? 'Ficha da área' : 'Ficha da congregação'], ['relogio', 'Cultos e pontos'], ['mapa', 'Mapa']]], ['Diretoria', [['maleta', 'Diretoria e cargos'], ['doc', 'Termos de posse']]]];
  if (k === 'geral') G.push(['Só a Geral', [['casas', 'Áreas e números'], ['mais', 'Congregação nova']]]);
  return G.map(g => { const tem = g[1].some(f => f[1] === ativo); return [g[0], g[1].map(f => (f[1] === ativo ? f.concat([1]) : f)), tem]; });
}
const r32Es = (p, k, ativo, conteudo, trilha, usu) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'estrutura', { titulo: 'Estrutura', escopo: usu === R32_USU.pres ? 'Presidente · igreja toda' : R32_ESC[k], grupos: r32Grupos(k, ativo), usuario: usu || R32_USU[k] }), trilha: ['Estrutura'].concat(trilha || [ativo]), faixa: R32_VERDE, conteudo }));
function r32EsCel(p, titulo, conteudo) {
  const marca = '<div style="flex:1;min-height:0;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:14px">';
  const h = cascaCel(p, { titulo, corBarra: '#16663F', conteudo }), i = h.indexOf(marca);
  return i < 0 ? h : h.slice(0, i) + r12Abas(p, R12_ITENS.lider, 'Trabalho', 'pilulas') + '<div style="flex:1;min-height:0;overflow:hidden;padding:12px 14px;display:flex;flex-direction:column;gap:10px">' + h.slice(i + marca.length);
}
// peças pequenas: o ícone verde de cada linha, o cartão compacto, a etiqueta do mandato e o filtro "só o que eu preciso resolver"
const r32Ic = (p, nome, tom) => `<span style="width:32px;height:32px;border-radius:9px;flex:none;background:${tom === 'verm' ? '#FDE4E4' : tom === 'ouro' ? '#FFF4D1' : '#DCFCE7'};display:flex;align-items:center;justify-content:center">${ic(nome, tom === 'verm' ? '#B91C1C' : tom === 'ouro' ? '#8A5A00' : R32_VERDE, 17, 2)}</span>`;
const r32Car = (p, tit, dir, corpo, cel) => r27Cartao(p, tit, dir, corpo, cel ? 'padding:8px 12px;gap:2px' : 'gap:2px');
const r32Filtro = (p, cel) => `<div style="display:flex;gap:6px;flex:none">${r31Chip(p, 'Só o que eu preciso resolver', 1)}${r31Chip(p, cel ? 'Tudo' : 'Tudo do meu nível', 0)}</div>`;
const r32Num = (n, t, tom) => [n, t, tom ? (p => R17_TONS[tom][1]) : null];
// a diretoria de 2026 de Vila Nova (todos vencem na virada do ano; o 1º tesoureiro está vago desde 25/11)
const R32_DIR_VN = [['Dirigente', 'Pr. Abel Nogueira', 'AN'], ['Vice-dirigente', 'Pb. Ivan Castro', 'IC'], ['1º secretário', 'Débora Lima', 'DL'], ['2º secretário', 'Paulo Mendes', 'PM'], ['1º tesoureiro', '', ''], ['2º tesoureiro', 'Sueli Rocha', 'SR']];
const R32_CULTOS_VN = [['Domingo', '8h30', 'Escola Bíblica Dominical'], ['Domingo', '18h', 'Culto da família'], ['Terça', '19h30', 'Culto de oração'], ['Quinta', '19h30', 'Culto de ensino'], ['Sábado', '19h30', 'Jovens · 1º e 3º sábados']];
const R32_PONTOS_VN = [['Altamira', 'Quinta, 19h30', 'na casa da irmã Lúcia', 'Dc. Otávio Lima'], ['Nova Carajás', 'Sábado, 19h', 'na casa do irmão Edson', 'Pb. Ivan Castro']];
// as 12 congregações da Área 2, pelo número de abertura (a ordem é pelo número, não pelo nome)
const R32_CONG_A2 = [['7', 'Vila Nova', 'Pr. Abel Nogueira', 1, 'conferido há 6 meses', 'ouro'], ['9', 'Cidade Jardim', 'Ev. Marcos Pinto', 0, 'termo pendente', 'ouro'], ['12', 'Monte Sião', '', 3, 'sem dirigente desde 02/11', 'verm'], ['15', 'Bela Vista', 'Pb. Sérgio Alves', 0, 'em dia', 'verde'], ['18', 'Jardim Ipê', 'Ev. Hélio Martins', 0, 'em dia', 'verde'], ['21', 'Nova Esperança', 'Pb. Gilmar Sousa', 0, 'sem conferir há 8 meses', 'ouro'], ['24', 'Primavera', 'Pr. Josué Lima', 0, 'em dia', 'verde'], ['27', 'Betel', 'Pb. Adão Ferreira', 2, 'tesoureiros vagos', 'ouro']];
// o "Para conferir" das telas da 32 que vem da sessão de 23/11, pelas regras dele (fica na explicação, fora do desenho)
const R32_PC_SITE = 'o endereço, os horários, o telefone e a foto são atualizados pela congregação, pela área e pela Geral, e o site muda sozinho';
// as 9 áreas (45 congregações): [nome, congregações, cultos por semana, pontos de culto, para conferir, cargos vagos, sem dirigente, termos pendentes, diretoria de 2027 pronta]
const R32_AREAS = [['Área 1 · Distrito Sede', 1, 9, 3, 0, 0, 0, 0, 1], ['Área 2', 12, 58, 19, 3, 8, 1, 1, 0], ['Área 3', 5, 22, 6, 1, 2, 0, 0, 1], ['Área 4', 6, 27, 8, 2, 3, 0, 1, 0], ['Área 5', 4, 18, 5, 0, 1, 0, 0, 2], ['Área 6', 5, 23, 7, 2, 4, 0, 1, 0], ['Área 7', 4, 19, 5, 2, 3, 1, 0, 0], ['Área 8', 4, 18, 4, 1, 1, 0, 0, 0], ['Área 9', 4, 20, 4, 0, 0, 0, 0, 0]];
const r32N = (p, n, tom) => (n ? r18Etiq(p, String(n), tom) : `<span style="color:${p.suave}">0</span>`);
