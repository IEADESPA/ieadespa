const { app } = require("@azure/functions");
const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { renderEmailShell, renderCodigoBox } = require("../lib/emailTemplate");
const { gerarCodigo, hashCodigo } = require("../lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

/*
 * Fase 26 — passo 1 do login sem senha da "Minha Conta": recebe um e-mail,
 * garante que existe uma conta pra ele (cria na primeira vez) e manda um
 * código de 6 dígitos por e-mail (Azure Communication Services, mesma
 * infraestrutura da Fase 21). `contas`/`contas_codigos` não têm leitura nem
 * escrita pública nenhuma no Directus — só esta Function, com o token de
 * admin, grava neles (mesmo padrão de `camiseta_pedidos`/`inscricoes_eventos`
 * protegidas).
 */
app.http("solicitar-codigo-conta", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "solicitar-codigo-conta",
  handler: async (request, context) => {
    if (!permitir(`conta-codigo-ip:${ipDoPedido(request)}`)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !ACS_CONNECTION_STRING) {
      context.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/ACS_CONNECTION_STRING).");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const email = String(body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return { status: 400, jsonBody: { erro: "E-mail inválido." } };
    }

    // limite por e-mail também, não só por IP — impede spam pra caixa de terceiro
    if (!permitir(`conta-codigo-email:${email}`)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas para este e-mail. Aguarde alguns minutos." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    const contaRes = await fetch(
      `${DIRECTUS_URL}/items/contas?filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
      { headers },
    );
    const contaExistente = contaRes.ok ? (await contaRes.json()).data?.[0] : null;
    if (!contaExistente) {
      await fetch(`${DIRECTUS_URL}/items/contas`, { method: "POST", headers, body: JSON.stringify({ email }) });
    }

    const codigo = gerarCodigo();
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await fetch(`${DIRECTUS_URL}/items/contas_codigos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, codigo_hash: hashCodigo(codigo), expira_em: expiraEm, usado: false }),
    });

    try {
      const client = new EmailClient(ACS_CONNECTION_STRING);
      const poller = await client.beginSend({
        senderAddress: REMETENTE,
        content: {
          subject: `Seu código de acesso: ${codigo}`,
          plainText: `Seu código de acesso é ${codigo}. Vale por 10 minutos — não compartilhe com ninguém.`,
          html: renderEmailShell({
            titulo: "Seu código de acesso",
            corpoHtml: `
              <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">Use o código abaixo para entrar na sua conta:</p>
              ${renderCodigoBox({ nome: email, codigo, situacao: "Vale por 10 minutos" })}
            `,
          }),
        },
        recipients: { to: [{ address: email }] },
      });
      await poller.pollUntilDone();
    } catch (err) {
      context.error("Falha ao enviar e-mail de código:", err);
      return { status: 502, jsonBody: { erro: "Falha ao enviar e-mail." } };
    }

    return { jsonBody: { enviado: true } };
  },
});
