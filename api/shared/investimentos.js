// shared/investimentos.js (v4.14)
// Gestão de Investimentos e Tesouraria Avançada (nível "pico"):
//   - Rentabilidade/valor atual de aplicações CALCULADOS NA LEITURA (nunca
//     digitados no relatório) — estimativa linear sobre a taxa anual.
//   - Portfólio consolidado do Fundo de Reserva.
//   - Previsão de liquidez com margem de confiança (faixa otimista/
//     conservador) a partir da variação histórica real das entradas.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const tesouraria = require("./tesouraria");

const DIAS_ANO = 365;
const DIAS_MES = 30.4375;

function diasEntre(a, b) {
  const da = a ? new Date(a) : new Date();
  const db = b ? new Date(b) : new Date();
  return Math.max(0, (db - da) / (1000 * 60 * 60 * 24));
}

// Rentabilidade acumulada estimada (linear) até a data de corte, limitada ao
// vencimento. Sem taxa informada → 0 (só o principal).
function rentabilidadeAcumulada(aplicacao, dataCorte) {
  const valor = Number(aplicacao.ValorAplicado !== undefined ? aplicacao.ValorAplicado : aplicacao.valorAplicado);
  const taxa = Number(aplicacao.TaxaAnual !== undefined ? aplicacao.TaxaAnual : aplicacao.taxaAnual);
  if (!taxa) return 0;
  const inicio = aplicacao.DataAplicacao !== undefined ? aplicacao.DataAplicacao : aplicacao.dataAplicacao;
  let fim = dataCorte;
  const venc = aplicacao.DataVencimento !== undefined ? aplicacao.DataVencimento : aplicacao.dataVencimento;
  if (venc && new Date(venc) < new Date(dataCorte)) fim = new Date(venc);
  const dias = diasEntre(inicio, fim);
  return round2(valor * (taxa / 100) * (dias / DIAS_ANO));
}

function valorAtualEstimado(aplicacao, dataCorte) {
  const valor = Number(aplicacao.ValorAplicado !== undefined ? aplicacao.ValorAplicado : aplicacao.valorAplicado);
  return round2(valor + rentabilidadeAcumulada(aplicacao, dataCorte));
}

// Resgatável agora: liquidez DIARIA, ou já vencida (D30/D90/NO_VENCIMENTO
// contam o prazo a partir do vencimento, aproximado aqui de forma simples).
function resgatavelAgora(aplicacao, dataCorte) {
  const liq = (aplicacao.Liquidez || aplicacao.liquidez || "NO_VENCIMENTO");
  if (liq === "DIARIA") return true;
  const venc = aplicacao.DataVencimento !== undefined ? aplicacao.DataVencimento : aplicacao.dataVencimento;
  if (!venc) return liq === "NO_VENCIMENTO" ? false : false;
  return new Date(venc) <= new Date(dataCorte);
}

async function calcularPortfolio(pool, sql) {
  const dataCorte = new Date();
  const aplicacoes = await pool.request().query(`
    SELECT a.*, ISNULL((SELECT SUM(ValorResgatado) FROM ResgatesAplicacoes r WHERE r.AplicacaoId = a.AplicacaoId), 0) AS totalResgatado
    FROM AplicacoesFinanceiras a ORDER BY a.DataVencimento
  `);
  let totalAplicado = 0, totalResgatado = 0, totalAtual = 0, totalRentabilidade = 0;
  const itens = aplicacoes.recordset.map(a => {
    const valor = Number(a.ValorAplicado);
    const atual = valorAtualEstimado(a, dataCorte);
    const rent = rentabilidadeAcumulada(a, dataCorte);
    totalAplicado += valor;
    totalResgatado += Number(a.totalResgatado);
    totalAtual += atual;
    totalRentabilidade += rent;
    return {
      aplicacaoId: a.AplicacaoId, tipo: a.Tipo, instituicao: a.Instituicao,
      valorAplicado: valor, taxaAnual: a.TaxaAnual, dataAplicacao: a.DataAplicacao,
      dataVencimento: a.DataVencimento, liquidez: a.Liquidez, status: a.Status,
      totalResgatado: Number(a.totalResgatado), rentabilidadeAcumulada: rent,
      valorAtualEstimado: atual, resgatavelAgora: resgatavelAgora(a, dataCorte)
    };
  });
  const vencendo = itens.filter(i => i.status === "ATIVA" && i.dataVencimento && diasEntre(dataCorte, i.dataVencimento) <= 90);
  return {
    dataCorte,
    totalAplicado: round2(totalAplicado), totalResgatado: round2(totalResgatado),
    saldoAplicado: round2(totalAplicado - totalResgatado),
    valorAtualEstimado: round2(totalAtual - totalResgatado),
    rentabilidadeAcumulada: round2(totalRentabilidade),
    resgataveisAgora: itens.filter(i => i.status === "ATIVA" && i.resgatavelAgora),
    vencendoEm90Dias: vencendo,
    itens
  };
}

function desvioPadrao(arr) {
  if (!arr || arr.length < 2) return 0;
  const media = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variancia = arr.reduce((a, b) => a + Math.pow(b - media, 2), 0) / arr.length;
  return round2(Math.sqrt(variancia));
}

// Previsão de liquidez com margem de confiança: faixa otimista/conservador
// baseada na variação histórica real das entradas do Tesouro Geral.
async function previsaoLiquidezComFaixa(pool, sql, meses) {
  const base = await tesouraria.projetarFluxoCaixa(pool, sql, "GERAL", null, meses);
  const historico = await pool.request().query(`
    SELECT TOP 12 SUM(ValorTesouroGeral) AS total FROM RateiosGerais GROUP BY MesReferencia ORDER BY MesReferencia DESC
  `);
  const totais = historico.recordset.map(r => Number(r.total)).reverse();
  const media = totais.length ? round2(totais.reduce((a, b) => a + b, 0) / totais.length) : base.entradaMediaMensal;
  const desvio = desvioPadrao(totais);
  const otimista = round2(media + desvio);
  const conservador = round2(Math.max(0, media - desvio));

  const projecao = base.projecao.map((p, i) => {
    const empenho = i === 0 ? base.totalEmpenhadoAberto : 0;
    const saldoOtimista = round2(base.saldoAtual + (otimista - base.saidaMediaMensal) * (i + 1) - empenho);
    const saldoConservador = round2(base.saldoAtual + (conservador - base.saidaMediaMensal) * (i + 1) - empenho);
    return Object.assign({}, p, { saldoOtimista, saldoConservador });
  });

  return { saldoAtual: base.saldoAtual, mediaEntradas: media, desvioEntradas: desvio, entradaOtimista: otimista, entradaConservador: conservador, projecao };
}

module.exports = { rentabilidadeAcumulada, valorAtualEstimado, resgatavelAgora, calcularPortfolio, previsaoLiquidezComFaixa, round2 };
