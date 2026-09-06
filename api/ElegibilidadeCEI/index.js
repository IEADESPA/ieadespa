// ElegibilidadeCEI (v3.1)
// GET /api/elegibilidade-cei/{membroId} — checagem INFORMATIVA dos requisitos
// do Art. 88 §2º pra ocupar o CEI/Corte Suprema Eclesiástica. Nunca bloqueia
// sozinha a criação do Assento (ver shared/estatuto.js::avaliarElegibilidadeCEI)
// — quem decide a indicação continua sendo o Pastor Presidente (Art. 89 §1º).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { dadosElegibilidadeCEI } = require("../shared/cei");
const estatuto = require("../shared/estatuto");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const membroId = context.bindingData.membroId;
  if (!membroId) {
    context.res = { status: 400, body: { erro: "Informe o membroId na rota: /api/elegibilidade-cei/{membroId}" } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  const dados = await dadosElegibilidadeCEI(pool, sql, membroId);
  const avaliacao = estatuto.avaliarElegibilidadeCEI(dados);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({ sucesso: true }, avaliacao) };
};
