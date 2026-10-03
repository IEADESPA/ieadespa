// SolicitarJustificativa (público — painel pessoal do obreiro)
// O próprio obreiro pede justificativa de uma falta, usando só a matrícula.
// Fica "pendente" até a Secretaria aprovar ou rejeitar.
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const auth = require("../shared/auth");

module.exports = async function (context, req) {
  // fecho da v7.5 — exige sessão e só a matrícula da própria sessão (antes qualquer um "justificava" a falta de qualquer matrícula).
  const matricula = context.bindingData.matricula;
  if (!auth.exigirTitular(req, context, matricula)) return;
  const sessaoId = auth.idDeRota(context.bindingData.sessaoId);
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "";

  if (!sessaoId || !motivo.trim() || motivo.trim().length > 300) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a reunião e o motivo (até 300 caracteres)." } };
    return;
  }

  const pool = await getPool();
  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, matricula).input("motivo", sql.NVarChar(300), motivo.trim())
    .query(`UPDATE Presencas SET JustificativaPendente = @motivo
            WHERE SessaoId = @sessaoId AND MembroId = @mat AND Presente = 0 AND FaltaJustificada = 0`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há falta pendente de justificativa nessa reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas", registroId: Number(sessaoId), acao: "Solicitou justificativa de falta",
    usuarioId: Number(matricula), dadosDepois: { motivo: motivo.trim() }
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Solicitação enviada. A Secretaria vai analisar." }
  };
};
