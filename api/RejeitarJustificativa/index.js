// RejeitarJustificativa
// Secretaria recusa um pedido de justificativa que o obreiro enviou — a falta
// continua como falta (não justificada), só some o pedido pendente.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const { membroId } = req.body || {};

  if (!sessaoId || !membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota) e membroId (body)." } };
    return;
  }

  const pool = await getPool();
  const alvo = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT c.Nome AS Congregacao FROM MembroReferencia m
            LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  if (!auth.estaNoEscopo(usuario, alvo.recordset[0] ? alvo.recordset[0].Congregacao : null)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Este obreiro está fora do seu escopo de acesso." } };
    return;
  }

  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId)
    .query(`UPDATE Presencas SET JustificativaPendente = NULL WHERE SessaoId = @sessaoId AND MembroId = @membroId`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há registro de frequência para esse membro nesta reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas",
    registroId: Number(membroId),
    acao: "Rejeitou solicitação de justificativa",
    usuarioId: usuario.membroId,
    dadosDepois: { sessaoId: Number(sessaoId) }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação rejeitada." } };
};
