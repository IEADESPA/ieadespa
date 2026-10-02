// GestaoPdqMetas (v4.8, segunda parte)
// Meta dentro de um eixo do PDQ (Art. 26-29). Marcar como NAO_CUMPRIDA
// exige justificativa técnica preenchida (Art. 29 §1º) — vira relatório
// de justificativa, nunca uma infração disciplinar automática.
// INSTITUCIONAL (o PDQ é da igreja inteira): criar e alterar meta é só da CLI (`cli`) ou do nível geral (shared/pdqAcesso.js); meta de plano ENCERRADO não muda.
// POST /api/pdq-metas -> { eixoId, descricao, indicador?, prazoAno }
// PUT  /api/pdq-metas/{id} -> { status?, justificativaTecnica? }
const auth = require("../shared/auth");
const { exigirAcessoPdq } = require("../shared/pdqAcesso");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { inteiroEntre, textoAte, textoOpcionalAte } = require("../shared/entradaFinanceira");

const STATUS = ["EM_ANDAMENTO", "CUMPRIDA", "NAO_CUMPRIDA"];

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const usuario = exigirAcessoPdq(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "POST") {
    const { eixoId: eixoBruto, descricao, indicador, prazoAno: prazoBruto } = req.body || {};
    if (!eixoBruto || typeof descricao !== "string" || !descricao.trim() || !prazoBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: eixoId, descricao, prazoAno." } };
      return;
    }
    const desc = textoAte(descricao, 300), ind = textoOpcionalAte(indicador, 300), prazoAno = inteiroEntre(prazoBruto, 1900, 2200);
    if (!desc || ind === null || prazoAno === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Confira a descrição (até 300 caracteres), o indicador (até 300) e o prazoAno (AAAA)." } };
      return;
    }
    const eixoId = auth.idDeRota(eixoBruto);
    const eixo = eixoId ? await pool.request().input("id", sql.Int, eixoId).query(
      `SELECT e.EixoId, p.Status AS PlanoStatus FROM PdqEixos e JOIN PdqPlanos p ON p.PlanoId = e.PlanoId WHERE e.EixoId = @id`) : { recordset: [] };
    if (eixo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Eixo não encontrado." } };
      return;
    }
    if (eixo.recordset[0].PlanoStatus === "ENCERRADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O plano deste eixo está encerrado — não recebe mais metas." } };
      return;
    }
    const criada = await pool.request()
      .input("eixoId", sql.Int, eixoId).input("descricao", sql.NVarChar(300), desc)
      .input("indicador", sql.NVarChar(300), ind || null).input("prazoAno", sql.Int, prazoAno)
      .query(`INSERT INTO PdqMetas (EixoId, Descricao, Indicador, PrazoAno) OUTPUT INSERTED.MetaId VALUES (@eixoId, @descricao, @indicador, @prazoAno)`);
    const metaId = criada.recordset[0].MetaId;
    await registrarAuditoria({
      tabela: "PdqMetas", registroId: metaId, acao: "Criou meta do PDQ", usuarioId: usuario.membroId,
      dadosDepois: { eixoId, descricao: desc, prazoAno }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Meta criada.", metaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!idBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/pdq-metas/{id}" } };
      return;
    }
    const { status, justificativaTecnica } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    if (status === "NAO_CUMPRIDA" && (typeof justificativaTecnica !== "string" || !justificativaTecnica.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Marcar uma meta como não cumprida exige a justificativa técnica (Art. 29 §1º)." } };
      return;
    }
    if (justificativaTecnica !== undefined && justificativaTecnica !== null && (typeof justificativaTecnica !== "string" || justificativaTecnica.trim().length > 1000)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "justificativaTecnica: texto de até 1000 caracteres." } };
      return;
    }
    const id = auth.idDeRota(idBruto);
    const antes = id ? await pool.request().input("id", sql.Int, id).query(
      `SELECT m.*, p.Status AS PlanoStatus FROM PdqMetas m JOIN PdqEixos e ON e.EixoId = m.EixoId JOIN PdqPlanos p ON p.PlanoId = e.PlanoId WHERE m.MetaId = @id`) : { recordset: [] };
    if (antes.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Meta não encontrada." } };
      return;
    }
    const { PlanoStatus, ...meta } = antes.recordset[0];
    if (PlanoStatus === "ENCERRADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O plano desta meta está encerrado — a meta não pode mais ser alterada." } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status || meta.Status)
      .input("justificativaTecnica", sql.NVarChar(1000), status === "NAO_CUMPRIDA" ? justificativaTecnica.trim() : (justificativaTecnica !== undefined ? justificativaTecnica : meta.JustificativaTecnica))
      .query(`UPDATE PdqMetas SET Status = @status, JustificativaTecnica = @justificativaTecnica WHERE MetaId = @id`);
    await registrarAuditoria({
      tabela: "PdqMetas", registroId: id, acao: "Atualizou meta do PDQ", usuarioId: usuario.membroId,
      dadosAntes: meta, dadosDepois: { status, justificativaTecnica }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Meta atualizada." } };
    return;
  }
};
