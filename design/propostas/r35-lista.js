const r35T = (id, nome, parte, decidido, desc, fn, perfis, perfisRot, explica) => ({ id, nome, parte, w: 1280, h: 800, disp: true, perfis, perfisRot, decidido: `${decidido} ${R22_REGRA}`, opcoes: [['Versão única', desc, fn]], explica });
const EXPLICA_R35 = `<p>(em construção)</p>`;
const R35_EX_PERFIS = {};
const R35_EX_AFASTAR = {};
const TELAS_R35 = [
  r35T('r35-perfis', 'Os perfis de acesso de cada cargo', 'Estrutura · Diretoria', 'Versão única.', 'O cargo carrega o acesso.', r35Perfis, PERFIS35_PERFIS, 'Quem está vendo e em que passo', R35_EX_PERFIS),
  r35T('r35-afastar', 'Afastar do cargo', 'Estrutura · Diretoria', 'Versão única.', 'Tira só o acesso do cargo.', r35Afastar, PERFIS35_AFASTAR, 'Quem está vendo e em que passo', R35_EX_AFASTAR)
];
TELAS.unshift(...TELAS_R35.map(t => Object.assign({}, t, { rodada: 35 })));
