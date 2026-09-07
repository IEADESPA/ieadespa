// MeusOrgaosLocais (v4.2.2)
// Corrige um problema de escala: `GET /api/catalogos/orgaosLocais` (usado
// pelo submenu de Reuniões) devolve TODA JAI/JEA/TER/... do sistema
// inteiro, sem filtrar por quem está logado — um Pastor de Área via a lista
// inteira da denominação em vez de só as ~4 congregações da própria área, e
// um Dirigente de Congregação via até órgãos de outros estados. Este
// endpoint devolve só os órgãos territoriais dentro do escopo de quem
// pediu, reaproveitando o mesmo motor de sempre (Lideranca.EscopoTipo/
// EscopoId -> escopo.resolverEscopoCongregacoes), sem duplicar lógica —
// só junta órgão-a-órgão porque não existe um "resolverEscopoCongregacoes"
// inverso pronto (dado um órgão, quem tem escopo sobre ele).
// GET /api/meus-orgaos-locais
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const escopo = require("../shared/escopo");

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT OrgaoLocalId AS orgaoLocalId, Sigla AS sigla, Nome AS nome, Nivel AS nivel, ReferenciaId AS referenciaId
    FROM OrgaosLocais WHERE Ativo = 1
  `);

  if (usuario.escopoCongregacoes === "TODAS") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  const permitidos = [];
  for (const orgao of result.recordset) {
    const tipo = escopo.NIVEL_PARA_ESCOPO_TIPO[orgao.nivel];
    const nomesDoOrgao = await escopo.resolverEscopoCongregacoes(pool, tipo, orgao.referenciaId);
    if (nomesDoOrgao.some(nome => usuario.escopoCongregacoes.includes(nome))) permitidos.push(orgao);
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: permitidos };
};
