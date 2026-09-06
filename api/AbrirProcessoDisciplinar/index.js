// AbrirProcessoDisciplinar
// v3.2 — abre um processo vinculado a um membro, citando 1+ infrações do
// catálogo estruturado `TiposInfracao` (Art. 96-99); `motivo` agora é só o
// detalhamento complementar em texto livre do caso, não mais o único campo.
// Exige a permissão "disciplina" (já cadastrada em Funcionalidades desde a
// migração 002).
// POST /api/processos-disciplinares -> body: { membroId, orgaoResponsavelId, infracoesIds: number[], motivo?, dataAbertura?, sigiloso? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { selectProcessoComInfracoes } = require("../shared/disciplinar");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, orgaoResponsavelId, infracoesIds, motivo, dataAbertura, sigiloso } = req.body || {};
  if (!membroId || !orgaoResponsavelId || !Array.isArray(infracoesIds) || infracoesIds.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, orgaoResponsavelId, infracoesIds (pelo menos 1)." } };
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
  const orgao = await pool.request().input("id", sql.Int, orgaoResponsavelId).query(`SELECT OrgaoId FROM Orgaos WHERE OrgaoId = @id`);
  if (orgao.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão responsável inválido." } };
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
    .input("orgaoResponsavelId", sql.Int, orgaoResponsavelId)
    .input("motivo", sql.NVarChar(500), motivo || null)
    .input("dataAbertura", sql.Date, dataAbertura || null)
    .input("sigiloso", sql.Bit, sigiloso === undefined ? true : sigiloso)
    .query(`
      INSERT INTO ProcessosDisciplinares (MembroId, OrgaoResponsavelId, Motivo, DataAbertura, Status, Sigiloso)
      OUTPUT INSERTED.ProcessoId
      VALUES (@membroId, @orgaoResponsavelId, @motivo, COALESCE(@dataAbertura, CAST(SYSUTCDATETIME() AS DATE)), 'EM_ANDAMENTO', @sigiloso)
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
    dadosDepois: { membroId, orgaoResponsavelId, motivo: motivo || null, infracoesIds: idsInfracoes }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo disciplinar aberto.", processo }
  };
};
