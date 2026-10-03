// GestaoParametrosSaida (v4.5, segunda parte)
// Único parâmetro configurável hoje: o valor a partir do qual uma Saída
// exige 3 cotações anexadas (Reg. Art. 62) — nunca hardcoded no código,
// editável em Financeiro → Plano de Contas → Parâmetros de Saída.
// CONFIG da denominação inteira (vale para as Saídas de todas as congregações): LER é para quem tem `financeiro` (a tela de Saída precisa do valor para pedir as
// cotações), mas ALTERAR é só do nível geral (papel Global com escopo de todas as congregações) — um Tesoureiro Local não muda a regra de controle de todo mundo.
// GET /api/parametros-saida
// PUT /api/parametros-saida -> { valorReferenciaCotacoes }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre } = require("../shared/entradaFinanceira");

// Teto do limite das 3 cotações: um limite acima disso desliga a regra na prática (e DECIMAL(10,2) estouraria antes de R$ 100 milhões).
const VALOR_MAXIMO = 100000;

module.exports = async function (context, req) {
  const usuario = req.method === "PUT" ? exigirGeral(req, context, "financeiro") : auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`SELECT ValorReferenciaCotacoes FROM ParametrosSaida WHERE ParametroId = 1`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { valorReferenciaCotacoes: result.recordset[0] ? result.recordset[0].ValorReferenciaCotacoes : null } };
    return;
  }

  if (req.method === "PUT") {
    const valor = numeroEntre((req.body || {}).valorReferenciaCotacoes, 0.01, VALOR_MAXIMO);
    if (valor === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Informe um valorReferenciaCotacoes maior que zero e de até R$ ${VALOR_MAXIMO.toFixed(2)}.` } };
      return;
    }
    const antes = await pool.request().query(`SELECT ValorReferenciaCotacoes FROM ParametrosSaida WHERE ParametroId = 1`);
    await pool.request().input("valor", sql.Decimal(10, 2), valor)
      .query(`UPDATE ParametrosSaida SET ValorReferenciaCotacoes = @valor WHERE ParametroId = 1`);
    await registrarAuditoria({
      tabela: "ParametrosSaida", registroId: 1, acao: "Atualizou parâmetros de saída", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { valorReferenciaCotacoes: valor }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parâmetro atualizado." } };
    return;
  }
};
