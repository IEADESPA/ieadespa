// LogoutSecretaria
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  // v7.6 — o token vem por onde a aplicação manda (x-auth-token, com Authorization de reserva: auth.extrairToken); sair encerra a sessão DE VERDADE (o token
  // deixa de valer em segundos em qualquer instância, e na hora nesta).
  const token = auth.extrairToken(req);
  if (token) {
    const pool = await getPool();
    await auth.encerrarSessao(pool, sql, token);
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true } };
};
