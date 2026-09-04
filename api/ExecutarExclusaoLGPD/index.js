// ExecutarExclusaoLGPD — Encarregado de Dados executa o direito de exclusão
// (LGPD Art. 18, VI). Exige a permissão "protecaodedados".
//
// Não é um DELETE de verdade: como o Regimento (Processo Disciplinar, Assentos,
// Consagrações etc.) depende do MembroId para funcionar e o próprio README exige
// que "nenhuma atualização pode apagar dados reais" (seção 2.4), a exclusão aqui
// é uma ANONIMIZAÇÃO dos dados de contato coletados por consentimento (Telefone/
// E-mail/Endereço, v0.2) — os dados cadastrais/disciplinares ficam, com base legal
// em cumprimento de obrigação legal e exercício regular de direitos (Art. 16, I e II).
// POST /api/lgpd/dpo/solicitacoes/{id}/excluir  body: { respostaTexto? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "protecaodedados");
  if (!usuario) return;

  const id = context.bindingData.id;
  if (!id) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota." } };
    return;
  }
  const { respostaTexto } = req.body || {};

  const pool = await getPool();
  const solicitacaoResult = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id`);
  const solicitacao = solicitacaoResult.recordset[0];
  if (!solicitacao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitação não encontrada." } };
    return;
  }
  if (solicitacao.Tipo !== "EXCLUSAO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Essa solicitação não é do tipo EXCLUSAO." } };
    return;
  }
  if (solicitacao.Status === "ATENDIDA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Essa solicitação já foi atendida." } };
    return;
  }

  const membroAntes = await pool.request().input("mat", sql.Int, solicitacao.MembroId)
    .query(`SELECT Telefone, Email, Endereco, FotoUrl FROM MembroReferencia WHERE MembroId = @mat`);

  await pool.request().input("mat", sql.Int, solicitacao.MembroId)
    .query(`UPDATE MembroReferencia SET Telefone = NULL, Email = NULL, Endereco = NULL, FotoUrl = NULL WHERE MembroId = @mat`);

  // Best-effort — o dado principal (FotoUrl) já foi zerado no SQL independentemente
  // do resultado da chamada ao Storage.
  if (membroAntes.recordset[0] && membroAntes.recordset[0].FotoUrl) {
    await storage.excluirFoto(solicitacao.MembroId);
  }

  await pool.request()
    .input("mat", sql.Int, solicitacao.MembroId)
    .input("registradoPor", sql.Int, usuario.membroId)
    .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
            VALUES (@mat, 'DADOS_CONTATO', 0, 'OBRIGACAO_LEGAL', 'Revogado automaticamente pela execução do direito de exclusão.', @registradoPor)`);

  await pool.request()
    .input("mat", sql.Int, solicitacao.MembroId)
    .input("registradoPor", sql.Int, usuario.membroId)
    .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
            VALUES (@mat, 'FOTO', 0, 'OBRIGACAO_LEGAL', 'Revogado automaticamente pela execução do direito de exclusão.', @registradoPor)`);

  const resposta = respostaTexto || "Dados de contato (telefone/e-mail/endereço) e foto anonimizados. Dados cadastrais e de processos são mantidos por obrigação legal e exercício regular de direitos (LGPD Art. 16).";
  await pool.request()
    .input("id", sql.Int, id)
    .input("respostaTexto", sql.NVarChar(500), resposta)
    .input("atendidoPor", sql.Int, usuario.membroId)
    .query(`UPDATE SolicitacoesTitularLGPD SET Status = 'ATENDIDA', RespostaTexto = @respostaTexto,
            DataResposta = SYSUTCDATETIME(), AtendidoPor = @atendidoPor WHERE SolicitacaoId = @id`);

  await registrarAuditoria({
    tabela: "MembroReferencia", registroId: solicitacao.MembroId, acao: "Executou exclusão LGPD (anonimizou dados de contato e foto)",
    usuarioId: usuario.membroId, dadosAntes: membroAntes.recordset[0], dadosDepois: { telefone: null, email: null, endereco: null, fotoUrl: null }
  });
  await registrarAuditoria({
    tabela: "SolicitacoesTitularLGPD", registroId: Number(id), acao: "Atendeu solicitação de exclusão LGPD",
    usuarioId: usuario.membroId, dadosDepois: { status: "ATENDIDA" }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Exclusão executada: dados de contato e foto anonimizados." } };
};
