// ListarTentativasContato
// Exige a permissão "disciplina". GET /api/tentativas-contato?membroId=
// Devolve as tentativas do membro + o resultado da elegibilidade de Abandono Digital
// (Art. 12 §2º), pra a tela já mostrar quanto falta (canais distintos e/ou dias).
// Auditoria de escopo (02/10/2026): só do membro DENTRO do escopo. Membro de fora do escopo, inexistente ou malformado devolve EXATAMENTE a resposta de "sem tentativas"
// (a que a matrícula inexistente sempre deu) — a rota não serve de sonda nem entrega o texto livre das observações.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const abandonoDigital = require("../shared/abandonoDigital");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

function semTentativas() {
  return { tentativas: [], elegibilidade: { elegivel: false, canaisDistintos: 0, diasDesdePrimeira: null, ultimaTentativa: null } };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId } = req.query || {};
  if (!membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroId);
  if (!pessoa) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: semTentativas() };
    return;
  }

  const result = await pool.request().input("id", sql.Int, pessoa.membroId).query(`
    SELECT t.TentativaId AS tentativaId, t.CanalId AS canalId, c.Nome AS canal,
           CONVERT(varchar(10), t.DataTentativa, 120) AS dataTentativa, t.Observacao AS observacao
    FROM TentativasContatoAbandono t
    JOIN CanaisOficiaisComunicacao c ON c.CanalId = t.CanalId
    WHERE t.MembroId = @id
    ORDER BY t.DataTentativa ASC
  `);

  const elegibilidade = await abandonoDigital.elegibilidadeAbandonoDigital(pool, sql, pessoa.membroId);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { tentativas: result.recordset, elegibilidade }
  };
};
