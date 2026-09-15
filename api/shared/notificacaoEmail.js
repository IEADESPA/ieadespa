// shared/notificacaoEmail.js
// Canal de e-mail do motor de notificações (vB.2). WhatsApp Business API
// ficou de fora por decisão explícita (custo — API paga por conversa, sem
// orçamento aprovado). Mesma filosofia do site institucional
// (site/api/EnviarConfirmacaoInscricao): notificação é best-effort — uma
// falha de e-mail nunca derruba a notificação em si (ela já existe na
// central de avisos independente do envio).
const { EmailClient } = require("@azure/communication-email");

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

let client = null;
function getClient() {
  if (!ACS_CONNECTION_STRING) return null;
  if (!client) client = new EmailClient(ACS_CONNECTION_STRING);
  return client;
}

async function enviarEmailNotificacao({ email, titulo, mensagem }) {
  const emailClient = getClient();
  if (!emailClient || !email) return false;
  try {
    const poller = await emailClient.beginSend({
      senderAddress: REMETENTE,
      content: {
        subject: titulo,
        plainText: mensagem,
        html: `<p>${mensagem.replace(/\n/g, "<br>")}</p>`
      },
      recipients: { to: [{ address: email }] }
    });
    await poller.pollUntilDone();
    return true;
  } catch (e) {
    console.error("[NOTIFICACOES] falha ao enviar e-mail:", e.message);
    return false;
  }
}

module.exports = { enviarEmailNotificacao };
