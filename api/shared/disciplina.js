// shared/disciplina.js
// Único lugar com a regra de "processo disciplinar ativo" (evita duplicar a lógica em
// GestaoPessoas, GestaoElegiveisAssembleia e universo.js). Núcleo mínimo da v0.2 —
// só EM_ANDAMENTO / JULGADO existem (AFASTAMENTO_CAUTELAR como status intermediário
// é v3.2). "Prazo indeterminado" não é uma coluna própria: é DataTerminoPrevisao NULL
// com Resultado=SANCAO (permanece ativo até alguém ajustar o prazo explicitamente,
// via EvoluirProcessoDisciplinar ação AJUSTAR_PRAZO).
const { sql } = require("./db");

// Ativo pra fins de suspensão de voto/ser votado:
// - Status EM_ANDAMENTO (ainda não julgado), OU
// - JULGADO com Resultado=EXCLUSAO (definitivo, sempre conta), OU
// - JULGADO com Resultado=SANCAO e o prazo não venceu (NULL = indeterminado, ainda ativo)
const CONDICAO_SQL_ATIVO = `(
  Status = 'EM_ANDAMENTO'
  OR (Status = 'JULGADO' AND Resultado = 'EXCLUSAO')
  OR (Status = 'JULGADO' AND Resultado = 'SANCAO' AND (DataTerminoPrevisao IS NULL OR DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE)))
)`;

async function membrosSobDisciplina(pool) {
  const result = await pool.request().query(
    `SELECT DISTINCT MembroId FROM ProcessosDisciplinares WHERE ${CONDICAO_SQL_ATIVO}`
  );
  return new Set(result.recordset.map(r => r.MembroId));
}

module.exports = { CONDICAO_SQL_ATIVO, membrosSobDisciplina };
