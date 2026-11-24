// Arrolamento (FASE 10, Membros, rodada 28 aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO de quem veio do sistema pago.
// GET  /api/arrolamento                 -> ?congregacaoId=N — o andamento (vieram, completadas, faltam), o dia em que vieram, cada congregação do escopo, as 4 próximas e, para a
//                                          Geral, cada área e quantas estão sem congregação (só as de antes da regra G3)
// GET  /api/arrolamento/ficha           -> ?matricula=N | ?congregacaoId=N&depois=M — a ficha para completar, a próxima e o andamento da congregação dela
// POST /api/arrolamento/completar       -> { matricula, situacao, formaAdmissao, dataAdmissao } — completa (409 se já foi completada); a função eclesiástica e a
//                                          congregação no pedido são recusadas
// Regra dele: a secretaria escolhe a situação, como e quando a pessoa entrou e o cargo, só se tiver; ao completar, a pessoa sai do grupo e, em comunhão, ganha
// o voto. "A área e a Geral também podem completar e editar ... se a congregação não faz o que tem de fazer, a área faz, e o serviço não para."
// ESCOPO: a permissão "pessoas" e a pessoa no alcance de quem completa (shared/escopoRotas.js) — a congregação, a área (só as congregações dela) e a Geral; fora
// do escopo (ou matrícula que não existe) a resposta é a mesma de "Matrícula não encontrada". Ninguém completa a própria ficha. Toda ficha do arrolamento tem
// congregação (G3, decisão dele de 24/11/2026); a de antes da regra, sem congregação, não se completa por aqui (409). As regras em shared/arrolamento.js; as consultas e a gravação em shared/arrolamentoDb.js.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const db = require("../shared/arrolamentoDb");

const SEM_CACHE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const acao = (context.bindingData && context.bindingData.acao) || "";
  const metodo = String(req.method || "GET").toUpperCase();
  const q = req.query || {};

  if (metodo === "GET" && acao === "") {
    let congregacaoId = null;
    if (q.congregacaoId !== undefined && q.congregacaoId !== "") {
      congregacaoId = auth.idDeRota(q.congregacaoId);
      if (!congregacaoId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Congregação inválida." } }; return; }
    }
    const pool = await getPool();
    const dados = await db.painel(pool, usuario, { congregacaoId });
    context.res = { status: 200, headers: SEM_CACHE, body: { sucesso: true, ...dados } };
    return;
  }

  if (metodo === "GET" && acao === "ficha") {
    const pool = await getPool();
    const { status, ...corpo } = await db.fichaParaCompletar(pool, usuario, q, hojeBrasilia());
    context.res = { status: status || 200, headers: SEM_CACHE, body: corpo };
    return;
  }

  if (metodo === "POST" && acao === "completar") {
    const pool = await getPool();
    const { status, ...corpo } = await db.completar(pool, usuario, req.body, hojeBrasilia());
    context.res = { status: status || 200, headers: SEM_CACHE, body: corpo };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
