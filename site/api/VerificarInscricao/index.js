const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

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
module.exports = async function (context, req) {
  if (!permitir(`verificar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN não configurados nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const { evento, modo, codigo, nome, id, telefone } = body;
  if (!evento || !modo) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  const rosterRes = await fetch(
    `${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${encodeURIComponent(evento)}&fields=id,nome,codigo,presente,pago,telefone&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
  );
  if (!rosterRes.ok) {
    context.log.error("Falha ao buscar roster no Directus:", rosterRes.status);
    context.res = { status: 502, body: { erro: "Falha ao consultar inscrições." } };
    return;
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
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: responder(registro) };
    return;
  }

  if (modo === "nome") {
    const termo = norm(nome);
    if (termo.length < 2) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { candidatos: [] } };
      return;
    }
    const candidatos = roster
      .filter((r) => norm(r.nome).includes(termo))
      .slice(0, 8)
      .map((r) => ({ id: r.id, nome: r.nome }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { candidatos } };
    return;
  }

  if (modo === "id") {
    const registro = roster.find((r) => String(r.id) === String(id));
    if (!registro || !conferirHash(telefone, registro.telefone)) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: responder(registro) };
    return;
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
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { autentico: false } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { autentico: true, nome: registro.nome } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { encontrado: false } };
};
