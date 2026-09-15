// LogoutSecretaria
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const [, token] = header.split(" ");
  if (token) {
    const pool = await getPool();
    await auth.encerrarSessao(pool, sql, token);
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true } };
};
