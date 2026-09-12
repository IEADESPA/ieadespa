// GestaoAuditoria (v4.12 — Trilha Inviolável + Ancoragem + 3 níveis + Parecer)
// GET  /api/auditoria/ancoragens -> ancoragens externas
// POST /api/auditoria/ancoragens -> { metodo, hashAncorado?, comprovanteBase64?, mimeType? }
// GET  /api/auditoria/niveis -> auditorias em 3 níveis
// POST /api/auditoria/niveis -> { nivel, titulo, anoReferencia, conclusao?, documentoBase64?, mimeType? }
// GET  /api/auditoria/pareceres -> pareceres do Conselho Fiscal
// POST /api/auditoria/pareceres -> { mesReferencia, decisao, justificativa?, documentoBase64?, mimeType? }
// GET  /api/auditoria/cadeia -> verificação de integridade da cadeia de hash
const auth = require("../shared/auth");
const { registrarAuditoria, sha256 } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const NIVEIS = ["INTERNA", "NIF", "EXTERNA"];
const DECISOES = ["APROVADO", "REJEITADO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "auditoria");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && recurso === "ancoragens") {
    const result = await pool.request().query(`
      SELECT a.AncoragemId AS ancoragemId, a.HashAncorado AS hashAncorado, a.Metodo AS metodo,
             CONVERT(varchar(33), a.CriadoEm, 126) AS criadoEm
      FROM AuditoriaAncoragens a ORDER BY a.AncoragemId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "ancoragens") {
    const { metodo, hashAncorado, comprovanteBase64, mimeType } = req.body || {};
    if (!metodo || (metodo !== "RFC3161" && metodo !== "REGISTRO_PUBLICO")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "metodo inválido. Use RFC3161 ou REGISTRO_PUBLICO." } };
      return;
    }
    let hash = hashAncorado;
    if (!hash) {
      const topo = await pool.request().query(`SELECT TOP 1 HashRegistro FROM AuditLog ORDER BY AuditId DESC`);
      hash = topo.recordset[0] ? topo.recordset[0].HashRegistro : null;
    }
    if (!hash) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhum hash disponível pra ancorar — grave pelo menos um registro de auditoria antes." } };
      return;
    }
    let comprovanteUrl = null;
    if (comprovanteBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de comprovante inválido." } };
        return;
      }
      comprovanteUrl = await storage.salvarDocumento(Buffer.from(comprovanteBase64, "base64"), mimeType);
    }
    const criada = await pool.request().input("hash", sql.NVarChar(64), hash).input("metodo", sql.NVarChar(30), metodo)
      .input("url", sql.NVarChar(500), comprovanteUrl).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO AuditoriaAncoragens (HashAncorado, Metodo, ComprovanteUrl, AncoradoPor) OUTPUT INSERTED.AncoragemId VALUES (@hash, @metodo, @url, @por)`);
    await registrarAuditoria({
      tabela: "AuditoriaAncoragens", registroId: criada.recordset[0].AncoragemId, acao: "Ancorou hash da trilha de auditoria", usuarioId: usuario.membroId,
      dadosDepois: { metodo, hashAncorado: hash }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Hash ancorado externamente (${metodo}).`, ancoragemId: criada.recordset[0].AncoragemId } };
    return;
  }

  if (req.method === "GET" && recurso === "niveis") {
    const result = await pool.request().query(`SELECT * FROM AuditoriasNiveis ORDER BY AnoReferencia DESC, Nivel`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "niveis") {
    const { nivel, titulo, anoReferencia, conclusao, documentoBase64, mimeType } = req.body || {};
    if (!nivel || !NIVEIS.includes(nivel) || !titulo || !titulo.trim() || !anoReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nivel (INTERNA|NIF|EXTERNA), titulo, anoReferencia." } };
      return;
    }
    let documentoUrl = null;
    if (documentoBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de documento inválido." } };
        return;
      }
      documentoUrl = await storage.salvarDocumento(Buffer.from(documentoBase64, "base64"), mimeType);
    }
    const criada = await pool.request().input("nivel", sql.NVarChar(20), nivel).input("titulo", sql.NVarChar(200), titulo.trim())
      .input("ano", sql.Int, anoReferencia).input("conclusao", sql.NVarChar(500), conclusao || null)
      .input("url", sql.NVarChar(500), documentoUrl).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO AuditoriasNiveis (Nivel, Titulo, AnoReferencia, Conclusao, DocumentoUrl, RegistradoPor) OUTPUT INSERTED.AuditoriaId VALUES (@nivel, @titulo, @ano, @conclusao, @url, @por)`);
    await registrarAuditoria({
      tabela: "AuditoriasNiveis", registroId: criada.recordset[0].AuditoriaId, acao: "Registrou auditoria (3 níveis)", usuarioId: usuario.membroId,
      dadosDepois: { nivel, titulo, anoReferencia }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Auditoria registrada." } };
    return;
  }

  if (req.method === "GET" && recurso === "pareceres") {
    const result = await pool.request().query(`
      SELECT p.ParecerId AS parecerId, p.MesReferencia AS mesReferencia, p.Decisao AS decisao,
             p.Justificativa AS justificativa, m.Nome AS parecerPorNome, CONVERT(varchar(33), p.CriadoEm, 126) AS criadoEm
      FROM PareceresConselhoFiscal p JOIN MembroReferencia m ON m.MembroId = p.ParecerPor ORDER BY p.MesReferencia DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "pareceres") {
    const { mesReferencia, decisao, justificativa, documentoBase64, mimeType } = req.body || {};
    if (!mesReferencia || !decisao || !DECISOES.includes(decisao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: mesReferencia, decisao (APROVADO|REJEITADO)." } };
      return;
    }
    let documentoUrl = null;
    if (documentoBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de documento inválido." } };
        return;
      }
      documentoUrl = await storage.salvarDocumento(Buffer.from(documentoBase64, "base64"), mimeType);
    }
    const criado = await pool.request().input("mes", sql.Char(7), mesReferencia).input("decisao", sql.NVarChar(20), decisao)
      .input("justificativa", sql.NVarChar(500), justificativa || null).input("url", sql.NVarChar(500), documentoUrl).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO PareceresConselhoFiscal (MesReferencia, Decisao, Justificativa, DocumentoUrl, ParecerPor) OUTPUT INSERTED.ParecerId VALUES (@mes, @decisao, @justificativa, @url, @por)`);
    await registrarAuditoria({
      tabela: "PareceresConselhoFiscal", registroId: criado.recordset[0].ParecerId, acao: "Emitiu parecer mensal do Conselho Fiscal", usuarioId: usuario.membroId,
      dadosDepois: { mesReferencia, decisao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer emitido." } };
    return;
  }

  if (req.method === "GET" && recurso === "cadeia") {
    const registros = await pool.request().query(`SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog ORDER BY AuditId ASC`);
    let integra = true;
    let anterior = "";
    const quebrados = [];
    for (const r of registros.recordset) {
      const payload = JSON.stringify({ tabela: r.Tabela, registroId: r.RegistroId, acao: r.Acao, usuarioId: r.UsuarioId, dadosAntes: r.DadosAntes, dadosDepois: r.DadosDepois });
      const esperado = sha256(payload + anterior);
      if (r.HashRegistro && r.HashRegistro !== esperado) { integra = false; quebrados.push(r.AuditId); }
      anterior = r.HashRegistro || "";
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { integra, total: registros.recordset.length, quebrados } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: ancoragens, niveis, pareceres ou cadeia." } };
};

