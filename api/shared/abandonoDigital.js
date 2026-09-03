// shared/abandonoDigital.js
// Elegibilidade de Abandono Eclesiástico Digital (Estatuto Art. 11, V e Art. 12 §2º):
// precisa de pelo menos 2 tentativas de contato por canais distintos, e os 90 dias
// contam a partir da 1ª tentativa registrada. Depende de banco (histórico de
// tentativas), por isso não é uma função pura em estatuto.js — mesmo espírito de
// shared/disciplina.js/shared/vacancia.js.
const estatuto = require("./estatuto");

async function elegibilidadeAbandonoDigital(pool, sql, membroId) {
  const result = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT MIN(DataTentativa) AS Primeira, MAX(DataTentativa) AS Ultima, COUNT(DISTINCT CanalId) AS CanaisDistintos
    FROM TentativasContatoAbandono WHERE MembroId = @id`);
  const { Primeira, Ultima, CanaisDistintos } = result.recordset[0];
  const diasDesdePrimeira = Primeira ? estatuto.diasDesde(Primeira) : null;
  const elegivel =
    CanaisDistintos >= estatuto.MIN_TENTATIVAS_CONTATO_DIGITAL &&
    diasDesdePrimeira !== null &&
    diasDesdePrimeira >= estatuto.DIAS_ABANDONO_DIGITAL;

  return { elegivel, canaisDistintos: CanaisDistintos, diasDesdePrimeira, ultimaTentativa: Ultima };
}

module.exports = { elegibilidadeAbandonoDigital };
