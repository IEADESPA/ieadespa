// AnexosGenericos (vB.4 — Anexos genéricos)
// Qualquer registro de qualquer módulo cadastrado em shared/anexos.js
// aceita documento, com o MESMO controle de acesso do registro-pai — nunca
// uma tela/permissão nova por módulo.
// GET    /api/anexos?tabela=X&registroId=Y   -> lista (com link assinado)
// POST   /api/anexos                          -> { tabela, registroId, nomeArquivo, mimeType, documentoBase64 }
// DELETE /api/anexos/{anexoId}
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { permissoesDaTabela } = require("../shared/anexos");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { tabela, registroId } = req.query || {};
    if (!tabela || !registroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe tabela e registroId." } };
      return;
    }
    const permissoes = permissoesDaTabela(tabela);
    if (!permissoes) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tabela '${tabela}' não aceita anexo genérico.` } };
      return;
    }
    if (!auth.exigirAlgumaPermissao(req, context, permissoes)) return;
    const result = await pool.request().input("tabela", sql.NVarChar(60), tabela).input("registroId", sql.Int, registroId)
      .query(`SELECT AnexoId, NomeArquivo, Url, MimeType, CriadoEm FROM AnexosGenericos WHERE Tabela = @tabela AND RegistroId = @registroId ORDER BY CriadoEm DESC`);
    const lista = result.recordset.map(a => ({
      anexoId: a.AnexoId, nomeArquivo: a.NomeArquivo, mimeType: a.MimeType, criadoEm: a.CriadoEm,
      urlAssinada: storage.urlDocumentoComSas(a.Url)
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !id) {
    const { tabela, registroId, nomeArquivo, mimeType, documentoBase64 } = req.body || {};
    if (!tabela || !registroId || !nomeArquivo || !mimeType || !documentoBase64) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe tabela, registroId, nomeArquivo, mimeType e documentoBase64." } };
      return;
    }
    const permissoes = permissoesDaTabela(tabela);
    if (!permissoes) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tabela '${tabela}' não aceita anexo genérico.` } };
      return;
    }
    if (!auth.exigirAlgumaPermissao(req, context, permissoes)) return;
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de arquivo inválido. Use PDF, JPEG ou PNG." } };
      return;
    }
    const url = await storage.salvarDocumento(Buffer.from(documentoBase64, "base64"), mimeType);
    const inserido = await pool.request()
      .input("tabela", sql.NVarChar(60), tabela).input("registroId", sql.Int, registroId)
      .input("nomeArquivo", sql.NVarChar(255), nomeArquivo).input("url", sql.NVarChar(500), url)
      .input("mimeType", sql.NVarChar(100), mimeType).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO AnexosGenericos (Tabela, RegistroId, NomeArquivo, Url, MimeType, EnviadoPorMembroId)
              OUTPUT INSERTED.AnexoId VALUES (@tabela, @registroId, @nomeArquivo, @url, @mimeType, @por)`);
    const anexoId = inserido.recordset[0].AnexoId;
    await registrarAuditoria({ tabela: "AnexosGenericos", registroId: anexoId, acao: `Anexou documento em ${tabela}#${registroId}`, usuarioId: usuario.membroId, dadosDepois: { tabela, registroId, nomeArquivo } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Anexo enviado.", anexoId } };
    return;
  }

  if (req.method === "DELETE" && id) {
    const anexo = (await pool.request().input("id", sql.Int, id).query(`SELECT Tabela, Url FROM AnexosGenericos WHERE AnexoId = @id`)).recordset[0];
    if (!anexo) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Anexo não encontrado." } };
      return;
    }
    const permissoes = permissoesDaTabela(anexo.Tabela);
    if (!permissoes) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tabela '${anexo.Tabela}' não tem mais permissão de anexo cadastrada.` } };
      return;
    }
    if (!auth.exigirAlgumaPermissao(req, context, permissoes)) return;
    await pool.request().input("id", sql.Int, id).query(`DELETE FROM AnexosGenericos WHERE AnexoId = @id`);
    await storage.excluirDocumento(anexo.Url);
    await registrarAuditoria({ tabela: "AnexosGenericos", registroId: Number(id), acao: "Excluiu anexo", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Anexo excluído." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
