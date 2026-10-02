// GestaoAuditoria (v4.12 — Trilha Inviolável + Ancoragem + 3 níveis + Parecer)
// GET  /api/auditoria/ancoragens -> ancoragens externas
// POST /api/auditoria/ancoragens -> { metodo, hashAncorado?, comprovanteBase64?, mimeType? }
// GET  /api/auditoria/niveis -> auditorias em 3 níveis
// POST /api/auditoria/niveis -> { nivel, titulo, anoReferencia, conclusao?, documentoBase64?, mimeType? }
// GET  /api/auditoria/pareceres -> pareceres do Conselho Fiscal
// POST /api/auditoria/pareceres -> { mesReferencia, decisao, justificativa?, documentoBase64?, mimeType? }
// GET  /api/auditoria/cadeia -> verificação de integridade da cadeia de hash
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria, sha256 } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const NIVEIS = ["INTERNA", "NIF", "EXTERNA"];
const DECISOES = ["APROVADO", "REJEITADO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // mesmo teto de GestaoDocumentos e GestaoTextoMestre
const HASH_SHA256 = /^[0-9a-f]{64}$/i;
const MES_AAAA_MM = /^\d{4}-(0[1-9]|1[0-2])$/;

// Anexo (comprovante/documento) em base64: formato permitido e no máximo 15 MB já decodificado. Devolve { buffer } ou { erro } (400).
function lerAnexo(base64, mimeType, rotulo) {
  if (typeof base64 !== "string" || !mimeType || !MIME_PERMITIDOS.includes(mimeType)) return { erro: `Formato de ${rotulo} inválido.` };
  if (base64.length > Math.ceil(TAMANHO_MAXIMO_BYTES / 3) * 4 + 8) return { erro: "Arquivo maior que 15 MB." };
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) return { erro: "Arquivo vazio ou maior que 15 MB." };
  return { buffer };
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  // A trilha e os registros de auditoria são da igreja toda (não têm congregação): só o nível GERAL (papel Global E escopo de todas as congregações) com a permissão
  // de auditoria. Papel local com "auditoria", ou Global com escopo de lista, é recusado antes de tocar no banco.
  const usuario = exigirGeral(req, context, "auditoria");
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
    let hash = null;
    if (hashAncorado !== undefined && hashAncorado !== null && hashAncorado !== "") {
      // Só se ancora um hash que de fato está na trilha: antes qualquer texto era aceito e passava por "hash ancorado" da cadeia.
      if (typeof hashAncorado !== "string" || !HASH_SHA256.test(hashAncorado.trim())) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "hashAncorado inválido (esperado o SHA-256 de um registro da trilha, 64 caracteres hexadecimais)." } };
        return;
      }
      const existe = await pool.request().input("hash", sql.NVarChar(64), hashAncorado.trim().toLowerCase()).query(`SELECT TOP 1 AuditId FROM AuditLog WHERE HashRegistro = @hash`);
      if (existe.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esse hash não existe na trilha de auditoria — só se ancora o hash de um registro da trilha." } };
        return;
      }
      hash = hashAncorado.trim().toLowerCase();
    } else {
      const topo = await pool.request().query(`SELECT TOP 1 HashRegistro FROM AuditLog ORDER BY AuditId DESC`);
      hash = topo.recordset[0] ? topo.recordset[0].HashRegistro : null;
    }
    if (!hash) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhum hash disponível pra ancorar — grave pelo menos um registro de auditoria antes." } };
      return;
    }
    let comprovanteUrl = null;
    if (comprovanteBase64) {
      const anexo = lerAnexo(comprovanteBase64, mimeType, "comprovante");
      if (anexo.erro) {
        context.res = { status: 400, body: { sucesso: false, mensagem: anexo.erro } };
        return;
      }
      comprovanteUrl = await storage.salvarDocumento(anexo.buffer, mimeType);
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
    if (!nivel || !NIVEIS.includes(nivel) || typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 200 || !Number.isInteger(anoReferencia) || anoReferencia < 1900 || anoReferencia > 2200
        || (conclusao != null && (typeof conclusao !== "string" || conclusao.length > 500))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: nivel (INTERNA|NIF|EXTERNA), titulo (até 200 caracteres), anoReferencia (ano com 4 dígitos); conclusao com até 500 caracteres." } };
      return;
    }
    let documentoUrl = null;
    if (documentoBase64) {
      const anexo = lerAnexo(documentoBase64, mimeType, "documento");
      if (anexo.erro) {
        context.res = { status: 400, body: { sucesso: false, mensagem: anexo.erro } };
        return;
      }
      documentoUrl = await storage.salvarDocumento(anexo.buffer, mimeType);
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
    if (typeof mesReferencia !== "string" || !MES_AAAA_MM.test(mesReferencia) || !decisao || !DECISOES.includes(decisao)
        || (justificativa != null && (typeof justificativa !== "string" || justificativa.length > 500))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: mesReferencia (AAAA-MM), decisao (APROVADO|REJEITADO); justificativa com até 500 caracteres." } };
      return;
    }
    let documentoUrl = null;
    if (documentoBase64) {
      const anexo = lerAnexo(documentoBase64, mimeType, "documento");
      if (anexo.erro) {
        context.res = { status: 400, body: { sucesso: false, mensagem: anexo.erro } };
        return;
      }
      documentoUrl = await storage.salvarDocumento(anexo.buffer, mimeType);
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
    // A cadeia é por Tabela (shared/auditoria.js encadeia com o hash anterior
    // da MESMA tabela) — a verificação precisa manter um "anterior" por
    // Tabela, não um único acumulador global, senão qualquer intercalação
    // entre tabelas diferentes (o caso normal) é reportada como quebra falsa.
    const anteriorPorTabela = {};
    const quebrados = [];
    for (const r of registros.recordset) {
      const anterior = anteriorPorTabela[r.Tabela] || "";
      const payload = JSON.stringify({ tabela: r.Tabela, registroId: r.RegistroId, acao: r.Acao, usuarioId: r.UsuarioId, dadosAntes: r.DadosAntes, dadosDepois: r.DadosDepois });
      const esperado = sha256(payload + anterior);
      if (r.HashRegistro && r.HashRegistro !== esperado) { integra = false; quebrados.push(r.AuditId); }
      anteriorPorTabela[r.Tabela] = r.HashRegistro || "";
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { integra, total: registros.recordset.length, quebrados } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: ancoragens, niveis, pareceres ou cadeia." } };
};

