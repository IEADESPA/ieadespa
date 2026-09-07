// RelatorioTesouraria (v4.1)
// Monta a folha do relatório mensal — mesma estrutura do modelo físico
// (bloco de dízimo impresso + mural): Termo/Nome/Valor por lançamento, e os
// totais do fechamento (se já fechado). modo=mural aplica shared/
// tesouraria.js::redigirParaMural (folha sem os valores, pra pregar no mural).
// GET /api/tesouraria-relatorio?congregacaoId=&mesReferencia=&modo=completo|mural
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const { congregacaoId, mesReferencia, modo } = req.query || {};
  if (!congregacaoId || !mesReferencia) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId e mesReferencia." } };
    return;
  }

  const pool = await getPool();
  const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  // Lançamentos cancelados aparecem no relatório (nunca somem da numeração —
  // igual à folha arrancada do bloco físico, que fica anotada como cancelada).
  const lancamentosResult = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`
      SELECT l.TermoNumero AS termoNumero, ISNULL(d.Nome, l.NomeAvulso) AS nome, l.Tipo AS tipo, l.Valor AS valor,
             l.FormaPagamento AS formaPagamento, l.Status AS status, l.MotivoCancelamento AS motivoCancelamento
      FROM LancamentosTesouraria l
      LEFT JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId
      WHERE l.CongregacaoId = @congregacaoId AND l.MesReferencia = @mesReferencia
      ORDER BY l.TermoNumero
    `);
  const lancamentos = modo === "mural" ? tesouraria.redigirParaMural(lancamentosResult.recordset) : lancamentosResult.recordset;

  const fechamentoResult = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT * FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
  const f = fechamentoResult.recordset[0];

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      congregacaoNome: cong.recordset[0].Nome,
      mesReferencia,
      modo: modo === "mural" ? "mural" : "completo",
      lancamentos,
      fechamento: f ? {
        totalRecebido: f.TotalRecebido, valorAluguel: f.ValorAluguel, valorLote: f.ValorLote, totalFinal: f.TotalFinal,
        percentualRetencaoLocal: f.PercentualRetencaoLocal, valorRetidoLocal: f.ValorRetidoLocal, valorRepasseGeral: f.ValorRepasseGeral,
        status: f.Status, dataRepasse: f.DataRepasse, formaRepasse: f.FormaRepasse
      } : null
    }
  };
};
