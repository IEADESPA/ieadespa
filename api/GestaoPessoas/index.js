// GestaoPessoas
// Cadastro de obreiros (MembroReferencia). Exige a permissão "pessoas".
// GET    /api/pessoas            -> lista (filtrada pelo escopo de quem está logado)
// POST   /api/pessoas            -> body: { membroId, nome, funcao, congregacaoId, status } -> cria ou atualiza
// DELETE /api/pessoas/{membroId} -> não remove de verdade: marca status = DESLIGADO
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;

  // ---- GET: listar (só quem está no escopo de quem está logado) ----
  if (method === "GET") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const result = await pool.request().query(`
    //   SELECT m.*, c.Nome AS Congregacao FROM MembroReferencia m
    //   LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId ORDER BY m.Nome
    // `);
    // context.res = { status: 200, body: result.recordset }; // filtre por escopo na aplicação, igual ao mock
    // return;

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: mockDb.listarMembros({ escopoCongregacoes: usuario.escopoCongregacoes })
    };
    return;
  }

  // ---- POST: criar ou atualizar ----
  if (method === "POST") {
    const { membroId, nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel, situacaoMembro, departamentoId } = req.body || {};
    if (!membroId || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, nome." } };
      return;
    }
    if (funcao && !mockDb.getFuncaoPorNome(funcao)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Função "${funcao}" não está cadastrada.` } };
      return;
    }
    if (congregacaoId && !mockDb.getCongregacao(congregacaoId)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação inválida." } };
      return;
    }

    // ---- Versão real com Azure SQL (upsert) ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const existente = await pool.request().input("id", sql.Int, membroId)
    //   .query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    // if (existente.recordset.length > 0) {
    //   await pool.request().input("id", sql.Int, membroId).input("nome", sql.NVarChar, nome)
    //     .input("funcao", sql.NVarChar, funcao).input("congregacaoId", sql.Int, congregacaoId || null).input("status", sql.NVarChar, status || "ATIVO")
    //     .query(`UPDATE MembroReferencia SET Nome=@nome, Funcao=@funcao, CongregacaoId=@congregacaoId, Status=@status WHERE MembroId=@id`);
    // } else {
    //   await pool.request().input("id", sql.Int, membroId).input("nome", sql.NVarChar, nome)
    //     .input("funcao", sql.NVarChar, funcao).input("congregacaoId", sql.Int, congregacaoId || null).input("status", sql.NVarChar, status || "ATIVO")
    //     .query(`INSERT INTO MembroReferencia (MembroId, Nome, Funcao, CongregacaoId, Status) VALUES (@id, @nome, @funcao, @congregacaoId, @status)`);
    // }

    const existia = mockDb.getMembro(membroId);
    const membro = existia
      ? mockDb.atualizarMembro(membroId, { nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel, situacaoMembro, departamentoId })
      : mockDb.criarMembro({ membroId, nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel, situacaoMembro, departamentoId });

    if (!membro) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula já cadastrada." } };
      return;
    }

    await registrarAuditoria({
      tabela: "MembroReferencia",
      registroId: Number(membroId),
      acao: existia ? "Atualizou pessoa" : "Cadastrou pessoa",
      usuarioId: usuario.membroId,
      dadosDepois: { nome, funcao, congregacaoId, status }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: existia ? "✅ Pessoa atualizada." : "✅ Pessoa cadastrada.", membro } };
    return;
  }

  // ---- DELETE: desligar (não remove de verdade) ----
  if (method === "DELETE") {
    if (!membroIdRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota: /api/pessoas/{membroId}" } };
      return;
    }

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().input("id", sql.Int, membroIdRota)
    //   .query(`UPDATE MembroReferencia SET Status = 'DESLIGADO' WHERE MembroId = @id`);

    const membro = mockDb.desligarMembro(membroIdRota);
    if (!membro) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }

    await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(membroIdRota), acao: "Desligou pessoa", usuarioId: usuario.membroId });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pessoa desligada." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
