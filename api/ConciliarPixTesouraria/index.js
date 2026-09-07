// ConciliarPixTesouraria (v4.1.2)
// Resposta a um problema real de operação: exigir 1 comprovante por
// lançamento PIX trava a agilidade quando a pessoa prefere, no fim do mês,
// conferir todos os PIX de uma vez contra UM extrato bancário só (a soma
// bate, não precisa abrir recibo por recibo). Esta ação NÃO substitui o
// comprovante individual (continua podendo existir, ver
// GestaoLancamentosTesouraria::PUT) — é uma segunda forma de dar baixa,
// pensada pra conferência em lote.
// GET  /api/tesouraria-conciliacao?congregacaoId=&mesReferencia=
// POST /api/tesouraria-conciliacao -> { congregacaoId, mesReferencia, lancamentoIds:[...],
//        valorTotal, comprovanteBase64, mimeType }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const { congregacaoId, mesReferencia } = req.query || {};
    if (!congregacaoId || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId e mesReferencia." } };
      return;
    }
    const result = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .query(`
        SELECT c.ConciliacaoId AS conciliacaoId, c.ValorTotal AS valorTotal, c.ComprovanteUrl AS comprovanteUrl,
               CONVERT(varchar(33), c.CriadoEm, 126) AS criadoEm,
               (SELECT COUNT(*) FROM LancamentosTesouraria l WHERE l.ConciliacaoId = c.ConciliacaoId) AS quantidadeLancamentos
        FROM ConciliacoesTesouraria c
        WHERE c.CongregacaoId = @congregacaoId AND c.MesReferencia = @mesReferencia
        ORDER BY c.CriadoEm DESC
      `);
    const conciliacoes = result.recordset.map(c => Object.assign({}, c, { comprovanteUrl: storage.urlDocumentoComSas(c.comprovanteUrl) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: conciliacoes };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, mesReferencia, lancamentoIds, valorTotal, comprovanteBase64, mimeType } = req.body || {};
    if (!congregacaoId || !mesReferencia || !Array.isArray(lancamentoIds) || lancamentoIds.length === 0 || !valorTotal || !comprovanteBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, mesReferencia, lancamentoIds (não vazio), valorTotal, comprovanteBase64, mimeType." } };
      return;
    }

    const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    const idsTexto = lancamentoIds.map(id => Number(id)).join(",");
    const lancamentos = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .query(`SELECT LancamentoId, FormaPagamento, Status, FechamentoId, ConciliacaoId, Valor
              FROM LancamentosTesouraria
              WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia AND LancamentoId IN (${idsTexto})`);

    if (lancamentos.recordset.length !== lancamentoIds.length) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Um ou mais lançamentos não pertencem a esta congregação/mês." } };
      return;
    }
    const invalido = lancamentos.recordset.find(l =>
      !["PIX", "MISTO"].includes(l.FormaPagamento) || l.Status !== "ATIVO" || l.FechamentoId || l.ConciliacaoId
    );
    if (invalido) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível conciliar lançamentos PIX/Misto ativos, ainda não fechados e ainda não conciliados." } };
      return;
    }

    if (!MIME_PERMITIDOS.includes(mimeType)) {
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
    let comprovanteUrl;
    try {
      comprovanteUrl = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar extrato de conciliação no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erro.message } };
      return;
    }

    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .input("valorTotal", sql.Decimal(10, 2), valorTotal).input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO ConciliacoesTesouraria (CongregacaoId, MesReferencia, ValorTotal, ComprovanteUrl, CriadoPor)
              OUTPUT INSERTED.ConciliacaoId VALUES (@congregacaoId, @mesReferencia, @valorTotal, @comprovanteUrl, @criadoPor)`);
    const conciliacaoId = criado.recordset[0].ConciliacaoId;

    await pool.request().input("conciliacaoId", sql.Int, conciliacaoId)
      .query(`UPDATE LancamentosTesouraria SET ConciliacaoId = @conciliacaoId WHERE LancamentoId IN (${idsTexto})`);

    await registrarAuditoria({
      tabela: "ConciliacoesTesouraria", registroId: conciliacaoId, acao: "Conciliou PIX em lote", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, mesReferencia, quantidade: lancamentoIds.length, valorTotal }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ ${lancamentoIds.length} lançamento(s) conciliado(s).`, conciliacaoId } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
