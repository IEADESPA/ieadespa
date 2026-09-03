// EvoluirProcedimentoAbandono
// Três ações sobre um procedimento de Abandono Material já aberto (Reg. Art. 11):
//   HOMOLOGAR -> só depois de vencido o prazo de defesa (15 dias da notificação); a CLI
//                homologa a constatação e a perda de membresia passa a valer de verdade
//                (Status='DESLIGADO', vacância automática — shared/vacancia.js).
//   ARQUIVAR  -> o membro voltou a comparecer antes da homologação; encerra sem perda.
//   RECURSO   -> registra o Recurso à Assembleia (30 dias da homologação, sem efeito
//                suspensivo — a perda já vale). O resultado da Assembleia é lançado
//                manualmente aqui depois (não integra com o módulo de votação ainda).
// Exige a permissão "disciplina". POST /api/procedimentos-abandono/{procedimentoId}/evoluir
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const vacancia = require("../shared/vacancia");

const RESULTADOS_RECURSO_VALIDOS = ["PENDENTE", "MANTIDO", "REVERTIDO"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const procedimentoId = context.bindingData.procedimentoId;
  const { acao } = req.body || {};
  if (!procedimentoId || !acao) {
    context.res = { status: 400, body: { erro: "Informe procedimentoId na rota e 'acao' no corpo (HOMOLOGAR, ARQUIVAR ou RECURSO)." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, procedimentoId)
    .query(`SELECT MembroId, Status, DataNotificacao, PrazoDias, DataHomologacao FROM ProcedimentosAbandono WHERE ProcedimentoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Procedimento não encontrado." } };
    return;
  }

  // ---- HOMOLOGAR: só depois de vencido o prazo de defesa ----
  if (acao === "HOMOLOGAR") {
    if (atual.Status !== "NOTIFICADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Procedimento com status "${atual.Status}" não pode ser homologado.` } };
      return;
    }
    const diasCorridos = estatuto.diasDesde(atual.DataNotificacao);
    if (diasCorridos === null || diasCorridos < atual.PrazoDias) {
      context.res = {
        status: 200,
        body: { sucesso: false, mensagem: `O prazo de defesa (${atual.PrazoDias} dias da notificação) ainda não venceu.` }
      };
      return;
    }

    await pool.request()
      .input("id", sql.Int, procedimentoId)
      .input("homologadoPor", sql.Int, usuario.membroId)
      .query(`UPDATE ProcedimentosAbandono SET Status = 'HOMOLOGADO', DataHomologacao = CAST(SYSUTCDATETIME() AS DATE), HomologadoPor = @homologadoPor WHERE ProcedimentoId = @id`);

    await pool.request()
      .input("id", sql.Int, atual.MembroId)
      .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
              MotivoSaida = 'ABANDONO_MATERIAL', DataSaida = CAST(SYSUTCDATETIME() AS DATE)
              WHERE MembroId = @id`);
    await vacancia.encerrarVinculos(pool, sql, atual.MembroId, "ABANDONO_MATERIAL");

    await registrarAuditoria({
      tabela: "ProcedimentosAbandono",
      registroId: Number(procedimentoId),
      acao: "Homologou Abandono Material — perda de membresia",
      usuarioId: usuario.membroId,
      dadosDepois: { membroId: atual.MembroId }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Abandono homologado — membresia encerrada." } };
    return;
  }

  // ---- ARQUIVAR: membro voltou a comparecer, sem perda ----
  if (acao === "ARQUIVAR") {
    if (atual.Status !== "NOTIFICADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Procedimento com status "${atual.Status}" não pode ser arquivado.` } };
      return;
    }
    await pool.request().input("id", sql.Int, procedimentoId).query(`UPDATE ProcedimentosAbandono SET Status = 'ARQUIVADO' WHERE ProcedimentoId = @id`);
    await registrarAuditoria({ tabela: "ProcedimentosAbandono", registroId: Number(procedimentoId), acao: "Arquivou procedimento de Abandono Material", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Procedimento arquivado." } };
    return;
  }

  // ---- RECURSO: registra o Recurso à Assembleia (sem efeito suspensivo) ----
  if (acao === "RECURSO") {
    if (atual.Status !== "HOMOLOGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível recorrer de um procedimento já homologado." } };
      return;
    }
    const diasDesdeHomologacao = estatuto.diasDesde(atual.DataHomologacao);
    if (diasDesdeHomologacao !== null && diasDesdeHomologacao > estatuto.DIAS_RECURSO_ASSEMBLEIA) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Prazo de recurso (${estatuto.DIAS_RECURSO_ASSEMBLEIA} dias da homologação) já venceu.` } };
      return;
    }
    const { resultadoRecurso } = req.body || {};
    if (resultadoRecurso && !RESULTADOS_RECURSO_VALIDOS.includes(resultadoRecurso)) {
      context.res = { status: 400, body: { erro: `resultadoRecurso inválido. Use um de: ${RESULTADOS_RECURSO_VALIDOS.join(", ")}.` } };
      return;
    }

    await pool.request()
      .input("id", sql.Int, procedimentoId)
      .input("resultado", sql.NVarChar(30), resultadoRecurso || "PENDENTE")
      .query(`UPDATE ProcedimentosAbandono SET RecursoInterposto = 1, DataRecurso = CAST(SYSUTCDATETIME() AS DATE), ResultadoRecurso = @resultado WHERE ProcedimentoId = @id`);

    await registrarAuditoria({
      tabela: "ProcedimentosAbandono",
      registroId: Number(procedimentoId),
      acao: "Registrou Recurso à Assembleia",
      usuarioId: usuario.membroId,
      dadosDepois: { resultadoRecurso: resultadoRecurso || "PENDENTE" }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Recurso registrado (sem efeito suspensivo — a perda de membresia já vale)." } };
    return;
  }

  context.res = { status: 400, body: { erro: "Ação inválida. Use 'HOMOLOGAR', 'ARQUIVAR' ou 'RECURSO'." } };
};
