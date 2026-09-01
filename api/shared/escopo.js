// shared/escopo.js
// Resolve um escopo de Lideranca (nível da Governança Escalonada) na lista de
// nomes de Congregacoes que caem dentro dele. LoginSecretaria grava essa lista
// já resolvida no token — assim o resto do app (auth.estaNoEscopo e as rotas
// que filtram por congregação) nunca precisa saber nada sobre Areas/Regioes/
// Quadrantes/Distritos, só compara nomes de congregação.
//
// "Extensão da Tenda" (nível 0) não entra aqui: MembroReferencia não tem
// vínculo com ExtensoesTenda (só com Congregacoes), então não existe hoje
// como calcular "quem está sob essa extensão" — precisa de uma coluna nova
// no cadastro de pessoas antes de virar uma opção de escopo de verdade.
const { sql } = require("./db");

const QUERY_POR_TIPO = {
  CONGREGACAO: `SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`,
  AREA: `SELECT Nome FROM Congregacoes WHERE AreaId = @id`,
  REGIAO: `SELECT Nome FROM Congregacoes WHERE AreaId IN (
             SELECT AreaId FROM Areas WHERE RegiaoId = @id
           )`,
  QUADRANTE: `SELECT Nome FROM Congregacoes WHERE AreaId IN (
                SELECT AreaId FROM Areas WHERE RegiaoId IN (
                  SELECT RegiaoId FROM Regioes WHERE QuadranteId = @id
                )
              )`,
  DISTRITO: `SELECT Nome FROM Congregacoes WHERE AreaId IN (
               SELECT AreaId FROM Areas WHERE RegiaoId IN (
                 SELECT RegiaoId FROM Regioes WHERE QuadranteId IN (
                   SELECT QuadranteId FROM Quadrantes WHERE DistritoId = @id
                 )
               )
             )`
};

// Retorna "TODAS" (acesso geral) ou um array de nomes de Congregacoes (pode
// vir vazio, se o nível escolhido não tiver nenhuma congregação embaixo —
// resultado vazio é o modo seguro: a pessoa não vê ninguém, nunca "todo mundo").
async function resolverEscopoCongregacoes(pool, escopoTipo, escopoId) {
  if (!escopoTipo || escopoTipo === "GLOBAL" || !escopoId) return "TODAS";

  const query = QUERY_POR_TIPO[escopoTipo];
  if (!query) return [];

  const result = await pool.request().input("id", sql.Int, escopoId).query(query);
  return result.recordset.map(r => r.Nome);
}

module.exports = { resolverEscopoCongregacoes };
