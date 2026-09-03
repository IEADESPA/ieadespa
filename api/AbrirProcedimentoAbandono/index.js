// AbrirProcedimentoAbandono
// Abre o procedimento sumário de constatação de Abandono Eclesiástico — Material ou
// Digital (Estatuto Art. 11, IV/V e §3º: mesmo rito pros dois — notifica o membro,
// registro datado, sem envio real de e-mail/SMS — não há essa infraestrutura no
// projeto — e passa a contar o prazo de defesa de 15 dias antes de poder ser
// homologado (ver EvoluirProcedimentoAbandono). Exige a permissão "disciplina" (mesma
// CLI que já homologa processos disciplinares).
// POST /api/procedimentos-abandono -> body: { membroId, tipo? ('MATERIAL'|'DIGITAL'), dataNotificacao?, dataEdital? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const abandonoDigital = require("../shared/abandonoDigital");

const TIPOS = ["MATERIAL", "DIGITAL"];

const SELECT_PROCEDIMENTO = `
  SELECT pa.ProcedimentoId AS procedimentoId, pa.MembroId AS membroId, m.Nome AS nome,
         pa.Tipo AS tipo, pa.Status AS status, CONVERT(varchar(10), pa.DataNotificacao, 120) AS dataNotificacao,
         CONVERT(varchar(10), pa.DataEdital, 120) AS dataEdital, pa.PrazoDias AS prazoDias,
         CONVERT(varchar(10), pa.DataHomologacao, 120) AS dataHomologacao,
         pa.RecursoInterposto AS recursoInterposto,
         CONVERT(varchar(10), pa.DataRecurso, 120) AS dataRecurso, pa.ResultadoRecurso AS resultadoRecurso
  FROM ProcedimentosAbandono pa
  JOIN MembroReferencia m ON m.MembroId = pa.MembroId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId, dataEdital } = req.body || {};
  const tipo = req.body && req.body.tipo ? req.body.tipo : "MATERIAL";
  let { dataNotificacao } = req.body || {};
  if (!membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
    return;
  }
  if (!TIPOS.includes(tipo)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
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

  if (tipo === "MATERIAL") {
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
  } else {
    // Digital (Art. 12 §2º): precisa de ≥2 tentativas de contato por canais distintos e
    // 90 dias corridos desde a 1ª — a notificação final do procedimento é a própria
    // tentativa mais recente já registrada (não pede uma data nova por fora).
    const elegibilidade = await abandonoDigital.elegibilidadeAbandonoDigital(pool, sql, membroId);
    if (!elegibilidade.elegivel) {
      context.res = {
        status: 200,
        body: {
          sucesso: false,
          mensagem: `Faltam requisitos do Art. 12 §2º: ${elegibilidade.canaisDistintos}/${estatuto.MIN_TENTATIVAS_CONTATO_DIGITAL} canais distintos tentados` +
            (elegibilidade.diasDesdePrimeira !== null ? `, ${elegibilidade.diasDesdePrimeira}/${estatuto.DIAS_ABANDONO_DIGITAL} dias desde a 1ª tentativa.` : ", nenhuma tentativa registrada ainda.")
        }
      };
      return;
    }
    dataNotificacao = elegibilidade.ultimaTentativa;
  }

  const aberto = await pool.request().input("id", sql.Int, membroId).input("tipo", sql.NVarChar(20), tipo)
    .query(`SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono WHERE MembroId = @id AND Tipo = @tipo AND Status = 'NOTIFICADO'`);
  if (aberto.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um procedimento em aberto (notificado) para este membro." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("tipo", sql.NVarChar(20), tipo)
    .input("dataNotificacao", sql.Date, dataNotificacao || null)
    .input("dataEdital", sql.Date, dataEdital || null)
    .query(`
      INSERT INTO ProcedimentosAbandono (MembroId, Tipo, Status, DataNotificacao, DataEdital)
      OUTPUT INSERTED.ProcedimentoId
      VALUES (@membroId, @tipo, 'NOTIFICADO', COALESCE(@dataNotificacao, CAST(SYSUTCDATETIME() AS DATE)), @dataEdital)
    `);
  const procedimentoId = result.recordset[0].ProcedimentoId;

  await registrarAuditoria({
    tabela: "ProcedimentosAbandono",
    registroId: procedimentoId,
    acao: `Abriu procedimento de Abandono ${tipo === "DIGITAL" ? "Digital" : "Material"} (notificação)`,
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, tipo, dataNotificacao, dataEdital }
  });

  const procedimentoResult = await pool.request().input("id", sql.Int, procedimentoId).query(`${SELECT_PROCEDIMENTO} WHERE pa.ProcedimentoId = @id`);

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Procedimento aberto — membro notificado.", procedimento: procedimentoResult.recordset[0] }
  };
};
