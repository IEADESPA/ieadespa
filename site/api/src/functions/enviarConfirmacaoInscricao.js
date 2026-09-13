const { app } = require("@azure/functions");
const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { renderEmailShell, renderCodigoBox, escaparHtml } = require("../lib/emailTemplate");

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

/*
 * Fase 21 — e-mail de confirmação no momento da inscrição. E-mail é sempre
 * opcional no formulário público (a verificação de identidade continua
 * sendo código + telefone, nunca e-mail) — esta Function só existe pra
 * mandar um comprovante pra quem quis deixar o e-mail. Melhor esforço: se
 * falhar, a inscrição em si já está feita há muito antes desta chamada (o
 * navegador dispara isto depois do POST em `inscricoes_eventos` ter dado
 * certo), então um erro aqui nunca deve travar nem confundir quem se
 * inscreveu — ver `evento/[slug].astro`, que ignora silenciosamente uma
 * falha nesta chamada.
 */
app.http("enviar-confirmacao-inscricao", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "enviar-confirmacao-inscricao",
  handler: async (request, context) => {
    const chave = `confirmacao:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!ACS_CONNECTION_STRING) {
      context.error("ACS_CONNECTION_STRING não configurada nas Application Settings.");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const { email, eventoTitulo, eventoPeriodo, eventoLocal, pessoas } = body || {};
    if (!email || !eventoTitulo || !Array.isArray(pessoas) || pessoas.length === 0) {
      return { status: 400, jsonBody: { erro: "Parâmetros ausentes." } };
    }

    const situacaoDe = (p) =>
      p.pendenteAprovacao
        ? "Aguardando aprovação da equipe organizadora"
        : p.aguardandoVaga
        ? "Lista de espera — avisamos se abrir vaga"
        : "Confirmada";

    const assunto = pessoas.length === 1 ? `Inscrição em ${eventoTitulo}` : `Inscrições em ${eventoTitulo}`;
    const periodoLocal = [eventoPeriodo, eventoLocal].filter(Boolean).join(" — ");

    const corpoHtml = `
      <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">
        Recebemos ${pessoas.length === 1 ? "sua inscrição" : "as inscrições do grupo"} em
        <strong>${escaparHtml(eventoTitulo)}</strong>${periodoLocal ? `, ${escaparHtml(periodoLocal)}` : ""}.
      </p>
      ${pessoas.map((p) => renderCodigoBox({ nome: p.nome, codigo: p.codigo, situacao: situacaoDe(p) })).join("")}
      <p style="margin:16px 0 0;font-size:13px;color:#8a8172;line-height:1.5;">
        Guarde o(s) código(s) acima — é o que confirma sua presença na entrada do evento.
      </p>`;

    const linhasTexto = pessoas.map((p) => `${p.nome}: código ${p.codigo} — ${situacaoDe(p)}`).join("\n");
    const corpoTexto = [
      `Recebemos ${pessoas.length === 1 ? "sua inscrição" : "as inscrições do grupo"} em "${eventoTitulo}".`,
      periodoLocal,
      "",
      linhasTexto,
      "",
      "Guarde o(s) código(s) acima — é o que confirma sua presença na entrada do evento.",
    ]
      .filter((linha) => linha !== "")
      .join("\n");

    try {
      const client = new EmailClient(ACS_CONNECTION_STRING);
      const poller = await client.beginSend({
        senderAddress: REMETENTE,
        content: {
          subject: assunto,
          plainText: corpoTexto,
          html: renderEmailShell({ titulo: assunto, corpoHtml }),
        },
        recipients: { to: [{ address: email }] },
      });
      await poller.pollUntilDone();
      return { jsonBody: { enviado: true } };
    } catch (err) {
      context.error("Falha ao enviar e-mail de confirmação:", err);
      return { jsonBody: { enviado: false } };
    }
  },
});
