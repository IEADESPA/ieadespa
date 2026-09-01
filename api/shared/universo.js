// shared/universo.js
// Universo de "quem deveria estar presente" por órgão — mesma regra usada por
// RegistrarPresenca, EncerrarReuniao e ListarFrequencia (equivalente ao antigo
// mockDb.universoDoOrgao, mantido lá só como referência histórica):
// - ASSEMBLEIA_GERAL: quem tem capacidade ativa (Art. 23 §1º) — calculado.
// - CLI: composição mista do Art. 15 — por Ordenação (Pastor/Evangelista/
//   Presbítero, ATIVO) UNIÃO com Assentos por Função ativos (Diretoria,
//   Conselho Fiscal, CEI, Dirigente de Congregação, Líder Geral).
// - Demais órgãos: todo mundo ATIVO (mesma simplificação de sempre enquanto
//   não há um universo mais específico definido).
const { sql } = require("./db");
const estatuto = require("./estatuto");

async function universoDoOrgao(pool, orgao) {
  if (!orgao) {
    const result = await pool.request().query(
      `SELECT MembroId AS membroId, Nome AS nome FROM MembroReferencia WHERE Status = 'ATIVO'`
    );
    return result.recordset;
  }

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    const result = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao,
             m.Status AS status, m.SituacaoMembro AS situacaoMembro,
             CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             m.DizimistaFiel AS dizimistaFiel
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    `);
    return result.recordset.filter(m => estatuto.calcularCapacidadeEleitoral(m).capacidadeAtiva);
  }

  if (orgao.sigla === "CLI") {
    const porOrdenacao = await pool.request().query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
      FROM MembroReferencia m
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE m.Status = 'ATIVO' AND m.Funcao IN ('Pastor', 'Evangelista', 'Presbítero')
    `);
    const idsPorOrdenacao = new Set(porOrdenacao.recordset.map(m => m.membroId));
    const porFuncao = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
      SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
      FROM Assentos a
      JOIN MembroReferencia m ON m.MembroId = a.MembroId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE a.OrgaoId = @orgaoId AND a.DataFim IS NULL
    `);
    return porOrdenacao.recordset.concat(porFuncao.recordset.filter(m => !idsPorOrdenacao.has(m.membroId)));
  }

  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, c.Nome AS congregacao
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.Status = 'ATIVO'
  `);
  return result.recordset;
}

module.exports = { universoDoOrgao };
