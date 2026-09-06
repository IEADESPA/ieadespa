// shared/disciplinar.js (v3.2)
// SELECT compartilhado por AbrirProcessoDisciplinar/EvoluirProcessoDisciplinar/
// ListarProcessosDisciplinares — evita duplicar a mesma query+agregação de
// infrações em 3 arquivos.
const estatuto = require("./estatuto");

const SELECT_PROCESSO_BASE = `
  SELECT p.ProcessoId AS processoId, p.MembroId AS membroId, m.Nome AS nome,
         p.OrgaoResponsavelId AS orgaoResponsavelId, o.Sigla AS orgaoSigla,
         p.Motivo AS motivo, CONVERT(varchar(10), p.DataAbertura, 120) AS dataAbertura,
         p.Status AS status, p.Sigiloso AS sigiloso,
         CONVERT(varchar(10), p.DataConclusao, 120) AS dataConclusao,
         p.Resultado AS resultado, p.DiasSancao AS diasSancao,
         CONVERT(varchar(10), p.DataTerminoPrevisao, 120) AS dataTerminoPrevisao,
         p.RelatorMembroId AS relatorMembroId, relator.Nome AS relatorNome,
         CONVERT(varchar(10), p.DataCitacao, 120) AS dataCitacao, p.CanalCitacao AS canalCitacao,
         p.DefesaProtocolada AS defesaProtocolada, CONVERT(varchar(10), p.DataDefesa, 120) AS dataDefesa,
         p.DefensorNome AS defensorNome
  FROM ProcessosDisciplinares p
  JOIN MembroReferencia m ON m.MembroId = p.MembroId
  JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId
  LEFT JOIN MembroReferencia relator ON relator.MembroId = p.RelatorMembroId`;

// Busca 1 processo (por id) já com infrações e prazoDefesa calculado.
async function selectProcessoComInfracoes(pool, sql, processoId) {
  const result = await pool.request().input("id", sql.Int, processoId).query(`${SELECT_PROCESSO_BASE} WHERE p.ProcessoId = @id`);
  const processos = await anexarInfracoesEPrazo(pool, sql, result.recordset);
  return processos[0] || null;
}

// Anexa `infracoes` (array {infracaoId, codigo, nome}) e `prazoDefesa` a uma
// lista de processos (usado tanto por 1 registro quanto pela listagem toda).
async function anexarInfracoesEPrazo(pool, sql, processos) {
  if (processos.length === 0) return [];
  const ids = processos.map(p => p.processoId);
  const idsValidos = ids.map(Number).filter(Number.isInteger);
  const infracoesResult = idsValidos.length
    ? await pool.request().query(`
        SELECT pi.ProcessoId AS processoId, ti.InfracaoId AS infracaoId, ti.Codigo AS codigo, ti.Nome AS nome, ti.Gravidade AS gravidade
        FROM ProcessoInfracoes pi JOIN TiposInfracao ti ON ti.InfracaoId = pi.InfracaoId
        WHERE pi.ProcessoId IN (${idsValidos.join(",")})
      `)
    : { recordset: [] };
  const infracoesPorProcesso = new Map();
  for (const row of infracoesResult.recordset) {
    if (!infracoesPorProcesso.has(row.processoId)) infracoesPorProcesso.set(row.processoId, []);
    infracoesPorProcesso.get(row.processoId).push({ infracaoId: row.infracaoId, codigo: row.codigo, nome: row.nome, gravidade: row.gravidade });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  return processos.map(p => Object.assign({}, p, {
    infracoes: infracoesPorProcesso.get(p.processoId) || [],
    prazoDefesa: p.status === "JULGADO" ? null : estatuto.avaliarPrazoDefesa(p.dataCitacao, p.defesaProtocolada, hoje)
  }));
}

module.exports = { SELECT_PROCESSO_BASE, selectProcessoComInfracoes, anexarInfracoesEPrazo };
