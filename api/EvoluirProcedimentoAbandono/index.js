// EvoluirProcedimentoAbandono
// Três ações sobre um procedimento de Abandono (Material ou Digital) já aberto (Reg. Art. 11):
//   HOMOLOGAR -> só depois de vencido o prazo de defesa (15 dias da notificação); a CLI
//                homologa a constatação e a perda de membresia passa a valer de verdade
//                (Status='DESLIGADO', vacância automática — shared/vacancia.js).
//   ARQUIVAR  -> o membro voltou a comparecer antes da homologação; encerra sem perda.
//   RECURSO   -> registra o Recurso à Assembleia (30 dias da homologação, sem efeito
//                suspensivo — a perda já vale). O resultado da Assembleia é lançado
//                manualmente aqui depois (não integra com o módulo de votação ainda).
// Exige a permissão "disciplina". POST /api/procedimentos-abandono/{procedimentoId}/evoluir
//
// Auditoria de escopo (02/10/2026):
//  - qualquer ação só vale para procedimento de membro DENTRO do escopo de quem chama; fora do escopo responde igual a "procedimento não encontrado";
//  - HOMOLOGAR (desliga o membro e encerra assentos, liderança e cargo) e RECURSO são decisão da CLI: só o nível GERAL. Um membro da JAI/JEA/TER/CDE, mesmo com
//    "disciplina", só arquiva dentro do próprio escopo;
//  - a homologação só grava se o procedimento AINDA está NOTIFICADO (WHERE com o estado: clique duplo ou duas pessoas ao mesmo tempo não encerram duas vezes a
//    membresia) e recusa membro que já está desligado ou falecido.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const vacancia = require("../shared/vacancia");
const { exigirGeral, pessoaAlcancavel } = require("../shared/escopoRotas");

const RESULTADOS_RECURSO_VALIDOS = ["PENDENTE", "MANTIDO", "REVERTIDO"];
const ACOES_DA_CLI = ["HOMOLOGAR", "RECURSO"];
const STATUS_TERMINAIS = ["DESLIGADO", "FALECIDO"];

const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;

module.exports = async function (context, req) {
  const acaoPedida = req.body && req.body.acao;
  const usuario = ACOES_DA_CLI.includes(acaoPedida)
    ? exigirGeral(req, context, "disciplina")
    : auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { acao } = req.body || {};
  if (!context.bindingData.procedimentoId || !acao) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe procedimentoId na rota e 'acao' no corpo (HOMOLOGAR, ARQUIVAR ou RECURSO)." } };
    return;
  }
  const naoEncontrado = () => { context.res = { status: 200, body: { sucesso: false, mensagem: "Procedimento não encontrado." } }; };
  const procedimentoId = auth.idDeRota(context.bindingData.procedimentoId);
  if (!procedimentoId) { naoEncontrado(); return; }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, procedimentoId)
    .query(`SELECT MembroId, Tipo, Status, DataNotificacao, PrazoDias, DataHomologacao FROM ProcedimentosAbandono WHERE ProcedimentoId = @id`);
  const atual = atualResult.recordset[0];
  // Procedimento de membro fora do escopo = "não existe".
  const pessoa = atual ? await pessoaAlcancavel(pool, usuario, atual.MembroId) : null;
  if (!atual || !pessoa) {
    naoEncontrado();
    return;
  }

  // ---- HOMOLOGAR: só depois de vencido o prazo de defesa ----
  if (acao === "HOMOLOGAR") {
    if (atual.Status !== "NOTIFICADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Procedimento com status "${atual.Status}" não pode ser homologado.` } };
      return;
    }
    if (STATUS_TERMINAIS.includes(pessoa.status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este membro já está desligado (ou falecido): não há membresia a encerrar. Arquive o procedimento." } };
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

    const homologou = await pool.request()
      .input("id", sql.Int, procedimentoId)
      .input("homologadoPor", sql.Int, usuario.membroId)
      .query(`UPDATE ProcedimentosAbandono SET Status = 'HOMOLOGADO', DataHomologacao = CAST(SYSUTCDATETIME() AS DATE), HomologadoPor = @homologadoPor
              WHERE ProcedimentoId = @id AND Status = 'NOTIFICADO'`);
    if (afetadas(homologou) !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este procedimento já foi homologado ou arquivado por outra pessoa." } };
      return;
    }

    const motivoSaida = atual.Tipo === "DIGITAL" ? "ABANDONO_DIGITAL" : "ABANDONO_MATERIAL";
    await pool.request()
      .input("id", sql.Int, atual.MembroId)
      .input("motivoSaida", sql.NVarChar(200), motivoSaida)
      .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
              MotivoSaida = @motivoSaida, DataSaida = CAST(SYSUTCDATETIME() AS DATE)
              WHERE MembroId = @id`);
    await vacancia.encerrarVinculos(pool, sql, atual.MembroId, motivoSaida);

    await registrarAuditoria({
      tabela: "ProcedimentosAbandono",
      registroId: Number(procedimentoId),
      acao: `Homologou Abandono ${atual.Tipo === "DIGITAL" ? "Digital" : "Material"} — perda de membresia`,
      usuarioId: usuario.membroId,
      dadosDepois: { membroId: atual.MembroId, motivoSaida }
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
    const arquivou = await pool.request().input("id", sql.Int, procedimentoId)
      .query(`UPDATE ProcedimentosAbandono SET Status = 'ARQUIVADO' WHERE ProcedimentoId = @id AND Status = 'NOTIFICADO'`);
    if (afetadas(arquivou) !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este procedimento já foi homologado ou arquivado por outra pessoa." } };
      return;
    }
    await registrarAuditoria({ tabela: "ProcedimentosAbandono", registroId: Number(procedimentoId), acao: `Arquivou procedimento de Abandono ${atual.Tipo === "DIGITAL" ? "Digital" : "Material"}`, usuarioId: usuario.membroId });
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
      context.res = { status: 400, body: { sucesso: false, mensagem: `resultadoRecurso inválido. Use um de: ${RESULTADOS_RECURSO_VALIDOS.join(", ")}.` } };
      return;
    }

    await pool.request()
      .input("id", sql.Int, procedimentoId)
      .input("resultado", sql.NVarChar(30), resultadoRecurso || "PENDENTE")
      .query(`UPDATE ProcedimentosAbandono SET RecursoInterposto = 1, DataRecurso = CAST(SYSUTCDATETIME() AS DATE), ResultadoRecurso = @resultado
              WHERE ProcedimentoId = @id AND Status = 'HOMOLOGADO'`);

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

  context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use 'HOMOLOGAR', 'ARQUIVAR' ou 'RECURSO'." } };
};
