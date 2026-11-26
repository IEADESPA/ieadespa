/* ================= RODADA 35: ESTRUTURA E TERRITÓRIOS (MÓDULO 3), A ÚLTIMA ================= */
// A 34 foi conferida por ele (25/11/2026): as 2 telas aprovadas. Vêm agora (a) os perfis de acesso de cada cargo (o cargo
// carrega o acesso; a Geral cuida dos modelos; o acesso vale desde o aceite do termo; a passagem de quem já tem acesso);
// (b) afastar do cargo (tira só o acesso do cargo; a pessoa continua membro ativo); (c) a agenda com o último domingo e a
// ceia geral; (d) a assinatura reforçada do termo; e (e) o que a 32 deixou para depois: as áreas e os números, a
// congregação nova (e o ponto de culto novo), mudar de área, fechar ou juntar e os termos guardados. A casca, os dados e as
// peças da 32 à 34 continuam na base (r32Car, r33Pin, r34Es...); aqui só o que é novo, com r35/R35.
// Nos acessos, hoje é 01/02/2027: o acesso pelo cargo foi ligado em 31/01 (a passagem é a prévia de 29/01).
const R35_HOJE = '01/02/2027';
// quem está vendo, além dos da 32 à 34 (nomes de mentira)
const R35_USU = {
  marcos: { ini: 'MP', nome: 'Ev. Marcos Pinto', papel: 'Dirigente · Cidade Jardim' },
  area5: { ini: 'NB', nome: 'Pr. Natan Barros', papel: 'Pastor da Área 5' },
  marcosV: { ini: 'MV', nome: 'Marcos Vieira', papel: 'Membro · Vila Nova' },
  membro: { ini: 'CS', nome: 'Célia Santos', papel: 'Membro · Monte Sião' }
};
const R35_ESC = { marcos: 'Congregação Cidade Jardim · nº 9', area5: 'Área 5 · 6 congregações' };
// o menu da 35: o da 34, com os acessos dos cargos na Diretoria e, em "Só a Geral", os perfis de acesso
function r35Grupos(k, ativo) {
  const G = [['Painel', [['grafico', 'Painel da estrutura']]], ['Igrejas', [['igreja', k === 'area' || k === 'area5' ? 'Ficha da área' : 'Ficha da congregação'], ['relogio', 'Cultos e pontos'], ['mapa', 'Mapa']]], ['Diretoria', [['maleta', 'Diretoria e cargos'], ['chave', 'Acessos dos cargos'], ['doc', 'Termos de posse']]]];
  if (k === 'pres' || k === 'secg') G[2][1].push(['doc', 'Termos para assinar']);
  if (k === 'geral' || k === 'pres' || k === 'secg') G.push(['Só a Geral', [['calendario', 'Agenda padrão'], ['doc', 'Modelos do termo'], ['escudo', 'Perfis de acesso'], ['casas', 'Bairros da cidade'], ['igreja', 'Áreas e números']]]);
  return G.map(g => { const tem = g[1].some(f => f[1] === ativo); return [g[0], g[1].map(f => (f[1] === ativo ? f.concat([1]) : f)), tem]; });
}
const r35Es = (p, k, ativo, conteudo, trilha, usu) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'estrutura', { titulo: 'Estrutura', escopo: R35_ESC[k] || R34_ESC[k] || R32_ESC[k], grupos: r35Grupos(k, ativo), usuario: usu || R35_USU[k] || R34_USU[k] || R32_USU[k] }), trilha: ['Estrutura'].concat(trilha || [ativo]), faixa: R32_VERDE, conteudo }));
// a chave de ligar e desligar (o módulo entra ou não entra no perfil)
const r35Chave = (p, on, trava) => `<span style="width:38px;height:22px;border-radius:11px;flex:none;box-sizing:border-box;position:relative;display:inline-block;${on ? `background:${trava ? '#86B89A' : R32_VERDE};` : `background:${p.fundo};border:1.5px solid ${p.campoBorda};`}"><span style="position:absolute;top:${on ? 3 : 2}px;${on ? 'right:3px' : 'left:2px'};width:16px;height:16px;border-radius:8px;background:${on ? '#FFFFFF' : p.campoBorda}"></span></span>`;
// a situação do acesso de cada pessoa: valendo, esperando o termo, afastado, dado pela Geral, vago
const R35_SIT = { ok: ['valendo', 'verde'], termo: ['esperando o termo', 'ouro'], afast: ['afastado', 'verm'], geral: ['dado pela Geral', 'roxo'], vago: ['vago', 'verm'], hoje: ['o de hoje, até o termo', 'azul'] };
const r35Sit = (p, s, t) => r18Etiq(p, t || R35_SIT[s][0], R35_SIT[s][1]);
// o campo de motivo e o PIN no fim de uma ação (afastar, dar, mudar, fechar)
const r35Pin = (p, t, cel) => r21Ouro(p, t, 'chave', cel ? 44 : 42);
// a caixa "isto não mexe no rol"
const r35NaoRol = (p, cel) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:${cel ? '8px 10px' : '10px 12px'};border-radius:12px;background:${p.fundo};border:1px solid ${p.borda};font-size:12.5px;line-height:1.4;color:${p.texto}">${ic('pessoa', R32_VERDE, 18, 2)}<span><strong style="color:${p.titulo}">Não mexe no rol.</strong> ${cel ? 'Ele continua membro ativo: entra no aplicativo, com a carteirinha e as contribuições.' : 'Ele continua membro ativo e continua entrando no aplicativo: a carteirinha, as contribuições, Minha vida. Afastar do rol (disciplina, licença) é outra coisa, na ficha do membro, e tira também a entrada de membro.'}</span></div>`;
