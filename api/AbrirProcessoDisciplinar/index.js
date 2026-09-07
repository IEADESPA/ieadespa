// AbrirProcessoDisciplinar
// v3.2 — abre um processo vinculado a um membro, citando 1+ infrações do
// catálogo estruturado `TiposInfracao` (Art. 96-99); `motivo` agora é só o
// detalhamento complementar em texto livre do caso, não mais o único campo.
// v3.6 — órgão responsável pode ser um dos 5 órgãos centrais OU uma JAI/JEA/TER
// territorial (escada disciplinar, `shared/disciplinar.js::validarOrgaoProcesso`).
// Exige a permissão "disciplina" (já cadastrada em Funcionalidades desde a
// migração 002).
// POST /api/processos-disciplinares -> body: { membroId, orgaoResponsavelId?, orgaoLocalId?, infracoesIds: number[], motivo?, dataAbertura?, sigiloso? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { selectProcessoComInfracoes, validarOrgaoProcesso } = require("../shared/disciplinar");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, orgaoResponsavelId, orgaoLocalId, infracoesIds, motivo, dataAbertura, sigiloso } = req.body || {};
  if (!membroId || !Array.isArray(infracoesIds) || infracoesIds.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, órgão (central ou territorial), infracoesIds (pelo menos 1)." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, SituacaoMembro FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }
  // Congregado é uma trilha à parte (v1.6): não tem os vínculos plenos de membresia
  // que justificam processo disciplinar — se houver algo a tratar, é na admissão.
  if (membro.recordset[0].SituacaoMembro === "CONGREGADO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível abrir processo disciplinar contra um Congregado." } };
    return;
  }
  const orgao = await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId, orgaoLocalId });
  if (!orgao.valido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: orgao.mensagem } };
    return;
  }
  // v3.6.2 — só quem é membro daquele órgão territorial (Lideranca Papel+
  // Escopo, ou GLOBAL) pode abrir processo nele.
  if (orgao.orgaoLocalId && !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, orgao.orgaoLocalId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." } };
    return;
  }

  const idsInfracoes = infracoesIds.map(Number).filter(Number.isInteger);
  const infracoesValidas = await pool.request().query(`
    SELECT InfracaoId FROM TiposInfracao WHERE Ativo = 1 AND InfracaoId IN (${idsInfracoes.length ? idsInfracoes.join(",") : "0"})
  `);
  if (infracoesValidas.recordset.length !== idsInfracoes.length) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Uma ou mais infrações informadas são inválidas ou estão inativas no catálogo." } };
    return;
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
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, orgaoResponsavelId: orgao.orgaoResponsavelId, orgaoLocalId: orgao.orgaoLocalId, motivo: motivo || null, infracoesIds: idsInfracoes }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo disciplinar aberto.", processo }
  };
};
