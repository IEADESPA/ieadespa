// shared/escopo.js
// Resolve um escopo de Lideranca (nível da Governança Escalonada) na lista de
// nomes de Congregacoes que caem dentro dele. LoginSecretaria grava essa lista
// já resolvida no token — assim o resto do app (auth.estaNoEscopo e as rotas
// que filtram por congregação) nunca precisa saber nada sobre Areas/Regioes/
// Quadrantes/Distritos, só compara nomes de congregação.
//
// "Extensão da Tenda" (nível 0) é sub-unidade de uma Congregação-Mãe, não uma
// Congregacao própria — por isso, pros fins de reunião/frequência/justificativa
// (que são por Congregação), o escopo EXTENSAO resolve pra Congregação-Mãe,
// igual ao escopo CONGREGACAO. A granularidade fina (só quem está naquela
// Extensão) é resolvida à parte por resolverNomeExtensao, usada só onde a
// pessoa em si tem ExtensaoId (GestaoPessoas) — ver auth.js / GestaoPessoas.
const { sql } = require("./db");

const QUERY_POR_TIPO = {
  CONGREGACAO: `SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`,
  EXTENSAO: `SELECT c.Nome FROM Congregacoes c
               JOIN ExtensoesTenda e ON e.CongregacaoMaeId = c.CongregacaoId
              WHERE e.ExtensaoId = @id`,
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

// Só pra escopo EXTENSAO: nome da própria Extensão (não da Congregação-Mãe),
// usado por GestaoPessoas pra restringir a lista só a quem tem esse ExtensaoId
// — sem isso, um escopo "Extensão" equivaleria a ver a Congregação-Mãe inteira.
async function resolverNomeExtensao(pool, escopoTipo, escopoId) {
  if (escopoTipo !== "EXTENSAO" || !escopoId) return null;
  const result = await pool.request().input("id", sql.Int, escopoId).query(
    `SELECT Nome FROM ExtensoesTenda WHERE ExtensaoId = @id`
  );
  return result.recordset[0] ? result.recordset[0].Nome : null;
}

module.exports = { resolverEscopoCongregacoes, resolverNomeExtensao };
