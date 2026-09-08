// GestaoParametrosSaida (v4.5, segunda parte)
// Único parâmetro configurável hoje: o valor a partir do qual uma Saída
// exige 3 cotações anexadas (Reg. Art. 62) — nunca hardcoded no código,
// editável em Financeiro → Plano de Contas → Parâmetros de Saída.
// GET /api/parametros-saida
// PUT /api/parametros-saida -> { valorReferenciaCotacoes }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`SELECT ValorReferenciaCotacoes FROM ParametrosSaida WHERE ParametroId = 1`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { valorReferenciaCotacoes: result.recordset[0] ? result.recordset[0].ValorReferenciaCotacoes : null } };
    return;
  }

  if (req.method === "PUT") {
    const { valorReferenciaCotacoes } = req.body || {};
    if (!valorReferenciaCotacoes || Number(valorReferenciaCotacoes) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe um valorReferenciaCotacoes maior que zero." } };
      return;
    }
    const antes = await pool.request().query(`SELECT ValorReferenciaCotacoes FROM ParametrosSaida WHERE ParametroId = 1`);
    await pool.request().input("valor", sql.Decimal(10, 2), valorReferenciaCotacoes)
      .query(`UPDATE ParametrosSaida SET ValorReferenciaCotacoes = @valor WHERE ParametroId = 1`);
    await registrarAuditoria({
      tabela: "ParametrosSaida", registroId: 1, acao: "Atualizou parâmetros de saída", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { valorReferenciaCotacoes }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parâmetro atualizado." } };
    return;
  }
};
