// EvoluirConsagracao
// Mesma esteira do sistema atual:
// PROTOCOLADO -> EM_ANALISE_CONSELHO -> AGUARDANDO_PLENARIO -> CONCLUIDO
// (ou REPROVAR em qualquer etapa, o que arquiva o processo). Exige a
// permissão "consagracoes".
//
// Quando chega em CONCLUIDO e o assunto não é "Integração"/"Reintegração",
// atualiza automaticamente a função do membro na base — igual ao sistema atual.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const PROXIMA_ETAPA_CONSAGRACAO = {
  PROTOCOLADO: "EM_ANALISE_CONSELHO",
  EM_ANALISE_CONSELHO: "AGUARDANDO_PLENARIO",
  AGUARDANDO_PLENARIO: "CONCLUIDO"
};

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const consagracaoId = context.bindingData.consagracaoId;
  const { acao } = req.body || {};

  if (!consagracaoId || !acao) {
    context.res = { status: 400, body: { erro: "Informe consagracaoId na rota e 'acao' no corpo (AVANCAR ou REPROVAR)." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
    .query(`SELECT MembroId AS membroId, Status AS status, Assunto AS assunto FROM Consagracoes WHERE ConsagracaoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  if (acao === "REPROVAR") {
    await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
      .query(`UPDATE Consagracoes SET Status = 'REPROVADO', DataConclusao = CAST(SYSUTCDATETIME() AS DATE) WHERE ConsagracaoId = @id`);

    await registrarAuditoria({ tabela: "Consagracoes", registroId: atual.membroId, acao: "Reprovou processo", usuarioId: usuario.membroId });

    context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Processo reprovado e arquivado." } };
    return;
  }

  if (acao === "AVANCAR") {
    const novoStatus = PROXIMA_ETAPA_CONSAGRACAO[atual.status];
    if (!novoStatus) {
      context.res = { status: 400, body: { erro: "Este processo já está em CONCLUIDO." } };
      return;
    }

    if (novoStatus === "CONCLUIDO") {
      await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
        .query(`UPDATE Consagracoes SET Status = 'CONCLUIDO', DataConclusao = CAST(SYSUTCDATETIME() AS DATE) WHERE ConsagracaoId = @id`);
      if (atual.assunto !== "Integração" && atual.assunto !== "Reintegração") {
        await pool.request().input("membroId", sql.Int, atual.membroId).input("funcao", sql.NVarChar(100), atual.assunto)
          .query(`UPDATE MembroReferencia SET Funcao = @funcao WHERE MembroId = @membroId`);
      }
    } else {
      await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("status", sql.NVarChar(30), novoStatus)
        .query(`UPDATE Consagracoes SET Status = @status WHERE ConsagracaoId = @id`);
    }

    await registrarAuditoria({
      tabela: "Consagracoes",
      registroId: atual.membroId,
      acao: `Avançou para ${novoStatus}`,
      usuarioId: usuario.membroId
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        novoStatus,
        mensagem: novoStatus === "CONCLUIDO" ? "✅ Efetivado! A função do obreiro foi atualizada." : `Processo avançou para: ${novoStatus}`
      }
    };
    return;
  }

  context.res = { status: 400, body: { erro: "Ação inválida. Use 'AVANCAR' ou 'REPROVAR'." } };
};
