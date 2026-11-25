/* ================= RODADA 34: ESTRUTURA E TERRITÓRIOS (MÓDULO 3), OS AJUSTES DA 33 ================= */
// A 33 foi conferida por ele (25/11/2026): o mapa e a virada aprovados; voltam os cultos (a agenda personalizada: culto só
// da Sede, culto só das congregações e o tipo de cada domingo do mês) e o termo de posse (de todo mundo que trabalha e tem
// acesso, com a parte 1 por cargo; assinam quem toma posse, quem deu a posse, o Presidente e o Secretário Geral). A casca,
// os dados e as peças da 32 e da 33 continuam na base (r32Car, r33Es, r33Teclado...); aqui só o que é novo, com r34/R34.
// Nos cultos, hoje é 02/12/2026 (os domingos de dezembro: 06, 13, 20 e 27; janeiro de 2027 tem 5: 03 a 31). No termo, é
// janeiro de 2027: o dirigente cadastrou a diretoria (a tela de 05/01 da 33) e cada um aceita o termo do ano.
const R34_JAN = '08/01/2027';
// quem está vendo, além dos da 32 e da 33 (nomes de mentira)
const R34_USU = {
  sede: { ini: 'RM', nome: 'Raquel Moura', papel: 'Secretaria · Sede' },
  pres: { ini: 'SA', nome: 'Pr. Samuel Araújo', papel: 'Presidente' },
  secg: { ini: 'JF', nome: 'Pr. Jonas Ferraz', papel: 'Secretário Geral' },
  debora: { ini: 'DL', nome: 'Débora Lima', papel: '1ª secretária · Vila Nova' }
};
const R34_ESC = { sede: 'Congregação Sede · nº 1', pres: 'Presidente · igreja toda', secg: 'Secretário Geral · igreja toda' };
// o menu da 34: o da 33, e a Geral ganha os modelos do termo em "Só a Geral"; o Presidente e o Secretário Geral, os termos para assinar
function r34Grupos(k, ativo) {
  const G = [['Painel', [['grafico', 'Painel da estrutura']]], ['Igrejas', [['igreja', k === 'area' ? 'Ficha da área' : 'Ficha da congregação'], ['relogio', 'Cultos e pontos'], ['mapa', 'Mapa']]], ['Diretoria', [['maleta', 'Diretoria e cargos'], ['doc', 'Termos de posse']]]];
  if (k === 'pres' || k === 'secg') G[2][1].push(['chave', 'Termos para assinar']);
  if (k === 'geral' || k === 'pres' || k === 'secg') G.push(['Só a Geral', [['calendario', 'Agenda padrão'], ['doc', 'Modelos do termo'], ['casas', 'Bairros da cidade'], ['igreja', 'Áreas e números']]]);
  return G.map(g => { const tem = g[1].some(f => f[1] === ativo); return [g[0], g[1].map(f => (f[1] === ativo ? f.concat([1]) : f)), tem]; });
}
const r34Es = (p, k, ativo, conteudo, trilha, usu) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'estrutura', { titulo: 'Estrutura', escopo: R34_ESC[k] || R32_ESC[k], grupos: r34Grupos(k, ativo), usuario: usu || R34_USU[k] || R32_USU[k] }), trilha: ['Estrutura'].concat(trilha || [ativo]), faixa: R32_VERDE, conteudo }));
// para quem é o culto do padrão: todas, só a Sede ou só as congregações
const R34_QUEM = { todas: ['Todas', 'azul'], sede: ['Só a Sede', 'roxo'], cong: ['Só as congregações', 'verde'] };
const r34Quem = (p, q, curto) => r18Etiq(p, curto ? { todas: 'Todas', sede: 'Sede', cong: 'Congr.' }[q] : R34_QUEM[q][0], R34_QUEM[q][1]);
// a caixinha de marcar, menor (listas do lote)
const r34Caixa = (p, on) => r33Caixa(p, on);
