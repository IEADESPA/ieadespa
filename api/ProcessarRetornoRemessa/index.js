// ProcessarRetornoRemessa (v4.7)
// Lê o arquivo de retorno que o banco devolve depois de processar uma
// remessa (shared/cnab240.js::parsearRetornoCnab240) e atualiza o status
// de cada Saída automaticamente: sucesso (ocorrência "00") vira PAGA de verdade
// (mesmo efeito de GestaoSaidas ação PAGAR, sem precisar registrar uma por uma);
// falha — inclusive ocorrência em branco — marca o item como FALHOU e
// a Saída continua APROVADA, disponível pra entrar numa remessa nova ou
// ser paga manualmente. Só o nível GERAL (papel Global com escopo de todas as congregações) —
// mesmo princípio de quem gera a remessa (GestaoRemessasBancarias).
// POST /api/remessas-bancarias/{id}/retorno -> { arquivoRetornoBase64, mimeType }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const cnab240 = require("../shared/cnab240");
const { idOpcional, lerBase64 } = require("../shared/financeiroSeguro");

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
  if (!rota.presente) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/remessas-bancarias/{id}/retorno" } };
    return;
  }
  const { arquivoRetornoBase64 } = req.body || {};
  if (!arquivoRetornoBase64) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe o arquivo de retorno recebido do banco." } };
    return;
  }

  const pool = await getPool();
  const remessa = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RemessasBancarias WHERE RemessaId = @id`) : { recordset: [] };
  if (remessa.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Remessa não encontrada." } };
    return;
  }
  if (remessa.recordset[0].Status === "PROCESSADA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta remessa já teve o retorno processado." } };
    return;
  }

  const lido = lerBase64(arquivoRetornoBase64);
  if (lido.erro) {
    context.res = { status: 400, body: { sucesso: false, mensagem: lido.erro === "Arquivo inválido." ? lido.erro : "Arquivo vazio ou maior que 15 MB." } };
    return;
  }
  const buffer = lido.buffer;

  const conteudo = buffer.toString("utf-8");
  const resultados = cnab240.parsearRetornoCnab240(conteudo);
  if (resultados.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não encontrei nenhum registro de pagamento reconhecível neste arquivo — confira se é o arquivo de retorno certo." } };
    return;
  }

  // O arquivo de retorno é texto: o tipo que o navegador declara não vale (um "text/html" servido do armazenamento seria página ativa) — grava sempre como texto puro.
  const arquivoRetornoUrl = await storage.salvarDocumento(buffer, "text/plain");

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
      const motivo = r.codigoOcorrencia ? `Rejeitado pelo banco — código de ocorrência ${r.codigoOcorrencia}` : "Retorno sem código de ocorrência — pagamento não confirmado pelo banco";
      await pool.request().input("id", sql.Int, item.recordset[0].RemessaItemId).input("motivo", sql.NVarChar(300), motivo)
        .query(`UPDATE RemessaItens SET Status = 'FALHOU', MotivoFalha = @motivo, ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id`);
      falharam++;
    }
  }

  await pool.request().input("id", sql.Int, id).input("processadoPor", sql.Int, usuario.membroId).input("arquivoRetornoUrl", sql.NVarChar(500), arquivoRetornoUrl)
    .query(`UPDATE RemessasBancarias SET Status = 'PROCESSADA', ProcessadoPor = @processadoPor, ProcessadoEm = SYSUTCDATETIME(), ArquivoRetornoUrl = @arquivoRetornoUrl WHERE RemessaId = @id`);

  await registrarAuditoria({
    tabela: "RemessasBancarias", registroId: id, acao: "Processou retorno de remessa bancária", usuarioId: usuario.membroId,
    dadosDepois: { confirmados, falharam, totalRegistrosLidos: resultados.length }
  });
  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Retorno processado: ${confirmados} pagamento(s) confirmado(s), ${falharam} rejeitado(s) pelo banco.`, confirmados, falharam }
  };
};
