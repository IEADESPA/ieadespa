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
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// fecho da v7.5 — rota anônima que responde "este e-mail é de membro ativo?": sem limite, serviria para varrer e-mails. Contenção por origem (o site chama de um servidor só,
// uma vez por criação de conta). O ideal é um segredo servidor a servidor entre o site e esta API (pede configurar a mesma chave nos dois Static Web Apps).
const limitador = criarLimitador({ janelaMs: 60000, maximo: 20 });

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas consultas seguidas. Aguarde um minuto." } };
    return;
  }
  if (req.method !== "GET") {
    context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }

  const email = String((req.query || {}).email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe um e-mail válido." } };
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
