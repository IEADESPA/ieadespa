// SucessaoPresidencial (v2.5)
// Vacância e sucessão do Pastor Presidente (Art. 32) — só leitura, calculada
// a partir de Assentos (shared/diretoria.js, calcularSucessaoPresidencial).
// GET /api/diretoria/sucessao
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { calcularSucessaoPresidencial } = require("../shared/diretoria");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const pool = await getPool();
  const orgaosResult = await pool.request().query(`SELECT OrgaoId AS orgaoId, Sigla AS sigla FROM Orgaos WHERE Sigla IN ('DIRETORIA_EXECUTIVA', 'CEI')`);
  const orgaoIdDiretoria = orgaosResult.recordset.find(o => o.sigla === "DIRETORIA_EXECUTIVA");
  const orgaoIdCEI = orgaosResult.recordset.find(o => o.sigla === "CEI");
  if (!orgaoIdDiretoria || !orgaoIdCEI) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Diretoria Executiva ou CEI não estão cadastrados." } };
    return;
  }

  const sucessao = await calcularSucessaoPresidencial(pool, sql, orgaoIdDiretoria.orgaoId, orgaoIdCEI.orgaoId);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({ sucesso: true }, sucessao) };
};
