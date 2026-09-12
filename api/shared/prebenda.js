// shared/prebenda.js (v4.10, segunda parte)
// Motor de cálculo e blindagem jurídica do sustento pastoral. É aqui que
// mora a diferença entre prebenda (natureza alimentar, sem vínculo CLT) e
// remuneração: a prebenda é tributável pelo IRPF com retenção na fonte,
// mas NÃO recolhe cota patronal (20%) — o ministro é contribuinte
// individual e recolhe a própria contribuição previdenciária
// (Lei 8.212/91 art. 22 §§13-14; Lei 13.137/2015; Lei 14.647/2023).
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Tipos de risco de descaracterização de vínculo — os elementos que a
// Justiça do Trabalho usa pra reconhecer relação de emprego. Se o sistema
// registrar qualquer um deles pra um ministro, ele próprio avisa.
const TIPOS_RISCO_VINCULO = ["JORNADA", "SUBORDINACAO", "CONTROLE_HORARIO"];

const NATUREZAS_FISCAIS_AUXILIO = ["INDENIZATORIA", "ISENTA", "TRIBUTAVEL_IRPF"];
const TIPOS_AUXILIO = ["MORADIA", "TRANSPORTE", "SAUDE", "OUTROS"];

// IRRF sobre a base de cálculo mensal, usando a tabela progressiva
// configurável (FaixasIrrf) — nunca hardcoded. Pega a maior faixa cujo
// piso seja <= base e aplica base * alíquota - parcela a deduzir.
async function calcularIrrf(pool, sql, base) {
  const faixas = await pool.request().query(`SELECT FaixaMinimo, Aliquota, ParcelaDeduzir FROM FaixasIrrf WHERE Ativo = 1 ORDER BY FaixaMinimo`);
  if (faixas.recordset.length === 0) return 0;
  let irrf = 0;
  for (const f of faixas.recordset) {
    if (Number(base) >= Number(f.FaixaMinimo)) {
      irrf = round2(Number(base) * Number(f.Aliquota) / 100 - Number(f.ParcelaDeduzir));
    }
  }
  return irrf < 0 ? 0 : round2(irrf);
}

// Riscos ATIVOS de descaracterização de vínculo de um prebendado. Retorna
// array de { tipoRisco, descricao } — vazio quando não há risco.
async function riscosAtivosVinculo(pool, sql, prebendadoId) {
  const result = await pool.request().input("id", sql.Int, prebendadoId).query(
    `SELECT TipoRisco AS tipoRisco, Descricao AS descricao FROM PrebendaRiscosVinculo
     WHERE PrebendadoId = @id AND Status = 'ATIVO' ORDER BY CriadoEm`
  );
  return result.recordset;
}

// Vedação à "pejotização": um ministro com prebenda não pode ser cadastrado
// como fornecedor PJ prestando serviço ministerial. Retorna o CPF/CNPJ do
// prebendado se houver colisão, ou null quando não há vedação.
async function prebendadoComCpf(pool, sql, cpfCnpj) {
  const limpo = String(cpfCnpj || "").replace(/\D/g, "");
  if (!limpo) return null;
  const result = await pool.request().input("cpf", sql.VarChar(14), cpfCnpj.trim())
    .query(`SELECT PrebendadoId AS prebendadoId, Nome FROM Prebendados WHERE Cpf = @cpf`);
  return result.recordset[0] || null;
}

module.exports = {
  round2,
  calcularIrrf,
  riscosAtivosVinculo,
  prebendadoComCpf,
  TIPOS_RISCO_VINCULO,
  NATUREZAS_FISCAIS_AUXILIO,
  TIPOS_AUXILIO
};
