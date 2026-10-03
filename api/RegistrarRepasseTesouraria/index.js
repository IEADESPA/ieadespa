// RegistrarRepasseTesouraria (v4.1, corrigido v4.1.3)
// Hoje existe UMA ÚNICA conta bancária pra toda a denominação — qualquer
// congregação deposita direto nela. Não existe "a congregação manda 60%
// pra Geral" como movimentação bancária real: o dinheiro já está todo no
// mesmo lugar desde o depósito. O que existe é a Tesouraria GERAL
// conferindo o fechamento local e LIBERANDO o saldo virtual de 40% pra
// congregação poder gastar (o "Centro de Custo Local" dela) — a
// congregação não pode "se autoliberar". Por isso essa ação exige o nível
// GERAL (Tesoureiro Geral: papel Global com escopo de todas as congregações),
// não só a permissão "financeiro" da própria congregação. Quando um dia existirem
// contas bancárias por congregação (Regimento Art. 140 — CNPJ de filial), isso vira
// movimentação real e o endpoint muda; até lá, é liberação de saldo dentro do caixa único.
// Só permitido em fechamentos ainda não liberados; depois disso o
// fechamento é imutável (erro se corrige com auditoria, não reescrevendo
// histórico) — o UPDATE só pega fechamento que NÃO está REPASSADO, então duas
// chamadas simultâneas não sobrescrevem quem liberou nem a data da liberação.
// POST /api/tesouraria-repasse/{fechamentoId} -> { formaRepasse?, comprovanteBase64?, mimeType? }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { idOpcional, lerBase64 } = require("../shared/financeiroSeguro");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const FORMAS_REPASSE = ["PIX", "DEPOSITO", "DINHEIRO"];

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;

  const rota = idOpcional(context.bindingData.fechamentoId);
  if (!rota.presente) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o fechamentoId na rota." } };
    return;
  }
  const fechamentoId = rota.id;

  const pool = await getPool();
  const atual = fechamentoId ? await pool.request().input("id", sql.Int, fechamentoId).query(`
    SELECT f.* FROM FechamentosTesouraria f WHERE f.FechamentoId = @id
  `) : { recordset: [] };
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Fechamento não encontrado." } };
    return;
  }
  const fechamento = atual.recordset[0];
  if (fechamento.Status === "REPASSADO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este saldo já foi liberado." } };
    return;
  }

  const { formaRepasse, comprovanteBase64, mimeType } = req.body || {};
  if (formaRepasse && !FORMAS_REPASSE.includes(formaRepasse)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `formaRepasse inválida. Use um de: ${FORMAS_REPASSE.join(", ")}.` } };
    return;
  }
  let comprovanteRepasseUrl = null;
  if (comprovanteBase64) {
    if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato de comprovante inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    const lido = lerBase64(comprovanteBase64);
    if (lido.erro) {
      context.res = { status: 400, body: { sucesso: false, mensagem: lido.erro === "Arquivo inválido." ? "comprovanteBase64 inválido." : "Comprovante vazio ou maior que 15 MB." } };
      return;
    }
    try {
      comprovanteRepasseUrl = await storage.salvarDocumento(lido.buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar comprovante no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica." } };
      return;
    }
  }

  const atualizado = await pool.request()
    .input("id", sql.Int, fechamentoId)
    .input("formaRepasse", sql.NVarChar(20), formaRepasse || null)
    .input("comprovanteRepasseUrl", sql.NVarChar(500), comprovanteRepasseUrl)
    .input("repassadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE FechamentosTesouraria SET Status = 'REPASSADO', DataRepasse = SYSUTCDATETIME(), FormaRepasse = @formaRepasse,
              ComprovanteRepasseUrl = @comprovanteRepasseUrl, RepassadoPor = @repassadoPor WHERE FechamentoId = @id AND Status <> 'REPASSADO'`);
  if (!atualizado.rowsAffected || atualizado.rowsAffected[0] !== 1) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este saldo já foi liberado." } };
    return;
  }

  await registrarAuditoria({
    tabela: "FechamentosTesouraria", registroId: fechamentoId, acao: "Tesouraria Geral liberou o saldo local", usuarioId: usuario.membroId,
    dadosDepois: { valorRetidoLocal: fechamento.ValorRetidoLocal, formaRepasse: formaRepasse || null, comComprovante: !!comprovanteRepasseUrl }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Saldo local liberado." } };
};
