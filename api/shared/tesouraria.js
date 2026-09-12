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

// v4.10 (fundação) — os "destinos" percentuais do Rateio Geral (Convenção,
// Prebenda Pastoral, Fundo PDQ) são Centros de Custo cujo dinheiro só
// existe depois que a Tesouraria Geral fecha o Rateio Geral do mês
// (malote — ver api/GestaoRateioGeral/index.js). Antes disso, o repasse liberado
// fica só "pendente de rateio", não gastável em nenhum desses três.
const DESTINOS_RATEIO_GERAL = ["CONVENCAO", "PREBENDA_PASTORAL", "PDQ"];

// v4.5 (LOCAL/GERAL) + v4.8 (PDQ) + v4.10 (CONVENCAO/PREBENDA_PASTORAL) —
// saldo disponível de um Centro de Custo pra Saídas: o que já foi
// liberado/dotado menos o que já foi efetivamente pago. Nunca fica
// negativo — é o próprio endpoint de pagamento que barra, não uma
// marcação manual.
// v4.10: GERAL deixou de ser o repasse bruto (ValorRepasseGeral) — agora
// é só o que sobrou depois do Rateio Geral (Convenção/Prebenda/PDQ já
// descontados, RateiosGerais.ValorTesouroGeral). Repasse liberado mas
// ainda não incluído num Rateio Geral fechado não é gastável em nada
// ainda — é exatamente o controle interno pedido ("o que já foi rateado
// não pode misturar com o que ainda não foi").
async function saldoCentroCusto(pool, sql, centroCusto, congregacaoId) {
  let liberado;
  if (centroCusto === "GERAL") {
    liberado = await pool.request().query(`SELECT ISNULL(SUM(ValorTesouroGeral), 0) AS total FROM RateiosGerais`);
  } else if (DESTINOS_RATEIO_GERAL.includes(centroCusto)) {
    liberado = await pool.request().input("codigo", sql.NVarChar(30), centroCusto)
      .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM RateioGeralValores WHERE DestinoCodigo = @codigo`);
  } else {
    liberado = await pool.request().input("congregacaoId", sql.Int, congregacaoId)
      .query(`SELECT ISNULL(SUM(ValorRetidoLocal), 0) AS total FROM FechamentosTesouraria WHERE Status = 'REPASSADO' AND CongregacaoId = @congregacaoId`);
  }
  const pagoRequest = pool.request().input("centroCusto", sql.NVarChar(20), centroCusto);
  if (centroCusto === "LOCAL") pagoRequest.input("congregacaoId", sql.Int, congregacaoId);
  const pago = await pagoRequest.query(`
    SELECT ISNULL(SUM(s.Valor), 0) AS total FROM SaidasTesouraria s
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    WHERE s.Status = 'PAGA' AND cs.CentroCusto = @centroCusto
    ${centroCusto === "LOCAL" ? "AND s.CongregacaoId = @congregacaoId" : ""}
  `);
  return round2(liberado.recordset[0].total - pago.recordset[0].total);
}

// v4.8 (segunda parte) — o Fundo de Execução Estratégica pode ser
// suspenso excepcionalmente pelo Pastor Presidente (Art. 27); enquanto
// suspenso, nenhuma nova Saída pode debitar dele (checado em
// GestaoSaidas). Suspensão ativa é a última linha sem ReativadoEm.
async function suspensaoAtivaFundoPdq(pool, sql) {
  const result = await pool.request().query(`SELECT TOP 1 * FROM PdqFundoSuspensoes WHERE ReativadoEm IS NULL ORDER BY SuspensaoId DESC`);
  return result.recordset[0] || null;
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

// v4.8 (primeira parte) — Fluxo de Caixa Projetado: estimativa do saldo
// futuro de um Centro de Custo, a partir do histórico recente de
// entradas/saídas + o que já está empenhado (Saídas aprovadas, ainda não
// pagas). SEMPRE CALCULADO NA LEITURA, a cada chamada — é por isso que já
// nasce sendo um "rolling forecast" (reprojeta do zero toda vez que é
// aberto, ajustando sozinho pelo que já foi realizado desde a última
// vez), sem precisar de um mecanismo de revisão periódica separado.
async function projetarFluxoCaixa(pool, sql, centroCusto, congregacaoId, meses) {
  const saldoAtual = await saldoCentroCusto(pool, sql, centroCusto, congregacaoId);

  let entradas;
  if (centroCusto === "GERAL") {
    entradas = await pool.request().query(`SELECT TOP 3 MesReferencia, SUM(ValorTesouroGeral) AS total FROM RateiosGerais GROUP BY MesReferencia ORDER BY MesReferencia DESC`);
  } else if (DESTINOS_RATEIO_GERAL.includes(centroCusto)) {
    entradas = await pool.request().input("codigo", sql.NVarChar(30), centroCusto).query(`
      SELECT TOP 3 rg.MesReferencia, SUM(rv.Valor) AS total FROM RateioGeralValores rv JOIN RateiosGerais rg ON rg.RateioGeralId = rv.RateioGeralId
      WHERE rv.DestinoCodigo = @codigo GROUP BY rg.MesReferencia ORDER BY rg.MesReferencia DESC
    `);
  } else {
    entradas = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
      SELECT TOP 3 MesReferencia, SUM(ValorRetidoLocal) AS total FROM FechamentosTesouraria
      WHERE Status = 'REPASSADO' AND CongregacaoId = @congregacaoId GROUP BY MesReferencia ORDER BY MesReferencia DESC
    `);
  }
  const entradaMediaMensal = entradas.recordset.length > 0
    ? round2(entradas.recordset.reduce((soma, r) => soma + Number(r.total), 0) / entradas.recordset.length)
    : 0;

  const centroSemCongregacao = centroCusto === "GERAL" || DESTINOS_RATEIO_GERAL.includes(centroCusto);
  const saidaRequest = pool.request().input("centroCusto", sql.NVarChar(20), centroCusto);
  let saidaWhere = "s.Status = 'PAGA' AND cs.CentroCusto = @centroCusto";
  if (!centroSemCongregacao) { saidaRequest.input("congregacaoId", sql.Int, congregacaoId); saidaWhere += " AND s.CongregacaoId = @congregacaoId"; }
  const saidas = await saidaRequest.query(`
    SELECT TOP 3 CONVERT(varchar(7), s.PagoEm, 120) AS mes, SUM(s.Valor) AS total FROM SaidasTesouraria s
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    WHERE ${saidaWhere} GROUP BY CONVERT(varchar(7), s.PagoEm, 120) ORDER BY mes DESC
  `);
  const saidaMediaMensal = saidas.recordset.length > 0
    ? round2(saidas.recordset.reduce((soma, r) => soma + Number(r.total), 0) / saidas.recordset.length)
    : 0;

  const empenhoRequest = pool.request().input("centroCusto", sql.NVarChar(20), centroCusto);
  let empenhoWhere = "s.Status = 'APROVADA' AND cs.CentroCusto = @centroCusto";
  if (!centroSemCongregacao) { empenhoRequest.input("congregacaoId", sql.Int, congregacaoId); empenhoWhere += " AND s.CongregacaoId = @congregacaoId"; }
  const empenhos = await empenhoRequest.query(`
    SELECT ISNULL(SUM(s.Valor), 0) AS total FROM SaidasTesouraria s JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo WHERE ${empenhoWhere}
  `);
  const totalEmpenhadoAberto = Number(empenhos.recordset[0].total);

  const hoje = new Date();
  const projecao = [];
  let saldoAcumulado = saldoAtual;
  for (let i = 1; i <= meses; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mesReferencia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    const empenhoDoMes = i === 1 ? totalEmpenhadoAberto : 0;
    saldoAcumulado = round2(saldoAcumulado + entradaMediaMensal - saidaMediaMensal - empenhoDoMes);
    projecao.push({ mesReferencia, entradaProjetada: entradaMediaMensal, saidaProjetada: saidaMediaMensal, empenhoAberto: empenhoDoMes, saldoProjetado: saldoAcumulado });
  }

  return { saldoAtual, entradaMediaMensal, saidaMediaMensal, totalEmpenhadoAberto, projecao };
}

module.exports = { proximoNumeroTermo, calcularFechamento, redigirParaMural, round2, saldoCentroCusto, saldoRestanteCampanha, saldoFundoFixo, projetarFluxoCaixa, suspensaoAtivaFundoPdq, DESTINOS_RATEIO_GERAL };
