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
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.funcaoId;

  if (method === "GET") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const result = await pool.request().query(`SELECT * FROM Funcoes ORDER BY Nome`);
    // context.res = { status: 200, body: result.recordset };
    // return;

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: mockDb.listarFuncoes() };
    return;
  }

  if (method === "POST") {
    const { funcaoId, nome } = req.body || {};
    if (!nome || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome da função." } };
      return;
    }

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // if (funcaoId) {
    //   await pool.request().input("id", sql.Int, funcaoId).input("nome", sql.NVarChar, nome)
    //     .query(`UPDATE Funcoes SET Nome = @nome WHERE FuncaoId = @id`);
    // } else {
    //   await pool.request().input("nome", sql.NVarChar, nome).query(`INSERT INTO Funcoes (Nome) VALUES (@nome)`);
    // }

    const funcao = funcaoId
      ? mockDb.atualizarFuncao(funcaoId, nome.trim())
      : mockDb.criarFuncao(nome.trim());

    if (!funcao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Função não encontrada." } };
      return;
    }

    await registrarAuditoria({
      tabela: "Funcoes",
      registroId: funcao.funcaoId,
      acao: funcaoId ? "Renomeou função" : "Cadastrou função",
      usuarioId: usuario.membroId,
      dadosDepois: { nome }
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

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().input("id", sql.Int, idRota).input("ativa", sql.Bit, ativa)
    //   .query(`UPDATE Funcoes SET Ativa = @ativa WHERE FuncaoId = @id`);

    const funcao = ativa ? mockDb.reativarFuncao(idRota) : mockDb.desativarFuncao(idRota);
    if (!funcao) {
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

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const emUso = await pool.request().input("nome", sql.NVarChar, nomeDaFuncao)
    //   .query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE Funcao = @nome`);
    // if (emUso.recordset[0].Total > 0) { ... "Não é possível excluir: existem pessoas com essa função." }
    // await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM Funcoes WHERE FuncaoId = @id`);

    const resultado = mockDb.excluirFuncao(idRota);
    if (resultado.erro === "NAO_ENCONTRADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Função não encontrada." } };
      return;
    }
    if (resultado.erro === "EM_USO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível excluir: existem pessoas cadastradas com essa função. Desative em vez de excluir." } };
      return;
    }

    await registrarAuditoria({ tabela: "Funcoes", registroId: Number(idRota), acao: "Excluiu função", usuarioId: usuario.membroId });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Função excluída." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
