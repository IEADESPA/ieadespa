// ListarReunioes
// Lista as sessões (abertas + encerradas) de QUALQUER órgão, com contagem de
// presentes/faltas/justificadas. Aceita ?orgaoId= pra filtrar só as sessões
// daquele órgão; sem filtro, traz de todos (aba Reuniões única).

const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const orgaoId = (req.query || {}).orgaoId;
  const pool = await getPool();
  const request = pool.request();

  let query = `
    SELECT s.SessaoId AS sessaoId, s.Descricao AS descricao,
           CONVERT(varchar(10), s.DataSessao, 120) AS dataSessao, s.Status AS status,
           o.OrgaoId AS orgaoId, o.Nome AS orgaoNome, o.Sigla AS orgaoSigla,
           SUM(CASE WHEN p.Presente = 1 THEN 1 ELSE 0 END) AS totalPresentes,
           SUM(CASE WHEN p.Presente = 0 THEN 1 ELSE 0 END) AS totalFaltas,
           SUM(CASE WHEN p.Presente = 0 AND p.FaltaJustificada = 1 THEN 1 ELSE 0 END) AS totalJustificadas
    FROM Sessoes s
    JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    LEFT JOIN Presencas p ON p.SessaoId = s.SessaoId
    WHERE s.Status <> 'CONVOCADA'`; // convocações pendentes da Assembleia aparecem só em ConvocarAssembleia, não aqui
  if (orgaoId) {
    query += ` AND s.OrgaoId = @orgaoId`;
    request.input("orgaoId", sql.Int, orgaoId);
  }
  query += ` GROUP BY s.SessaoId, s.Descricao, s.DataSessao, s.Status, o.OrgaoId, o.Nome, o.Sigla ORDER BY s.SessaoId DESC`;

  const result = await request.query(query);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
