// ProcessarRetornoRemessa (v4.7)
// Lê o arquivo de retorno que o banco devolve depois de processar uma
// remessa (shared/cnab240.js::parsearRetornoCnab240) e atualiza o status
// de cada Saída automaticamente: sucesso (ocorrência "00") vira PAGA de verdade
// (mesmo efeito de GestaoSaidas ação PAGAR, sem precisar registrar uma por uma) — MAS só depois de repetir, nesse instante, as conferências do pagamento comum
// (shared/conferenciaPagamento.js): entre o envio e o retorno a congregação pode ter entrado sob tutela, o Fundo PDQ ter sido suspenso, o dado bancário do fornecedor
// ter sido trocado, o fornecedor ter sido desativado, a Saída ter sido cancelada ou o saldo ter sido gasto — e, só aqui, o VALOR que o banco diz ter pago (campo "valor efetivamente
// pago" do Segmento A, em centavos inteiros: shared/cnab240.js) tem de ser igual ao da Saída; valor diferente, ausente ou ilegível também vira divergência. O banco, porém, JÁ pagou: então o fato não se apaga nem vira pagamento regular — o item fica
// DIVERGENTE (status próprio + os motivos), a Saída continua como está e a Tesouraria Geral trata em GestaoRemessasBancarias (PUT TRATAR_DIVERGENCIA).
// Falha — inclusive ocorrência em branco — marca o item como FALHOU e a Saída continua APROVADA, disponível pra entrar numa remessa nova ou ser paga manualmente.
// Item da remessa que o arquivo NÃO menciona também fica DIVERGENTE ("o banco não informou"): sem isso ele ficaria PENDENTE para sempre, bloqueando a Saída e
// reservando saldo. Tudo numa transação, debaixo da trava "PagamentoSaida" (a mesma do pagamento na mão e da geração de remessa). Só o nível GERAL (papel Global com
// escopo de todas as congregações) — mesmo princípio de quem gera a remessa (GestaoRemessasBancarias).
// POST /api/remessas-bancarias/{id}/retorno -> { arquivoRetornoBase64, mimeType }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const cnab240 = require("../shared/cnab240");
const { idOpcional, lerBase64, obterTrava } = require("../shared/financeiroSeguro");
const conferencia = require("../shared/conferenciaPagamento");
const { afetadas } = require("../shared/entradaFinanceira");

