// GestaoLancamentosTesouraria (v4.1)
// O "bloco de dízimo" digital: cada lançamento é uma entrada de dízimo ou
// oferta, com Termo nº gerado pelo servidor (nunca digitado à mão — shared/
// tesouraria.js::proximoNumeroTermo, sequencial contínuo por congregação).
// PIX exige comprovante (mesmo padrão de upload de GestaoDocumentos); em
// dinheiro não há como validar tecnicamente, fica na palavra registrada.
// GET    /api/tesouraria-lancamentos?congregacaoId=&mesReferencia=
// POST   /api/tesouraria-lancamentos -> { congregacaoId, dizimistaId?, nomeAvulso?,
//         tipo, valor, formaPagamento, comprovanteBase64?, mimeType?, mesReferencia }
// DELETE /api/tesouraria-lancamentos/{id} -> só antes do fechamento do mês
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const TIPOS = ["DIZIMO", "OFERTA"];
const FORMAS = ["DINHEIRO", "PIX"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const REGEX_MES = /^\d{4}-\d{2}$/;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  async function nomeCongregacao(congregacaoId) {
    const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    return r.recordset[0] ? r.recordset[0].Nome : null;
  }

  if (req.method === "GET") {
    const { congregacaoId, mesReferencia } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND l.CongregacaoId = @congregacaoId"; }
    if (mesReferencia) { request.input("mesReferencia", sql.Char(7), mesReferencia); where += " AND l.MesReferencia = @mesReferencia"; }

    const result = await request.query(`
      SELECT l.LancamentoId AS lancamentoId, l.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
             l.DizimistaId AS dizimistaId, d.Nome AS dizimistaNome, l.NomeAvulso AS nomeAvulso,
             l.TermoNumero AS termoNumero, l.Tipo AS tipo, l.Valor AS valor, l.FormaPagamento AS formaPagamento,
             l.ComprovanteUrl AS comprovanteUrl, l.MesReferencia AS mesReferencia, l.FechamentoId AS fechamentoId,
             CONVERT(varchar(33), l.CriadoEm, 126) AS criadoEm
      FROM LancamentosTesouraria l
      JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
      LEFT JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId
      WHERE ${where}
      ORDER BY l.TermoNumero DESC
    `);
    const lancamentos = result.recordset
      .filter(l => auth.estaNoEscopo(usuario, l.congregacaoNome))
      .map(l => Object.assign({}, l, { comprovanteUrl: l.comprovanteUrl ? storage.urlDocumentoComSas(l.comprovanteUrl) : null }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lancamentos };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, dizimistaId, nomeAvulso, tipo, valor, formaPagamento, comprovanteBase64, mimeType, mesReferencia } = req.body || {};
    if (!congregacaoId || !tipo || !valor || !formaPagamento || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, tipo, valor, formaPagamento, mesReferencia." } };
      return;
    }
    if (!dizimistaId && !nomeAvulso) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o dizimista cadastrado ou um nome avulso." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (!FORMAS.includes(formaPagamento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Forma de pagamento inválida. Use um de: ${FORMAS.join(", ")}.` } };
      return;
    }
    if (!REGEX_MES.test(mesReferencia)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "mesReferencia deve estar no formato AAAA-MM." } };
      return;
    }
    if (Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Valor deve ser maior que zero." } };
      return;
    }

    const congNome = await nomeCongregacao(congregacaoId);
    if (!congNome || !auth.estaNoEscopo(usuario, congNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    const fechado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
    if (fechado.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já foi fechado — não é mais possível lançar entradas nele." } };
      return;
    }

    let comprovanteUrl = null;
    if (formaPagamento === "PIX") {
      if (!comprovanteBase64 || !mimeType) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Lançamento via PIX exige comprovante (comprovanteBase64 + mimeType)." } };
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
      try {
        comprovanteUrl = await storage.salvarDocumento(buffer, mimeType);
      } catch (erro) {
        context.log.error("Falha ao salvar comprovante no Blob Storage:", erro.message);
        context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erro.message } };
        return;
      }
    }

    const termoNumero = await tesouraria.proximoNumeroTermo(pool, sql, congregacaoId);
    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId)
      .input("dizimistaId", sql.Int, dizimistaId || null)
      .input("nomeAvulso", sql.NVarChar(200), dizimistaId ? null : nomeAvulso)
      .input("termoNumero", sql.Int, termoNumero)
      .input("tipo", sql.NVarChar(20), tipo)
      .input("valor", sql.Decimal(10, 2), valor)
      .input("formaPagamento", sql.NVarChar(20), formaPagamento)
      .input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
      .input("mesReferencia", sql.Char(7), mesReferencia)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO LancamentosTesouraria
                (CongregacaoId, DizimistaId, NomeAvulso, TermoNumero, Tipo, Valor, FormaPagamento, ComprovanteUrl, MesReferencia, RegistradoPor)
              OUTPUT INSERTED.LancamentoId
              VALUES (@congregacaoId, @dizimistaId, @nomeAvulso, @termoNumero, @tipo, @valor, @formaPagamento, @comprovanteUrl, @mesReferencia, @registradoPor)`);
    const lancamentoId = criado.recordset[0].LancamentoId;

    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: lancamentoId, acao: "Lançou entrada de tesouraria", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, tipo, valor, formaPagamento, mesReferencia, termoNumero }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Lançamento nº ${termoNumero} registrado.`, lancamentoId, termoNumero } };
    return;
  }

  if (req.method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/tesouraria-lancamentos/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT l.*, c.Nome AS congregacaoNome FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId WHERE l.LancamentoId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Lançamento não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (registro.FechamentoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento já está dentro de um mês fechado — não pode mais ser excluído." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).query(`DELETE FROM LancamentosTesouraria WHERE LancamentoId = @id`);
    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: Number(id), acao: "Excluiu lançamento de tesouraria (antes do fechamento)", usuarioId: usuario.membroId, dadosAntes: registro
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Lançamento excluído." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
