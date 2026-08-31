// RejeitarJustificativa
// Secretaria recusa um pedido de justificativa que o obreiro enviou pelo
// painel pessoal — a falta continua como falta (não justificada), só some o
// pedido pendente. Ver SolicitarJustificativa e JustificarFalta (aprovar).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const { membroId } = req.body || {};

  if (!sessaoId || !membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota) e membroId (body)." } };
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
  // await pool.request().input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId)
  //   .query(`UPDATE Presencas SET JustificativaPendente = NULL WHERE SessaoId = @sessaoId AND MembroId = @membroId`);

  const presenca = mockDb.rejeitarJustificativaPendente(sessaoId, membroId);
  if (!presenca) {
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
