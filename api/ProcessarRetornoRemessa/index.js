// ProcessarRetornoRemessa (v4.7)
// Lê o arquivo de retorno que o banco devolve depois de processar uma
// remessa (shared/cnab240.js::parsearRetornoCnab240) e atualiza o status
// de cada Saída automaticamente: sucesso vira PAGA de verdade (mesmo
// efeito de GestaoSaidas ação PAGAR, sem precisar registrar uma por uma);
// falha marca o item como FALHOU (com o código de ocorrência do banco) e
// a Saída continua APROVADA, disponível pra entrar numa remessa nova ou
// ser paga manualmente. Restrito a nível Global — mesmo princípio de
// quem gera a remessa (GestaoRemessasBancarias).
// POST /api/remessas-bancarias/{id}/retorno -> { arquivoRetornoBase64, mimeType }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const cnab240 = require("../shared/cnab240");

const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Processar o retorno de uma remessa é restrito a papéis de nível Global." } };
    return;
  }
  if (!id) {
    context.res = { status: 400, body: { erro: "Informe o id na rota: /api/remessas-bancarias/{id}/retorno" } };
    return;
  }
  const { arquivoRetornoBase64, mimeType } = req.body || {};
  if (!arquivoRetornoBase64) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe o arquivo de retorno recebido do banco." } };
    return;
  }

  const pool = await getPool();
  const remessa = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RemessasBancarias WHERE RemessaId = @id`);
  if (remessa.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Remessa não encontrada." } };
    return;
  }
  if (remessa.recordset[0].Status === "PROCESSADA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta remessa já teve o retorno processado." } };
    return;
  }

  let buffer;
  try { buffer = Buffer.from(arquivoRetornoBase64, "base64"); } catch (e) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo inválido." } };
    return;
  }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
    return;
  }

  const conteudo = buffer.toString("utf-8");
  const resultados = cnab240.parsearRetornoCnab240(conteudo);
  if (resultados.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não encontrei nenhum registro de pagamento reconhecível neste arquivo — confira se é o arquivo de retorno certo." } };
    return;
  }

  const arquivoRetornoUrl = await storage.salvarDocumento(buffer, mimeType || "text/plain");

  let confirmados = 0;
  let falharam = 0;
  for (const r of resultados) {
    const item = await pool.request().input("remessaId", sql.Int, id).input("saidaId", sql.Int, r.saidaId)
      .query(`SELECT * FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'`);
    if (item.recordset.length === 0) continue;

    if (r.sucesso) {
      await pool.request().input("saidaId", sql.Int, r.saidaId).input("pagoPor", sql.Int, usuario.membroId).input("comprovanteUrl", sql.NVarChar(500), arquivoRetornoUrl)
        .query(`UPDATE SaidasTesouraria SET Status = 'PAGA', PagoPor = @pagoPor, PagoEm = SYSUTCDATETIME(), ComprovantePagamentoUrl = @comprovanteUrl
                WHERE SaidaId = @saidaId AND Status = 'APROVADA'`);
      // v4.10 — se esta Saída era uma prebenda (folha mensal), a geração
      // acompanha o pagamento: o IRRF retido já está registrado nela pra
      // compor o Informe Anual de Rendimentos (v4.19).
      await pool.request().input("saidaId", sql.Int, r.saidaId)
        .query(`UPDATE PrebendaGeracoes SET Status = 'PAGA' WHERE SaidaId = @saidaId AND Status = 'GERADA'`);
      await pool.request().input("id", sql.Int, item.recordset[0].RemessaItemId)
        .query(`UPDATE RemessaItens SET Status = 'PROCESSADO', ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id`);
      confirmados++;
    } else {
      await pool.request().input("id", sql.Int, item.recordset[0].RemessaItemId).input("motivo", sql.NVarChar(300), `Rejeitado pelo banco — código de ocorrência ${r.codigoOcorrencia || "?"}`)
        .query(`UPDATE RemessaItens SET Status = 'FALHOU', MotivoFalha = @motivo, ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id`);
      falharam++;
    }
  }

  await pool.request().input("id", sql.Int, id).input("processadoPor", sql.Int, usuario.membroId).input("arquivoRetornoUrl", sql.NVarChar(500), arquivoRetornoUrl)
    .query(`UPDATE RemessasBancarias SET Status = 'PROCESSADA', ProcessadoPor = @processadoPor, ProcessadoEm = SYSUTCDATETIME(), ArquivoRetornoUrl = @arquivoRetornoUrl WHERE RemessaId = @id`);

  await registrarAuditoria({
    tabela: "RemessasBancarias", registroId: Number(id), acao: "Processou retorno de remessa bancária", usuarioId: usuario.membroId,
    dadosDepois: { confirmados, falharam, totalRegistrosLidos: resultados.length }
  });
  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Retorno processado: ${confirmados} pagamento(s) confirmado(s), ${falharam} rejeitado(s) pelo banco.`, confirmados, falharam }
  };
};
