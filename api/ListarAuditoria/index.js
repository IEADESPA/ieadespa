// ListarAuditoria
// Lista os registros de auditoria, com filtros opcionais por tabela, usuário ou data.
// Uso: aba "Auditoria" da Secretaria (permissão "auditoria").
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "auditoria");
  if (!usuario) return;

  const { tabela, usuarioId, de, ate } = req.query || {};
  const pool = await getPool();
  const request = pool.request();

  let query = `SELECT TOP 200 a.AuditId AS auditId, a.Tabela AS tabela, a.RegistroId AS registroId,
               a.Acao AS acao, a.UsuarioId AS usuarioId, m.Nome AS usuarioNome,
               CONVERT(varchar(33), a.DataHora, 126) AS dataHora, a.DadosAntes AS dadosAntes, a.DadosDepois AS dadosDepois
               FROM AuditLog a
               LEFT JOIN MembroReferencia m ON m.MembroId = a.UsuarioId
               WHERE 1=1`;
  if (tabela) { query += ` AND a.Tabela = @tabela`; request.input("tabela", sql.NVarChar(50), tabela); }
  if (usuarioId) { query += ` AND a.UsuarioId = @usuarioId`; request.input("usuarioId", sql.Int, usuarioId); }
  if (de) { query += ` AND a.DataHora >= @de`; request.input("de", sql.DateTime2, de); }
  if (ate) { query += ` AND a.DataHora <= @ate`; request.input("ate", sql.DateTime2, ate); }
  query += ` ORDER BY a.DataHora DESC`;

  const result = await request.query(query);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
