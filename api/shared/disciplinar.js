// shared/disciplinar.js (v3.2, ampliado v3.4/v3.5)
// SELECT compartilhado por AbrirProcessoDisciplinar/EvoluirProcessoDisciplinar/
// ListarProcessosDisciplinares — evita duplicar a mesma query+agregação de
// infrações em 3 arquivos.
const estatuto = require("./estatuto");

// Art. 103 §1º, II — ministros ordenados (Pastor/Evangelista) respondem
// duplamente: localmente ao CEI e, na credencial, ao Conselho de Ética da
// CIADSETA-PARÁ. CIADSETA é entidade externa (Convenção Estadual), sem
// representação nenhuma no sistema — não tem como processar/homologar nada
// dela aqui, então isso vira só um aviso informativo (mesmo padrão de outras
// referências à CIADSETA no sistema, ex: sucessão presidencial v1.5).
const CARGOS_JURISDICAO_DUPLA = ["PASTOR", "EVANGELISTA"];

const SELECT_PROCESSO_BASE = `
  SELECT p.ProcessoId AS processoId, p.MembroId AS membroId, m.Nome AS nome, m.CargoMinisterial AS cargoMinisterialReu,
         p.OrgaoResponsavelId AS orgaoResponsavelId, o.Sigla AS orgaoSigla,
         p.Motivo AS motivo, CONVERT(varchar(10), p.DataAbertura, 120) AS dataAbertura,
         p.Status AS status, p.Sigiloso AS sigiloso,
         CONVERT(varchar(10), p.DataConclusao, 120) AS dataConclusao,
         p.Resultado AS resultado, p.DiasSancao AS diasSancao,
         CONVERT(varchar(10), p.DataTerminoPrevisao, 120) AS dataTerminoPrevisao,
         p.RelatorMembroId AS relatorMembroId, relator.Nome AS relatorNome,
         CONVERT(varchar(10), p.DataCitacao, 120) AS dataCitacao, p.CanalCitacao AS canalCitacao,
         p.DefesaProtocolada AS defesaProtocolada, CONVERT(varchar(10), p.DataDefesa, 120) AS dataDefesa,
         p.DefensorNome AS defensorNome,
         p.PenalidadeId AS penalidadeId, tp.Codigo AS penalidadeCodigo, tp.Nome AS penalidadeNome,
         CONVERT(varchar(10), p.DataProvaReintegracao, 120) AS dataProvaReintegracao,
         p.ResultadoProvaReintegracao AS resultadoProvaReintegracao
  FROM ProcessosDisciplinares p
  JOIN MembroReferencia m ON m.MembroId = p.MembroId
  JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId
  LEFT JOIN MembroReferencia relator ON relator.MembroId = p.RelatorMembroId
  LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = p.PenalidadeId`;

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
    prazoDefesa: p.status === "JULGADO" ? null : estatuto.avaliarPrazoDefesa(p.dataCitacao, p.defesaProtocolada, hoje),
    envolveMinistro: CARGOS_JURISDICAO_DUPLA.includes(p.cargoMinisterialReu),
    emCarenciaAdministrativa: p.penalidadeCodigo === "DISCIPLINA_RIGOROSA" &&
      (p.resultadoProvaReintegracao == null || p.resultadoProvaReintegracao === "REPROVADO")
  }));
}

// Sigilo com efeito funcional real (v3.4): quem não tem a permissão "cei" e
// não é o relator designado do processo só vê que ele existe (nome, órgão,
// situação, prazos) — o conteúdo sensível (motivo, infrações, relator,
// defensor) some, substituído só pela contagem de infrações. Continua tudo
// visível pra quem abriu/opera o processo no mesmo instante (Abrir/Evoluir
// devolvem o dado cru) — a redação só se aplica na listagem geral.
function redigirSeSigiloso(processos, usuario) {
  const podeVerTudo = usuario.permissoes.includes("cei");
  return processos.map(p => {
    if (!p.sigiloso || podeVerTudo || Number(usuario.membroId) === Number(p.relatorMembroId)) return p;
    return Object.assign({}, p, {
      motivo: null,
      infracoes: [],
      quantidadeInfracoes: (p.infracoes || []).length,
      relatorNome: null,
      defensorNome: null,
      detalhesRestritos: true
    });
  });
}

module.exports = { SELECT_PROCESSO_BASE, selectProcessoComInfracoes, anexarInfracoesEPrazo, redigirSeSigiloso };
