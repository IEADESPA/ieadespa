// LogoutSecretaria
const auth = require("../shared/auth");

module.exports = async function (context, req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const [, token] = header.split(" ");
  if (token) auth.encerrarSessao(token);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true } };
};
