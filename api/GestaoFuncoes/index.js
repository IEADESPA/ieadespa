// GestaoFuncoes
// Catálogo fechado de funções eclesiásticas (Presbítero, Diácono, etc.) —
// mesmo raciocínio de GestaoCongregacoes: sem opção de digitar livre, pra
// não repetir o mesmo nome de formas diferentes. Exige a permissão "pessoas".
// GET    /api/funcoes                -> lista (inclusive inativas)
// POST   /api/funcoes                -> body: { funcaoId?, nome } -> cria (sem id) ou renomeia (com id)
// PUT    /api/funcoes/{funcaoId}     -> body: { ativa: true|false } -> reativa ou desativa
// DELETE /api/funcoes/{funcaoId}     -> exclui de verdade (só se ninguém mais usa)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.funcaoId;
  const pool = await getPool();

  if (method === "GET") {
    const result = await pool.request().query(
      `SELECT FuncaoId AS funcaoId, Nome AS nome, Ativa AS ativa FROM Funcoes ORDER BY Nome`
    );
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (method === "POST") {
    const { funcaoId, nome } = req.body || {};
    if (!nome || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome da função." } };
      return;
    }
    const nomeLimpo = nome.trim();

    if (funcaoId) {
      const upd = await pool.request().input("id", sql.Int, funcaoId).input("nome", sql.NVarChar(100), nomeLimpo)
        .query(`UPDATE Funcoes SET Nome = @nome WHERE FuncaoId = @id`);
      if (upd.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Função não encontrada." } };
        return;
      }
    } else {
      await pool.request().input("nome", sql.NVarChar(100), nomeLimpo)
        .query(`INSERT INTO Funcoes (Nome) VALUES (@nome)`);
    }

    const result = await pool.request().input("nome", sql.NVarChar(100), nomeLimpo)
      .query(`SELECT TOP 1 FuncaoId AS funcaoId, Nome AS nome, Ativa AS ativa FROM Funcoes WHERE Nome = @nome ORDER BY FuncaoId DESC`);
    const funcao = result.recordset[0];

    await registrarAuditoria({
      tabela: "Funcoes",
      registroId: funcao.funcaoId,
      acao: funcaoId ? "Renomeou função" : "Cadastrou função",
      usuarioId: usuario.membroId,
      dadosDepois: { nome: nomeLimpo }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Função salva.", funcao } };
    return;
  }

  if (method === "PUT") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o funcaoId na rota." } };
      return;
    }
    const { ativa } = req.body || {};
    const upd = await pool.request().input("id", sql.Int, idRota).input("ativa", sql.Bit, !!ativa)
      .query(`UPDATE Funcoes SET Ativa = @ativa WHERE FuncaoId = @id`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Função não encontrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "Funcoes", registroId: Number(idRota), acao: ativa ? "Reativou função" : "Desativou função", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: ativa ? "✅ Função reativada." : "✅ Função desativada." } };
    return;
  }

  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o funcaoId na rota." } };
      return;
    }
    const alvo = await pool.request().input("id", sql.Int, idRota)
      .query(`SELECT Nome FROM Funcoes WHERE FuncaoId = @id`);
    if (alvo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Função não encontrada." } };
      return;
    }
    const emUso = await pool.request().input("nome", sql.NVarChar(100), alvo.recordset[0].Nome)
      .query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE Funcao = @nome`);
    if (emUso.recordset[0].Total > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível excluir: existem pessoas cadastradas com essa função. Desative em vez de excluir." } };
      return;
    }
    await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM Funcoes WHERE FuncaoId = @id`);
    await registrarAuditoria({ tabela: "Funcoes", registroId: Number(idRota), acao: "Excluiu função", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Função excluída." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
