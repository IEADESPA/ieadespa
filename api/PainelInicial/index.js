// PainelInicial (vB.7 — Painel inicial por perfil)
// "O que aquela pessoa precisa decidir hoje" — blocos reunidos, nenhum
// cálculo novo (ver shared/painelBlocos.js). Qualquer sessão válida vê os
// blocos "meus" (notificações, tarefas); os demais só aparecem pra quem
// já receberia a notificação equivalente (mesma regra de NotificacaoRegras).
// GET /api/painel-inicial
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { montarPainelInicial } = require("../shared/painelBlocos");

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();
  const blocos = await montarPainelInicial(pool, usuario);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: blocos };
};
