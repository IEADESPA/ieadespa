// shared/habilitacao.js (Trava 8-A) — UM lugar para as marcas da disciplina e para "quem está nas funções ministeriais".
// Antes da trava, a Comissão de Unção (v8.3), a licença para oficiar o batismo (v8.1), o Meu Painel e a credencial (v8.4) respondiam diferente para a mesma pessoa:
// um Pastor suspenso podia oficiar o batismo e ungir na cerimônia enquanto o QR dizia "Obreiro inativo". Agora todos leem daqui.
//
// A disciplina não muda o cadastro (Status/Situação): as marcas vêm do processo.
//  - Excluido: exclusão julgada (ou com recurso pendente — Art. 92 §2º: o recurso não tem efeito suspensivo), homologada pelo CEI quando a homologação é exigida, e
//    posterior à última admissão (quem foi readmitido depois da exclusão volta a ser membro — a data de admissão nova é a da readmissão).
//  - ForaDaComunhao: Disciplina Rigorosa em vigor, homologada (Art. 95 §2º, III — o "afastamento total da comunhão").
//  - Afastado: das FUNÇÕES — sanção em vigor (não a advertência), afastamento cautelar, exclusão ou Disciplina Rigorosa. Aqui a decisão do TER ainda pendente de
//    homologação do CEI JÁ afasta (decisão da Trava 8-A): a pessoa continua membro até o CEI homologar, mas não oficia nem unge. O processo só aberto, sem
//    julgamento, não afasta (Art. 95 §3º, III).
//  A recusa da homologação pelo CEI (CEIRecusouEm, migração 160) tira o efeito da decisão.
const { sql } = require("./db");
const { CONDICAO_SQL_ATIVO } = require("./disciplina");

const EM_RECURSO_VALE = `(pd.Status = N'EM_RECURSO' AND pd.CEIRecusouEm IS NULL
  AND NOT EXISTS (SELECT 1 FROM ProcessosDisciplinares r WHERE r.ProcessoOrigemId = pd.ProcessoId AND r.Status = N'JULGADO'))`;
const HOMOLOGACAO_VALE = `ISNULL(pd.HomologadoPeloCEI, 1) = 1`;
const DEPOIS_DA_ADMISSAO = `(m.DataAdmissao IS NULL OR pd.DataConclusao IS NULL OR pd.DataConclusao >= m.DataAdmissao)`;

// As três marcas, para a pessoa de alias `m` (MembroReferencia).
const MARCAS_DISCIPLINA = `
  CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pd WHERE pd.MembroId = m.MembroId AND pd.Resultado = N'EXCLUSAO' AND ${HOMOLOGACAO_VALE} AND ${DEPOIS_DA_ADMISSAO}
                    AND (pd.Status = N'JULGADO' OR ${EM_RECURSO_VALE})) THEN 1 ELSE 0 END AS Excluido,
  CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pd LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = pd.PenalidadeId
                    WHERE pd.MembroId = m.MembroId AND tp.Codigo = N'DISCIPLINA_RIGOROSA' AND ${HOMOLOGACAO_VALE} AND ((${CONDICAO_SQL_ATIVO}) OR ${EM_RECURSO_VALE})) THEN 1 ELSE 0 END AS ForaDaComunhao,
  CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pd LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = pd.PenalidadeId
                    WHERE pd.MembroId = m.MembroId AND (pd.Resultado <> N'EXCLUSAO' OR ${DEPOIS_DA_ADMISSAO})
                      AND ((pd.Status <> N'EM_ANDAMENTO' AND ${CONDICAO_SQL_ATIVO})
                           OR (${EM_RECURSO_VALE} AND pd.Resultado IN (N'SANCAO', N'EXCLUSAO') AND ISNULL(tp.Codigo, N'') <> N'ADVERTENCIA'
                               -- a suspensão com prazo vencido não afasta mais, mesmo com o recurso pendente (revisão da Trava 8-A)
                               AND (pd.Resultado = N'EXCLUSAO' OR tp.Codigo = N'DISCIPLINA_RIGOROSA' OR pd.DataTerminoPrevisao IS NULL
                                    OR pd.DataTerminoPrevisao >= CAST(SYSUTCDATETIME() AS DATE))))) THEN 1 ELSE 0 END AS Afastado`;

// A matrícula mais recente da AFM (o mesmo critério em toda a fase 8).
const STATUS_MATRICULA = `(SELECT TOP 1 a.StatusMatricula FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId ORDER BY a.MatriculaId DESC) AS StatusMatricula`;

const listaDeIds = (ids) => [...new Set((ids || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);

// Map membroId -> { membroId, nome, cargo, status, situacaoMembro, dataNascimento, dataAdmissao, statusMatricula, excluido, foraDaComunhao, afastado }.
// `conexao`: o pool ou a transação em curso.
async function situacaoMinisterial(conexao, membroIds) {
  const ids = listaDeIds(membroIds);
  const out = new Map();
  if (!ids.length) return out;
  const r = await new sql.Request(conexao).query(`
    SELECT m.MembroId, m.Nome, m.CargoMinisterial, m.Status, m.SituacaoMembro,
           CONVERT(varchar(10), m.DataNascimento, 120) AS DataNascimento, CONVERT(varchar(10), m.DataAdmissao, 120) AS DataAdmissao,
           ${STATUS_MATRICULA}, ${MARCAS_DISCIPLINA}
    FROM MembroReferencia m WHERE m.MembroId IN (${ids.join(",")})`);
  for (const l of r.recordset) {
    out.set(Number(l.MembroId), {
      membroId: Number(l.MembroId), nome: l.Nome, cargo: l.CargoMinisterial || null, status: l.Status, situacaoMembro: l.SituacaoMembro,
      dataNascimento: l.DataNascimento || null, dataAdmissao: l.DataAdmissao || null, statusMatricula: l.StatusMatricula || null,
      excluido: !!l.Excluido, foraDaComunhao: !!l.ForaDaComunhao, afastado: !!l.Afastado
    });
  }
  return out;
}

module.exports = { MARCAS_DISCIPLINA, STATUS_MATRICULA, EM_RECURSO_VALE, HOMOLOGACAO_VALE, situacaoMinisterial };
