// RegistrarRepasseTesouraria (v4.1)
// Confirma que o repasse de 60% (ou o percentual vigente) chegou de fato à
// Tesouraria Geral — aceita comprovante (mesmo padrão de upload de
// GestaoDocumentos). Só permitido em fechamentos ainda não repassados;
// depois disso o fechamento é imutável (erro se corrige com auditoria, não
// reescrevendo histórico).
// POST /api/tesouraria-repasse/{fechamentoId} -> { comprovanteBase64?, mimeType? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const fechamentoId = context.bindingData.fechamentoId;
  if (!fechamentoId) {
    context.res = { status: 400, body: { erro: "Informe o fechamentoId na rota." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, fechamentoId).query(`
    SELECT f.*, c.Nome AS congregacaoNome FROM FechamentosTesouraria f JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId WHERE f.FechamentoId = @id
  `);
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Fechamento não encontrado." } };
    return;
  }
  const fechamento = atual.recordset[0];
  if (!auth.estaNoEscopo(usuario, fechamento.congregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }
  if (fechamento.Status === "REPASSADO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este repasse já foi registrado." } };
    return;
  }

  const { comprovanteBase64, mimeType } = req.body || {};
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
      context.log.error("Falha ao salvar comprovante de repasse no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erro.message } };
      return;
    }
  }

  await pool.request()
    .input("id", sql.Int, fechamentoId)
    .input("comprovanteRepasseUrl", sql.NVarChar(500), comprovanteRepasseUrl)
    .input("repassadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE FechamentosTesouraria SET Status = 'REPASSADO', DataRepasse = SYSUTCDATETIME(),
              ComprovanteRepasseUrl = @comprovanteRepasseUrl, RepassadoPor = @repassadoPor WHERE FechamentoId = @id`);

  await registrarAuditoria({
    tabela: "FechamentosTesouraria", registroId: Number(fechamentoId), acao: "Registrou repasse à Tesouraria Geral", usuarioId: usuario.membroId,
    dadosDepois: { valorRepasseGeral: fechamento.ValorRepasseGeral, comComprovante: !!comprovanteRepasseUrl }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Repasse registrado." } };
};
