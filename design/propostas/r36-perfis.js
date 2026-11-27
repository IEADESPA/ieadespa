/* ---------------- 1. O PERFIL DE CADA CARGO, REFEITO ---------------- */
// Reprovado na 35 (26/11): o perfil com a lista de módulos e as chaves soltas. O que ele quer: o módulo dado ao cargo já
// traz as funções do NÍVEL do cargo, sem marcar subfunção por subfunção. O Financeiro dado ao tesoureiro da congregação
// mostra só o que é do local; o mesmo Financeiro dado ao tesoureiro geral mostra tudo o que é da Geral. As funções
// aparecem SÓ PARA LER, para ele entender o que cada nível vê. O 1º e o 2º do mesmo cargo têm o mesmo perfil.
// Os perfis, por nível: [cargo, nível, quantos têm (2027), módulos ligados]
const R36_PERFIS = [
  ['Na congregação', [['Dirigente', 'local', 44, 'membros,estrutura'], ['Vice-dirigente', 'local', 41, 'membros,estrutura'], ['Secretário (1º e 2º)', 'local', 83, 'membros,estrutura'], ['Tesoureiro (1º e 2º)', 'local', 82, 'financeiro']]],
  ['Na área', [['Pastor de área', 'area', 9, 'membros,estrutura'], ['Secretário da área', 'area', 9, 'membros,estrutura'], ['Tesoureiro da área', 'area', 8, 'financeiro']]],
  ['Na Geral', [['Presidente', 'geral', 1, 'membros,financeiro,estrutura'], ['Secretário Geral', 'geral', 1, 'membros,financeiro,estrutura'], ['Tesoureiro Geral', 'geral', 1, 'financeiro']]]
];
// qual perfil está aberto em cada passo
const R36_ABERTO = { local: 'Tesoureiro (1º e 2º)', geral: 'Tesoureiro Geral', area: 'Pastor de área' };
const r36Perfil = nome => R36_PERFIS.flatMap(g => g[1]).find(x => x[0] === nome);
function r36ListaPerfis(p, aberto) {
  return R36_PERFIS.map(g => `<div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${p.suave};padding:6px 0 2px">${g[0]}</div>${g[1].map((x, i) => { const n = x[3].split(',').length; return r28Pes(p, r32Ic(p, 'escudo'), x[0], `${x[2]} ${x[2] === 1 ? 'pessoa' : 'pessoas'} · ${n === 3 ? 'os 3 módulos' : n === 1 ? R36_MODS.find(m => m[0] === x[3])[1] : x[3].split(',').map(k => R36_MODS.find(m => m[0] === k)[1]).join(' e ')}`, '', { i, alt: 40, sel: x[0] === aberto }); }).join('')}`).join('');
}
// os 3 módulos, cada um com a chave (entra ou não entra no cargo)
function r36ModsChave(p, liga, cel) {
  const on = k => liga.split(',').includes(k);
  if (cel) return R36_MODS.map((m, i) => `<div style="display:flex;align-items:center;gap:10px;min-height:35px;${i ? `border-top:1px solid ${p.linha};` : ''}"><span style="flex:1;font-size:13.5px;font-weight:600;color:${on(m[0]) ? p.titulo : p.suave}">${m[1]}</span><span style="font-size:11.5px;color:${p.suave}">${on(m[0]) ? 'entra' : 'não entra'}</span>${r35Chave(p, on(m[0]))}</div>`).join('');
  return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${R36_MODS.map(m => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid ${on(m[0]) ? '#86B89A' : p.borda};background:${on(m[0]) ? '#F0FAF3' : p.sup}"><span style="flex:1;min-width:0;line-height:1.2"><span style="display:block;font-size:13.5px;font-weight:700;color:${on(m[0]) ? p.titulo : p.suave}">${m[1]}</span><span style="font-size:11.5px;color:${p.suave}">${on(m[0]) ? 'entra no cargo' : 'não entra'}</span></span>${r35Chave(p, on(m[0]))}</div>`).join('')}</div>`;
}
// a linha do que o cargo NÃO vê (o mesmo módulo, de outro nível)
const R36_NAOVE = {
  local: 'Do Financeiro da área e da Geral, não vê nada: o repasse recebido, o caixa único e o rateio são do tesoureiro geral.',
  geral: 'Vê o Financeiro da igreja toda. O lançar das folhas fica com cada congregação; aqui ele confere e recebe.',
  area: 'O Financeiro não entra: o dinheiro da área quem vê é o tesoureiro da área.'
};
function r36PerfilTela(p, k, cel) {
  const x = r36Perfil(R36_ABERTO[k]), niv = x[1], mods = x[3].split(',');
  const alcance = { local: 'só a congregação do cargo', area: 'as congregações da área do cargo', geral: 'a igreja toda' }[niv];
  const dois = /1º e 2º/.test(x[0]);
  const fatos = r31Fatos(p, [['Alcance', `${alcance} (vem do nível, não se muda)`], dois ? ['O 1º e o 2º', 'o mesmo perfil: os dois fazem as mesmas coisas'] : ['Vale', 'desde o aceite do termo até o cargo acabar'], ['Exige', 'membro há 90 dias ou mais · o termo de posse aceito']], cel);
  const caixas = mods.length === 1 ? r36CaixaFun(p, mods[0], niv, cel) : `<div style="display:grid;grid-template-columns:${cel ? '1fr' : '1fr 1fr'};gap:8px">${mods.map(m => r36CaixaFun(p, m, niv, cel, cel ? 2 : 0)).join('')}</div>`;
  const nome = `${x[0]} · ${R36_NIVEL[niv]}`;
  if (cel) return r32EsCel(p, 'Perfis de acesso', `${r32Car(p, nome, r18Etiq(p, String(x[2]), 'azul'), `${fatos}<div style="font-size:12.5px;font-weight:700;color:${p.titulo};padding-top:4px">Os módulos do cargo</div>${r36ModsChave(p, x[3], 1)}`, 1)}${caixas}${mods.length > 1 ? '' : r20Nota(p, 'As funções vêm do nível do cargo. Não se marca uma por uma.')}${r35Pin(p, 'Salvar com o meu PIN', 1)}`);
  const esq = r32Car(p, 'Um perfil por cargo', r28Mais(p, '+ Perfil novo'), r36ListaPerfis(p, x[0]));
  const dir = r32Car(p, nome, r18Etiq(p, `${x[2]} ${x[2] === 1 ? 'pessoa' : 'pessoas'}`, 'azul'), `${fatos}<div style="font-size:12.5px;font-weight:700;color:${p.titulo};padding:6px 0 4px">Os módulos do cargo: ligue o módulo, e as funções do nível vêm junto</div>${r36ModsChave(p, x[3], 0)}<div style="padding-top:8px">${caixas}</div><div style="padding-top:6px">${r20Nota(p, R36_NAOVE[k])}</div><div style="display:flex;gap:10px;padding-top:8px">${r35Pin(p, 'Salvar com o meu PIN').replace('justify-content:center', 'justify-content:center;flex:1.3')}${r28Bt(p, 'Quem tem este cargo', 'pessoas')}</div>`);
  const tit = r18Tit(p, 'O perfil de cada cargo', `o módulo traz as funções do nível do cargo · a Secretaria Geral cuida dos perfis · ${R36_HOJE}`);
  return r36Es(p, 'geral', 'Perfis de acesso', `${tit}${r17Dois(esq, dir, '1fr 1.75fr')}`, ['Perfis de acesso']);
}
const r36Perfis = (p, k, d) => r36PerfilTela(p, k, ehCel(d));
const PERFIS36_PERFIS = [['local', 'Secretaria Geral · abre o tesoureiro da congregação'], ['geral', 'Secretaria Geral · abre o tesoureiro geral (o mesmo Financeiro)'], ['area', 'Secretaria Geral · abre o pastor de área']];
