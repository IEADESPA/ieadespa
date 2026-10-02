// ListarAuditoria
// Lista os registros de auditoria, com filtros opcionais por tabela, usuário ou data.
// Uso: aba "Auditoria" da Secretaria (permissão "auditoria").
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  // A trilha é da igreja toda (a tabela AuditLog não tem congregação e guarda o antes/depois de qualquer cadastro, até de processo disciplinar): só o nível GERAL
  // (papel Global E escopo de todas as congregações) com a permissão de auditoria. Papel local com "auditoria", ou Global com escopo de lista, é recusado.
  const usuario = exigirGeral(req, context, "auditoria");
  if (!usuario) return;

  const { tabela, usuarioId, de, ate } = req.query || {};
  const dataInvalida = (v) => v && Number.isNaN(Date.parse(v));
  if ((tabela && (typeof tabela !== "string" || tabela.length > 50)) || (usuarioId && !auth.idDeRota(usuarioId)) || dataInvalida(de) || dataInvalida(ate)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Filtro inválido (tabela, usuarioId ou data)." } };
    return;
  }
  const pool = await getPool();
  const request = pool.request();

  let query = `SELECT TOP 200 a.AuditId AS auditId, a.Tabela AS tabela, a.RegistroId AS registroId,
               a.Acao AS acao, a.UsuarioId AS usuarioId, m.Nome AS usuarioNome,
               CONVERT(varchar(33), a.DataHora, 126) AS dataHora, a.DadosAntes AS dadosAntes, a.DadosDepois AS dadosDepois
               FROM AuditLog a
               LEFT JOIN MembroReferencia m ON m.MembroId = a.UsuarioId
               WHERE 1=1`;
  if (tabela) { query += ` AND a.Tabela = @tabela`; request.input("tabela", sql.NVarChar(50), tabela); }
  if (usuarioId) { query += ` AND a.UsuarioId = @usuarioId`; request.input("usuarioId", sql.Int, auth.idDeRota(usuarioId)); }
  if (de) { query += ` AND a.DataHora >= @de`; request.input("de", sql.DateTime2, de); }
  if (ate) { query += ` AND a.DataHora <= @ate`; request.input("ate", sql.DateTime2, ate); }
  query += ` ORDER BY a.DataHora DESC`;

  const result = await request.query(query);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
