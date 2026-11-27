/* ================= RODADA 36: OS ACESSOS PELO CARGO, REFEITOS, O CARGO VAGO E A CEIA GERAL NO SÁBADO ================= */
// A 35 foi conferida por ele (26 e 27/11/2026). Reprovadas: as 2 primeiras telas dos perfis (o perfil do cargo com a lista
// de módulos e a passagem) e a ideia de "afastar do cargo". A 36 é a ÚLTIMA rodada até o lançamento:
// (a) o perfil de cada cargo, refeito: o módulo dado ao cargo já traz as funções do NÍVEL do cargo (só para ler), e o 1º e
//     o 2º têm o mesmo perfil; (b) vários cargos ao mesmo tempo, cada um no nível dele, sem um alargar o outro; (c) o cargo
//     vago, que substitui o afastar: o cargo só acaba por causa (a disciplina, a licença por candidatura, a carta de
//     mudança), o 2º sobe a 1º e se escolhe um novo 2º; (d) a correção da agenda: a ceia geral é no sábado.
// A casca, os dados e as peças da 32 à 35 continuam na base (r32Car, r35Es, r35Chave...); aqui só o que é novo, r36/R36.
// Hoje, nos acessos e no cargo vago, é 01/02/2027. Não há passagem: depois da importação ninguém tem cargo, e o acesso
// vem quando a pessoa é posta no cargo.
const R36_HOJE = '01/02/2027';
// quem está vendo, além dos da 32 à 35 (nomes de mentira). A Secretaria Geral aqui é a Ester, para o João da Silva ser só
// o exemplo dos dois cargos.
const R36_USU = {
  ger: { ini: 'EM', nome: 'Ester Moraes', papel: 'Secretaria Geral' },
  joao: { ini: 'JS', nome: 'Pr. João da Silva', papel: 'Pastor da Área 4 · Tesoureiro de Liberdade' },
  lucas: { ini: 'LF', nome: 'Lucas Ferreira', papel: 'Líder da EBD · Vila Nova' },
  marcos: { ini: 'MV', nome: 'Marcos Vieira', papel: 'Membro · Vila Nova' }
};
// a tela da Estrutura com quem está vendo (a Geral passa a Ester)
const r36Es = (p, k, ativo, conteudo, trilha) => r35Es(p, k, ativo, conteudo, trilha, k === 'geral' ? R36_USU.ger : undefined);
// os 3 módulos do lançamento: [chave, nome]
const R36_MODS = [['membros', 'Membros'], ['financeiro', 'Financeiro'], ['estrutura', 'Estrutura']];
// as funções de cada módulo em cada nível (do desenho aprovado de cada módulo), só para ler
const R36_FUN = {
  financeiro: {
    local: ['Lançar os dízimos e as ofertas (as folhas do bloco)', 'Ligar o dízimo digital a um recibo', 'Lançar as saídas da congregação', 'Mandar o repasse à Geral', 'O mural dos dizimistas', 'Os relatórios da congregação', 'Para onde foram os 60% da congregação'],
    area: ['Acompanhar os repasses das congregações da área', 'Os relatórios da área', 'Para onde foram os 60% da área', 'O mural das congregações da área'],
    geral: ['Receber o repasse e dar o recibo', 'O caixa único (espécie e Pix)', 'O extrato da Cora', 'O rateio dos 60% da Geral', 'O Tesouro Geral e a Convenção', 'Os centros de custo', 'Quanto cada congregação tem na Geral', 'Os saldos de abertura', 'Os blocos da gráfica', 'O contador (o ano numa linha)', 'Os relatórios da igreja toda']
  },
  membros: {
    local: ['As fichas da congregação', 'A fila de cadastros', 'As cartas e as saídas', 'As carteirinhas', 'As listas e os aniversariantes'],
    area: ['As fichas das congregações da área', 'Os pedidos que sobem para a área', 'As listas e os números da área'],
    geral: ['As fichas da igreja toda', 'A fila de cadastros de todas', 'As cartas e as saídas de todas', 'Juntar cadastros repetidos', 'As carteirinhas (os modelos)', 'As listas e os números da igreja toda']
  },
  estrutura: {
    local: ['A ficha da congregação', 'Os cultos e os pontos de culto', 'A diretoria e os cargos', 'Os termos de posse da congregação'],
    area: ['A ficha da área', 'As congregações da área', 'Pôr o dirigente', 'Os acessos dos cargos da área'],
    geral: ['A agenda padrão', 'Os modelos do termo', 'Os perfis de acesso', 'As áreas e os números', 'Os bairros da cidade', 'Os termos para assinar']
  }
};
const R36_NIVEL = { local: 'na congregação', area: 'na área', geral: 'na Geral' };
// a lista das funções de um módulo num nível, só para ler (cel: as 4 primeiras e "mais N")
function r36Funcoes(p, mod, niv, cel, max) {
  const L = R36_FUN[mod][niv], lim = max || (cel ? 4 : L.length), V = L.slice(0, lim);
  const it = V.map(t => `<div style="display:flex;align-items:center;gap:8px;min-height:${cel ? 26 : 27}px;font-size:12.5px;line-height:1.25;color:${p.texto}">${ic('check', R32_VERDE, 14, 2.4)}<span style="min-width:0">${t}</span></div>`).join('');
  return `<div style="display:grid;grid-template-columns:${cel || L.length < 6 ? '1fr' : '1fr 1fr'};column-gap:16px">${it}</div>${L.length > lim ? `<span style="font-size:12px;color:${p.suave}">e mais ${L.length - lim}</span>` : ''}`;
}
// a caixa "só para ler" com as funções de um módulo num nível
const r36CaixaFun = (p, mod, niv, cel, max) => `<div style="border:1px solid ${p.borda};border-radius:12px;background:${p.fundo};padding:${cel ? '8px 10px' : '10px 12px'};display:flex;flex-direction:column;gap:2px;min-width:0"><div style="display:flex;align-items:center;gap:8px;padding-bottom:2px">${ic('cadeado', p.suave, 14, 2)}<strong style="flex:1;min-width:0;font-size:12.5px;color:${p.titulo}">${R36_MODS.find(m => m[0] === mod)[1]} ${R36_NIVEL[niv]}: o que vê</strong><span style="font-size:11px;color:${p.suave};white-space:nowrap">só para ler</span></div>${r36Funcoes(p, mod, niv, cel, max)}</div>`;
// uma linha "cargo → onde vale" (os vários cargos de uma pessoa)
const r36Cargo = (p, cargo, onde, nivel, mods, i, cel) => r28Pes(p, r32Ic(p, nivel === 'area' ? 'igreja' : 'escudo', nivel === 'area' ? 'ouro' : ''), cargo, `${onde}${cel ? '' : ` · ${mods}`}`, r18Etiq(p, R36_NIVEL[nivel].replace('na ', ''), nivel === 'area' ? 'azul' : nivel === 'geral' ? 'roxo' : 'verde'), { i, alt: cel ? 44 : 48 });
