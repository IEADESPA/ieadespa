// ListarReunioes
// Lista as sessões (abertas + encerradas) de QUALQUER órgão, com contagem de
// presentes/faltas/justificadas. Aceita ?orgaoId= pra filtrar só as sessões
// daquele órgão; sem filtro, traz de todos (aba Reuniões única).

const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const { orgaoId, orgaoLocalId } = req.query || {};
  const pool = await getPool();
  const request = pool.request();

  let query = `
    SELECT s.SessaoId AS sessaoId, s.Descricao AS descricao,
           CONVERT(varchar(10), s.DataSessao, 120) AS dataSessao, s.Status AS status,
           s.OrgaoId AS orgaoId, s.OrgaoLocalId AS orgaoLocalId,
           COALESCE(o.Nome, ol.Nome) AS orgaoNome, COALESCE(o.Sigla, ol.Sigla) AS orgaoSigla,
           SUM(CASE WHEN p.Presente = 1 THEN 1 ELSE 0 END) AS totalPresentes,
           SUM(CASE WHEN p.Presente = 0 THEN 1 ELSE 0 END) AS totalFaltas,
           SUM(CASE WHEN p.Presente = 0 AND p.FaltaJustificada = 1 THEN 1 ELSE 0 END) AS totalJustificadas
    FROM Sessoes s
    LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = s.OrgaoLocalId
    LEFT JOIN Presencas p ON p.SessaoId = s.SessaoId
    WHERE s.Status <> 'CONVOCADA'`; // convocações pendentes da Assembleia aparecem só em ConvocarAssembleia, não aqui
  if (orgaoId) {
    query += ` AND s.OrgaoId = @orgaoId`;
    request.input("orgaoId", sql.Int, orgaoId);
  }
  if (orgaoLocalId) {
    query += ` AND s.OrgaoLocalId = @orgaoLocalId`;
    request.input("orgaoLocalId", sql.Int, orgaoLocalId);
  }
  query += ` GROUP BY s.SessaoId, s.Descricao, s.DataSessao, s.Status, s.OrgaoId, s.OrgaoLocalId, o.Nome, o.Sigla, ol.Nome, ol.Sigla ORDER BY s.SessaoId DESC`;

  const result = await request.query(query);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
