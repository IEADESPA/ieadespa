// EvoluirProcessoDisciplinar
// Núcleo mínimo (v0.2). Duas ações (não é uma esteira linear de 1 next-state, porque
// julgar e ajustar prazo são operações distintas com validações próprias):
//   JULGAR         -> { resultado: 'ARQUIVADO'|'SANCAO'|'EXCLUSAO', diasSancao? }
//   AJUSTAR_PRAZO  -> { novoDiasSancao? , prazoIndeterminado?, justificativa } (justificativa obrigatória)
// Exige a permissão "disciplina". Status intermediário AFASTAMENTO_CAUTELAR e reabertura
// de processo já julgado ficam fora deste núcleo (v3.2).
// POST /api/processos-disciplinares/{processoId}/evoluir
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const RESULTADOS_VALIDOS = ["ARQUIVADO", "SANCAO", "EXCLUSAO"];

const SELECT_PROCESSO = `
  SELECT p.ProcessoId AS processoId, p.MembroId AS membroId, m.Nome AS nome,
         p.OrgaoResponsavelId AS orgaoResponsavelId, o.Sigla AS orgaoSigla,
         p.Motivo AS motivo, CONVERT(varchar(10), p.DataAbertura, 120) AS dataAbertura,
         p.Status AS status, p.Sigiloso AS sigiloso,
         CONVERT(varchar(10), p.DataConclusao, 120) AS dataConclusao,
         p.Resultado AS resultado, p.DiasSancao AS diasSancao,
         CONVERT(varchar(10), p.DataTerminoPrevisao, 120) AS dataTerminoPrevisao
  FROM ProcessosDisciplinares p
  JOIN MembroReferencia m ON m.MembroId = p.MembroId
  JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const processoId = context.bindingData.processoId;
  const { acao } = req.body || {};
  if (!processoId || !acao) {
    context.res = { status: 400, body: { erro: "Informe processoId na rota e 'acao' no corpo (JULGAR ou AJUSTAR_PRAZO)." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, processoId)
    .query(`SELECT MembroId, Status, Resultado, DiasSancao, DataAbertura, DataTerminoPrevisao FROM ProcessosDisciplinares WHERE ProcessoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  // ---- JULGAR: encerra a fase de instrução com um resultado ----
  if (acao === "JULGAR") {
    if (atual.Status === "JULGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo já foi julgado." } };
      return;
    }
    const { resultado, diasSancao } = req.body || {};
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
      context.res = { status: 400, body: { erro: "Informe 'resultado' válido: ARQUIVADO, SANCAO ou EXCLUSAO." } };
      return;
    }
    const diasSancaoFinal = resultado === "SANCAO" && diasSancao ? Number(diasSancao) : null;

    await pool.request()
      .input("id", sql.Int, processoId)
      .input("resultado", sql.NVarChar(30), resultado)
      .input("diasSancao", sql.Int, diasSancaoFinal)
      .query(`
        UPDATE ProcessosDisciplinares SET
          Status = 'JULGADO', Resultado = @resultado, DiasSancao = @diasSancao,
          DataTerminoPrevisao = CASE WHEN @diasSancao IS NOT NULL THEN DATEADD(day, @diasSancao, DataAbertura) ELSE NULL END,
          DataConclusao = CAST(SYSUTCDATETIME() AS DATE)
        WHERE ProcessoId = @id`);

    // Exclusão sempre implica perda de tudo (Regimento) — fecha os Assentos ativos.
    // Os demais resultados (SANCAO) exigem saber o nível de pena pra decidir se há
    // perda de mandato (Disciplina Rigorosa) ou só afastamento temporário (Suspensão
    // Temporária) — isso depende do catálogo TiposPenalidade, que é v3.4.
    if (resultado === "EXCLUSAO") {
      await pool.request().input("membroId", sql.Int, atual.MembroId)
        .query(`UPDATE Assentos SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = 'DISCIPLINA' WHERE MembroId = @membroId AND DataFim IS NULL`);
    }

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares",
      registroId: Number(processoId),
      acao: `Julgou processo: ${resultado}`,
      usuarioId: usuario.membroId,
      dadosDepois: { resultado, diasSancao: diasSancaoFinal }
    });

    const processoResult = await pool.request().input("id", sql.Int, processoId).query(`${SELECT_PROCESSO} WHERE p.ProcessoId = @id`);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Processo julgado.", processo: processoResult.recordset[0] }
    };
    return;
  }

  // ---- AJUSTAR_PRAZO: reduz/aumenta/torna indeterminado o prazo de uma sanção já
  // julgada — sempre com justificativa auditada (é o órgão que decide, não o sistema).
  if (acao === "AJUSTAR_PRAZO") {
    if (atual.Status !== "JULGADO" || atual.Resultado !== "SANCAO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível ajustar prazo de um processo já julgado com resultado SANCAO." } };
      return;
    }
    const { novoDiasSancao, prazoIndeterminado, justificativa } = req.body || {};
    if (!justificativa || !String(justificativa).trim()) {
      context.res = { status: 400, body: { erro: "Justificativa é obrigatória para ajustar o prazo de uma sanção." } };
      return;
    }
    if (!prazoIndeterminado && !novoDiasSancao) {
      context.res = { status: 400, body: { erro: "Informe 'novoDiasSancao' ou 'prazoIndeterminado'." } };
      return;
    }
    const diasFinal = prazoIndeterminado ? null : Number(novoDiasSancao);

    await pool.request()
      .input("id", sql.Int, processoId)
      .input("dias", sql.Int, diasFinal)
      .query(`
        UPDATE ProcessosDisciplinares SET
          DiasSancao = @dias,
          DataTerminoPrevisao = CASE WHEN @dias IS NOT NULL THEN DATEADD(day, @dias, DataAbertura) ELSE NULL END
        WHERE ProcessoId = @id`);

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares",
      registroId: Number(processoId),
      acao: "Ajustou prazo da sanção",
      usuarioId: usuario.membroId,
      dadosAntes: { diasSancao: atual.DiasSancao, dataTerminoPrevisao: atual.DataTerminoPrevisao },
      dadosDepois: { diasSancao: diasFinal, justificativa: String(justificativa).trim() }
    });

    const processoResult = await pool.request().input("id", sql.Int, processoId).query(`${SELECT_PROCESSO} WHERE p.ProcessoId = @id`);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Prazo ajustado.", processo: processoResult.recordset[0] }
    };
    return;
  }

  context.res = { status: 400, body: { erro: "Ação inválida. Use 'JULGAR' ou 'AJUSTAR_PRAZO'." } };
};
