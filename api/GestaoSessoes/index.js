// GestaoSessoes (vB.9 — Trilha de sessão)
// "Minhas Sessões": dispositivo, quando entrou, e um botão pra encerrar
// remotamente. v7.6 — encerrar aqui vale DE VERDADE: o aparelho que estava com
// aquela sessão recebe "Sua sessão foi encerrada. Entre novamente." em poucos
// segundos (shared/auth.js, "SESSÃO REVOGÁVEL", e shared/entrada.js). Antes só
// marcava a trilha e o token seguia valendo até expirar sozinho (12 h).
// GET /api/minhas-sessoes       -> lista (mais recentes primeiro)
// PUT /api/minhas-sessoes/{id}  -> { acao: 'ENCERRAR' }   (id = o GUID da sessão; só a dona encerra)
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

// GUID no formato do SQL Server. Um id que não é GUID dava erro de validação do driver (500); agora é "sessão não encontrada", igual à de outra pessoa ou inexistente.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  try {
    const pool = await getPool();

    if (req.method === "GET" && !id) {
      const sessoes = await auth.listarSessoes(pool, sql, usuario.membroId);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: sessoes };
      return;
    }

    if (req.method === "PUT" && id) {
      const { acao } = req.body || {};
      if (acao !== "ENCERRAR") {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use ENCERRAR." } };
        return;
      }
      const ok = typeof id === "string" && GUID.test(id) && await auth.encerrarSessaoEspecifica(pool, sql, usuario.membroId, id);
      if (!ok) {
        context.res = { status: 404, body: { sucesso: false, mensagem: "Sessão não encontrada." } };
        return;
      }
      context.res = {
        status: 200, headers: { "Content-Type": "application/json" },
        body: { sucesso: true, mensagem: "✅ Sessão encerrada — se estava aberta em outro aparelho, ele sai em poucos segundos." }
      };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
  } catch (e) {
    context.log.error("[GestaoSessoes] erro:", e);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Erro interno ao processar as sessões." } };
  }
};
