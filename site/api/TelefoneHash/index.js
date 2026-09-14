const { gerarHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

/**
 * Utilitário puro de criptografia — recebe o telefone em texto (só nesta
 * chamada, nunca fica guardado em lugar nenhum) e devolve o valor já
 * hashado ("saltHex:hashHex") pronto para ser salvo no campo `telefone`.
 * Não fala com o Directus — quem grava a inscrição continua sendo quem já
 * gravava antes (o próprio navegador do inscrito com o papel Público, ou a
 * equipe autenticada em `/painel-eventos/`), só que agora envia o valor
 * hashado em vez do telefone puro.
 */
module.exports = async function (context, req) {
  if (!permitir(`hash:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  const body = req.body || {};
  const valor = gerarHash(body.telefone);
  if (!valor) {
    context.res = { status: 400, body: { erro: "Telefone inválido (mínimo 8 dígitos)." } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { valor } };
};
