// shared/orgaosLocaisEscopo.js
// Quais órgãos territoriais (OrgaosLocais: JAI, JEA, TER, CRA, CEQ, CDE...) estão dentro do escopo de quem pede? Mesma regra de MeusOrgaosLocais: o órgão está no escopo
// quando o território dele (a congregação, a área, a região, o quadrante ou o distrito a que se refere) alcança alguma congregação do escopo da sessão.
// Escopo "TODAS" alcança todos. Órgão sem nível conhecido (ou cujo território resolve para "todas") só é alcançado por quem tem escopo "TODAS": falha fechado.
const { sql } = require("./db");

// Raio-x de velocidade 3 (17/11/2026): as congregações do território de CADA órgão numa consulta só (antes, uma consulta por órgão — 45 numa lista de reuniões, 79 em
// MeusOrgaosLocais). A mesma resolução de escopo.resolverEscopoCongregacoes, nível a nível (1 congregação, 2 área, 3 região, 4 quadrante, 5 distrito); órgão de nível
// desconhecido ou sem referência não traz congregação nenhuma (falha fechado). `ids`: OrgaoLocalId do próprio banco. Devolve Map(orgaoLocalId -> [nomes]).
async function congregacoesPorOrgaoLocal(pool, ids) {
  const unicos = Array.from(new Set((ids || []).map(Number).filter(Number.isInteger)));
  const mapa = new Map(unicos.map((id) => [id, []]));
  if (unicos.length === 0) return mapa;
  const linhas = (await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(unicos)).query(`
    SELECT o.OrgaoLocalId AS orgaoLocalId, c.Nome AS nome
    FROM OrgaosLocais o
    JOIN Congregacoes c ON
         (o.Nivel = 1 AND c.CongregacaoId = o.ReferenciaId)
      OR (o.Nivel = 2 AND c.AreaId = o.ReferenciaId)
      OR (o.Nivel = 3 AND c.AreaId IN (SELECT a.AreaId FROM Areas a WHERE a.RegiaoId = o.ReferenciaId))
      OR (o.Nivel = 4 AND c.AreaId IN (SELECT a.AreaId FROM Areas a JOIN Regioes r ON r.RegiaoId = a.RegiaoId WHERE r.QuadranteId = o.ReferenciaId))
      OR (o.Nivel = 5 AND c.AreaId IN (SELECT a.AreaId FROM Areas a JOIN Regioes r ON r.RegiaoId = a.RegiaoId
                                        JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE q.DistritoId = o.ReferenciaId))
    WHERE o.OrgaoLocalId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`)).recordset;
  for (const l of linhas) {
    const lista = mapa.get(Number(l.orgaoLocalId));
    if (lista && l.nome) lista.push(l.nome);
  }
  return mapa;
}

// `ids`: OrgaoLocalId de interesse (do próprio banco, nunca de texto digitado). Devolve um Set com os que estão no escopo.
async function orgaosLocaisNoEscopo(pool, usuario, ids) {
  const unicos = Array.from(new Set((ids || []).map(Number).filter(Number.isInteger)));
  if (unicos.length === 0) return new Set();
  if (usuario && usuario.escopoCongregacoes === "TODAS") return new Set(unicos);
  const lista = usuario && Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : [];
  if (lista.length === 0) return new Set();

  const territorio = await congregacoesPorOrgaoLocal(pool, unicos);
  const permitidos = new Set();
  for (const [id, nomes] of territorio) if (nomes.some((nome) => lista.includes(nome))) permitidos.add(id);
  return permitidos;
}

module.exports = { orgaosLocaisNoEscopo, congregacoesPorOrgaoLocal };
