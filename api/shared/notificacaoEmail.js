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


// A mensagem pode carregar texto digitado por gente (nome de equipe, de rodízio...): vai ao HTML do e-mail sempre escapada.
function escaparHtml(texto) {
  return String(texto == null ? "" : texto).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// `aguardarEntrega: false` (vD.4): responde assim que o serviço ACEITA o e-mail (beginSend), sem esperar a entrega — o login
// da liderança não pode ficar 10-15 s preso esperando o serviço de e-mail confirmar.
// Trava 7-C: o cliente SEM novas tentativas (o mesmo da comunicação, abaixo): o padrão do SDK repete o 429 esperando o Retry-After (minutos, com o limite da hora estourado) e a
// rodada das 7h passava do tempo da função, atrasando as retenções e o aviso de risco. O 429 volta na hora como "não enviado": a notificação fica com EnviadaEmail = 0 e o
// reenvio das regras obrigatórias (protecaoDb.reenviarEmailsPendentes) a manda depois.
async function enviarEmailNotificacao({ email, titulo, mensagem, aguardarEntrega = true }) {
  const emailClient = getClienteComunicado();
  if (!emailClient || !email) return false;
  try {
    const poller = await emailClient.beginSend({
      senderAddress: REMETENTE,
      content: {
        subject: titulo,
        plainText: mensagem,
        html: `<p>${escaparHtml(mensagem).replace(/\n/g, "<br>")}</p>`
      },
      recipients: { to: [{ address: email }] }
    });
    if (aguardarEntrega) await poller.pollUntilDone();
    return true;
  } catch (e) {
    console.error("[NOTIFICACOES] falha ao enviar e-mail:", e.message);
    return false;
  }
}

// v7.12 — o e-mail de um comunicado (texto e HTML já montados por shared/comunicacao.js). Responde o que aconteceu, para o registro de entrega:
// { ok:true } aceito pelo serviço · { limite:true } o serviço recusou por excesso (429: nada saiu; a fila tenta na rodada seguinte) · { ok:false } falhou.
// Um cliente próprio, SEM novas tentativas automáticas: o padrão do SDK repete o 429 esperando o Retry-After (minutos, com o limite da hora estourado) e a rodada da fila
// estouraria o tempo da função com as entregas presas em "enviando" (revisão independente, 22/10/2026). Aqui o 429 volta na hora e a fila tenta na rodada seguinte.
let clienteSemRepeticao = null;
function getClienteComunicado() {
  if (!ACS_CONNECTION_STRING) return null;
  if (!clienteSemRepeticao) clienteSemRepeticao = new EmailClient(ACS_CONNECTION_STRING, { retryOptions: { maxRetries: 0 } });
  return clienteSemRepeticao;
}
async function enviarEmailComunicado({ email, assunto, texto, html }) {
  const emailClient = getClienteComunicado();
  if (!emailClient || !email) return { ok: false };
  try {
    await emailClient.beginSend({
      senderAddress: REMETENTE,
      content: { subject: assunto, plainText: texto, html },
      recipients: { to: [{ address: email }] }
    });
    return { ok: true };
  } catch (e) {
    const status = e && (e.statusCode || (e.response && e.response.status));
    if (status === 429 || /too ?many|429/i.test(String(e && (e.code || e.message)))) return { limite: true };
    // só o código e o status: a mensagem do serviço pode conter o endereço de quem recebe
    console.error("[COMUNICACAO] falha ao enviar e-mail:", (e && (e.code || e.name)) || "erro", status || "");
    return { ok: false };
  }
}

module.exports = { enviarEmailNotificacao, enviarEmailComunicado };
