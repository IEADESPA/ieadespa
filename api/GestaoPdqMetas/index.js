// GestaoPdqMetas (v4.8, segunda parte)
// Meta dentro de um eixo do PDQ (Art. 26-29). Marcar como NAO_CUMPRIDA
// exige justificativa técnica preenchida (Art. 29 §1º) — vira relatório
// de justificativa, nunca uma infração disciplinar automática.
// POST /api/pdq-metas -> { eixoId, descricao, indicador?, prazoAno }
// PUT  /api/pdq-metas/{id} -> { status?, justificativaTecnica? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const STATUS = ["EM_ANDAMENTO", "CUMPRIDA", "NAO_CUMPRIDA"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirAlgumaPermissao(req, context, ["cli", "financeiro"]);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "POST") {
    const { eixoId, descricao, indicador, prazoAno } = req.body || {};
    if (!eixoId || !descricao || !descricao.trim() || !prazoAno) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: eixoId, descricao, prazoAno." } };
      return;
    }
    const eixo = await pool.request().input("id", sql.Int, eixoId).query(`SELECT EixoId FROM PdqEixos WHERE EixoId = @id`);
    if (eixo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Eixo não encontrado." } };
      return;
    }
    const criada = await pool.request()
      .input("eixoId", sql.Int, eixoId).input("descricao", sql.NVarChar(300), descricao.trim())
      .input("indicador", sql.NVarChar(300), indicador || null).input("prazoAno", sql.Int, prazoAno)
      .query(`INSERT INTO PdqMetas (EixoId, Descricao, Indicador, PrazoAno) OUTPUT INSERTED.MetaId VALUES (@eixoId, @descricao, @indicador, @prazoAno)`);
    const metaId = criada.recordset[0].MetaId;
    await registrarAuditoria({
      tabela: "PdqMetas", registroId: metaId, acao: "Criou meta do PDQ", usuarioId: usuario.membroId,
      dadosDepois: { eixoId, descricao, prazoAno }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Meta criada.", metaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/pdq-metas/{id}" } };
      return;
    }
    const { status, justificativaTecnica } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    if (status === "NAO_CUMPRIDA" && (!justificativaTecnica || !justificativaTecnica.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Marcar uma meta como não cumprida exige a justificativa técnica (Art. 29 §1º)." } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqMetas WHERE MetaId = @id`);
    if (antes.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Meta não encontrada." } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status || antes.recordset[0].Status)
      .input("justificativaTecnica", sql.NVarChar(1000), status === "NAO_CUMPRIDA" ? justificativaTecnica.trim() : (justificativaTecnica !== undefined ? justificativaTecnica : antes.recordset[0].JustificativaTecnica))
      .query(`UPDATE PdqMetas SET Status = @status, JustificativaTecnica = @justificativaTecnica WHERE MetaId = @id`);
    await registrarAuditoria({
      tabela: "PdqMetas", registroId: Number(id), acao: "Atualizou meta do PDQ", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { status, justificativaTecnica }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Meta atualizada." } };
    return;
  }
};
