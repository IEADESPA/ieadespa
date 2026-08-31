// SolicitarJustificativa (público — painel pessoal do obreiro)
// O próprio obreiro pede justificativa de uma falta, usando só a matrícula
// (mesmo nível de acesso do resto do painel pessoal — sem senha). Por isso
// NÃO aplica a justificativa na hora: fica "pendente" até a Secretaria
// aprovar ou rejeitar (ver JustificarFalta e RejeitarJustificativa) — assim
// ninguém consegue forjar uma justificativa em nome de outra pessoa só
// sabendo a matrícula dela.
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  const sessaoId = context.bindingData.sessaoId;
  const { motivo } = req.body || {};

  if (!matricula || !sessaoId || !motivo || !motivo.trim()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula, a reunião e o motivo." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request()
  //   .input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, matricula).input("motivo", sql.NVarChar, motivo)
  //   .query(`
  //     UPDATE Presencas SET JustificativaPendente = @motivo
  //     WHERE SessaoId = @sessaoId AND MembroId = @mat AND Presente = 0 AND FaltaJustificada = 0
  //   `);
  // if (result.rowsAffected[0] === 0) { ... "Não há falta pendente pra justificar nessa reunião." }

  const presenca = mockDb.solicitarJustificativa(sessaoId, matricula, motivo.trim());
  if (!presenca) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há falta pendente de justificativa nessa reunião." } };
    return;
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Solicitação enviada. A Secretaria vai analisar." }
  };
};
