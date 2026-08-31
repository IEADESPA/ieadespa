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
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.congregacaoId;

  if (method === "GET") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const result = await pool.request().query(`SELECT * FROM Congregacoes ORDER BY Nome`);
    // context.res = { status: 200, body: result.recordset };
    // return;

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: mockDb.listarCongregacoes() };
    return;
  }

  if (method === "POST") {
    const { congregacaoId, nome, areaId } = req.body || {};
    if (!nome || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome da congregação." } };
      return;
    }

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // if (congregacaoId) {
    //   await pool.request().input("id", sql.Int, congregacaoId).input("nome", sql.NVarChar, nome)
    //     .query(`UPDATE Congregacoes SET Nome = @nome WHERE CongregacaoId = @id`);
    // } else {
    //   await pool.request().input("nome", sql.NVarChar, nome).query(`INSERT INTO Congregacoes (Nome) VALUES (@nome)`);
    // }

    const congregacao = congregacaoId
      ? mockDb.atualizarCongregacao(congregacaoId, { nome: nome.trim(), areaId })
      : mockDb.criarCongregacao({ nome: nome.trim(), areaId });

    if (!congregacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }

    await registrarAuditoria({
      tabela: "Congregacoes",
      registroId: congregacao.congregacaoId,
      acao: congregacaoId ? "Renomeou congregação" : "Cadastrou congregação",
      usuarioId: usuario.membroId,
      dadosDepois: { nome }
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

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().input("id", sql.Int, idRota).input("ativa", sql.Bit, ativa)
    //   .query(`UPDATE Congregacoes SET Ativa = @ativa WHERE CongregacaoId = @id`);

    const congregacao = ativa ? mockDb.reativarCongregacao(idRota) : mockDb.desativarCongregacao(idRota);
    if (!congregacao) {
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

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const emUso = await pool.request().input("id", sql.Int, idRota)
    //   .query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE CongregacaoId = @id`);
    // if (emUso.recordset[0].Total > 0) { ... "Não é possível excluir: existem pessoas nessa congregação." }
    // await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM Congregacoes WHERE CongregacaoId = @id`);

    const resultado = mockDb.excluirCongregacao(idRota);
    if (resultado.erro === "NAO_ENCONTRADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }
    if (resultado.erro === "EM_USO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível excluir: existem pessoas cadastradas nessa congregação. Desative em vez de excluir." } };
      return;
    }

    await registrarAuditoria({ tabela: "Congregacoes", registroId: Number(idRota), acao: "Excluiu congregação", usuarioId: usuario.membroId });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Congregação excluída." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
