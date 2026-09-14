const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { renderEmailShell, renderCodigoBox } = require("../src/lib/emailTemplate");
const { gerarCodigo, hashCodigo } = require("../src/lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";
// URL pública do sistema de governança — não é segredo, mesmo padrão de
// DIRECTUS_URL (ver site/src/lib/congregacoes.ts).
const SISTEMA_API_URL = "https://app.ieadespa.org.br/api";

/**
 * vC.3 — antes de criar uma conta NOVA (nunca pra quem já tem conta:
 * reaproveitar continua funcionando mesmo se a pessoa virou membro depois),
 * confere se esse e-mail já é de um membro ativo do sistema. Se for, recusa
 * e orienta a usar o acesso de membro — evita a pessoa criar uma identidade
 * solta no site quando já devia estar usando o acesso de verdade. Servidor
 * pra servidor (Azure Function, não o navegador) — sem questão de CORS.
 */
async function ehMembroAtivo(email) {
  try {
    const res = await fetch(`${SISTEMA_API_URL}/verificar-conta-membro?email=${encodeURIComponent(email)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ehMembroAtivo;
  } catch {
    return false;
  }
}

/*
 * Fase 26 — passo 1 do login sem senha da "Minha Conta": recebe um e-mail,
 * garante que existe uma conta pra ele (cria na primeira vez) e manda um
 * código de 6 dígitos por e-mail (Azure Communication Services, mesma
 * infraestrutura da Fase 21). `contas`/`contas_codigos` não têm leitura nem
 * escrita pública nenhuma no Directus — só esta Function, com o token de
 * admin, grava neles (mesmo padrão de `camiseta_pedidos`/`inscricoes_eventos`
 * protegidas).
 */
module.exports = async function (context, req) {
  if (!permitir(`conta-codigo-ip:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !ACS_CONNECTION_STRING) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/ACS_CONNECTION_STRING).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    context.res = { status: 400, body: { erro: "E-mail inválido." } };
    return;
  }

  // limite por e-mail também, não só por IP — impede spam pra caixa de terceiro
  if (!permitir(`conta-codigo-email:${email}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas para este e-mail. Aguarde alguns minutos." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const contaRes = await fetch(
    `${DIRECTUS_URL}/items/contas?filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
    { headers },
  );
  const contaExistente = contaRes.ok ? (await contaRes.json()).data?.[0] : null;
  if (!contaExistente) {
    if (await ehMembroAtivo(email)) {
      context.res = {
        status: 409,
        body: { erro: "Este e-mail já é de um membro ativo da IEADESPA — use o acesso de membro (matrícula e senha), não é preciso criar uma conta aqui." },
      };
      return;
    }
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
    context.log.error("Falha ao enviar e-mail de código:", err);
    context.res = { status: 502, body: { erro: "Falha ao enviar e-mail." } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: true } };
};
