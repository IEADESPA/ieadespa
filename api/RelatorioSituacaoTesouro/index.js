// RelatorioSituacaoTesouro (v4.10, fundação)
// Painel de saldo real, em tempo real — quanto cada Centro de Custo tem
// AGORA, sem esperar o fechamento do mês (antes só era possível saber
// isso tarde, calculando manualmente na planilha). Tudo CALCULADO NA
// LEITURA a partir de shared/tesouraria.js::saldoCentroCusto — nenhum
// saldo é gravado à parte, então a resposta é sempre a foto real do
// exato instante em que a tela é aberta.
// GET /api/situacao-tesouro
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "A situação consolidada do Tesouro é restrita a papéis de nível Global." } };
    return;
  }
  const pool = await getPool();

  const [tesouroGeral, convencao, prebendaPastoral, pdq] = await Promise.all([
    tesouraria.saldoCentroCusto(pool, sql, "GERAL", null),
    tesouraria.saldoCentroCusto(pool, sql, "CONVENCAO", null),
    tesouraria.saldoCentroCusto(pool, sql, "PREBENDA_PASTORAL", null),
    tesouraria.saldoCentroCusto(pool, sql, "PDQ", null)
  ]);

  // Malote pendente — mesma consulta de GestaoRateioGeral::buscarPendentes,
  // só que aqui só interessa o total agregado, não a lista de itens.
  const malote = await pool.request().query(`
    SELECT COUNT(*) AS totalItens, ISNULL(SUM(f.ValorRepasseGeral), 0) AS totalBase
    FROM FechamentosTesouraria f
    WHERE f.Status = 'REPASSADO' AND NOT EXISTS (SELECT 1 FROM RateioGeralItens ri WHERE ri.FechamentoId = f.FechamentoId)
  `);

  // Saldo Local por congregação — uma única query agregada (não N+1),
  // mesma fórmula de saldoCentroCusto('LOCAL', congregacaoId): liberado
  // (repassado) menos pago.
  const porCongregacao = await pool.request().query(`
    SELECT c.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           ISNULL((SELECT SUM(ValorRetidoLocal) FROM FechamentosTesouraria WHERE Status = 'REPASSADO' AND CongregacaoId = c.CongregacaoId), 0)
           - ISNULL((SELECT SUM(s.Valor) FROM SaidasTesouraria s JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo WHERE s.Status = 'PAGA' AND cs.CentroCusto = 'LOCAL' AND s.CongregacaoId = c.CongregacaoId), 0)
           AS saldoLocal
    FROM Congregacoes c
    WHERE c.Ativa = 1
    ORDER BY c.Nome
  `);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      tesouroGeral, convencao, prebendaPastoral, pdq,
      malotePendente: { totalItens: malote.recordset[0].totalItens, totalBase: tesouraria.round2(malote.recordset[0].totalBase) },
      porCongregacao: porCongregacao.recordset.map(c => ({ congregacaoId: c.congregacaoId, congregacaoNome: c.congregacaoNome, saldoLocal: tesouraria.round2(c.saldoLocal) })),
      totalLocalConsolidado: tesouraria.round2(porCongregacao.recordset.reduce((soma, c) => soma + Number(c.saldoLocal), 0))
    }
  };
};
