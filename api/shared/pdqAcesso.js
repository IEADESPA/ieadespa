// shared/pdqAcesso.js — quem lê e quem escreve no Plano Diretor Quadrienal (PDQ, Regimento Art. 26-29).
// O PDQ é matéria INSTITUCIONAL (a igreja inteira, sem congregação): ler é para a CLI e para a Tesouraria (qualquer `financeiro`, como RelatorioProgressoPdq); ESCREVER
// (criar plano, meta ou projeto, mudar status, prazo) é só da CLI (`cli`) ou da administração geral (papel GLOBAL com escopo TODAS) — um Tesoureiro Local, de Área, de
// Região, de Quadrante ou de Distrito lê mas não altera o plano da denominação.
const auth = require("./auth");
const { ehGeral } = require("./escopoRotas");

const MENSAGEM_ESCRITA = "O Plano Diretor Quadrienal só é alterado pela CLI ou pela administração geral da igreja.";

// Porta das rotas do PDQ: login + (`cli` ou `financeiro`); para POST/PUT exige ainda `cli` ou ser geral. Devolve o usuário ou null (context.res já preenchido).
function exigirAcessoPdq(req, context) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["cli", "financeiro"]);
  if (!usuario) return null;
  const escrita = req.method !== "GET";
  if (escrita && !auth.temPermissao(usuario, "cli") && !ehGeral(usuario)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: MENSAGEM_ESCRITA } };
    return null;
  }
  return usuario;
}

module.exports = { exigirAcessoPdq, MENSAGEM_ESCRITA };
