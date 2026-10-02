// ExecutarExclusaoLGPD — Encarregado de Dados executa o direito de exclusão
// (LGPD Art. 18, VI). Exige a permissão "protecaodedados" E o nível GERAL.
//
// Não é um DELETE de verdade: como o Regimento (Processo Disciplinar, Assentos,
// Consagrações etc.) depende do MembroId para funcionar e o próprio README exige
// que "nenhuma atualização pode apagar dados reais" (seção 2.4), a exclusão aqui
// é uma ANONIMIZAÇÃO dos dados de contato coletados por consentimento (Telefone/
// E-mail/Endereço, v0.2) — os dados cadastrais/disciplinares ficam, com base legal
// em cumprimento de obrigação legal e exercício regular de direitos (Art. 16, I e II).
// POST /api/lgpd/dpo/solicitacoes/{id}/excluir  body: { respostaTexto? }
//
// GERAL: anonimiza a ficha de QUALQUER membro (irreversível), então não basta a permissão: só o papel Global com escopo de todas as congregações (shared/escopoRotas.js).
// Só executa solicitação EM ABERTO (PENDENTE ou EM_ANALISE): uma já ATENDIDA ou NEGADA não é executada (a negada tem de ser reaberta antes, em ResponderSolicitacaoLGPD).
// A anonimização, as revogações de consentimento e o fechamento da solicitação ficam numa transação só — ou tudo, ou nada — e a solicitação é "tomada" com UPDATE
// condicional, então duas execuções ao mesmo tempo não anonimizam duas vezes.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { exigirGeral } = require("../shared/escopoRotas");

const STATUS_EXECUTAVEIS = ["PENDENTE", "EM_ANALISE"];

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "protecaodedados");
  if (!usuario) return;

  const id = auth.idDeRota(context.bindingData.id);
  if (!context.bindingData.id) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota." } };
    return;
  }
  const { respostaTexto } = req.body || {};

  const pool = await getPool();
  const solicitacaoResult = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id`) : { recordset: [] };
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
  if (!STATUS_EXECUTAVEIS.includes(solicitacao.Status)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: `Essa solicitação está "${solicitacao.Status}" e não pode ser executada — recoloque em análise antes.` } };
    return;
  }

  const membroAntes = await pool.request().input("mat", sql.Int, solicitacao.MembroId)
    .query(`SELECT Telefone, Email, Endereco, FotoUrl FROM MembroReferencia WHERE MembroId = @mat`);

  const resposta = String(respostaTexto || "Dados de contato (telefone/e-mail/endereço) e foto anonimizados. Dados cadastrais e de processos são mantidos por obrigação legal e exercício regular de direitos (LGPD Art. 16).").slice(0, 500);

  const transaction = new sql.Transaction(pool);
  const r = () => new sql.Request(transaction);
  await transaction.begin();
  try {
    // "Toma" a solicitação: só quem a encontra ainda em aberto segue adiante.
    const tomada = await r()
      .input("id", sql.Int, id)
      .input("respostaTexto", sql.NVarChar(500), resposta)
      .input("atendidoPor", sql.Int, usuario.membroId)
      .query(`UPDATE SolicitacoesTitularLGPD SET Status = 'ATENDIDA', RespostaTexto = @respostaTexto,
              DataResposta = SYSUTCDATETIME(), AtendidoPor = @atendidoPor WHERE SolicitacaoId = @id AND Status IN ('PENDENTE','EM_ANALISE')`);
    if (tomada.rowsAffected[0] === 0) {
      await transaction.rollback();
      context.res = { status: 200, body: { sucesso: false, mensagem: "Essa solicitação já foi atendida." } };
      return;
    }

    await r().input("mat", sql.Int, solicitacao.MembroId)
      .query(`UPDATE MembroReferencia SET Telefone = NULL, Email = NULL, Endereco = NULL, FotoUrl = NULL WHERE MembroId = @mat`);

    await r()
      .input("mat", sql.Int, solicitacao.MembroId)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
              VALUES (@mat, 'DADOS_CONTATO', 0, 'OBRIGACAO_LEGAL', 'Revogado automaticamente pela execução do direito de exclusão.', @registradoPor)`);

    await r()
      .input("mat", sql.Int, solicitacao.MembroId)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO ConsentimentosLGPD (MembroId, Tipo, Concedido, BaseLegal, Observacao, RegistradoPor)
              VALUES (@mat, 'FOTO', 0, 'OBRIGACAO_LEGAL', 'Revogado automaticamente pela execução do direito de exclusão.', @registradoPor)`);

    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* a transação pode já ter sido desfeita */ }
    context.log.error("Falha ao executar a exclusão LGPD:", e.message);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Não foi possível executar a exclusão agora; nada foi alterado. Tente de novo." } };
    return;
  }

  // Best-effort — o dado principal (FotoUrl) já foi zerado no SQL independentemente
  // do resultado da chamada ao Storage.
  if (membroAntes.recordset[0] && membroAntes.recordset[0].FotoUrl) {
    await storage.excluirFoto(solicitacao.MembroId);
  }

  // Trava 6-B: a trilha de auditoria é encadeada por hash e não pode ser
  // corrigida depois — gravar aqui o telefone/e-mail/endereço "de antes"
  // guardava para sempre exatamente o dado que a exclusão apagou. Fica só
  // QUAIS campos estavam preenchidos.
  const antes = membroAntes.recordset[0] || {};
  await registrarAuditoria({
    tabela: "MembroReferencia", registroId: solicitacao.MembroId, acao: "Executou exclusão LGPD (anonimizou dados de contato e foto)",
    usuarioId: usuario.membroId,
    dadosAntes: { telefonePreenchido: !!antes.Telefone, emailPreenchido: !!antes.Email, enderecoPreenchido: !!antes.Endereco, tinhaFoto: !!antes.FotoUrl },
    dadosDepois: { telefone: null, email: null, endereco: null, fotoUrl: null }
  });
  await registrarAuditoria({
    tabela: "SolicitacoesTitularLGPD", registroId: Number(id), acao: "Atendeu solicitação de exclusão LGPD",
    usuarioId: usuario.membroId, dadosDepois: { status: "ATENDIDA" }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Exclusão executada: dados de contato e foto anonimizados." } };
};
