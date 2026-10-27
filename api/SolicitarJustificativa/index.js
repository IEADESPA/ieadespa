// SolicitarJustificativa (público — painel pessoal do obreiro)
// O próprio obreiro pede justificativa de uma falta, usando só a matrícula.
// Fica "pendente" até a Secretaria aprovar ou rejeitar.
//
// v8.1 — reunião da CLI (inclusive a Sessão Magna da AFM): o pedido escolhe o motivo no catálogo fechado do Regimento Art. 149 §2º (shared/afm.js); os vedados ("escala",
// "evento de departamento"...) são recusados aqui mesmo, com o artigo. Body: { codigo, detalhe? }. Nos demais órgãos segue o texto livre: { motivo }.
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const auth = require("../shared/auth");
const afm = require("../shared/afm");

module.exports = async function (context, req) {
  // fecho da v7.5 — exige sessão e só a matrícula da própria sessão (antes qualquer um "justificava" a falta de qualquer matrícula).
  const matricula = context.bindingData.matricula;
  if (!auth.exigirTitular(req, context, matricula)) return;
  const sessaoId = auth.idDeRota(context.bindingData.sessaoId);
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a reunião." } };
    return;
  }

  const pool = await getPool();
  const sessao = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT o.Sigla AS sigla FROM Sessoes s LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.SessaoId = @id`)).recordset[0];
  const ehCLI = !!sessao && sessao.sigla === "CLI";

  let texto;
  let codigo = null;
  if (ehCLI) {
    const v = afm.validarJustificativa({ codigo: corpo.codigo, detalhe: corpo.detalhe });
    if (!v.valido) {
      context.res = { status: 422, body: { sucesso: false, mensagem: v.mensagem } };
      return;
    }
    codigo = v.codigo;
    texto = afm.textoDaJustificativa(v.codigo, v.detalhe);
  } else {
    const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "";
    if (!motivo.trim() || motivo.trim().length > 300) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a reunião e o motivo (até 300 caracteres)." } };
      return;
    }
    texto = motivo.trim();
  }

  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, matricula).input("motivo", sql.NVarChar(300), texto).input("codigo", sql.NVarChar(30), codigo)
    .query(`UPDATE Presencas SET JustificativaPendente = @motivo, PendenteCodigo = @codigo
            WHERE SessaoId = @sessaoId AND MembroId = @mat AND Presente = 0 AND FaltaJustificada = 0`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há falta pendente de justificativa nessa reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas", registroId: Number(sessaoId), acao: "Solicitou justificativa de falta",
    usuarioId: Number(matricula), dadosDepois: ehCLI ? { codigo } : { motivo: texto }   // v8.1: na CLI a trilha guarda só o código (o detalhe pode citar saúde)
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Solicitação enviada. A Secretaria vai analisar." }
  };
};
