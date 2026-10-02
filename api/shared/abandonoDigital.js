// shared/abandonoDigital.js
// Elegibilidade de Abandono Eclesiástico Digital (Estatuto Art. 11, V e Art. 12 §2º):
// precisa de pelo menos 2 tentativas de contato por canais distintos, e os 90 dias
// contam a partir da 1ª tentativa registrada. Depende de banco (histórico de
// tentativas), por isso não é uma função pura em estatuto.js — mesmo espírito de
// shared/disciplina.js/shared/vacancia.js.
const estatuto = require("./estatuto");
const { hojeBrasilia } = require("./dataBrasilia");

// Auditoria de escopo (02/10/2026): a data da tentativa era livre — duas tentativas "de 100 dias atrás" em canais diferentes fabricavam o prazo de 90 dias do Estatuto
// (Art. 12 §2º) e o procedimento nascia com a defesa de 15 dias já vencida. Agora só vale o dia do registro ou até JANELA_DIAS_TENTATIVA dias para trás (o lançamento
// atrasado de um contato que de fato aconteceu); data futura nunca vale.
const JANELA_DIAS_TENTATIVA = 7;

// "AAAA-MM-DD" que existe no calendário (2026-02-31 não existe).
function dataIsoValida(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Resolve a data informada para a tentativa. { data: null } = usar o dia do servidor; { data } = data aceita; { erro } = recusar com a mensagem.
function resolverDataTentativa(informada, hoje = hojeBrasilia()) {
  if (informada === undefined || informada === null || informada === "") return { data: null };
  if (!dataIsoValida(informada)) return { erro: "Data da tentativa inválida. Use o formato AAAA-MM-DD." };
  if (informada > hoje) return { erro: "A data da tentativa não pode ser futura." };
  if (informada < somarDias(hoje, -JANELA_DIAS_TENTATIVA)) {
    return { erro: `A tentativa só pode ser registrada com a data de hoje ou dos últimos ${JANELA_DIAS_TENTATIVA} dias.` };
  }
  return { data: informada };
}

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

module.exports = { elegibilidadeAbandonoDigital, resolverDataTentativa, dataIsoValida, JANELA_DIAS_TENTATIVA };
