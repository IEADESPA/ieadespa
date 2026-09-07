// ConsultarProtocoloOuvidoria (v3.7)
// GET /api/ouvidoria-protocolo/{protocolo} — SEM login: o protocolo é a
// própria credencial (única forma de um denunciante anônimo acompanhar).
// Devolve só o status, nunca o relato/denunciado/denunciante.
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const protocolo = context.bindingData.protocolo;
  if (!protocolo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o protocolo na rota." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("protocolo", sql.NVarChar(30), protocolo).query(`
    SELECT Tipo AS tipo, Status AS status, CONVERT(varchar(10), DataProtocolo, 120) AS dataProtocolo
    FROM DenunciasOuvidoria WHERE Protocolo = @protocolo
  `);
  if (result.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Protocolo não encontrado." } };
    return;
  }
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, ...result.recordset[0] } };
};
