// shared/auditoria.js
// Módulo interno reaproveitado por outras Functions (GestaoLideranca, EvoluirConsagracao, etc.)
// Grava na tabela AuditLog do Azure SQL (não deixa a falha de auditoria derrubar a operação).

const { getPool, sql } = require("./db");

async function registrarAuditoria({ tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input("tabela", sql.NVarChar(50), tabela)
      .input("registroId", sql.Int, registroId)
      .input("acao", sql.NVarChar(100), acao)
      .input("usuarioId", sql.Int, usuarioId || null)
      .input("dadosAntes", sql.NVarChar(sql.MAX), dadosAntes ? JSON.stringify(dadosAntes) : null)
      .input("dadosDepois", sql.NVarChar(sql.MAX), dadosDepois ? JSON.stringify(dadosDepois) : null)
      .query(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois)
              VALUES (@tabela, @registroId, @acao, @usuarioId, @dadosAntes, @dadosDepois)`);
  } catch (e) {
    console.error("[AUDITORIA] falha ao gravar:", e.message);
  }
  return true;
}

module.exports = { registrarAuditoria };
