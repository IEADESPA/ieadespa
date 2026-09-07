// shared/disciplina.js
// Único lugar com a regra de "processo disciplinar ativo" (evita duplicar a lógica em
// GestaoPessoas, GestaoElegiveisAssembleia, ComposicaoCLI e universo.js).
// "Prazo indeterminado" não é uma coluna própria: é DataTerminoPrevisao NULL
// com Resultado=SANCAO (permanece ativo até alguém ajustar o prazo explicitamente,
// via EvoluirProcessoDisciplinar ação AJUSTAR_PRAZO).
//
// v3.4 — granularizado por TiposPenalidade (Art. 95 §2º): Advertência nunca
// suspende (não impede Ceia); Disciplina Rigorosa fica ativo indefinidamente
// até a Prova de Reintegração Ética ser APROVADA (Art. 77 — sem prazo fixo de
// dias, por isso ignora DataTerminoPrevisao); qualquer outro código (Suspensão
// Temporária) ou PenalidadeId NULL (dado incompleto — fail-safe, nunca libera
// sozinho) usa a regra de prazo por dias que já existia.
const { sql } = require("./db");

const CONDICAO_SQL_ATIVO = `(
  Status = 'EM_ANDAMENTO'
  OR Status = 'AFASTAMENTO_CAUTELAR'
  OR (Status = 'JULGADO' AND Resultado = 'EXCLUSAO')
  OR (Status = 'JULGADO' AND Resultado = 'SANCAO' AND (tp.Codigo IS NULL OR tp.Codigo <> 'ADVERTENCIA') AND (
        (tp.Codigo = 'DISCIPLINA_RIGOROSA' AND (ResultadoProvaReintegracao IS NULL OR ResultadoProvaReintegracao = 'REPROVADO'))
        OR (
          (tp.Codigo IS NULL OR tp.Codigo <> 'DISCIPLINA_RIGOROSA')
          AND (DataTerminoPrevisao IS NULL OR DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))
        )
      ))
)`;

async function membrosSobDisciplina(pool) {
  const result = await pool.request().query(
    `SELECT DISTINCT ProcessosDisciplinares.MembroId AS MembroId
     FROM ProcessosDisciplinares
     LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = ProcessosDisciplinares.PenalidadeId
     WHERE ${CONDICAO_SQL_ATIVO}`
  );
  return new Set(result.recordset.map(r => r.MembroId));
}

module.exports = { CONDICAO_SQL_ATIVO, membrosSobDisciplina };
