// JustificarFalta
// Secretaria lança a justificativa de uma falta já gerada (depois que a
// reunião foi encerrada). Não mexe em faltas que ainda não existem nem em
// presenças (Presente = 1).
//
// v8.1 — reunião da CLI (inclusive a Sessão Magna da AFM): só o catálogo fechado do Regimento Art. 149 §2º (shared/afm.js — os motivos vedados são recusados) e, na
// Sessão Magna, a confirmação de que a justificativa é documentada (Art. 69 §2º, I). Body: { membroId, codigo, detalhe?, comprovanteConferido? }. Nos demais órgãos segue o
// texto livre de antes: { membroId, motivo }. Justificar pode desfazer uma exclusão/desmatrícula por faltas: a apuração roda em seguida.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const afm = require("../shared/afm");
const afmDb = require("../shared/afmDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const { membroId, motivo } = corpo;
  const usuarioId = usuario.membroId;

  if (!sessaoId || !membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota) e membroId (body)." } };
    return;
  }

  const pool = await getPool();
  const alvo = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT c.Nome AS Congregacao FROM MembroReferencia m
            LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  const congregacaoNome = alvo.recordset[0] ? alvo.recordset[0].Congregacao : null;
  if (!auth.estaNoEscopo(usuario, congregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Este obreiro está fora do seu escopo de acesso." } };
    return;
  }

  const sessao = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.TipoSessao AS tipoSessao, s.ContaFaltasCLI AS contaFaltasCLI, o.Sigla AS sigla
    FROM Sessoes s LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.SessaoId = @id`)).recordset[0];
  const ehCLI = !!sessao && sessao.sigla === "CLI";

  let texto = motivo || null;
  let codigo = null;
  let comprovante = null;
  if (ehCLI) {
    const v = afm.validarJustificativa({
      codigo: corpo.codigo, detalhe: corpo.detalhe,
      exigirComprovante: sessao.tipoSessao === "MAGNA_AFM", comprovanteConferido: corpo.comprovanteConferido
    });
    if (!v.valido) {
      context.res = { status: 422, body: { sucesso: false, mensagem: v.mensagem } };
      return;
    }
    codigo = v.codigo;
    texto = afm.textoDaJustificativa(v.codigo, v.detalhe);
    comprovante = sessao.tipoSessao === "MAGNA_AFM" ? true : null;
  }

  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId).input("motivo", sql.NVarChar(300), texto)
    .input("codigo", sql.NVarChar(30), codigo).input("comprovante", sql.Bit, comprovante)
    .query(`UPDATE Presencas SET FaltaJustificada = 1, MotivoJustificativa = @motivo, MotivoCodigo = @codigo, ComprovanteConferido = @comprovante,
                   JustificativaPendente = NULL, PendenteCodigo = NULL
            WHERE SessaoId = @sessaoId AND MembroId = @membroId AND Presente = 0`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há falta registrada para esse membro nesta reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas",
    registroId: Number(membroId),
    acao: "Justificou falta",
    usuarioId,
    dadosDepois: { sessaoId: Number(sessaoId), motivo: texto, codigo }
  });

  let apuracao = "";
  if (ehCLI && sessao.contaFaltasCLI) apuracao = afmDb.resumoDaApuracao(await afmDb.apurarSemFalhar(pool, { membroIds: [Number(membroId)] }, context.log.error));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Falta justificada.${apuracao}` } };
};
