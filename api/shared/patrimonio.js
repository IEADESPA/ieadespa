// shared/patrimonio.js (v4.11)
// Motor de patrimônio: depreciação de ativo fixo (método linear, padrão
// pra entidades sem fins lucrativos — ITG 2002), Teto de Alçada Patrimonial
// (5% do PL, Art. 58 §1º do Estatuto), roteamento da aprovação de alienação
// (CLI vs. Assembleia) e quarentena patrimonial de 12 meses (Art. 58 §7º).
// Tudo CALCULADO NA LEITURA — nunca um saldo de depreciação gravado à parte.
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const DIAS_MEDIO_MES = 30.4375; // média de dias por mês (ano/12)
const PERCENTUAL_TETO_ALCADA = 5.00; // Art. 58 §1º do Estatuto
const MESES_QUARENTENA = 12; // Art. 58 §7º do Estatuto

function num(v) { return Number(v || 0); }

function dataDoCampo(bem, campo, padrao) {
  const v = bem[campo] !== undefined ? bem[campo] : bem[campo.charAt(0).toLowerCase() + campo.slice(1)];
  if (!v) return padrao;
  if (v instanceof Date) return v;
  return new Date(v);
}

// Depreciação linear mensal: (custo - residual) / vida útil em meses.
function depreciacaoMensal(valorAquisicao, valorResidual, vidaUtilMeses) {
  if (!vidaUtilMeses || num(vidaUtilMeses) <= 0) return 0;
  const base = num(valorAquisicao) - num(valorResidual);
  return round2(Math.max(0, base) / num(vidaUtilMeses));
}

// Meses inteiros decorridos desde a aquisição até a data de corte (>= 0).
function mesesDecorridos(dataAquisicao, dataCorte) {
  const aq = new Date(dataAquisicao);
  const corte = new Date(dataCorte);
  if (corte <= aq) return 0;
  return Math.floor((corte - aq) / (1000 * 60 * 60 * 24 * DIAS_MEDIO_MES));
}

// Depreciação acumulada até a data de corte, limitada a (custo - residual).
function depreciacaoAcumulada(bem, dataCorte) {
  const valor = num(bem.ValorAquisicao !== undefined ? bem.ValorAquisicao : bem.valorAquisicao);
  const residual = num(bem.ValorResidual !== undefined ? bem.ValorResidual : bem.valorResidual);
  const vida = num(bem.VidaUtilMeses !== undefined ? bem.VidaUtilMeses : bem.vidaUtilMeses);
  if (!vida) return 0;
  const aquisicao = dataDoCampo(bem, "DataAquisicao", null);
  if (!aquisicao) return 0;
  const meses = Math.min(mesesDecorridos(aquisicao, dataCorte), vida);
  return round2(Math.min(depreciacaoMensal(valor, residual, vida) * meses, Math.max(0, valor - residual)));
}

// Valor contábil líquido na data de corte (custo - depreciação acumulada).
function valorContabilLiquido(bem, dataCorte) {
  const valor = num(bem.ValorAquisicao !== undefined ? bem.ValorAquisicao : bem.valorAquisicao);
  return round2(valor - depreciacaoAcumulada(bem, dataCorte));
}

// Ativo Imobilizado líquido consolidado (todos os bens ATIVOS, com ou sem
// depreciação) — entra no Balanço Patrimonial (v4.9).
async function imobilizadoLiquido(pool, sql, dataCorte) {
  const bens = await pool.request().query(`SELECT ValorAquisicao, DataAquisicao, VidaUtilMeses, ValorResidual FROM BensPatrimoniais WHERE Status = 'ATIVO'`);
  let total = 0;
  for (const b of bens.recordset) total += valorContabilLiquido(b, dataCorte);
  return round2(total);
}

// Teto de Alçada Patrimonial — 5% do PL (Art. 58 §1º).
function calcularTetoAlcadaPatrimonial(patrimonioLiquido) {
  return round2(num(patrimonioLiquido) * PERCENTUAL_TETO_ALCADA / 100);
}

// Quem aprova a alienação: Templo Sede OU valor acima do teto → Assembleia;
// caso contrário → CLI (Art. 58 §1º, I e II).
function alvoAprovacaoAlienacao({ ehTemploSede, valorProposto, tetoAlcada }) {
  if (ehTemploSede || num(valorProposto) >= num(tetoAlcada)) return "ASSEMBLEIA";
  return "CLI";
}

// Quarentena patrimonial ativa (Art. 58 §7º) — retorna a linha ativa ou null.
async function quarentenaPatrimonialAtiva(pool, sql) {
  const result = await pool.request().query(`
    SELECT TOP 1 QuarentenaId AS quarentenaId, Motivo AS motivo, DataInicio AS dataInicio, DataFim AS dataFim
    FROM QuarentenasPatrimoniais
    WHERE CAST(SYSUTCDATETIME() AS DATE) BETWEEN DataInicio AND DataFim
    ORDER BY DataInicio DESC
  `);
  return result.recordset[0] || null;
}

module.exports = {
  round2,
  depreciacaoMensal,
  mesesDecorridos,
  depreciacaoAcumulada,
  valorContabilLiquido,
  imobilizadoLiquido,
  calcularTetoAlcadaPatrimonial,
  alvoAprovacaoAlienacao,
  quarentenaPatrimonialAtiva,
  PERCENTUAL_TETO_ALCADA,
  MESES_QUARENTENA
};
