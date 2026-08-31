// shared/auditoria.js
// Módulo interno reaproveitado por outras Functions (GestaoLideranca, EvoluirConsagracao, etc.)
// Espelha a função logAuditoria() do sistema atual (Google Apps Script),
// mas grava na tabela AuditLog do Azure SQL em vez de uma aba de planilha.

async function registrarAuditoria({ tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois }) {
  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // await pool.request()
  //   .input("tabela", sql.NVarChar, tabela)
  //   .input("registroId", sql.Int, registroId)
  //   .input("acao", sql.NVarChar, acao)
  //   .input("usuarioId", sql.Int, usuarioId || null)
  //   .input("dadosAntes", sql.NVarChar, dadosAntes ? JSON.stringify(dadosAntes) : null)
  //   .input("dadosDepois", sql.NVarChar, dadosDepois ? JSON.stringify(dadosDepois) : null)
  //   .query(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois)
  //           VALUES (@tabela, @registroId, @acao, @usuarioId, @dadosAntes, @dadosDepois)`);

  // ---- Modo local/mock: só loga no console até o SQL estar conectado ----
  console.log("[AUDITORIA]", { tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois, quando: new Date().toISOString() });
  return true;
}

module.exports = { registrarAuditoria };
