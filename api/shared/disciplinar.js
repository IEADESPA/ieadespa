// shared/disciplinar.js (v3.2, ampliado v3.4/v3.5)
// SELECT compartilhado por AbrirProcessoDisciplinar/EvoluirProcessoDisciplinar/
// ListarProcessosDisciplinares — evita duplicar a mesma query+agregação de
// infrações em 3 arquivos.
const estatuto = require("./estatuto");
const escopo = require("./escopo");
const { registrarAuditoria } = require("./auditoria");

// Art. 103 §1º, II — ministros ordenados (Pastor/Evangelista) respondem
// duplamente: localmente ao CEI e, na credencial, ao Conselho de Ética da
// CIADSETA-PARÁ. CIADSETA é entidade externa (Convenção Estadual), sem
// representação nenhuma no sistema — não tem como processar/homologar nada
// dela aqui, então isso vira só um aviso informativo (mesmo padrão de outras
// referências à CIADSETA no sistema, ex: sucessão presidencial v1.5).
const CARGOS_JURISDICAO_DUPLA = ["PASTOR", "EVANGELISTA"];

// Art. 105-109 (JAI, Congregação), 122-123 (JEA, Área), 126-C (TER, Região) —
// única siglas de OrgaosLocais que são órgão disciplinar de verdade; as
// demais (CRA/CEQ/CAQ/CDE/JUC/CRAF) são administrativas/fiscais/estratégicas,
// nunca julgam processo (v3.6).
const SIGLAS_DISCIPLINARES_LOCAIS = ["JAI", "JEA", "TER"];
// Só JAI/JEA cabem em recurso (Art. 108 §3º/123) — TER é a última instância
// territorial, o caminho dela é homologação do CEI, não recurso.
const SIGLAS_QUE_PODEM_RECORRER = ["JAI", "JEA"];

