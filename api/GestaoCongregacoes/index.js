// GestaoCongregacoes
// Catálogo fechado de congregações — resolve o problema de "Templo Central"
// x "Sede" digitados de formas diferentes pra mesma congregação. Exige a
// permissão "pessoas" (é dado de apoio ao cadastro de pessoas).
// GET    /api/congregacoes                    -> lista (inclusive inativas)
// POST   /api/congregacoes                    -> body: { congregacaoId?, nome } -> cria (sem id) ou renomeia (com id)
// PUT    /api/congregacoes/{congregacaoId}     -> body: { ativa: true|false } -> reativa ou desativa
// DELETE /api/congregacoes/{congregacaoId}     -> exclui de verdade (só se ninguém mais usa)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.congregacaoId;
  const pool = await getPool();

  if (method === "GET") {
    const result = await pool.request().query(
      `SELECT CongregacaoId AS congregacaoId, Nome AS nome, Ativa AS ativa, AreaId AS areaId
       FROM Congregacoes ORDER BY Nome`
    );
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (method === "POST") {
    const { congregacaoId, nome, areaId } = req.body || {};
    if (!nome || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome da congregação." } };
      return;
    }
    const nomeLimpo = nome.trim();

    if (congregacaoId) {
      const upd = await pool.request()
        .input("id", sql.Int, congregacaoId)
        .input("nome", sql.NVarChar(150), nomeLimpo)
        .input("areaId", sql.Int, areaId || null)
        .query(`UPDATE Congregacoes SET Nome = @nome, AreaId = @areaId WHERE CongregacaoId = @id`);
      if (upd.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
        return;
      }
    } else {
      await pool.request()
        .input("nome", sql.NVarChar(150), nomeLimpo)
        .input("areaId", sql.Int, areaId || null)
        .query(`INSERT INTO Congregacoes (Nome, AreaId) VALUES (@nome, @areaId)`);
    }

    const result = await pool.request().input("nome", sql.NVarChar(150), nomeLimpo)
      .query(`SELECT TOP 1 CongregacaoId AS congregacaoId, Nome AS nome, Ativa AS ativa, AreaId AS areaId
              FROM Congregacoes WHERE Nome = @nome ORDER BY CongregacaoId DESC`);
    const congregacao = result.recordset[0];

    await registrarAuditoria({
      tabela: "Congregacoes",
      registroId: congregacao.congregacaoId,
      acao: congregacaoId ? "Renomeou congregação" : "Cadastrou congregação",
      usuarioId: usuario.membroId,
      dadosDepois: { nome: nomeLimpo, areaId }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Congregação salva.", congregacao } };
    return;
  }

  if (method === "PUT") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o congregacaoId na rota." } };
      return;
    }
    const { ativa } = req.body || {};
    const upd = await pool.request().input("id", sql.Int, idRota).input("ativa", sql.Bit, !!ativa)
      .query(`UPDATE Congregacoes SET Ativa = @ativa WHERE CongregacaoId = @id`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "Congregacoes", registroId: Number(idRota), acao: ativa ? "Reativou congregação" : "Desativou congregação", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: ativa ? "✅ Congregação reativada." : "✅ Congregação desativada." } };
    return;
  }

  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o congregacaoId na rota." } };
      return;
    }
    const emUso = await pool.request().input("id", sql.Int, idRota)
      .query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE CongregacaoId = @id`);
    if (emUso.recordset[0].Total > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível excluir: existem pessoas cadastradas nessa congregação. Desative em vez de excluir." } };
      return;
    }
    const del = await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM Congregacoes WHERE CongregacaoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "Congregacoes", registroId: Number(idRota), acao: "Excluiu congregação", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Congregação excluída." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
