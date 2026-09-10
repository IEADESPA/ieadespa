// shared/demonstracoes.js (v4.9)
// Demonstrações Contábeis exigidas pela ITG 2002 (CFC, Resolução 1.409/12)
// pra entidades sem finalidade de lucros — Balanço Patrimonial,
// Demonstração do Resultado do Período (DRP), Mutações do Patrimônio
// Líquido e Fluxo de Caixa. TODAS calculadas na leitura a partir do que
// já existe (LancamentosTesouraria, SaidasTesouraria, ContasAReceber,
// PlanoContas/CategoriasEntrada/CategoriasSaida) — nenhum saldo contábil
// é gravado à parte; o registro do dia a dia continua em regime de caixa
// (é assim que o Tesoureiro Local vive, v4.1), a conversão pra regime de
// COMPETÊNCIA acontece só aqui, na geração das demonstrações formais.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Caixa e Equivalentes consolidado (toda a denominação, conta única —
// v4.1.3): tudo que já entrou de verdade menos tudo que já saiu de
// verdade, até a data de corte. Regime de CAIXA (é literalmente o que
// "caixa" significa no Balanço).
async function caixaConsolidadoAteData(pool, sql, dataCorte) {
  const entradas = await pool.request().input("data", sql.DateTime2, dataCorte)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM LancamentosTesouraria WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO' AND CriadoEm <= @data`);
  const saidas = await pool.request().input("data", sql.DateTime2, dataCorte)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria WHERE Status = 'PAGA' AND PagoEm <= @data`);
  return round2(entradas.recordset[0].total - saidas.recordset[0].total);
}

// Contas a Receber ainda em aberto na data de corte (v4.6) — Ativo
// Circulante sob competência: já é um direito da entidade, mesmo sem o
// dinheiro ter entrado ainda.
async function contasAReceberAtivoAteData(pool, sql, dataCorte) {
  const result = await pool.request().input("data", sql.DateTime2, dataCorte).query(`
    SELECT ISNULL(SUM(Valor), 0) AS total FROM ContasAReceber
    WHERE CriadoEm <= @data AND Status != 'CANCELADO'
      AND (Status = 'PREVISTO' OR (Status = 'RECEBIDO' AND ConfirmadoEm > @data))
  `);
  return round2(result.recordset[0].total);
}

// Saídas já aprovadas (compromisso assumido, v4.5/v4.8 "empenho") mas
// ainda não pagas na data de corte — Passivo Circulante sob competência:
// já é uma obrigação da entidade, mesmo sem o dinheiro ter saído ainda.
async function contasAPagarPassivoAteData(pool, sql, dataCorte) {
  const result = await pool.request().input("data", sql.DateTime2, dataCorte).query(`
    SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria
    WHERE SolicitadoEm <= @data AND (Status = 'APROVADA' OR (Status = 'PAGA' AND PagoEm > @data))
  `);
  return round2(result.recordset[0].total);
}

// Balanço Patrimonial na data de corte — Patrimônio Líquido é sempre o
// residual (Ativo Total menos Passivo Total, definição contábil), nunca
// um saldo próprio gravado.
async function calcularBalancoPatrimonial(pool, sql, dataCorte) {
  const caixa = await caixaConsolidadoAteData(pool, sql, dataCorte);
  const contasReceber = await contasAReceberAtivoAteData(pool, sql, dataCorte);
  const contasPagar = await contasAPagarPassivoAteData(pool, sql, dataCorte);
  const ativoTotal = round2(caixa + contasReceber);
  const passivoTotal = round2(contasPagar);
  const patrimonioLiquido = round2(ativoTotal - passivoTotal);
  return {
    dataCorte,
    ativo: { caixaEEquivalentes: caixa, contasAReceber: contasReceber, total: ativoTotal },
    passivo: { contasAPagar: contasPagar, total: passivoTotal },
    patrimonioLiquido
  };
}

// Demonstração do Resultado do Período — regime de COMPETÊNCIA: receita
// reconhecida quando o direito nasce (LancamentosTesouraria confirmados +
// ContasAReceber, sem contar duas vezes a mesma entrada quando uma vira a
// outra), despesa reconhecida quando o compromisso é assumido (Saídas
// aprovadas, não só quando pagas).
async function calcularDRP(pool, sql, dataInicio, dataFim) {
  const receitasDiretas = await pool.request().input("inicio", sql.DateTime2, dataInicio).input("fim", sql.DateTime2, dataFim).query(`
    SELECT l.Tipo AS categoriaCodigo, ce.Nome AS categoriaNome, SUM(l.Valor) AS total
    FROM LancamentosTesouraria l
    LEFT JOIN CategoriasEntrada ce ON ce.Codigo = l.Tipo
    WHERE l.Status = 'ATIVO' AND l.StatusConfirmacao = 'CONFIRMADO' AND l.CriadoEm BETWEEN @inicio AND @fim
      AND NOT EXISTS (SELECT 1 FROM ContasAReceber cr WHERE cr.LancamentoId = l.LancamentoId)
    GROUP BY l.Tipo, ce.Nome
  `);
  const receitasPorContaReceber = await pool.request().input("inicio", sql.DateTime2, dataInicio).input("fim", sql.DateTime2, dataFim).query(`
    SELECT cr.Tipo AS categoriaCodigo, ce.Nome AS categoriaNome, SUM(cr.Valor) AS total
    FROM ContasAReceber cr
    LEFT JOIN CategoriasEntrada ce ON ce.Codigo = cr.Tipo
    WHERE cr.Status != 'CANCELADO' AND cr.CriadoEm BETWEEN @inicio AND @fim
    GROUP BY cr.Tipo, ce.Nome
  `);
  const receitasPorCategoria = {};
  [...receitasDiretas.recordset, ...receitasPorContaReceber.recordset].forEach(r => {
    const chave = r.categoriaCodigo;
    if (!receitasPorCategoria[chave]) receitasPorCategoria[chave] = { categoriaCodigo: chave, categoriaNome: r.categoriaNome, total: 0 };
    receitasPorCategoria[chave].total = round2(receitasPorCategoria[chave].total + Number(r.total));
  });

  const despesas = await pool.request().input("inicio", sql.DateTime2, dataInicio).input("fim", sql.DateTime2, dataFim).query(`
    SELECT s.Tipo AS categoriaCodigo, cs.Nome AS categoriaNome, cs.ClassificacaoFuncional AS classificacaoFuncional, SUM(s.Valor) AS total
    FROM SaidasTesouraria s
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    WHERE s.Status IN ('APROVADA', 'PAGA') AND s.SolicitadoEm BETWEEN @inicio AND @fim
    GROUP BY s.Tipo, cs.Nome, cs.ClassificacaoFuncional
  `);

  const totalReceitas = round2(Object.values(receitasPorCategoria).reduce((soma, r) => soma + r.total, 0));
  const totalDespesas = round2(despesas.recordset.reduce((soma, d) => soma + Number(d.total), 0));
  const totalAtividadesFim = round2(despesas.recordset.filter(d => d.classificacaoFuncional === "ATIVIDADES_FIM").reduce((soma, d) => soma + Number(d.total), 0));
  const totalAdministrativas = round2(despesas.recordset.filter(d => d.classificacaoFuncional === "ADMINISTRATIVA").reduce((soma, d) => soma + Number(d.total), 0));

  return {
    dataInicio, dataFim,
    receitas: Object.values(receitasPorCategoria), totalReceitas,
    despesas: despesas.recordset, totalDespesas,
    classificacaoFuncional: { atividadesFim: totalAtividadesFim, administrativas: totalAdministrativas },
    resultadoDoPeriodo: round2(totalReceitas - totalDespesas)
  };
}

// Mutações do Patrimônio Líquido — PL inicial (Balanço no dia anterior ao
// início do período) + Resultado do Período (da DRP) = PL final (deve
// bater com o Balanço na data de fim — mesma base de cálculo, nunca dois
// números divergentes por estarem em tabelas diferentes).
async function calcularMutacoesPL(pool, sql, dataInicio, dataFim) {
  const diaAnterior = new Date(dataInicio);
  diaAnterior.setDate(diaAnterior.getDate() - 1);
  const balancoInicial = await calcularBalancoPatrimonial(pool, sql, diaAnterior);
  const drp = await calcularDRP(pool, sql, dataInicio, dataFim);
  const balancoFinal = await calcularBalancoPatrimonial(pool, sql, dataFim);
  return {
    dataInicio, dataFim,
    patrimonioLiquidoInicial: balancoInicial.patrimonioLiquido,
    resultadoDoPeriodo: drp.resultadoDoPeriodo,
    patrimonioLiquidoFinal: balancoFinal.patrimonioLiquido
  };
}

// Fluxo de Caixa — regime de CAIXA (o registro do dia a dia já é assim,
// v4.1; aqui só organiza num formato de demonstração formal).
async function calcularFluxoCaixa(pool, sql, dataInicio, dataFim) {
  const diaAnterior = new Date(dataInicio);
  diaAnterior.setDate(diaAnterior.getDate() - 1);
  const saldoInicial = await caixaConsolidadoAteData(pool, sql, diaAnterior);
  const entradas = await pool.request().input("inicio", sql.DateTime2, dataInicio).input("fim", sql.DateTime2, dataFim)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM LancamentosTesouraria WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO' AND CriadoEm BETWEEN @inicio AND @fim`);
  const saidas = await pool.request().input("inicio", sql.DateTime2, dataInicio).input("fim", sql.DateTime2, dataFim)
    .query(`SELECT ISNULL(SUM(Valor), 0) AS total FROM SaidasTesouraria WHERE Status = 'PAGA' AND PagoEm BETWEEN @inicio AND @fim`);
  const totalEntradas = round2(entradas.recordset[0].total);
  const totalSaidas = round2(saidas.recordset[0].total);
  return {
    dataInicio, dataFim, saldoInicial,
    entradasOperacionais: totalEntradas, saidasOperacionais: totalSaidas,
    variacaoLiquida: round2(totalEntradas - totalSaidas),
    saldoFinal: round2(saldoInicial + totalEntradas - totalSaidas)
  };
}

module.exports = {
  caixaConsolidadoAteData, contasAReceberAtivoAteData, contasAPagarPassivoAteData,
  calcularBalancoPatrimonial, calcularDRP, calcularMutacoesPL, calcularFluxoCaixa
};