const SELECT_PROCESSO_BASE = `
  SELECT p.ProcessoId AS processoId, p.MembroId AS membroId, m.Nome AS nome, m.CargoMinisterial AS cargoMinisterialReu,
         p.OrgaoResponsavelId AS orgaoResponsavelId, p.OrgaoLocalId AS orgaoLocalId,
         COALESCE(o.Sigla, ol.Sigla) AS orgaoSigla, COALESCE(o.Nome, ol.Nome) AS orgaoNome, ol.Nivel AS orgaoLocalNivel,
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
         p.ResultadoProvaReintegracao AS resultadoProvaReintegracao,
         p.ProcessoOrigemId AS processoOrigemId, p.HomologadoPeloCEI AS homologadoPeloCei
  FROM ProcessosDisciplinares p
  JOIN MembroReferencia m ON m.MembroId = p.MembroId
  LEFT JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId
  LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = p.OrgaoLocalId
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
  return processos.map(p => {
    // Art. 108 §3º / 123 — recurso de JAI/JEA em 5 dias corridos a partir da
    // conclusão, só enquanto ainda não foi recorrido (calculado na leitura).
    const podeRecorrer = p.status === "JULGADO" && SIGLAS_QUE_PODEM_RECORRER.includes(p.orgaoSigla);
    const diasDesdeConclusao = podeRecorrer ? estatuto.diasDesde(p.dataConclusao, hoje) : null;
    return Object.assign({}, p, {
      infracoes: infracoesPorProcesso.get(p.processoId) || [],
      prazoDefesa: p.status === "JULGADO" ? null : estatuto.avaliarPrazoDefesa(p.dataCitacao, p.defesaProtocolada, hoje),
      envolveMinistro: CARGOS_JURISDICAO_DUPLA.includes(p.cargoMinisterialReu),
      emCarenciaAdministrativa: p.penalidadeCodigo === "DISCIPLINA_RIGOROSA" &&
        (p.resultadoProvaReintegracao == null || p.resultadoProvaReintegracao === "REPROVADO"),
      podeRecorrer,
      prazoRecursoVencido: diasDesdeConclusao !== null ? diasDesdeConclusao > 5 : null
    });
  });
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

// Valida o órgão de um processo (central OU territorial, exatamente 1) e
// resolve a Sigla — usado por AbrirProcessoDisciplinar e por RECORRER
// (EvoluirProcessoDisciplinar), evitando duplicar a mesma checagem. Por
// baixo reaproveita shared/escopo.js::resolverOrgao (v3.6.2), só
// acrescentando a restrição de sigla (só JAI/JEA/TER julgam disciplina).
async function validarOrgaoProcesso(pool, sql, { orgaoResponsavelId, orgaoLocalId }) {
  const resolvido = await escopo.resolverOrgao(pool, sql, { orgaoId: orgaoResponsavelId, orgaoLocalId });
  if (!resolvido.valido) {
    return { valido: false, mensagem: resolvido.mensagem.replace("orgaoId", "orgaoResponsavelId") };
  }
  if (resolvido.orgaoLocalId && !SIGLAS_DISCIPLINARES_LOCAIS.includes(resolvido.sigla)) {
    return { valido: false, mensagem: `Só JAI, JEA ou TER podem julgar processo disciplinar (informado: ${resolvido.sigla}).` };
  }
  return {
    valido: true,
    orgaoResponsavelId: resolvido.orgaoId,
    orgaoLocalId: resolvido.orgaoLocalId,
    sigla: resolvido.sigla,
    nivel: resolvido.nivel
  };
}

// Cria um Processo Disciplinar (validação de órgão/infrações + INSERT +
// ProcessoInfracoes + auditoria) — extraído de `AbrirProcessoDisciplinar`
// (v3.7) pra ser reaproveitado também por `EvoluirDenunciaOuvidoria`
// (ação ENCAMINHAR_PROCESSO), sem duplicar a validação. Nunca lança —
// sempre devolve { sucesso, mensagem, processo? }.
async function criarProcessoDisciplinar(pool, sql, dados, usuarioId) {
  const { membroId, orgaoResponsavelId, orgaoLocalId, infracoesIds, motivo, dataAbertura, sigiloso } = dados;
  if (!membroId || !Array.isArray(infracoesIds) || infracoesIds.length === 0) {
    return { sucesso: false, mensagem: "Campos obrigatórios: membroId, órgão (central ou territorial), infracoesIds (pelo menos 1)." };
  }

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, SituacaoMembro FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    return { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." };
  }
  // Congregado é uma trilha à parte (v1.6): não tem os vínculos plenos de membresia
  // que justificam processo disciplinar — se houver algo a tratar, é na admissão.
  if (membro.recordset[0].SituacaoMembro === "CONGREGADO") {
    return { sucesso: false, mensagem: "Não é possível abrir processo disciplinar contra um Congregado." };
  }
  const orgao = await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId, orgaoLocalId });
  if (!orgao.valido) {
    return { sucesso: false, mensagem: orgao.mensagem };
  }

  const idsInfracoes = infracoesIds.map(Number).filter(Number.isInteger);
  const infracoesValidas = await pool.request().query(`
    SELECT InfracaoId FROM TiposInfracao WHERE Ativo = 1 AND InfracaoId IN (${idsInfracoes.length ? idsInfracoes.join(",") : "0"})
  `);
  if (infracoesValidas.recordset.length !== idsInfracoes.length) {
    return { sucesso: false, mensagem: "Uma ou mais infrações informadas são inválidas ou estão inativas no catálogo." };
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("orgaoResponsavelId", sql.Int, orgao.orgaoResponsavelId)
    .input("orgaoLocalId", sql.Int, orgao.orgaoLocalId)
    .input("motivo", sql.NVarChar(500), motivo || null)
    .input("dataAbertura", sql.Date, dataAbertura || null)
    .input("sigiloso", sql.Bit, sigiloso === undefined ? true : sigiloso)
    .query(`
      INSERT INTO ProcessosDisciplinares (MembroId, OrgaoResponsavelId, OrgaoLocalId, Motivo, DataAbertura, Status, Sigiloso)
      OUTPUT INSERTED.ProcessoId
      VALUES (@membroId, @orgaoResponsavelId, @orgaoLocalId, @motivo, COALESCE(@dataAbertura, CAST(SYSUTCDATETIME() AS DATE)), 'EM_ANDAMENTO', @sigiloso)
    `);
  const processoId = result.recordset[0].ProcessoId;

  for (const infracaoId of idsInfracoes) {
    await pool.request().input("processoId", sql.Int, processoId).input("infracaoId", sql.Int, infracaoId)
      .query(`INSERT INTO ProcessoInfracoes (ProcessoId, InfracaoId) VALUES (@processoId, @infracaoId)`);
  }

  const processo = await selectProcessoComInfracoes(pool, sql, processoId);

  await registrarAuditoria({
    tabela: "ProcessosDisciplinares",
    registroId: processoId,
    acao: "Abriu processo disciplinar",
    usuarioId,
    dadosDepois: { membroId, orgaoResponsavelId: orgao.orgaoResponsavelId, orgaoLocalId: orgao.orgaoLocalId, motivo: motivo || null, infracoesIds: idsInfracoes }
  });

  return { sucesso: true, mensagem: "✅ Processo disciplinar aberto.", processo, processoId };
}

module.exports = {
  SELECT_PROCESSO_BASE, selectProcessoComInfracoes, anexarInfracoesEPrazo, redigirSeSigiloso,
  SIGLAS_DISCIPLINARES_LOCAIS, SIGLAS_QUE_PODEM_RECORRER, validarOrgaoProcesso, criarProcessoDisciplinar
};
