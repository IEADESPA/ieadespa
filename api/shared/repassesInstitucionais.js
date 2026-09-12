// shared/repassesInstitucionais.js (v4.15)
// Repasses institucionais (Art. 126-N, I): o "Dízimo Institucional" que
// congregações/departamentos/distritos repassam à Sede Geral, com prazo e
// tolerância configuráveis e cálculo do atraso NA LEITURA (Art. 144, II).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

async function parametros(pool, sql) {
  const r = await pool.request().query(`SELECT * FROM ParametrosRepasseInstitucional WHERE ParametroId = 1`);
  return r.recordset[0] || { PercentualDizimoInstitucional: 10, DiasTolerancia: 5 };
}

function calcularValorRepasse(valorArrecadadoLiquido, percentual) {
  return round2(Number(valorArrecadadoLiquido) * Number(percentual) / 100);
}

// Trava de Revisão 4-A: para origem CONGREGACAO a arrecadação líquida NUNCA
// é digitada — já existe eletronicamente no fechamento mensal da Tesouraria
// Local (shared/tesouraria.js::calcularFechamento, desde a v4.1). Reaproveita
// o mesmo TotalFinal (Total Recebido menos Aluguel/Lote) usado para o rateio
// 40/60 local, evitando divergência entre o valor reportado à Sede e o valor
// real do fechamento. Retorna null se o mês ainda não foi fechado.
async function arrecadacaoLiquidaFechamento(pool, sql, congregacaoId, mesReferencia) {
  const result = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT TotalFinal FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
  if (result.recordset.length === 0) return null;
  return Number(result.recordset[0].TotalFinal);
}

// Atraso calculado na leitura: se o mês de referência já venceu (considerando
// a tolerância) e ainda não foi repassado. O dia da tolerância (padrão: dia 5)
// é o ÚLTIMO dia ainda dentro do prazo — só conta como atrasado a partir do
// dia seguinte, por isso o limite é a meia-noite de (tolerância + 1).
function estaAtrasado(mesReferencia, hoje, diasTolerancia) {
  const [ano, mes] = String(mesReferencia).split("-").map(Number);
  const dataLimite = new Date(ano, mes, diasTolerancia + 1); // 00:00 do dia seguinte ao fim da tolerância, no mês SEGUINTE
  return dataLimite <= hoje;
}

module.exports = { parametros, calcularValorRepasse, estaAtrasado, round2, arrecadacaoLiquidaFechamento };
