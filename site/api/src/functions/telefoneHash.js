const { app } = require("@azure/functions");
const { gerarHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

/**
 * Utilitário puro de criptografia — recebe o telefone em texto (só nesta
 * chamada, nunca fica guardado em lugar nenhum) e devolve o valor já
 * hashado ("saltHex:hashHex") pronto para ser salvo no campo `telefone`.
 * Não fala com o Directus — quem grava a inscrição continua sendo quem já
 * gravava antes (o próprio navegador do inscrito com o papel Público, ou a
 * equipe autenticada em `/painel-eventos/`), só que agora envia o valor
 * hashado em vez do telefone puro.
 */
app.http("telefone-hash", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "telefone-hash",
  handler: async (request) => {
    const chave = `hash:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const valor = gerarHash(body?.telefone);
    if (!valor) {
      return { status: 400, jsonBody: { erro: "Telefone inválido (mínimo 8 dígitos)." } };
    }

    return { jsonBody: { valor } };
  },
});
