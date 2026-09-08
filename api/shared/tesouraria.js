// shared/tesouraria.js (v4.1)
// Motor de cálculo da Tesouraria Local — Art. 118: retenção local (padrão
// 40%) + repasse à Tesouraria Geral (padrão 60%), sempre derivado dos
// lançamentos do mês, nunca digitado à mão pelo Tesoureiro.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Termo nº sequencial e contínuo por congregação — igual ao bloco físico de
// dízimo, nunca reinicia por mês (mesma ideia de shared/ouvidoria.js::gerarProtocolo).
async function proximoNumeroTermo(pool, sql, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(
    `SELECT ISNULL(MAX(TermoNumero), 0) + 1 AS proximo FROM LancamentosTesouraria WHERE CongregacaoId = @congregacaoId`
  );
  return result.recordset[0].proximo;
}

// Função pura — mesmos números do relatório físico: Total Recebido menos
// Aluguel/Lote (deduções fixas antes do rateio) = Total Final, dividido pelo
// percentual de retenção local (o resto vai para a Tesouraria Geral).
function calcularFechamento({ totalRecebido, valorAluguel, valorLote, percentualRetencao }) {
  const totalFinal = round2(totalRecebido - (valorAluguel || 0) - (valorLote || 0));
  const valorRetidoLocal = round2(totalFinal * (percentualRetencao / 100));
  const valorRepasseGeral = round2(totalFinal - valorRetidoLocal);
  return { totalFinal, valorRetidoLocal, valorRepasseGeral };
}

// "Folha sem os valores do dizimista" — mesmo padrão de redação condicional
// de shared/disciplinar.js::redigirSeSigiloso, aqui incondicional (é sempre
// a versão pra pregar no mural, ao lado da versão completa/interna).
function redigirParaMural(lancamentos) {
  return lancamentos.map(l => {
    const { valor, ...resto } = l;
    return resto;
  });
}

// v4.5 — saldo disponível de um Centro de Custo (Local de uma congregação
// específica, ou Geral consolidado de toda a denominação) pra Saídas: o
// que já foi liberado pela Tesouraria Geral (v4.1.3) menos o que já foi
// efetivamente pago. Nunca fica negativo — é o próprio endpoint de
// pagamento que barra, não uma marcação manual.
async function saldoCentroCusto(pool, sql, centroCusto, congregacaoId) {
  const liberado = centroCusto === "GERAL"
    ? await pool.request().query(`SELECT ISNULL(SUM(ValorRepasseGeral), 0) AS total FROM FechamentosTesouraria WHERE Status = 'REPASSADO'`)
    : await pool.request().input("congregacaoId", sql.Int, congregacaoId)
        .query(`SELECT ISNULL(SUM(ValorRetidoLocal), 0) AS total FROM FechamentosTesouraria WHERE Status = 'REPASSADO' AND CongregacaoId = @congregacaoId`);
  const pagoRequest = pool.request().input("centroCusto", sql.NVarChar(20), centroCusto);
  if (centroCusto !== "GERAL") pagoRequest.input("congregacaoId", sql.Int, congregacaoId);
  const pago = await pagoRequest.query(`
    SELECT ISNULL(SUM(s.Valor), 0) AS total FROM SaidasTesouraria s
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    WHERE s.Status = 'PAGA' AND cs.CentroCusto = @centroCusto
    ${centroCusto !== "GERAL" ? "AND s.CongregacaoId = @congregacaoId" : ""}
  `);
  return round2(liberado.recordset[0].total - pago.recordset[0].total);
}

// Saldo restante de uma campanha (fundo restrito, v4.2/v4.4): o que já foi
// confirmado como arrecadado menos o que já está aprovado ou pago em
// Saídas vinculadas a ela — nunca deixa gastar além do que a campanha
// arrecadou, mesmo que várias solicitações estejam em aprovação ao mesmo tempo.
async function saldoRestanteCampanha(pool, sql, campanhaId) {
  const arrecadado = await pool.request().input("campanhaId", sql.Int, campanhaId)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM LancamentosTesouraria WHERE CampanhaId = @campanhaId AND Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO'`);
  const comprometido = await pool.request().input("campanhaId", sql.Int, campanhaId)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria WHERE CampanhaId = @campanhaId AND Status IN ('APROVADA', 'PAGA')`);
  return round2(arrecadado.recordset[0].total - comprometido.recordset[0].total);
}

// v4.5 (segunda parte) — saldo de um Fundo Fixo de Caixa (petty cash):
// sempre CALCULADO NA LEITURA (soma de reposições menos soma de
// despesas), nunca uma coluna própria marcada manualmente.
async function saldoFundoFixo(pool, sql, fundoId) {
  const result = await pool.request().input("fundoId", sql.Int, fundoId).query(`
    SELECT
      ISNULL(SUM(CASE WHEN Tipo = 'REPOSICAO' THEN Valor ELSE 0 END), 0) AS totalReposicoes,
      ISNULL(SUM(CASE WHEN Tipo = 'DESPESA' THEN Valor ELSE 0 END), 0) AS totalDespesas
    FROM FundoFixoMovimentos WHERE FundoId = @fundoId
  `);
  const { totalReposicoes, totalDespesas } = result.recordset[0];
  return round2(totalReposicoes - totalDespesas);
}

module.exports = { proximoNumeroTermo, calcularFechamento, redigirParaMural, round2, saldoCentroCusto, saldoRestanteCampanha, saldoFundoFixo };
