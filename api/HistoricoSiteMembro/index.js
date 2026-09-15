// HistoricoSiteMembro (vC.3)
// Mostra, no perfil do membro, o que ele já tinha feito no site institucional
// (inscrições em eventos, pedidos de camiseta) ANTES ou DEPOIS de virar
// membro — casado só por e-mail, nunca fundido com a conta dele no site
// (ela continua existindo e funcionando por conta própria). Exige a
// permissão "pessoas" — é dado de apoio ao cadastro de pessoas, mesma trava
// de GestaoPessoas.
// GET /api/historico-site-membro?matricula=123
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (req.method !== "GET") {
    context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }

  const matricula = Number((req.query || {}).matricula);
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: ?matricula=123" } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, matricula)
    .query(`SELECT Email FROM MembroReferencia WHERE MembroId = @id`);
  const email = membro.recordset[0]?.Email;

  if (!email) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { temEmail: false, inscricoes: [], pedidos: [] } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { temEmail: true, indisponivel: true, inscricoes: [], pedidos: [] } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
  const filtroEmail = `filter[email][_eq]=${encodeURIComponent(email)}`;

  const [inscricoesRes, pedidosRes] = await Promise.all([
    fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?${filtroEmail}&fields=id,codigo,pago,presente,evento.title,evento.event_date&sort=-id&limit=-1`, { headers }),
    fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?${filtroEmail}&fields=id,valor_pago,grupo.nome&sort=-id&limit=-1`, { headers }),
  ]);

  const inscricoes = inscricoesRes.ok ? (await inscricoesRes.json()).data || [] : [];
  const pedidos = pedidosRes.ok ? (await pedidosRes.json()).data || [] : [];

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      temEmail: true,
      inscricoes: inscricoes.map(i => ({ eventoTitulo: i.evento?.title ?? null, eventoData: i.evento?.event_date ?? null, presente: i.presente })),
      pedidos: pedidos.map(p => ({ grupo: p.grupo?.nome ?? null, valorPago: p.valor_pago })),
    },
  };
};
