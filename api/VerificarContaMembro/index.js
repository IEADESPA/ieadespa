// VerificarContaMembro (vC.3)
// Chamada pelo site (site/api/solicitarCodigoConta.js), servidor pra
// servidor, antes de criar uma conta nova em "Minha Conta" — sem login
// (anonymous), mas devolve só um booleano, nunca nome/matrícula/telefone ou
// qualquer outro dado pessoal: existe pra impedir que alguém crie uma conta
// solta no site com o mesmo e-mail de um membro ativo (devia usar o acesso
// de membro, não uma conta paralela) — nunca pra confirmar/expor se um
// e-mail arbitrário pertence a alguém específico.
// GET /api/verificar-conta-membro?email=fulano@exemplo.com
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  if (req.method !== "GET") {
    context.res = { status: 405, body: { erro: "Método não suportado." } };
    return;
  }

  const email = String((req.query || {}).email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    context.res = { status: 400, body: { erro: "Informe um e-mail válido." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("email", sql.NVarChar(150), email)
    .query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE LOWER(Email) = @email AND Status = 'ATIVO'`);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { ehMembroAtivo: result.recordset[0].Total > 0 }
  };
};
