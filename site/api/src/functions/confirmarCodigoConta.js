const { app } = require("@azure/functions");
const { permitir, ipDoPedido } = require("../lib/rateLimit");
const { conferirCodigo, assinar } = require("../lib/contaToken");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 26 — passo 2 do login: confere o código de 6 dígitos contra o hash
 * guardado em `contas_codigos` (o mais recente e ainda não usado pra aquele
 * e-mail), marca como usado e devolve um token assinado (ver `contaToken.js`)
 * pro navegador guardar em localStorage — essa é a "sessão" da Minha Conta.
 */
app.http("confirmar-codigo-conta", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "confirmar-codigo-conta",
  handler: async (request, context) => {
    if (!permitir(`conta-confirmar:${ipDoPedido(request)}`)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.CONTA_TOKEN_SECRET) {
      context.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/CONTA_TOKEN_SECRET).");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const codigo = String(body?.codigo || "").trim();
    if (!email || !codigo) {
      return { status: 400, jsonBody: { erro: "E-mail e código são obrigatórios." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

    const codigosRes = await fetch(
      `${DIRECTUS_URL}/items/contas_codigos?filter[email][_eq]=${encodeURIComponent(email)}&filter[usado][_eq]=false&sort=-id&limit=5`,
      { headers },
    );
    if (!codigosRes.ok) {
      context.error("Falha ao buscar código no Directus:", codigosRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao verificar código." } };
    }
    const codigos = (await codigosRes.json()).data || [];

    const agora = Date.now();
    const encontrado = codigos.find(
      (c) => new Date(c.expira_em).getTime() > agora && conferirCodigo(codigo, c.codigo_hash),
    );

    if (!encontrado) {
      return { status: 401, jsonBody: { erro: "Código inválido ou expirado." } };
    }

    await fetch(`${DIRECTUS_URL}/items/contas_codigos/${encontrado.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ usado: true }),
    });

    return { jsonBody: { token: assinar(email), email } };
  },
});
