// AtualizarPresencaManual
// Secretaria corrige uma presença/falta lançada errado, sem reabrir a reunião.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const afmDb = require("../shared/afmDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const { membroId, presente } = req.body || {};

  if (!sessaoId || !membroId || typeof presente !== "boolean") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota), membroId e presente (true/false)." } };
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
    .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId).input("presente", sql.Bit, presente)
    .query(`UPDATE Presencas SET Presente = @presente,
            FaltaJustificada = CASE WHEN @presente = 1 THEN 0 ELSE FaltaJustificada END,
            MotivoJustificativa = CASE WHEN @presente = 1 THEN NULL ELSE MotivoJustificativa END,
            MotivoCodigo = CASE WHEN @presente = 1 THEN NULL ELSE MotivoCodigo END,
            ComprovanteConferido = CASE WHEN @presente = 1 THEN NULL ELSE ComprovanteConferido END,
            JustificativaPendente = CASE WHEN @presente = 1 THEN NULL ELSE JustificativaPendente END,
            PendenteCodigo = CASE WHEN @presente = 1 THEN NULL ELSE PendenteCodigo END
            WHERE SessaoId = @sessaoId AND MembroId = @membroId`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há registro de frequência para esse membro nesta reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas",
    registroId: Number(membroId),
    acao: "Corrigiu presença manualmente",
    usuarioId: usuario.membroId,
    dadosDepois: { sessaoId: Number(sessaoId), presente }
  });

  // v8.1 — corrigir presença numa reunião que conta falta refaz a apuração das 3 faltas (pode excluir ou desfazer uma exclusão).
  let apuracao = "";
  const conta = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.ContaFaltasCLI AS conta FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId AND o.Sigla = 'CLI' WHERE s.SessaoId = @id`)).recordset[0];
  if (conta && conta.conta) apuracao = afmDb.resumoDaApuracao(await afmDb.apurarSemFalhar(pool, { membroIds: [Number(membroId)] }, context.log.error));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Presença atualizada.${apuracao}` } };
};
