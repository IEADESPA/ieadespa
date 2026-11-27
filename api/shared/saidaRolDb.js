// shared/saidaRolDb.js (FASE 10, Membros, missão B: a saída com a carta, 26/11/2026) — a leitura da ficha para a fotografia da carta, num pedido só (regra 1
// do Banco: sem uma consulta por cargo). Chamada DENTRO da transação da saída e ANTES da vacância (shared/vacancia.js zera a função e encerra os cargos).
// As regras e a montagem são puras (shared/saidaMembro.js::montarConteudoDaCarta); aqui só se lê e se normaliza.
//
// O que é "cargo" na carta (proposta da missão B, pergunta 6, "para conferir"): o mesmo que a vacância encerra — os cargos com acesso (Lideranca, com o
// papel), os assentos nos órgãos, o professor de turma da EBD e o corpo docente do seminário. As funções eclesiásticas vêm do histórico do cargo
// ministerial (CargosMinisteriaisHistorico), com a data. O grau é o escopo do cargo (shared/nivelDoCargo.js::ordemDoCargo); o assento em órgão conta como
// geral; a turma da EBD, como a congregação.
const { ordemDoCargo } = require("./nivelDoCargo");
const { ROTULO_CARGO } = require("./escada");

const DIA_BR = (col) => `CONVERT(varchar(10), DATEADD(HOUR, -3, ${col}), 120)`;
const DIA = (col) => `CONVERT(varchar(10), ${col}, 120)`;
const GRAU_LOCAL = ordemDoCargo("CONGREGACAO");
const GRAU_GERAL = ordemDoCargo("GLOBAL");

// a disciplina ativa (a mesma regra de shared/disciplina.js::CONDICAO_SQL_ATIVO), a mais recente — sem a exclusão julgada ANTES da última admissão (a
// readmissão da Trava 8-A, como em disciplina.membrosSobDisciplina): o readmitido não sai "em disciplina" por causa da exclusão antiga
const SQL_DISCIPLINA = `SELECT TOP 1 p.Status, p.Resultado, ${DIA("p.DataConclusao")} AS DataConclusao, ${DIA("p.DataTerminoPrevisao")} AS DataTerminoPrevisao,
         tp.Codigo AS Penalidade
  FROM ProcessosDisciplinares p LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = p.PenalidadeId
  WHERE p.MembroId = @id AND ${require("./disciplina").CONDICAO_SQL_ATIVO}
    AND NOT EXISTS (SELECT 1 FROM MembroReferencia mr WHERE mr.MembroId = p.MembroId AND ISNULL(p.Resultado, '') = 'EXCLUSAO'
                    AND ISNULL(p.DataConclusao, '99991231') < ISNULL(mr.DataAdmissao, '19000101'))
  ORDER BY p.DataAbertura DESC`;

