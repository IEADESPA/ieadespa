// GestaoDocumentosBens (v4.11 — item 4)
// Registro de escrituras, títulos, alvarás, veículos e contratos — sob
// guarda dos 2º/3º Secretários (Reg. Art. 57, III; Art. 31, II — atos
// administrativos exigem assinatura conjunta do Presidente e do 1º
// Secretário, e o arquivo fica registrado aqui como prova documental).
// INSTITUCIONAL (guarda da Secretaria Geral): só o nível GERAL (papel Global + escopo TODAS).
// GET  /api/bens-documentos?tipoDocumento= -> lista
// POST /api/bens-documentos -> { bemId?, tipoDocumento, descricao, responsavelCargo, documentoBase64, mimeType }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { decodificarArquivo } = require("../shared/financeiro1Util");

const TIPOS_DOCUMENTO = ["ESCRITURA", "TITULO", "ALVARA", "VEICULO", "CONTRATO", "IPTU", "OUTROS"];
const CARGOS_RESPONSAVEIS = ["SECRETARIO_2", "SECRETARIO_3"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const { tipoDocumento } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (tipoDocumento) { request.input("tipo", sql.NVarChar(30), tipoDocumento); where += " AND d.TipoDocumento = @tipo"; }
    const result = await request.query(`
      SELECT d.DocumentoBemId AS documentoBemId, d.BemId AS bemId, b.Descricao AS bemDescricao,
             d.TipoDocumento AS tipoDocumento, d.Descricao AS descricao, d.ResponsavelCargo AS responsavelCargo,
             CONVERT(varchar(33), d.CriadoEm, 126) AS criadoEm
      FROM BensDocumentos d LEFT JOIN BensPatrimoniais b ON b.BemId = d.BemId
      WHERE ${where} ORDER BY d.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { tipoDocumento, descricao, responsavelCargo, documentoBase64, mimeType } = req.body || {};
    if (!tipoDocumento || typeof descricao !== "string" || !descricao.trim() || !responsavelCargo || !documentoBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipoDocumento, descricao, responsavelCargo, documentoBase64, mimeType." } };
      return;
    }
    if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipoDocumento inválido. Use um de: ${TIPOS_DOCUMENTO.join(", ")}.` } };
      return;
    }
    if (!CARGOS_RESPONSAVEIS.includes(responsavelCargo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `responsavelCargo inválido. Use: ${CARGOS_RESPONSAVEIS.join(" ou ")}.` } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    // O bem, quando informado, precisa existir (antes um id inexistente dava 500 de chave estrangeira).
    const bruto = (req.body || {}).bemId;
    let bemId = null;
    if (bruto !== undefined && bruto !== null && bruto !== "") {
      bemId = auth.idDeRota(bruto);
      const bem = bemId ? await pool.request().input("id", sql.Int, bemId).query(`SELECT BemId FROM BensPatrimoniais WHERE BemId = @id`) : { recordset: [] };
      if (bem.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Bem não encontrado." } };
        return;
      }
    }
    const buffer = decodificarArquivo(documentoBase64);
    if (!buffer) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }
    let documentoUrl;
    try { documentoUrl = await storage.salvarDocumento(buffer, mimeType); } catch (erro) {
      context.log.error("Falha ao salvar documento patrimonial:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao salvar o documento. Tente de novo ou avise a equipe técnica." } };
      return;
    }
    const criado = await pool.request()
      .input("bemId", sql.Int, bemId).input("tipoDocumento", sql.NVarChar(30), tipoDocumento)
      .input("descricao", sql.NVarChar(300), descricao.trim()).input("responsavelCargo", sql.NVarChar(30), responsavelCargo)
      .input("documentoUrl", sql.NVarChar(500), documentoUrl).input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO BensDocumentos (BemId, TipoDocumento, Descricao, ResponsavelCargo, DocumentoUrl, RegistradoPor)
              OUTPUT INSERTED.DocumentoBemId VALUES (@bemId, @tipoDocumento, @descricao, @responsavelCargo, @documentoUrl, @registradoPor)`);
    await registrarAuditoria({
      tabela: "BensDocumentos", registroId: criado.recordset[0].DocumentoBemId, acao: "Registrou documento patrimonial", usuarioId: usuario.membroId,
      dadosDepois: { bemId, tipoDocumento, descricao, responsavelCargo }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Documento patrimonial registrado.", documentoBemId: criado.recordset[0].DocumentoBemId } };
    return;
  }
};
