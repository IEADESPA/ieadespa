// shared/db.js
// Conexão única (pool) com o Azure SQL, reaproveitada por todas as Functions.
// Usa process.env.SQL_CONNECTION_STRING — definida em api/local.settings.json
// (desenvolvimento) e nas configurações da Function App (produção).
const sql = require("mssql");

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(process.env.SQL_CONNECTION_STRING);
    poolPromise.catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

// Helper: executa uma query com parâmetros tipados.
// Uso: await executar("SELECT ... WHERE X = @x", [{ nome: "x", tipo: sql.Int, valor: 1 }])
async function executar(query, inputs = []) {
  const pool = await getPool();
  const request = pool.request();
  for (const { nome, tipo, valor } of inputs) {
    request.input(nome, tipo, valor);
  }
  return request.query(query);
}

module.exports = { getPool, executar, sql };
