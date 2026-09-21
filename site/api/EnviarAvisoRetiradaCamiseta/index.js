const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { renderEmailShell, escaparHtml } = require("../src/lib/emailTemplate");

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

  const itensTexto = itens.map((i) => {
    const rotulo = [i.tamanho, i.modelo].filter(Boolean).join(" · ") || "Item";
    return `${rotulo} — ${i.quantidade}x`;
  });

  const assuntoFinal = assunto || `Sua camiseta chegou! — ${campanhaNome}`;
  const paragrafo = corpo || `Boa notícia, ${nome}! O pedido que você fez em "${campanhaNome}" já chegou e está separado, pronto pra você retirar.`;

  const corpoHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">${escaparHtml(paragrafo)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5decf;border-radius:8px;">
      <tr><td style="padding:12px 16px;">
        ${itensTexto.map((linha) => `<div style="font-size:14px;color:#2a2116;">${escaparHtml(linha)}</div>`).join("")}
      </td></tr>
    </table>
    ${
      retiradaLocal
        ? `<p style="margin:0;font-size:14px;color:#3a3226;line-height:1.5;"><strong>Onde retirar:</strong> ${escaparHtml(retiradaLocal)}</p>`
        : ""
    }`;

  const corpoTexto = [paragrafo, "", ...itensTexto, "", retiradaLocal ? `Onde retirar: ${retiradaLocal}` : ""].filter((l) => l !== "").join("\n");

  try {
    const client = new EmailClient(ACS_CONNECTION_STRING);
    const poller = await client.beginSend({
      senderAddress: REMETENTE,
      content: {
        subject: assuntoFinal,
        plainText: corpoTexto,
        html: renderEmailShell({ titulo: assuntoFinal, corpoHtml }),
      },
      recipients: { to: [{ address: email }] },
    });
    await poller.pollUntilDone();
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: true } };
  } catch (err) {
    context.log.error("Falha ao enviar e-mail de aviso de retirada:", err);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: false } };
  }
};
