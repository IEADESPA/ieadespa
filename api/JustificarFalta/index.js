// JustificarFalta
// Secretaria lança a justificativa de uma falta já gerada (depois que a
// reunião foi encerrada). Não mexe em faltas que ainda não existem nem em
// presenças (Presente = 1).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const { membroId, motivo } = req.body || {};
  const usuarioId = usuario.membroId;

  if (!sessaoId || !membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota) e membroId (body)." } };
    return;
  }

  const pool = await getPool();
  const alvo = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT c.Nome AS Congregacao FROM MembroReferencia m
            LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  const congregacaoNome = alvo.recordset[0] ? alvo.recordset[0].Congregacao : null;
  if (!auth.estaNoEscopo(usuario, congregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Este obreiro está fora do seu escopo de acesso." } };
    return;
  }

  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId).input("motivo", sql.NVarChar(300), motivo || null)
    .query(`UPDATE Presencas SET FaltaJustificada = 1, MotivoJustificativa = @motivo
            WHERE SessaoId = @sessaoId AND MembroId = @membroId AND Presente = 0`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há falta registrada para esse membro nesta reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas",
    registroId: Number(membroId),
    acao: "Justificou falta",
    usuarioId,
    dadosDepois: { sessaoId: Number(sessaoId), motivo }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Falta justificada." } };
};
