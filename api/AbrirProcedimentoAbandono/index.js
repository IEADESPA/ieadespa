// AbrirProcedimentoAbandono
// Abre o procedimento sumário de constatação de Abandono Eclesiástico Material
// (Reg. Art. 11): notifica o membro (registro datado, sem envio real de e-mail/SMS —
// não há essa infraestrutura no projeto) e passa a contar o prazo de defesa de 15 dias
// antes de poder ser homologado (ver EvoluirProcedimentoAbandono). Exige a permissão
// "disciplina" (mesma CLI que já homologa processos disciplinares).
// POST /api/procedimentos-abandono -> body: { membroId, dataNotificacao?, dataEdital? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

const SELECT_PROCEDIMENTO = `
  SELECT pa.ProcedimentoId AS procedimentoId, pa.MembroId AS membroId, m.Nome AS nome,
         pa.Status AS status, CONVERT(varchar(10), pa.DataNotificacao, 120) AS dataNotificacao,
         CONVERT(varchar(10), pa.DataEdital, 120) AS dataEdital, pa.PrazoDias AS prazoDias,
         CONVERT(varchar(10), pa.DataHomologacao, 120) AS dataHomologacao,
         pa.RecursoInterposto AS recursoInterposto,
         CONVERT(varchar(10), pa.DataRecurso, 120) AS dataRecurso, pa.ResultadoRecurso AS resultadoRecurso
  FROM ProcedimentosAbandono pa
  JOIN MembroReferencia m ON m.MembroId = pa.MembroId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, dataNotificacao, dataEdital } = req.body || {};
  if (!membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }

  const pool = await getPool();
  const membroResult = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT MembroId, Nome, SituacaoMembro, CONVERT(varchar(10), DataAfastamento, 120) AS DataAfastamento
            FROM MembroReferencia WHERE MembroId = @id`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  const elegivel = estatuto.elegivelAbandonoMaterial(
    { situacaoMembro: membro.SituacaoMembro, dataAfastamento: membro.DataAfastamento }
  );
  if (!elegivel) {
    context.res = {
      status: 200,
      body: { sucesso: false, mensagem: `Este membro ainda não completou os ${estatuto.DIAS_ABANDONO_MATERIAL} dias de afastamento (ou não está marcado Sem Comunhão com Data de Afastamento lançada).` }
    };
    return;
  }

  const aberto = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono WHERE MembroId = @id AND Status = 'NOTIFICADO'`);
  if (aberto.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um procedimento em aberto (notificado) para este membro." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("dataNotificacao", sql.Date, dataNotificacao || null)
    .input("dataEdital", sql.Date, dataEdital || null)
    .query(`
      INSERT INTO ProcedimentosAbandono (MembroId, Status, DataNotificacao, DataEdital)
      OUTPUT INSERTED.ProcedimentoId
      VALUES (@membroId, 'NOTIFICADO', COALESCE(@dataNotificacao, CAST(SYSUTCDATETIME() AS DATE)), @dataEdital)
    `);
  const procedimentoId = result.recordset[0].ProcedimentoId;

  await registrarAuditoria({
    tabela: "ProcedimentosAbandono",
    registroId: procedimentoId,
    acao: "Abriu procedimento de Abandono Material (notificação)",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, dataNotificacao, dataEdital }
  });

  const procedimentoResult = await pool.request().input("id", sql.Int, procedimentoId).query(`${SELECT_PROCEDIMENTO} WHERE pa.ProcedimentoId = @id`);

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Procedimento aberto — membro notificado.", procedimento: procedimentoResult.recordset[0] }
  };
};
