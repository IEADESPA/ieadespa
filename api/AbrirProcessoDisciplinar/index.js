// AbrirProcessoDisciplinar
// Núcleo mínimo (v0.2) — abre um processo vinculado a um membro, com motivo em texto
// livre (o catálogo de infrações do Regimento, Art. 96-99, é v3.3). Exige a permissão
// "disciplina" (já cadastrada em Funcionalidades desde a migração 002).
// POST /api/processos-disciplinares -> body: { membroId, orgaoResponsavelId, motivo, dataAbertura?, sigiloso? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const SELECT_PROCESSO = `
  SELECT p.ProcessoId AS processoId, p.MembroId AS membroId, m.Nome AS nome,
         p.OrgaoResponsavelId AS orgaoResponsavelId, o.Sigla AS orgaoSigla,
         p.Motivo AS motivo, CONVERT(varchar(10), p.DataAbertura, 120) AS dataAbertura,
         p.Status AS status, p.Sigiloso AS sigiloso,
         CONVERT(varchar(10), p.DataConclusao, 120) AS dataConclusao,
         p.Resultado AS resultado, p.DiasSancao AS diasSancao,
         CONVERT(varchar(10), p.DataTerminoPrevisao, 120) AS dataTerminoPrevisao
  FROM ProcessosDisciplinares p
  JOIN MembroReferencia m ON m.MembroId = p.MembroId
  JOIN Orgaos o ON o.OrgaoId = p.OrgaoResponsavelId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, orgaoResponsavelId, motivo, dataAbertura, sigiloso } = req.body || {};
  if (!membroId || !orgaoResponsavelId || !motivo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, orgaoResponsavelId, motivo." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }
  const orgao = await pool.request().input("id", sql.Int, orgaoResponsavelId).query(`SELECT OrgaoId FROM Orgaos WHERE OrgaoId = @id`);
  if (orgao.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão responsável inválido." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("orgaoResponsavelId", sql.Int, orgaoResponsavelId)
    .input("motivo", sql.NVarChar(500), motivo)
    .input("dataAbertura", sql.Date, dataAbertura || null)
    .input("sigiloso", sql.Bit, sigiloso === undefined ? true : sigiloso)
    .query(`
      INSERT INTO ProcessosDisciplinares (MembroId, OrgaoResponsavelId, Motivo, DataAbertura, Status, Sigiloso)
      OUTPUT INSERTED.ProcessoId
      VALUES (@membroId, @orgaoResponsavelId, @motivo, COALESCE(@dataAbertura, CAST(SYSUTCDATETIME() AS DATE)), 'EM_ANDAMENTO', @sigiloso)
    `);
  const processoId = result.recordset[0].ProcessoId;

  const processoResult = await pool.request().input("id", sql.Int, processoId).query(`${SELECT_PROCESSO} WHERE p.ProcessoId = @id`);
  const processo = processoResult.recordset[0];

  await registrarAuditoria({
    tabela: "ProcessosDisciplinares",
    registroId: processoId,
    acao: "Abriu processo disciplinar",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, orgaoResponsavelId, motivo }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo disciplinar aberto.", processo }
  };
};
