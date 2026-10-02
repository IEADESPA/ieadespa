// shared/orgaosLocaisEscopo.js
// Quais órgãos territoriais (OrgaosLocais: JAI, JEA, TER, CRA, CEQ, CDE...) estão dentro do escopo de quem pede? Mesma regra de MeusOrgaosLocais: o órgão está no escopo
// quando o território dele (a congregação, a área, a região, o quadrante ou o distrito a que se refere) alcança alguma congregação do escopo da sessão.
// Escopo "TODAS" alcança todos. Órgão sem nível conhecido (ou cujo território resolve para "todas") só é alcançado por quem tem escopo "TODAS": falha fechado.
const escopo = require("./escopo");

// `ids`: OrgaoLocalId de interesse (do próprio banco, nunca de texto digitado). Devolve um Set com os que estão no escopo.
async function orgaosLocaisNoEscopo(pool, usuario, ids) {
  const unicos = Array.from(new Set((ids || []).map(Number).filter(Number.isInteger)));
  if (unicos.length === 0) return new Set();
  if (usuario && usuario.escopoCongregacoes === "TODAS") return new Set(unicos);
  const lista = usuario && Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : [];
  if (lista.length === 0) return new Set();

  const orgaos = (await pool.request().query(
    `SELECT OrgaoLocalId, Nivel, ReferenciaId FROM OrgaosLocais WHERE OrgaoLocalId IN (${unicos.join(",")})`
  )).recordset;
  const permitidos = new Set();
  for (const orgao of orgaos) {
    const tipo = escopo.NIVEL_PARA_ESCOPO_TIPO[orgao.Nivel];
    if (!tipo) continue;
    const nomes = await escopo.resolverEscopoCongregacoes(pool, tipo, orgao.ReferenciaId);
    if (Array.isArray(nomes) && nomes.some((nome) => lista.includes(nome))) permitidos.add(orgao.OrgaoLocalId);
  }
  return permitidos;
}

module.exports = { orgaosLocaisNoEscopo };
