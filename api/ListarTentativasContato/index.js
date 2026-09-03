// ListarTentativasContato
// Exige a permissão "disciplina". GET /api/tentativas-contato?membroId=
// Devolve as tentativas do membro + o resultado da elegibilidade de Abandono Digital
// (Art. 12 §2º), pra a tela já mostrar quanto falta (canais distintos e/ou dias).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const abandonoDigital = require("../shared/abandonoDigital");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId } = req.query || {};
  if (!membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT t.TentativaId AS tentativaId, t.CanalId AS canalId, c.Nome AS canal,
           CONVERT(varchar(10), t.DataTentativa, 120) AS dataTentativa, t.Observacao AS observacao
    FROM TentativasContatoAbandono t
    JOIN CanaisOficiaisComunicacao c ON c.CanalId = t.CanalId
    WHERE t.MembroId = @id
    ORDER BY t.DataTentativa ASC
  `);

  const elegibilidade = await abandonoDigital.elegibilidadeAbandonoDigital(pool, sql, membroId);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { tentativas: result.recordset, elegibilidade }
  };
};
