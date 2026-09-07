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

// v3.6.2 — direção inversa de QUERY_POR_TIPO: dado um OrgaosLocais
// (Nivel 1..5 = Congregação..Distrito), sobe a cadeia territorial até achar
// os ids ancestrais em cada nível. Usado por membroAutorizadoNoOrgaoLocal e
// pelo fallback territorial de shared/universo.js.
const NIVEL_PARA_ESCOPO_TIPO = { 1: "CONGREGACAO", 2: "AREA", 3: "REGIAO", 4: "QUADRANTE", 5: "DISTRITO" };

async function ancestraisTerritoriais(pool, sql, nivel, referenciaId) {
  let congregacaoId = null, areaId = null, regiaoId = null, quadranteId = null, distritoId = null;

  if (nivel === 1) {
    congregacaoId = referenciaId;
    const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT AreaId FROM Congregacoes WHERE CongregacaoId = @id`);
    areaId = r.recordset[0] ? r.recordset[0].AreaId : null;
  } else if (nivel === 2) {
    areaId = referenciaId;
  }

  if (areaId && regiaoId === null) {
    const r = await pool.request().input("id", sql.Int, areaId).query(`SELECT RegiaoId FROM Areas WHERE AreaId = @id`);
    regiaoId = r.recordset[0] ? r.recordset[0].RegiaoId : null;
  }
  if (nivel === 3) regiaoId = referenciaId;

  if (regiaoId && quadranteId === null) {
    const r = await pool.request().input("id", sql.Int, regiaoId).query(`SELECT QuadranteId FROM Regioes WHERE RegiaoId = @id`);
    quadranteId = r.recordset[0] ? r.recordset[0].QuadranteId : null;
  }
  if (nivel === 4) quadranteId = referenciaId;

  if (quadranteId && distritoId === null) {
    const r = await pool.request().input("id", sql.Int, quadranteId).query(`SELECT DistritoId FROM Quadrantes WHERE QuadranteId = @id`);
    distritoId = r.recordset[0] ? r.recordset[0].DistritoId : null;
  }
  if (nivel === 5) distritoId = referenciaId;

  return { congregacaoId, areaId, regiaoId, quadranteId, distritoId };
}

// Autoriza se a pessoa tem Lideranca ATIVA com EscopoTipo='GLOBAL', ou com o
// EscopoTipo/EscopoId de QUALQUER nível ancestral do órgão territorial — ex:
// um Pastor de Área (EscopoTipo=AREA) autoriza tanto a JEA/JUC da própria
// Área quanto a JAI de qualquer Congregação daquela Área (hierarquia "desce"
// pro órgão, então uma Lideranca de nível mais alto sempre cobre os de baixo).
async function membroAutorizadoNoOrgaoLocal(pool, sql, membroId, orgaoLocalId) {
  const orgaoResult = await pool.request().input("id", sql.Int, orgaoLocalId).query(`SELECT Nivel, ReferenciaId FROM OrgaosLocais WHERE OrgaoLocalId = @id`);
  const orgao = orgaoResult.recordset[0];
  if (!orgao) return false;

  const { congregacaoId, areaId, regiaoId, quadranteId, distritoId } = await ancestraisTerritoriais(pool, sql, orgao.Nivel, orgao.ReferenciaId);

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("areaId", sql.Int, areaId)
    .input("regiaoId", sql.Int, regiaoId)
    .input("quadranteId", sql.Int, quadranteId)
    .input("distritoId", sql.Int, distritoId)
    .query(`
      SELECT TOP 1 LiderancaId FROM Lideranca
      WHERE MembroId = @membroId AND (AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
        AND (
          EscopoTipo = 'GLOBAL'
          OR (EscopoTipo = 'CONGREGACAO' AND EscopoId = @congregacaoId)
          OR (EscopoTipo = 'AREA' AND EscopoId = @areaId)
          OR (EscopoTipo = 'REGIAO' AND EscopoId = @regiaoId)
          OR (EscopoTipo = 'QUADRANTE' AND EscopoId = @quadranteId)
          OR (EscopoTipo = 'DISTRITO' AND EscopoId = @distritoId)
        )
    `);
  return result.recordset.length > 0;
}

// Generaliza a resolução de "órgão central OU territorial" (exatamente 1 dos
// dois) — mesma ideia usada antes só em shared/disciplinar.js::validarOrgaoProcesso,
// agora reaproveitável por Reuniões também. Quem precisar restringir por
// sigla (ex: disciplina, só JAI/JEA/TER) filtra por cima do retorno.
async function resolverOrgao(pool, sql, { orgaoId, orgaoLocalId }) {
  if ((orgaoId && orgaoLocalId) || (!orgaoId && !orgaoLocalId)) {
    return { valido: false, mensagem: "Informe exatamente um órgão: orgaoId (central) ou orgaoLocalId (territorial)." };
  }
  if (orgaoId) {
    const orgao = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT Sigla, Nome FROM Orgaos WHERE OrgaoId = @id`);
    if (orgao.recordset.length === 0) return { valido: false, mensagem: "Órgão inválido." };
    return { valido: true, orgaoId, orgaoLocalId: null, sigla: orgao.recordset[0].Sigla, nome: orgao.recordset[0].Nome };
  }
  const orgaoLocal = await pool.request().input("id", sql.Int, orgaoLocalId).query(`SELECT Sigla, Nome, Nivel, ReferenciaId, Ativo FROM OrgaosLocais WHERE OrgaoLocalId = @id`);
  if (orgaoLocal.recordset.length === 0 || !orgaoLocal.recordset[0].Ativo) {
    return { valido: false, mensagem: "Órgão territorial inválido ou inativo." };
  }
  const row = orgaoLocal.recordset[0];
  return { valido: true, orgaoId: null, orgaoLocalId, sigla: row.Sigla, nome: row.Nome, nivel: row.Nivel, referenciaId: row.ReferenciaId };
}

module.exports = {
  resolverEscopoCongregacoes, resolverNomeExtensao,
  NIVEL_PARA_ESCOPO_TIPO, ancestraisTerritoriais, membroAutorizadoNoOrgaoLocal, resolverOrgao
};
