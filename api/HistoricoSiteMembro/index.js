// HistoricoSiteMembro (vC.3)
// Mostra, no perfil do membro, o que ele já tinha feito no site institucional
// (inscrições em eventos, pedidos de camiseta) ANTES ou DEPOIS de virar
// membro — casado só por e-mail, nunca fundido com a conta dele no site
// (ela continua existindo e funcionando por conta própria). Exige a
// permissão "pessoas" — é dado de apoio ao cadastro de pessoas, mesma trava
// de GestaoPessoas.
// GET /api/historico-site-membro?matricula=123
//
// ESCOPO: o histórico é da PESSOA — só abre quem alcança a congregação dela (shared/escopoRotas.js). Fora do escopo, matrícula inexistente ou malformada: a MESMA resposta de
// "pessoa sem e-mail" (nada de sonda para saber quem tem cadastro ou e-mail). O Directus é consultado com um token administrativo, por isso a consulta tem tempo limite e uma
// falha dele vira "indisponível" (sem repassar o erro ao cliente).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const TEMPO_LIMITE_MS = 8000;

const SEM_HISTORICO = { temEmail: false, inscricoes: [], pedidos: [] };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (req.method !== "GET") {
    context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }

  const matriculaBruta = (req.query || {}).matricula;
  if (matriculaBruta === undefined || matriculaBruta === null || matriculaBruta === "") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: ?matricula=123" } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, matriculaBruta);
  const membro = pessoa ? await pool.request().input("id", sql.Int, pessoa.membroId).query(`SELECT Email FROM MembroReferencia WHERE MembroId = @id`) : { recordset: [] };
  const email = membro.recordset[0] ? membro.recordset[0].Email : null;

  if (!email) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: SEM_HISTORICO };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { temEmail: true, indisponivel: true, inscricoes: [], pedidos: [] } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };
  const filtroEmail = `filter[email][_eq]=${encodeURIComponent(email)}`;

  let inscricoesRes, pedidosRes;
  try {
    [inscricoesRes, pedidosRes] = await Promise.all([
      fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?${filtroEmail}&fields=id,codigo,pago,presente,evento.title,evento.event_date&sort=-id&limit=-1`, { headers, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) }),
      fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?${filtroEmail}&fields=id,valor_pago,grupo.nome&sort=-id&limit=-1`, { headers, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) }),
    ]);
  } catch (e) {
    context.log.error("Falha ao consultar o Directus:", e.message);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { temEmail: true, indisponivel: true, inscricoes: [], pedidos: [] } };
    return;
  }

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
