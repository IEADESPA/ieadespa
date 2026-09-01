// TrocarSenha
// Self-service: quem já está logado (tem Lideranca) troca a própria senha.
// Não pede a senha atual — a sessão (token) já é a prova de identidade.
// POST /api/auth/senha   body: { novaSenha }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const { novaSenha } = req.body || {};
  if (!novaSenha || !String(novaSenha).trim()) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a nova senha." } };
    return;
  }

  const pool = await getPool();
  const senhaHash = auth.hashSenha(novaSenha);
  const upd = await pool.request().input("id", sql.Int, usuario.membroId).input("senhaHash", sql.NVarChar(200), senhaHash)
    .query(`UPDATE Lideranca SET SenhaHash = @senhaHash WHERE MembroId = @id`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não encontrei seu acesso à Secretaria." } };
    return;
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Senha alterada." } };
};
