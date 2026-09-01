// ListarAuditoria
// Lista os registros de auditoria, com filtros opcionais por tabela, usuário ou data.
// Uso: painel "Auditoria e Gestão" da Secretaria.

const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const { tabela, usuarioId, de, ate } = req.query || {};
  const pool = await getPool();
  const request = pool.request();

  let query = `SELECT TOP 200 AuditId AS auditId, Tabela AS tabela, RegistroId AS registroId,
               Acao AS acao, UsuarioId AS usuarioId, CONVERT(varchar(33), DataHora, 126) AS dataHora
               FROM AuditLog WHERE 1=1`;
  if (tabela) { query += ` AND Tabela = @tabela`; request.input("tabela", sql.NVarChar(50), tabela); }
  if (usuarioId) { query += ` AND UsuarioId = @usuarioId`; request.input("usuarioId", sql.Int, usuarioId); }
  if (de) { query += ` AND DataHora >= @de`; request.input("de", sql.DateTime2, de); }
  if (ate) { query += ` AND DataHora <= @ate`; request.input("ate", sql.DateTime2, ate); }
  query += ` ORDER BY DataHora DESC`;

  const result = await request.query(query);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
