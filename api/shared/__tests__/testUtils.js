// testUtils.js — fake mínimo do driver mssql pra testar as funções de
// shared/ que recebem (pool, sql) sem precisar de um Azure SQL real.
// Cada chamada a `pool.request()...query(...)` consome um recordset da
// fila, na ordem em que as funções testadas fazem as chamadas (a mesma
// ordem em que o código-fonte as declara) — sem interpretar o SQL em si.

function criarPoolFalso(recordsets) {
  const fila = [...recordsets];
  const chamadas = [];
  const pool = {
    request: () => {
      const inputs = {};
      const req = {
        input: (nome, _tipo, valor) => { inputs[nome] = valor; return req; },
        query: async (sqlTexto) => {
          chamadas.push({ inputs: Object.assign({}, inputs), sql: sqlTexto });
          if (fila.length === 0) throw new Error("mock de pool ficou sem recordsets — faltou empilhar um resultado pra esta chamada de query()");
          return { recordset: fila.shift() };
        }
      };
      return req;
    }
  };
  return { pool, chamadas };
}

// sql.Int, sql.NVarChar(30), sql.Decimal(10,2) etc. — só precisam existir e
// não quebrar; o mock de .input() acima ignora o tipo mesmo.
const sqlFalso = new Proxy({}, { get: () => (() => undefined) });

module.exports = { criarPoolFalso, sqlFalso };