const MOTIVO_AUSENTE = {
  codigo: "SEM_RESULTADO_NO_RETORNO",
  mensagem: "O arquivo de retorno não trouxe o resultado deste pagamento — confira o extrato do banco: se o valor saiu, reconheça o pagamento; se não saiu, encerre o item para a Saída poder entrar numa nova remessa."
};

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

  const transaction = new sql.Transaction(pool);
  const r = () => new sql.Request(transaction);
  const execucao = { request: r };
  await transaction.begin();
  let confirmados = 0;
  let falharam = 0;
  const divergentes = [];
  try {
    if (!(await obterTrava(r, "PagamentoSaida"))) {
      await transaction.rollback();
      context.res = { status: 409, body: { sucesso: false, mensagem: "Há um pagamento ou uma geração de remessa em andamento — aguarde alguns segundos e processe o retorno de novo." } };
      return;
    }
    // Quem esperou a trava pode ter chegado depois de outro processamento do MESMO retorno (duplo clique): a situação da remessa é lida de novo, já com a trava.
    const atual = await r().input("id", sql.Int, id).query(`SELECT * FROM RemessasBancarias WHERE RemessaId = @id`);
    if (atual.recordset.length === 0 || atual.recordset[0].Status === "PROCESSADA") {
      await transaction.rollback();
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta remessa já teve o retorno processado." } };
      return;
    }

    const marcarDivergente = async (itemId, saidaId, motivos) => {
      await r().input("id", sql.Int, itemId).input("motivo", sql.NVarChar(300), conferencia.resumirMotivos(motivos)).input("json", sql.NVarChar(sql.MAX), JSON.stringify(motivos))
        .query(`UPDATE RemessaItens SET Status = 'DIVERGENTE', MotivoFalha = @motivo, MotivosJson = @json, ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id AND Status = 'PENDENTE'`);
      divergentes.push({ saidaId, motivos });
    };

    for (const resultado of resultados) {
      const item = await r().input("remessaId", sql.Int, id).input("saidaId", sql.Int, resultado.saidaId)
        .query(`SELECT * FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'`);
      if (item.recordset.length === 0) continue;
      const itemId = item.recordset[0].RemessaItemId;

      if (resultado.sucesso) {
        // O banco diz que pagou. Antes de lançar como pagamento regular, as mesmas conferências do pagamento comum, com a Saída travada. O saldo desconta só o que o
        // banco já pagou e está a tratar (DIVERGENTE): os itens ainda PENDENTES não entram, porque este é justamente um deles e o dinheiro já saiu.
        const saida = await conferencia.carregarSaida(execucao, sql, resultado.saidaId, { travar: true });
        // O valor que o banco diz ter pago (centavos inteiros, lido do arquivo) entra na conferência: diferente do valor da Saída — ou não informado/ilegível, que NUNCA vale como igual —
        // o item vira DIVERGENTE e nada é lançado como pago.
        const valorPagoBanco = { centavos: resultado.valorPagoCentavos, problema: resultado.valorPagoProblema };
        const conferido = saida
          ? await conferencia.criarConferidor(execucao, sql, { reservas: "divergentes" }).conferir(saida, { valorPagoBanco })
          : { ok: false, motivos: [{ codigo: "SAIDA_NAO_ENCONTRADA", mensagem: "A Saída deste pagamento não foi encontrada." }] };
        if (!conferido.ok) {
          await marcarDivergente(itemId, resultado.saidaId, conferido.motivos);
          continue;
        }
        const pagou = await r().input("saidaId", sql.Int, resultado.saidaId).input("pagoPor", sql.Int, usuario.membroId).input("comprovanteUrl", sql.NVarChar(500), arquivoRetornoUrl)
          .query(`UPDATE SaidasTesouraria SET Status = 'PAGA', PagoPor = @pagoPor, PagoEm = SYSUTCDATETIME(), ComprovantePagamentoUrl = @comprovanteUrl
                  WHERE SaidaId = @saidaId AND Status = 'APROVADA'`);
        // Rede: a Saída foi conferida APROVADA com a linha travada, então não deveria falhar; se falhar, o retorno INTEIRO é desfeito (nada fica meio processado) em vez de seguir como se tivesse pago.
        if (afetadas(pagou) === 0) throw new Error(`A Saída ${resultado.saidaId} deixou de estar APROVADA durante o processamento do retorno.`);
        // v4.10 — se esta Saída era uma prebenda (folha mensal), a geração
        // acompanha o pagamento: o IRRF retido já está registrado nela pra
        // compor o Informe Anual de Rendimentos (v4.19).
        await r().input("saidaId", sql.Int, resultado.saidaId)
          .query(`UPDATE PrebendaGeracoes SET Status = 'PAGA' WHERE SaidaId = @saidaId AND Status = 'GERADA'`);
        await r().input("id", sql.Int, itemId)
          .query(`UPDATE RemessaItens SET Status = 'PROCESSADO', ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id AND Status = 'PENDENTE'`);
        confirmados++;
      } else {
        const motivo = resultado.codigoOcorrencia ? `Rejeitado pelo banco — código de ocorrência ${resultado.codigoOcorrencia}` : "Retorno sem código de ocorrência — pagamento não confirmado pelo banco";
        await r().input("id", sql.Int, itemId).input("motivo", sql.NVarChar(300), motivo)
          .query(`UPDATE RemessaItens SET Status = 'FALHOU', MotivoFalha = @motivo, ProcessadoEm = SYSUTCDATETIME() WHERE RemessaItemId = @id AND Status = 'PENDENTE'`);
        falharam++;
      }
    }

    // O que sobrou PENDENTE não foi mencionado pelo arquivo: o banco não disse nem sim nem não. Fica DIVERGENTE para alguém conferir o extrato.
    const sobras = await r().input("remessaId", sql.Int, id)
      .query(`SELECT RemessaItemId, SaidaId FROM RemessaItens WHERE RemessaId = @remessaId AND Status = 'PENDENTE'`);
    for (const sobra of sobras.recordset) await marcarDivergente(sobra.RemessaItemId, sobra.SaidaId, [MOTIVO_AUSENTE]);

    await r().input("id", sql.Int, id).input("processadoPor", sql.Int, usuario.membroId).input("arquivoRetornoUrl", sql.NVarChar(500), arquivoRetornoUrl)
      .query(`UPDATE RemessasBancarias SET Status = 'PROCESSADA', ProcessadoPor = @processadoPor, ProcessadoEm = SYSUTCDATETIME(), ArquivoRetornoUrl = @arquivoRetornoUrl WHERE RemessaId = @id`);
    await transaction.commit();
  } catch (erro) {
    try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
    context.log.error("Falha ao processar o retorno da remessa:", erro.message);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao processar o retorno — nada foi alterado. Avise a equipe técnica." } };
    return;
  }

  await registrarAuditoria({
    tabela: "RemessasBancarias", registroId: id, acao: "Processou retorno de remessa bancária", usuarioId: usuario.membroId,
    dadosDepois: { confirmados, falharam, divergentes: divergentes.map(d => ({ saidaId: d.saidaId, codigos: d.motivos.map(m => m.codigo) })), totalRegistrosLidos: resultados.length }
  });
  const aviso = divergentes.length
    ? ` ATENÇÃO: ${divergentes.length} item(ns) com divergência — o banco já tratou o pagamento, mas ele não passa nas conferências de hoje (ou o valor pago não bate com o da Saída, ou o arquivo não informou). Nada foi lançado como pago: trate cada um na remessa.`
    : "";
  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Retorno processado: ${confirmados} pagamento(s) confirmado(s), ${falharam} rejeitado(s) pelo banco.${aviso}`, confirmados, falharam, divergentes }
  };
};
