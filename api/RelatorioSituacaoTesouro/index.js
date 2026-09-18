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

  // v5.4 (correção) — dinheiro de departamento é discricionário DELE
  // (Art. 49), não se funde no Tesouro Geral acima — mas precisa aparecer
  // NESTE MESMO relatório consolidado, senão o Conselho Fiscal teria que
  // abrir 8 telas separadas pra auditar. Local: liberado (ValorParaLocal
  // congelado nos relatórios aprovados) menos pago (mesma SaidasTesouraria
  // de sempre, Centro de Custo DEPTO_<SIGLA>) — calculado ao vivo, igual
  // ao resto deste painel. Geral: o último balancete FECHADO
  // (TesourariasDepartamento) — é o número oficial/auditável, não uma
  // reconstrução ao vivo (a dedução de suporte à Secretaria Geral só
  // existe no momento do fechamento mensal).
  const porDepartamento = await pool.request().query(`
    SELECT d.DepartamentoId AS departamentoId, d.Sigla AS sigla, d.Nome AS nome,
           ISNULL((SELECT SUM(r.ValorParaLocal) FROM RelatoriosDepartamentais r
                    WHERE r.DepartamentoId = d.DepartamentoId AND r.Status IN ('APROVADO_GERAL', 'RETIFICADO') AND r.ValorParaLocal IS NOT NULL), 0)
           - ISNULL((SELECT SUM(s.Valor) FROM SaidasTesouraria s JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
                      WHERE s.Status = 'PAGA' AND cs.CentroCusto = CONCAT('DEPTO_', d.Sigla)), 0) AS saldoLocalConsolidado,
           (SELECT TOP 1 t.SaldoMes FROM TesourariasDepartamento t WHERE t.DepartamentoId = d.DepartamentoId ORDER BY t.AnoReferencia DESC, t.MesReferencia DESC) AS saldoGeralUltimoBalancete
    FROM Departamentos d
    WHERE d.Ativo = 1
    ORDER BY d.Numero
  `);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      tesouroGeral, convencao, prebendaPastoral, pdq,
      malotePendente: { totalItens: malote.recordset[0].totalItens, totalBase: tesouraria.round2(malote.recordset[0].totalBase) },
      porCongregacao: porCongregacao.recordset.map(c => ({ congregacaoId: c.congregacaoId, congregacaoNome: c.congregacaoNome, saldoLocal: tesouraria.round2(c.saldoLocal) })),
      totalLocalConsolidado: tesouraria.round2(porCongregacao.recordset.reduce((soma, c) => soma + Number(c.saldoLocal), 0)),
      porDepartamento: porDepartamento.recordset.map(d => ({
        departamentoId: d.departamentoId, sigla: d.sigla, nome: d.nome,
        saldoLocalConsolidado: tesouraria.round2(d.saldoLocalConsolidado),
        saldoGeralUltimoBalancete: d.saldoGeralUltimoBalancete === null ? null : tesouraria.round2(d.saldoGeralUltimoBalancete)
      }))
    }
  };
};
