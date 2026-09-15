// shared/parecerViabilidade.js (vB.14 — Conselho Consultivo Técnico, Art. 31)
// Parecer de Viabilidade é pré-condição de ato de alto impacto patrimonial.
// O único ato desse tipo que o sistema já modela de verdade é alienação de
// bem (GestaoAlienacoesBens, v4.11) — "aquisição de imóvel" e "contratação
// de empréstimo" não têm módulo correspondente ainda (varredura confirmou
// zero ocorrência no código), documentado como gap no README, não fabricado
// aqui. O travamento é real onde o ato é real.
const { sql } = require("./db");

async function limiteParecerViabilidade(pool) {
  const r = await pool.request().query(`SELECT ValorLimite FROM ParametrosParecerViabilidade WHERE ParametroId = 1`);
  return r.recordset[0] ? Number(r.recordset[0].ValorLimite) : Infinity;
}

// Art. 31 — só quem tem assento ativo no Conselho Consultivo Técnico pode
// emitir o parecer (não é "qualquer um com permissão financeiro").
async function membroNoConselhoConsultivo(pool, membroId) {
  const r = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT 1 FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE o.Sigla = 'CONSELHO_CONSULTIVO_TECNICO' AND a.MembroId = @membroId AND a.DataFim IS NULL
  `);
  return r.recordset.length > 0;
}

async function possuiParecerFavoravel(pool, alienacaoId) {
  const r = await pool.request().input("id", sql.Int, alienacaoId).query(`
    SELECT 1 FROM PareceresViabilidadeAlienacao WHERE AlienacaoId = @id AND Decisao = 'FAVORAVEL'
  `);
  return r.recordset.length > 0;
}

async function registrarParecer(pool, { alienacaoId, decisao, justificativa, emitidoPor }) {
  const inserido = await pool.request()
    .input("alienacaoId", sql.Int, alienacaoId).input("decisao", sql.NVarChar(20), decisao)
    .input("justificativa", sql.NVarChar(500), justificativa || null).input("emitidoPor", sql.Int, emitidoPor)
    .query(`INSERT INTO PareceresViabilidadeAlienacao (AlienacaoId, Decisao, Justificativa, EmitidoPor)
            OUTPUT INSERTED.ParecerId VALUES (@alienacaoId, @decisao, @justificativa, @emitidoPor)`);
  return inserido.recordset[0].ParecerId;
}

module.exports = { limiteParecerViabilidade, membroNoConselhoConsultivo, possuiParecerFavoravel, registrarParecer };
