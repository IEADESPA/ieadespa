// AtualizarPresencaManual
// Secretaria corrige uma presença/falta lançada errado, sem precisar reabrir
// a reunião. Vira presença: some a justificativa (se tinha). Vira falta:
// fica pendente de justificativa igual uma falta normal.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const { membroId, presente } = req.body || {};

  if (!sessaoId || !membroId || typeof presente !== "boolean") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota), membroId e presente (true/false)." } };
    return;
  }

  const membroAlvo = mockDb.getMembro(membroId);
  const congregacaoAlvo = membroAlvo ? mockDb.getCongregacao(membroAlvo.congregacaoId) : null;
  if (!auth.estaNoEscopo(usuario, congregacaoAlvo ? congregacaoAlvo.nome : null)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Este obreiro está fora do seu escopo de acesso." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // await pool.request()
  //   .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId).input("presente", sql.Bit, presente)
  //   .query(`
  //     UPDATE Presencas SET Presente = @presente,
  //            FaltaJustificada = CASE WHEN @presente = 1 THEN 0 ELSE FaltaJustificada END,
  //            MotivoJustificativa = CASE WHEN @presente = 1 THEN NULL ELSE MotivoJustificativa END
  //     WHERE SessaoId = @sessaoId AND MembroId = @membroId
  //   `);

  const presenca = mockDb.atualizarPresencaManual(sessaoId, membroId, presente);
  if (!presenca) {
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

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Presença atualizada." } };
};
