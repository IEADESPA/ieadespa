const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { conferirCodigo, assinar } = require("../src/lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 26 — passo 2 do login: confere o código de 6 dígitos contra o hash
 * guardado em `contas_codigos` (o mais recente e ainda não usado pra aquele
 * e-mail), marca como usado e devolve um token assinado (ver `contaToken.js`)
 * pro navegador guardar em localStorage — essa é a "sessão" da Minha Conta.
 */
module.exports = async function (context, req) {
  if (!permitir(`conta-confirmar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.CONTA_TOKEN_SECRET) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/CONTA_TOKEN_SECRET).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const codigo = String(body.codigo || "").trim();
  if (!email || !codigo) {
    context.res = { status: 400, body: { erro: "E-mail e código são obrigatórios." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  const codigosRes = await fetch(
    `${DIRECTUS_URL}/items/contas_codigos?filter[email][_eq]=${encodeURIComponent(email)}&filter[usado][_eq]=false&sort=-id&limit=5`,
    { headers },
  );
  if (!codigosRes.ok) {
    context.log.error("Falha ao buscar código no Directus:", codigosRes.status);
    context.res = { status: 502, body: { erro: "Falha ao verificar código." } };
    return;
  }
  const codigos = (await codigosRes.json()).data || [];

  const agora = Date.now();
  const encontrado = codigos.find(
    (c) => new Date(c.expira_em).getTime() > agora && conferirCodigo(codigo, c.codigo_hash),
  );

  if (!encontrado) {
    context.res = { status: 401, body: { erro: "Código inválido ou expirado." } };
    return;
  }

  await fetch(`${DIRECTUS_URL}/items/contas_codigos/${encontrado.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ usado: true }),
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { token: assinar(email), email } };
};
