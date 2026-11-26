const r35T = (id, nome, parte, decidido, desc, fn, perfis, perfisRot, explica) => ({ id, nome, parte, w: 1280, h: 800, disp: true, perfis, perfisRot, decidido: `${decidido} ${R22_REGRA}`, opcoes: [['Versão única', desc, fn]], explica });
const EXPLICA_R35 = `<p>(em construção)</p>`;
const R35_EX_PERFIS = {};
const R35_EX_AFASTAR = {};
const R35_EX_AGENDA = {};
const R35_EX_ASSINAR = {};
const TELAS_R35 = [
  r35T('r35-perfis', 'Os perfis de acesso de cada cargo', 'Estrutura · Diretoria', 'Versão única.', 'O cargo carrega o acesso.', r35Perfis, PERFIS35_PERFIS, 'Quem está vendo e em que passo', R35_EX_PERFIS),
  r35T('r35-afastar', 'Afastar do cargo', 'Estrutura · Diretoria', 'Versão única.', 'Tira só o acesso do cargo.', r35Afastar, PERFIS35_AFASTAR, 'Quem está vendo e em que passo', R35_EX_AFASTAR),
  r35T('r35-agenda', 'A agenda: o último domingo e a ceia geral', 'Estrutura · Igrejas', 'Versão única.', 'O último domingo e a ceia geral.', r35Agenda, PERFIS35_AGENDA, 'Quem está vendo e em que passo', R35_EX_AGENDA),
  r35T('r35-assinar', 'O termo: a assinatura reforçada', 'Estrutura · Diretoria', 'Versão única.', 'O PIN e o código do e-mail.', r35Assinar, PERFIS35_ASSINAR, 'Quem está vendo e em que passo', R35_EX_ASSINAR),
  r35T('r35-igrejas', 'As áreas, os números e a congregação nova', 'Estrutura · Só a Geral', 'Versão única.', 'x', r35Igrejas, PERFIS35_IGREJAS, 'Quem está vendo e em que passo', {}),
  r35T('r35-mudar', 'Mudar de área, fechar ou juntar', 'Estrutura · Só a Geral', 'Versão única.', 'x', r35MudarTela, PERFIS35_MUDAR, 'Quem está vendo e em que passo', {}),
  r35T('r35-guardados', 'Os termos guardados', 'Estrutura · Diretoria', 'Versão única.', 'x', r35Guardados, PERFIS35_GUARDADOS, 'Quem está vendo e em que passo', {})
];
TELAS.unshift(...TELAS_R35.map(t => Object.assign({}, t, { rodada: 35 })));
