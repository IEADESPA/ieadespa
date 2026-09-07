// FecharMesTesouraria (v4.1)
// Fecha o mês de uma congregação: soma os lançamentos, aplica as deduções
// fixas (aluguel/lote) e o rateio (Art. 118) — tudo via shared/tesouraria.js,
// NUNCA digitado à mão. Uma vez fechado, os lançamentos daquele mês ficam
// travados (GestaoLancamentosTesouraria bloqueia novo lançamento e exclusão).
// POST /api/tesouraria-fechamento -> { congregacaoId, mesReferencia }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

const REGEX_MES = /^\d{4}-\d{2}$/;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const { congregacaoId, mesReferencia } = req.body || {};
  if (!congregacaoId || !mesReferencia || !REGEX_MES.test(mesReferencia)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId e mesReferencia (AAAA-MM)." } };
    return;
  }

  const pool = await getPool();
  const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`
    SELECT Nome, ValorAluguelMensal, ValorLoteMensal, PercentualRetencaoLocal FROM Congregacoes WHERE CongregacaoId = @id
  `);
  if (cong.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
    return;
  }
  const congregacao = cong.recordset[0];
  if (!auth.estaNoEscopo(usuario, congregacao.Nome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  const jaFechado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
  if (jaFechado.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já está fechado." } };
    return;
  }

  // Só lançamentos ATIVOS entram na soma — um cancelado (folha arrancada do
  // bloco) preserva o Termo nº pro relatório, mas não conta no total.
  // Categoria não importa aqui: Dízimo, Oferta, Entrada de Departamento,
  // Revista, Congresso etc. entram todas do mesmo jeito (CategoriasEntrada,
  // v4.1.5) — a supervisão é este próprio fechamento + a liberação da Geral.
  const soma = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total, COUNT(*) AS quantidade FROM LancamentosTesouraria
            WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia AND Status = 'ATIVO'`);
  const { total: totalRecebido, quantidade } = soma.recordset[0];
  if (quantidade === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há lançamentos ativos neste mês para fechar." } };
    return;
  }

  const valorAluguel = congregacao.ValorAluguelMensal || 0;
  const valorLote = congregacao.ValorLoteMensal || 0;
  const percentualRetencao = congregacao.PercentualRetencaoLocal;
  const { totalFinal, valorRetidoLocal, valorRepasseGeral } = tesouraria.calcularFechamento({
    totalRecebido, valorAluguel, valorLote, percentualRetencao
  });

  const criado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("mesReferencia", sql.Char(7), mesReferencia)
    .input("totalRecebido", sql.Decimal(10, 2), totalRecebido)
    .input("valorAluguel", sql.Decimal(10, 2), valorAluguel)
    .input("valorLote", sql.Decimal(10, 2), valorLote)
    .input("totalFinal", sql.Decimal(10, 2), totalFinal)
    .input("percentualRetencaoLocal", sql.Decimal(5, 2), percentualRetencao)
    .input("valorRetidoLocal", sql.Decimal(10, 2), valorRetidoLocal)
    .input("valorRepasseGeral", sql.Decimal(10, 2), valorRepasseGeral)
    .input("fechadoPor", sql.Int, usuario.membroId)
    .query(`INSERT INTO FechamentosTesouraria
              (CongregacaoId, MesReferencia, TotalRecebido, ValorAluguel, ValorLote, TotalFinal,
               PercentualRetencaoLocal, ValorRetidoLocal, ValorRepasseGeral, FechadoPor)
            OUTPUT INSERTED.FechamentoId
            VALUES (@congregacaoId, @mesReferencia, @totalRecebido, @valorAluguel, @valorLote, @totalFinal,
                    @percentualRetencaoLocal, @valorRetidoLocal, @valorRepasseGeral, @fechadoPor)`);
  const fechamentoId = criado.recordset[0].FechamentoId;

  await pool.request().input("fechamentoId", sql.Int, fechamentoId)
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`UPDATE LancamentosTesouraria SET FechamentoId = @fechamentoId WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);

  await registrarAuditoria({
    tabela: "FechamentosTesouraria", registroId: fechamentoId, acao: "Fechou o mês da tesouraria local", usuarioId: usuario.membroId,
    dadosDepois: { congregacaoId, mesReferencia, totalRecebido, valorAluguel, valorLote, totalFinal, valorRetidoLocal, valorRepasseGeral }
  });

  context.res = {
    status: 201, headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true, mensagem: "✅ Mês fechado.", fechamentoId,
      totalRecebido, valorAluguel, valorLote, totalFinal, percentualRetencaoLocal: percentualRetencao, valorRetidoLocal, valorRepasseGeral
    }
  };
};
