// ListarAuditoria
// Lista os registros de auditoria, com filtros opcionais por tabela, usuário ou data.
// Uso: painel "Auditoria e Gestão" da Secretaria (equivalente ao que hoje é a aba tb_Auditoria).

const MOCK_DATA = [
  { auditId: 1, tabela: "Consagracoes", registroId: 12, acao: "Evoluiu processo", usuarioId: 3, dataHora: "2026-08-20T14:02:00Z" },
  { auditId: 2, tabela: "Presencas", registroId: 45, acao: "Abonou falta", usuarioId: 3, dataHora: "2026-08-21T09:15:00Z" },
  { auditId: 3, tabela: "Lideranca", registroId: 7, acao: "Concedeu liderança", usuarioId: 1, dataHora: "2026-08-22T18:40:00Z" }
];

module.exports = async function (context, req) {
  const { tabela, usuarioId, de, ate } = req.query || {};

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // let query = `SELECT TOP 200 * FROM AuditLog WHERE 1=1`;
  // const request = pool.request();
  // if (tabela) { query += ` AND Tabela = @tabela`; request.input("tabela", sql.NVarChar, tabela); }
  // if (usuarioId) { query += ` AND UsuarioId = @usuarioId`; request.input("usuarioId", sql.Int, usuarioId); }
  // if (de) { query += ` AND DataHora >= @de`; request.input("de", sql.DateTime2, de); }
  // if (ate) { query += ` AND DataHora <= @ate`; request.input("ate", sql.DateTime2, ate); }
  // query += ` ORDER BY DataHora DESC`;
  // const result = await request.query(query);
  // context.res = { status: 200, body: result.recordset };
  // return;

  let filtrados = MOCK_DATA;
  if (tabela) filtrados = filtrados.filter(r => r.tabela.toLowerCase() === String(tabela).toLowerCase());
  if (usuarioId) filtrados = filtrados.filter(r => String(r.usuarioId) === String(usuarioId));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: filtrados
  };
};