/** as fontes da carta de uma pessoa, já normalizadas; null se a pessoa não existe. `executor`: a transação (ou o pool). `dia`: o dia da saída (Brasília) */
async function lerFontesDaCarta(executor, sql, membroId, dia) {
  const lotes = [
    `SELECT m.MembroId, m.Nome, m.Sexo, ${DIA("m.DataNascimento")} AS DataNascimento, m.Status, m.SituacaoMembro, m.CongregacaoId, c.Nome AS Congregacao,
            a.Nome AS Area, m.FormaAdmissao, ${DIA("m.DataAdmissao")} AS DataAdmissao, ${DIA("m.DataBatismo")} AS DataBatismo, m.EstadoCivil, m.CargoMinisterial,
            ${DIA("m.DataAfastamento")} AS DataAfastamento
     FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN Areas a ON a.AreaId = c.AreaId
     WHERE m.MembroId = @id`,
    `SELECT TOP 1 t.Local FROM CandidatosBatismo cb JOIN TurmasBatismo t ON t.TurmaId = cb.TurmaId AND t.Status = N'REALIZADA'
     WHERE cb.MembroId = @id ORDER BY t.DataBatismo DESC`,
    `SELECT TOP 1 ${DIA("DataMarco")} AS DataMarco, DataAproximada FROM MarcosMembro WHERE MembroId = @id AND Tipo = N'BATISMO_ESPIRITO_SANTO' ORDER BY DataMarco`,
    `SELECT Cargo, ${DIA("Desde")} AS Desde FROM CargosMinisteriaisHistorico WHERE MembroId = @id`,
    `SELECT COALESCE(p.Nome, l.Tipo) AS Nome, l.EscopoTipo,
            CASE l.EscopoTipo WHEN N'CONGREGACAO' THEN cg.Nome WHEN N'AREA' THEN ar.Nome END AS Escopo,
            ${DIA_BR("l.CriadoEm")} AS Inicio, ${DIA("l.AtivoAte")} AS AtivoAte
     FROM Lideranca l LEFT JOIN Papeis p ON p.PapelId = l.PapelId
     LEFT JOIN Congregacoes cg ON l.EscopoTipo = N'CONGREGACAO' AND cg.CongregacaoId = l.EscopoId
     LEFT JOIN Areas ar ON l.EscopoTipo = N'AREA' AND ar.AreaId = l.EscopoId
     WHERE l.MembroId = @id`,
    `SELECT o.Nome AS Orgao, a.CargoOuFuncao, ${DIA("a.DataInicio")} AS Inicio, ${DIA("a.DataFim")} AS Fim
     FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE a.MembroId = @id`,
    `SELECT t.Nome AS Turma, c.Nome AS Congregacao, ${DIA_BR("p.DesignadoEm")} AS Inicio, ${DIA_BR("p.EncerradoEm")} AS Fim, p.Ativo
     FROM EbdTurmaProfessores p JOIN EbdTurmas t ON t.TurmaId = p.TurmaId LEFT JOIN Congregacoes c ON c.CongregacaoId = t.CongregacaoId WHERE p.MembroId = @id`,
    `IF OBJECT_ID(N'dbo.AFMCorpoDocente', N'U') IS NOT NULL
       SELECT Papel, ${DIA("DataInicio")} AS Inicio, ${DIA("DataFim")} AS Fim FROM AFMCorpoDocente WHERE MembroId = @id
     ELSE SELECT CAST(NULL AS NVARCHAR(8)) AS Papel, CAST(NULL AS varchar(10)) AS Inicio, CAST(NULL AS varchar(10)) AS Fim WHERE 1 = 0`,
    SQL_DISCIPLINA,
    // a congregação da chegada: a de origem da primeira transferência concluída; sem transferência, a de hoje
    `IF OBJECT_ID(N'dbo.TransferenciasCongregacao', N'U') IS NOT NULL
       SELECT TOP 1 co.Nome AS Origem FROM TransferenciasCongregacao t JOIN Congregacoes co ON co.CongregacaoId = t.CongregacaoOrigemId
       WHERE t.MembroId = @id AND t.Situacao = N'CONCLUIDA' ORDER BY t.DecididoEm
     ELSE SELECT CAST(NULL AS NVARCHAR(200)) AS Origem WHERE 1 = 0`
  ];
  const r = await executor.request().input("id", sql.Int, membroId).query(lotes.join(";\n"));
  const rs = r.recordsets || [];
  const lido = (i) => rs[i] || [];
  const m = lido(0)[0];
  if (!m) return null;

  const ativoAte = (fim) => !fim || fim >= dia;
  const cargos = [
    ...lido(4).map((l) => ({ nome: l.Escopo ? `${l.Nome} (${l.Escopo})` : l.Nome, grau: ordemDoCargo(l.EscopoTipo), inicio: l.Inicio, fim: l.AtivoAte, ativo: ativoAte(l.AtivoAte) })),
    ...lido(5).map((a) => ({ nome: a.CargoOuFuncao ? `${a.CargoOuFuncao} (${a.Orgao})` : a.Orgao, grau: GRAU_GERAL, inicio: a.Inicio, fim: a.Fim, ativo: ativoAte(a.Fim) })),
    ...lido(6).map((p) => ({ nome: `Professor da turma ${p.Turma} (EBD${p.Congregacao ? `, ${p.Congregacao}` : ""})`, grau: GRAU_LOCAL, inicio: p.Inicio,
      fim: p.Ativo ? null : p.Fim, ativo: !!p.Ativo })),
    ...lido(7).map((d) => ({ nome: d.Papel === "REITOR" ? "Reitor do seminário" : "Docente do seminário", grau: GRAU_GERAL, inicio: d.Inicio, fim: d.Fim, ativo: ativoAte(d.Fim) }))
  ];
  const consagracoes = lido(3).map((h) => ({ nome: ROTULO_CARGO[h.Cargo] || h.Cargo, data: h.Desde }));
  if (consagracoes.length === 0 && m.CargoMinisterial) consagracoes.push({ nome: ROTULO_CARGO[m.CargoMinisterial] || m.CargoMinisterial, data: null });
  const d = lido(8)[0];
  const julgado = !!d && d.Status === "JULGADO";
  // ate nulo: sem data para terminar (a Disciplina Rigorosa vale até a Prova de Reintegração, sem prazo; o prazo indeterminado). exclusao: a exclusão julgada
  // que ainda vale — a carta não a escreve (shared/saidaMembro.js, MENSAGENS_PENDENTES.EXCLUSAO)
  const disciplina = d ? { julgado, exclusao: julgado && d.Resultado === "EXCLUSAO", inicio: julgado ? d.DataConclusao : null,
    ate: julgado && d.Penalidade !== "DISCIPLINA_RIGOROSA" ? d.DataTerminoPrevisao : null } : null;
  const espirito = lido(2)[0];
  const origem = lido(9)[0];

  return {
    membro: { membroId: m.MembroId, nome: m.Nome, sexo: m.Sexo || null, nascimento: m.DataNascimento, status: m.Status, situacaoMembro: m.SituacaoMembro,
      congregacaoId: m.CongregacaoId, congregacao: m.Congregacao || null, area: m.Area || null, formaAdmissao: m.FormaAdmissao || null,
      dataAdmissao: m.DataAdmissao, dataBatismo: m.DataBatismo, estadoCivil: m.EstadoCivil || null,
      // "sem comunhão desde" (resposta de 26/11): a data do afastamento que a secretaria lançou na ficha; sem ela, a carta não inventa uma
      semComunhaoDesde: m.DataAfastamento || null },
    localBatismo: (lido(1)[0] && lido(1)[0].Local) || null,
    espiritoSanto: espirito ? { data: espirito.DataMarco, aproximada: !!espirito.DataAproximada } : null,
    consagracoes, cargos, disciplina,
    chegadaCongregacao: (origem && origem.Origem) || m.Congregacao || null
  };
}

module.exports = { lerFontesDaCarta };
