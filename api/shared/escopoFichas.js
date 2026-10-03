// shared/escopoFichas.js — pequenos auxiliares das rotas de ficha e dados de pessoas (a regra de ESCOPO em si mora em shared/escopoRotas.js).
//  - dataISOValida: data AAAA-MM-DD que existe no calendário (2026-02-30 não vale), para recusar com 400 em vez de estourar 500 no driver;
//  - escopoDaApresentacao: de qual congregação é uma Apresentação de Criança (a criança não é matrícula): a congregação registrada, senão a do pai, senão a da mãe;
//  - ocultarSigiloAptidao: quem não tem a permissão "disciplina" não pode saber que um dos pais responde a processo disciplinar.

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataISOValida(valor) {
  if (typeof valor !== "string" || !DATA_ISO.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

// Pedaços de SQL da apresentação com a congregação e a extensão da própria apresentação, do pai e da mãe (o SELECT da rota junta tudo com `a`, `pai` e `mae`).
const SQL_COLUNAS_ESCOPO_APRESENTACAO = `cg.Nome AS congregacaoNome, cgp.Nome AS congregacaoPaiNome, cgm.Nome AS congregacaoMaeNome, exp.Nome AS extensaoPaiNome, exm.Nome AS extensaoMaeNome`;
const SQL_JUNCOES_ESCOPO_APRESENTACAO = `
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = a.CongregacaoId
  LEFT JOIN Congregacoes cgp ON cgp.CongregacaoId = pai.CongregacaoId
  LEFT JOIN Congregacoes cgm ON cgm.CongregacaoId = mae.CongregacaoId
  LEFT JOIN ExtensoesTenda exp ON exp.ExtensaoId = pai.ExtensaoId
  LEFT JOIN ExtensoesTenda exm ON exm.ExtensaoId = mae.ExtensaoId`;

const congregacaoDaApresentacao = (l) => l.congregacaoNome || l.congregacaoPaiNome || l.congregacaoMaeNome || null;
const extensaoDaApresentacao = (l) => l.extensaoPaiNome || l.extensaoMaeNome || null;

const DETALHE_IMPEDIMENTO_GENERICO = "Há impedimento de um dos pais para a apresentação — consulte a Secretaria Geral.";

// A aptidão calculada carrega, no detalhe do impedimento dos pais, "pai sob disciplina em curso": dado sigiloso. Sem "disciplina", vira texto genérico.
function ocultarSigiloAptidao(aptidao, usuario) {
  if (!aptidao || require("./auth").temPermissao(usuario, "disciplina")) return aptidao;
  const itens = { ...aptidao.itens };
  if (itens.impedimentoPais && !itens.impedimentoPais.ok) itens.impedimentoPais = { ...itens.impedimentoPais, detalhe: DETALHE_IMPEDIMENTO_GENERICO };
  return { ...aptidao, itens };
}

module.exports = {
  dataISOValida, SQL_COLUNAS_ESCOPO_APRESENTACAO, SQL_JUNCOES_ESCOPO_APRESENTACAO,
  congregacaoDaApresentacao, extensaoDaApresentacao, ocultarSigiloAptidao, DETALHE_IMPEDIMENTO_GENERICO
};
