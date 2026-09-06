// shared/enquetes.js (v2.8, Parte A)
// Quem pode votar numa Enquete: TODOS_ATIVOS reaproveita o mesmo universo
// "todo mundo ATIVO, em comunhão, sem disciplina" já usado pelo resto do
// sistema (shared/universo.js — mesmo padrão de "não é enquete se a pessoa
// já perdeu direitos"); LISTA_CUSTOM é a lista específica cadastrada em
// PublicoEnqueteCustom (ex: só os membros de um departamento).
const { universoDoOrgao } = require("./universo");

async function membrosElegiveis(pool, sql, enquete) {
  if (enquete.publicoTipo === "LISTA_CUSTOM") {
    const result = await pool.request().input("id", sql.Int, enquete.enqueteId)
      .query(`SELECT MembroId AS membroId FROM PublicoEnqueteCustom WHERE EnqueteId = @id`);
    return new Set(result.recordset.map(r => r.membroId));
  }
  const universo = await universoDoOrgao(pool, null);
  return new Set(universo.map(m => m.membroId));
}

module.exports = { membrosElegiveis };
