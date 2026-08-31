// GestaoLideranca
// Adaptado de gerenciarLiderancaApp() do sistema atual. Conceder liderança é
// o que dá acesso de login à Secretaria (ver api/shared/auth.js) — por isso
// exige a permissão "permissoes" pra mexer aqui: só quem já administra acesso
// pode conceder acesso a outra pessoa.
// GET    /api/lideranca            -> lista todos os líderes
// POST   /api/lideranca            -> body: { membroId, tipo, escopo, permissoes, senha } -> concede/atualiza acesso
// DELETE /api/lideranca/{membroId} -> remove liderança (e o acesso de login) daquele membro
//
// "Tipo" é só um rótulo/cargo de exibição (ex: "Dirigente", "Secretário de
// Consagrações") — quem controla o que a pessoa pode fazer de verdade é
// "permissoes" (chaves: reunioes, assembleia, cli, pessoas, permissoes, consagracoes) e
// "escopo" (lista de nomes de Congregacoes, ou 'TODAS').
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

const CHAVES_PERMISSAO_VALIDAS = ["reunioes", "assembleia", "cli", "pessoas", "permissoes", "consagracoes"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "permissoes");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const usuarioId = usuario.membroId;

  // ---- GET: listar ----
  if (method === "GET") {
    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // const result = await pool.request().query(`
    //   SELECT l.LiderancaId, l.MembroId, m.Nome, l.Tipo, l.Escopo, l.Permissoes
    //   FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId
    // `);
    // context.res = { status: 200, body: result.recordset };
    // return;

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: mockDb.listarLiderancas() };
    return;
  }

  // ---- POST: conceder ou atualizar acesso ----
  if (method === "POST") {
    const { membroId, papelId, escopoTipo, escopoId, senha } = req.body || {};
    if (!membroId || !papelId) {
      context.res = { status: 400, body: { erro: "Campos obrigatórios: membroId, papelId." } };
      return;
    }
    if (!mockDb.getMembro(membroId)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cadastre a pessoa antes de conceder liderança." } };
      return;
    }
    if (!mockDb.getPapel(papelId)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Papel inválido." } };
      return;
    }
    const jaTemAcesso = mockDb.getLideranca(membroId);
    if (!jaTemAcesso && !senha) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Defina uma senha para o primeiro acesso desta pessoa." } };
      return;
    }

    mockDb.criarOuAtualizarLideranca({ membroId, papelId, escopoTipo, escopoId, senha });

    await registrarAuditoria({
      tabela: "Lideranca",
      registroId: Number(membroId),
      acao: jaTemAcesso ? "Atualizou liderança" : "Concedeu liderança",
      usuarioId,
      dadosDepois: { membroId, papelId, escopoTipo, escopoId }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Liderança registrada." } };
    return;
  }

  // ---- DELETE: remover ----
  if (method === "DELETE") {
    if (!membroIdRota) {
      context.res = { status: 400, body: { erro: "Informe o membroId na rota: /api/lideranca/{membroId}" } };
      return;
    }

    // ---- Versão real com Azure SQL ----
    // const sql = require("mssql");
    // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    // await pool.request().input("membroId", sql.Int, membroIdRota)
    //   .query(`DELETE FROM Lideranca WHERE MembroId = @membroId`);

    const removeu = mockDb.removerLideranca(membroIdRota);
    if (!removeu) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa não tem liderança registrada." } };
      return;
    }

    await registrarAuditoria({ tabela: "Lideranca", registroId: Number(membroIdRota), acao: "Removeu liderança", usuarioId });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Liderança removida." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
