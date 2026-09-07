// RegistrarRepasseTesouraria (v4.1, corrigido v4.1.3)
// Hoje existe UMA ÚNICA conta bancária pra toda a denominação — qualquer
// congregação deposita direto nela. Não existe "a congregação manda 60%
// pra Geral" como movimentação bancária real: o dinheiro já está todo no
// mesmo lugar desde o depósito. O que existe é a Tesouraria GERAL
// conferindo o fechamento local e LIBERANDO o saldo virtual de 40% pra
// congregação poder gastar (o "Centro de Custo Local" dela) — a
// congregação não pode "se autoliberar". Por isso essa ação exige nível
// GLOBAL (Tesoureiro Geral), não só a permissão "financeiro" da própria
// congregação. Quando um dia existirem contas bancárias por congregação
// (Regimento Art. 140 — CNPJ de filial), isso vira movimentação real e o
// endpoint muda; até lá, é liberação de saldo dentro do caixa único.
// Só permitido em fechamentos ainda não liberados; depois disso o
// fechamento é imutável (erro se corrige com auditoria, não reescrevendo
// histórico).
// POST /api/tesouraria-repasse/{fechamentoId} -> { formaRepasse?, comprovanteBase64?, mimeType? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const FORMAS_REPASSE = ["PIX", "DEPOSITO", "DINHEIRO"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Só a Tesouraria Geral pode conferir e liberar o saldo local — fale com quem tem esse nível de acesso." } };
    return;
  }

  const fechamentoId = context.bindingData.fechamentoId;
  if (!fechamentoId) {
    context.res = { status: 400, body: { erro: "Informe o fechamentoId na rota." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, fechamentoId).query(`
    SELECT f.* FROM FechamentosTesouraria f WHERE f.FechamentoId = @id
  `);
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
    let buffer;
    try { buffer = Buffer.from(comprovanteBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "comprovanteBase64 inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Comprovante vazio ou maior que 15 MB." } };
      return;
    }
    try {
      comprovanteRepasseUrl = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar comprovante no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erro.message } };
      return;
    }
  }

  await pool.request()
    .input("id", sql.Int, fechamentoId)
    .input("formaRepasse", sql.NVarChar(20), formaRepasse || null)
    .input("comprovanteRepasseUrl", sql.NVarChar(500), comprovanteRepasseUrl)
    .input("repassadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE FechamentosTesouraria SET Status = 'REPASSADO', DataRepasse = SYSUTCDATETIME(), FormaRepasse = @formaRepasse,
              ComprovanteRepasseUrl = @comprovanteRepasseUrl, RepassadoPor = @repassadoPor WHERE FechamentoId = @id`);

  await registrarAuditoria({
    tabela: "FechamentosTesouraria", registroId: Number(fechamentoId), acao: "Tesouraria Geral liberou o saldo local", usuarioId: usuario.membroId,
    dadosDepois: { valorRetidoLocal: fechamento.ValorRetidoLocal, formaRepasse: formaRepasse || null, comComprovante: !!comprovanteRepasseUrl }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Saldo local liberado." } };
};
