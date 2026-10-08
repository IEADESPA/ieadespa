// Aviso de "pode retirar" das camisetas — o texto do e-mail num lugar só (08/10/2026), usado pelo aviso de um
// pedido (EnviarAvisoRetiradaCamiseta, ao marcar "separado") e pelo aviso EM MASSA do grupo (AvisarRetiradaCamisetas).
const { renderEmailShell, escaparHtml } = require("./emailTemplate");

function montarAvisoRetirada({ nome, campanhaNome, itens, retiradaLocal, assunto, corpo }) {
  const itensTexto = (Array.isArray(itens) ? itens : []).map((i) => {
    const rotulo = [i.tamanho, i.modelo].filter(Boolean).join(" · ") || "Item";
    return `${rotulo} — ${i.quantidade}x`;
  });
  const assuntoFinal = assunto || `Sua camiseta chegou! — ${campanhaNome}`;
  const paragrafo = corpo || `Boa notícia, ${nome}! O pedido que você fez em "${campanhaNome}" já chegou e está pronto pra você retirar.`;
  const corpoHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">${escaparHtml(paragrafo)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5decf;border-radius:8px;">
      <tr><td style="padding:12px 16px;">
        ${itensTexto.map((linha) => `<div style="font-size:14px;color:#2a2116;">${escaparHtml(linha)}</div>`).join("")}
      </td></tr>
    </table>
    ${retiradaLocal ? `<p style="margin:0;font-size:14px;color:#3a3226;line-height:1.5;"><strong>Onde retirar:</strong> ${escaparHtml(retiradaLocal)}</p>` : ""}`;
  const corpoTexto = [paragrafo, "", ...itensTexto, "", retiradaLocal ? `Onde retirar: ${retiradaLocal}` : ""].filter((l) => l !== "").join("\n");
  return { subject: assuntoFinal, plainText: corpoTexto, html: renderEmailShell({ titulo: assuntoFinal, corpoHtml }) };
}

// Envia pelo ACS. `aguardarEntrega:false` responde assim que o serviço ACEITA o e-mail (sem esperar a entrega) — no aviso em
// massa, esperar a entrega de cada um levaria minutos.
async function enviarAviso(emailClient, remetente, { email, aviso, aguardarEntrega = true }) {
  const poller = await emailClient.beginSend({ senderAddress: remetente, content: { subject: aviso.subject, plainText: aviso.plainText, html: aviso.html }, recipients: { to: [{ address: email }] } });
  if (aguardarEntrega) await poller.pollUntilDone();
  return true;
}

module.exports = { montarAvisoRetirada, enviarAviso };
