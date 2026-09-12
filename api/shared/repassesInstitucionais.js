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

// Atraso calculado na leitura: se o mês de referência já venceu (considerando
// a tolerância) e ainda não foi repassado.
function estaAtrasado(mesReferencia, hoje, diasTolerancia) {
  const [ano, mes] = String(mesReferencia).split("-").map(Number);
  const dataLimite = new Date(ano, mes, diasTolerancia); // dia (tolerância) do mês SEGUINTE
  return dataLimite < hoje;
}

module.exports = { parametros, calcularValorRepasse, estaAtrasado, round2 };
