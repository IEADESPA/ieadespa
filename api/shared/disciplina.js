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

// Trava 8-A (migração 160): a decisão do TER que o CEI RECUSOU homologar (Art. 94, II) não tem efeito — CEIRecusouEm preenchido tira o processo daqui. Antes, a
// recusa gravava o mesmo 0 de "pendente" e a pessoa ficava sob disciplina para sempre.
const CONDICAO_SQL_ATIVO = `(CEIRecusouEm IS NULL AND (
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
))`;

// Decisão do responsável (29/10/2026) — Regimento Art. 77: "o cumprimento do tempo da pena disciplinar encerra a punição, mas não devolve automaticamente a
// função". Terminado o prazo de uma SUSPENSÃO (sanção que não é advertência nem Disciplina Rigorosa — essa já fica ativa até a prova), o obreiro entra na
// "Carência Administrativa" (§ 1º): a punição acabou (volta a ser membro em dia — Ceia, voto), mas ele continua FORA DAS FUNÇÕES até a aprovação na Prova de
// Reintegração Ética da AFM (§ 2º). Mesmas colunas sem alias do CONDICAO_SQL_ATIVO (precisa de TiposPenalidade como `tp`).
const CARENCIA_SQL = `(CEIRecusouEm IS NULL AND Status = 'JULGADO' AND Resultado = 'SANCAO'
  AND (tp.Codigo IS NULL OR tp.Codigo NOT IN ('ADVERTENCIA', 'DISCIPLINA_RIGOROSA'))
  AND DataTerminoPrevisao IS NOT NULL AND DataTerminoPrevisao < CAST(SYSUTCDATETIME() AS DATE)
  AND ISNULL(ResultadoProvaReintegracao, '') <> 'APROVADO')`;

// Trava 8-A (revisão): a exclusão julgada ANTES da última admissão (a readmissão, que só o nível geral registra — GestaoPessoas) já não conta. `m`: o alias de
// MembroReferencia na consulta de quem chama; as colunas do processo ficam sem alias, como no CONDICAO_SQL_ATIVO.
const foraDaReadmissao = (m) => `NOT (ISNULL(Resultado, '') = 'EXCLUSAO' AND ISNULL(DataConclusao, '99991231') < ISNULL(${m}.DataAdmissao, '19000101'))`;

async function membrosSobDisciplina(pool) {
  const result = await pool.request().query(
    `SELECT DISTINCT ProcessosDisciplinares.MembroId AS MembroId
     FROM ProcessosDisciplinares
     LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = ProcessosDisciplinares.PenalidadeId
     WHERE ${CONDICAO_SQL_ATIVO}
       -- a readmissão (Trava 8-A), sem juntar MembroReferencia aqui: as colunas do CONDICAO_SQL_ATIVO não têm alias (Status ficaria ambíguo)
       AND NOT EXISTS (SELECT 1 FROM MembroReferencia mr WHERE mr.MembroId = ProcessosDisciplinares.MembroId AND ISNULL(ProcessosDisciplinares.Resultado, '') = 'EXCLUSAO'
                       AND ISNULL(ProcessosDisciplinares.DataConclusao, '99991231') < ISNULL(mr.DataAdmissao, '19000101'))`
  );
  return new Set(result.recordset.map(r => r.MembroId));
}

module.exports = { CONDICAO_SQL_ATIVO, CARENCIA_SQL, foraDaReadmissao, membrosSobDisciplina };
