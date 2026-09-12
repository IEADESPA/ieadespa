// shared/auditoria.js
// Módulo interno reaproveitado por outras Functions (GestaoLideranca, EvoluirConsagracao, etc.)
// Grava na tabela AuditLog do Azure SQL (não deixa a falha de auditoria derrubar a operação).
// v4.12 — trilha inviolável: cada registro recebe um HashRegistro (SHA-256)
// calculado sobre os dados do próprio registro + o hash do registro anterior
// da MESMA tabela (cadeia). A ancoragem externa fica em GestaoAuditoria.

const crypto = require("crypto");
const { getPool, sql } = require("./db");

function sha256(texto) {
  return crypto.createHash("sha256").update(texto, "utf8").digest("hex");
}

async function registrarAuditoria({ tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois }) {
  try {
    const pool = await getPool();
    // Hash do registro anterior da mesma tabela (topo da corrente).
    const anterior = await pool.request().input("tabela", sql.NVarChar(50), tabela)
      .query(`SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = @tabela ORDER BY AuditId DESC`);
    const hashAnterior = anterior.recordset[0] ? (anterior.recordset[0].HashRegistro || "") : "";

    // O hash precisa ser calculado sobre EXATAMENTE os mesmos valores que
    // ficam gravados no banco (strings), senão a verificação da cadeia
    // (GET /api/auditoria/cadeia), que relê do banco, nunca vai bater —
    // ela reconstrói o payload a partir das colunas já persistidas.
    const registroIdNorm = registroId != null ? registroId : null;
    const dadosAntesStr = dadosAntes ? JSON.stringify(dadosAntes) : null;
    const dadosDepoisStr = dadosDepois ? JSON.stringify(dadosDepois) : null;
    const payload = JSON.stringify({ tabela, registroId: registroIdNorm, acao, usuarioId: usuarioId || null, dadosAntes: dadosAntesStr, dadosDepois: dadosDepoisStr });
    const hashRegistro = sha256(payload + hashAnterior);

    await pool.request()
      .input("tabela", sql.NVarChar(50), tabela)
      .input("registroId", sql.Int, registroIdNorm)
      .input("acao", sql.NVarChar(100), acao)
      .input("usuarioId", sql.Int, usuarioId || null)
      .input("dadosAntes", sql.NVarChar(sql.MAX), dadosAntesStr)
      .input("dadosDepois", sql.NVarChar(sql.MAX), dadosDepoisStr)
      .input("hashRegistro", sql.NVarChar(64), hashRegistro)
      .query(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro)
              VALUES (@tabela, @registroId, @acao, @usuarioId, @dadosAntes, @dadosDepois, @hashRegistro)`);
  } catch (e) {
    console.error("[AUDITORIA] falha ao gravar:", e.message);
  }
  return true;
}

module.exports = { registrarAuditoria, sha256 };
