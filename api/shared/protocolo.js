// shared/protocolo.js (vB.4 — Protocolo institucional único)
// Sequência atômica por Tipo+Ano — substitui o padrão `SELECT COUNT(*) ...
// WHERE Protocolo LIKE prefixo%` que cada módulo reinventava (Ouvidoria,
// Projetos): sob concorrência real, duas requisições podiam calcular o
// mesmo COUNT antes de qualquer uma inserir e gerar protocolo duplicado.
// MERGE com HOLDLOCK serializa a leitura+escrita na MESMA linha
// (Tipo, Ano), então mesmo duas requisições simultâneas nunca saem com o
// mesmo número.
const { sql } = require("./db");

async function proximoNumero(pool, tipo) {
  const ano = new Date().getFullYear();
  const resultado = await pool.request()
    .input("tipo", sql.NVarChar(10), tipo)
    .input("ano", sql.Int, ano)
    .query(`
      MERGE dbo.Protocolos WITH (HOLDLOCK) AS destino
      USING (SELECT @tipo AS Tipo, @ano AS Ano) AS origem
      ON destino.Tipo = origem.Tipo AND destino.Ano = origem.Ano
      WHEN MATCHED THEN UPDATE SET UltimoNumero = destino.UltimoNumero + 1
      WHEN NOT MATCHED THEN INSERT (Tipo, Ano, UltimoNumero) VALUES (@tipo, @ano, 1)
      OUTPUT INSERTED.UltimoNumero;
    `);
  return resultado.recordset[0].UltimoNumero;
}

// Máscara padrão do protocolo institucional único: TIPO-ANO-NNNN (ex:
// DISC-2026-0007). Quem precisa de formato próprio (Ouvidoria: sufixo
// aleatório contra enumeração, dado o sigilo do denunciante — Art. 104)
// chama proximoNumero() direto e monta o próprio formato por cima.
async function gerarProtocolo(pool, tipo, { digitos = 4 } = {}) {
  const ano = new Date().getFullYear();
  const numero = await proximoNumero(pool, tipo);
  return `${tipo}-${ano}-${String(numero).padStart(digitos, "0")}`;
}

module.exports = { proximoNumero, gerarProtocolo };
