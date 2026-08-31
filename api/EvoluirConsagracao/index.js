// EvoluirConsagracao
// Adaptado de evoluirConsagracaoApp(). Mesma esteira do sistema atual:
// PROTOCOLADO -> EM_ANALISE_CONSELHO -> AGUARDANDO_PLENARIO -> CONCLUIDO
// (ou REPROVAR em qualquer etapa, o que arquiva o processo). Exige a
// permissão "consagracoes".
//
// Quando chega em CONCLUIDO e o assunto não é "Integração"/"Reintegração",
// atualiza automaticamente a função do membro na base (mockDb.avancarConsagracao
// já faz isso) — igual ao sistema atual.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const consagracaoId = context.bindingData.consagracaoId;
  const { acao } = req.body || {};

  if (!consagracaoId || !acao) {
    context.res = { status: 400, body: { erro: "Informe consagracaoId na rota e 'acao' no corpo (AVANCAR ou REPROVAR)." } };
    return;
  }
  if (!mockDb.getConsagracao(consagracaoId)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  if (acao === "REPROVAR") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().input("id", sql.UniqueIdentifier, consagracaoId)
    //   .query(`UPDATE Consagracoes SET Status = 'REPROVADO', DataConclusao = SYSUTCDATETIME() WHERE ConsagracaoId = @id`);

    mockDb.reprovarConsagracao(consagracaoId);
    await registrarAuditoria({ tabela: "Consagracoes", registroId: consagracaoId, acao: "Reprovou processo", usuarioId: usuario.membroId });

    context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Processo reprovado e arquivado." } };
    return;
  }

  if (acao === "AVANCAR") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // (ver mockDb.avancarConsagracao para a lógica completa: status seguinte + UPDATE
    // MembroReferencia.Funcao quando concluído e não é Integração/Reintegração)

    const consagracao = mockDb.avancarConsagracao(consagracaoId);
    if (!consagracao) {
      context.res = { status: 400, body: { erro: "Este processo já está em CONCLUIDO." } };
      return;
    }

    await registrarAuditoria({
      tabela: "Consagracoes",
      registroId: consagracaoId,
      acao: `Avançou para ${consagracao.status}`,
      usuarioId: usuario.membroId
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        novoStatus: consagracao.status,
        mensagem: consagracao.status === "CONCLUIDO"
          ? "✅ Efetivado! A função do obreiro foi atualizada."
          : `Processo avançou para: ${consagracao.status}`
      }
    };
    return;
  }

  context.res = { status: 400, body: { erro: "Ação inválida. Use 'AVANCAR' ou 'REPROVAR'." } };
};
