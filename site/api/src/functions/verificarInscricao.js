const { app } = require("@azure/functions");
const { conferirHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * Substitui o Flow "Verificar inscricao (codigo + telefone)" do Directus —
 * mesma lógica e mesmo formato de entrada/saída (drop-in replacement, as
 * páginas certificado/cracha/pesquisa/qrcode não precisaram mudar nada
 * além da URL), mas rodando em Node.js de verdade (não no sandbox do
 * Flow, que não tem `crypto` nem `fetch` — ver README, Fase 6) e
 * comparando o telefone contra um hash de verdade, não texto puro.
 */
app.http("verificar-inscricao", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "verificar-inscricao",
  handler: async (request, context) => {
    const chave = `verificar:${ipDoPedido(request)}`;
    if (!permitir(chave)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
      context.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    const { evento, modo, codigo, nome, id, telefone } = body || {};
    if (!evento || !modo) {
      return { status: 400, jsonBody: { erro: "Parâmetros ausentes." } };
    }

    const rosterRes = await fetch(
      `${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${encodeURIComponent(evento)}&fields=id,nome,codigo,presente,pago,telefone&limit=-1`,
      { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
    );
    if (!rosterRes.ok) {
      context.error("Falha ao buscar roster no Directus:", rosterRes.status);
      return { status: 502, jsonBody: { erro: "Falha ao consultar inscrições." } };
    }
    const roster = (await rosterRes.json()).data || [];

    const responder = (registro) => ({
      encontrado: true,
      id: registro.id,
      nome: registro.nome,
      codigo: registro.codigo,
      presente: registro.presente,
      pago: registro.pago,
    });

    if (modo === "codigo") {
      const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
      if (!registro || !conferirHash(telefone, registro.telefone)) {
        return { jsonBody: { encontrado: false } };
      }
      return { jsonBody: responder(registro) };
    }

    if (modo === "nome") {
      const termo = norm(nome);
      if (termo.length < 2) return { jsonBody: { candidatos: [] } };
      const candidatos = roster
        .filter((r) => norm(r.nome).includes(termo))
        .slice(0, 8)
        .map((r) => ({ id: r.id, nome: r.nome }));
      return { jsonBody: { candidatos } };
    }

    if (modo === "id") {
      const registro = roster.find((r) => String(r.id) === String(id));
      if (!registro || !conferirHash(telefone, registro.telefone)) {
        return { jsonBody: { encontrado: false } };
      }
      return { jsonBody: responder(registro) };
    }

    // Fase 21 — verificação pública de autenticidade de certificado: de
    // propósito SEM telefone (quem confere é um terceiro — ex. um
    // empregador — que nunca teria o telefone de quem se inscreveu, só o
    // código impresso no próprio certificado). Por isso a resposta é
    // mínima: nunca confirma nem nega que um código existe quando a pessoa
    // não esteve presente — sempre a mesma forma (`autentico:false`), pra
    // não revelar "existe mas não foi" de quem não tem certificado nenhum.
    if (modo === "verificar_certificado") {
      const registro = roster.find((r) => norm(r.codigo) === norm(codigo));
      if (!registro || !registro.presente) {
        return { jsonBody: { autentico: false } };
      }
      return { jsonBody: { autentico: true, nome: registro.nome } };
    }

    return { jsonBody: { encontrado: false } };
  },
});
