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

module.exports = { proximoNumeroTermo, calcularFechamento, redigirParaMural, round2 };
