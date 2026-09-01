// SolicitarJustificativa (público — painel pessoal do obreiro)
// O próprio obreiro pede justificativa de uma falta, usando só a matrícula.
// Fica "pendente" até a Secretaria aprovar ou rejeitar.
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  const sessaoId = context.bindingData.sessaoId;
  const { motivo } = req.body || {};

  if (!matricula || !sessaoId || !motivo || !motivo.trim()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula, a reunião e o motivo." } };
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

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Solicitação enviada. A Secretaria vai analisar." }
  };
};
