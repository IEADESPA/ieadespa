const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { montarAvisoRetirada, enviarAviso } = require("../src/lib/avisoRetirada");

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

/*
 * Fase 28 — aviso de "pode retirar", disparado pelo painel (`/painel-
 * camisetas/grupo/pedidos/`) no momento em que a equipe marca um pedido como
 * "separado" (peças já chegaram da malharia e foram separadas pra aquela
 * pessoa). O painel já tem tudo em memória (nome, e-mail, itens, campanha,
 * local de retirada) — esta Function não consulta o Directus nem precisa de
 * token de admin, só monta e envia o e-mail. Melhor esforço, igual ao resto
 * do e-mail transacional do site: falha aqui nunca desfaz o "separado", que
 * já foi gravado antes desta chamada.
 * 08/10/2026 — o texto do e-mail mora em src/lib/avisoRetirada.js, o mesmo do aviso EM MASSA (AvisarRetiradaCamisetas).
 */
module.exports = async function (context, req) {
  if (!permitir(`aviso-retirada-camiseta:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!ACS_CONNECTION_STRING) {
    context.log.error("ACS_CONNECTION_STRING não configurada nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const { email, nome, campanhaNome, itens, retiradaLocal, assunto, corpo } = body;
  if (!email || !nome || !campanhaNome || !Array.isArray(itens) || itens.length === 0) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  try {
    const aviso = montarAvisoRetirada({ nome, campanhaNome, itens, retiradaLocal, assunto, corpo });
    await enviarAviso(new EmailClient(ACS_CONNECTION_STRING), REMETENTE, { email, aviso, aguardarEntrega: true });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: true } };
  } catch (err) {
    context.log.error("Falha ao enviar e-mail de aviso de retirada:", err);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: false } };
  }
};
