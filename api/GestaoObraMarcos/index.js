// GestaoObraMarcos (v4.24 — cronograma físico-financeiro da obra)
// Marco com percentual físico previsto x realizado e valor previsto x
// gasto real — mesmo espírito do motor de projetos do PDQ (v4.8). O gasto
// real, quando existir, vem de uma Saída já lançada e paga (v4.5),
// vinculada por SaidaId — nunca digitado à mão duas vezes.
// GET  /api/obra-marcos?obraId= -> lista
// POST /api/obra-marcos -> { obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto }
// PUT  /api/obra-marcos/{id} -> { percentualFisicoRealizado, dataConclusao?, saidaId? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { obraId } = req.query || {};
    if (!obraId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe obraId." } };
      return;
    }
    const result = await pool.request().input("obraId", sql.Int, obraId).query(`SELECT * FROM ObraMarcos WHERE ObraId = @obraId ORDER BY DataPrevista`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto } = req.body || {};
    if (!obraId || !descricao || !descricao.trim() || !dataPrevista || percentualFisicoPrevisto == null || !valorPrevisto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto." } };
      return;
    }
    const obra = await pool.request().input("id", sql.Int, obraId).query(`SELECT ObraId FROM ObrasTemplo WHERE ObraId = @id`);
    if (obra.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obra não encontrada." } };
      return;
    }
    const criado = await pool.request().input("obraId", sql.Int, obraId).input("desc", sql.NVarChar(300), descricao.trim())
      .input("data", sql.Date, dataPrevista).input("pct", sql.Decimal(5, 2), percentualFisicoPrevisto)
      .input("valor", sql.Decimal(12, 2), valorPrevisto).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ObraMarcos (ObraId, Descricao, DataPrevista, PercentualFisicoPrevisto, ValorPrevisto, RegistradoPor)
              OUTPUT INSERTED.MarcoId VALUES (@obraId, @desc, @data, @pct, @valor, @por)`);
    await registrarAuditoria({
      tabela: "ObraMarcos", registroId: criado.recordset[0].MarcoId, acao: "Criou marco do cronograma da obra", usuarioId: usuario.membroId,
      dadosDepois: { obraId, descricao, dataPrevista, percentualFisicoPrevisto, valorPrevisto }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Marco criado.", marcoId: criado.recordset[0].MarcoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/obra-marcos/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM ObraMarcos WHERE MarcoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Marco não encontrado." } };
      return;
    }
    const { percentualFisicoRealizado, dataConclusao, saidaId } = req.body || {};
    if (percentualFisicoRealizado == null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe percentualFisicoRealizado." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("pct", sql.Decimal(5, 2), percentualFisicoRealizado)
      .input("data", sql.Date, dataConclusao || null).input("saidaId", sql.Int, saidaId || atual.recordset[0].SaidaId)
      .query(`UPDATE ObraMarcos SET PercentualFisicoRealizado = @pct, DataConclusao = @data, SaidaId = @saidaId WHERE MarcoId = @id`);
    await registrarAuditoria({
      tabela: "ObraMarcos", registroId: Number(id), acao: "Atualizou progresso do marco da obra", usuarioId: usuario.membroId,
      dadosDepois: { percentualFisicoRealizado, dataConclusao, saidaId }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Progresso do marco atualizado." } };
  }
};
