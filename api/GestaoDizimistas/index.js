// GestaoDizimistas (v4.1)
// Cadastro de dizimistas por congregação — substitui a planilha de Excel.
// Pode ou não ser membro cadastrado no sistema (visitante fiel, cônjuge
// não-membro etc.).
// GET    /api/dizimistas?congregacaoId=  -> lista (dentro do escopo do usuário)
// POST   /api/dizimistas                 -> body: { congregacaoId, nome, membroId? }
// DELETE /api/dizimistas/{id}            -> soft delete (Ativo=0)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  async function nomeCongregacao(congregacaoId) {
    const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    return r.recordset[0] ? r.recordset[0].Nome : null;
  }

  if (req.method === "GET") {
    const { congregacaoId } = req.query || {};
    const request = pool.request();
    let where = "d.Ativo = 1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND d.CongregacaoId = @congregacaoId"; }

    const result = await request.query(`
      SELECT d.DizimistaId AS dizimistaId, d.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
             d.Nome AS nome, d.MembroId AS membroId
      FROM Dizimistas d
      JOIN Congregacoes c ON c.CongregacaoId = d.CongregacaoId
      WHERE ${where}
      ORDER BY d.Nome
    `);
    const dizimistas = result.recordset.filter(dz => auth.estaNoEscopo(usuario, dz.congregacaoNome));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: dizimistas };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, nome, membroId } = req.body || {};
    if (!congregacaoId || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId e nome." } };
      return;
    }
    const congNome = await nomeCongregacao(congregacaoId);
    if (!congNome || !auth.estaNoEscopo(usuario, congNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId)
      .input("nome", sql.NVarChar(200), nome)
      .input("membroId", sql.Int, membroId || null)
      .query(`INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) OUTPUT INSERTED.DizimistaId VALUES (@congregacaoId, @nome, @membroId)`);
    const dizimistaId = criado.recordset[0].DizimistaId;

    await registrarAuditoria({
      tabela: "Dizimistas", registroId: dizimistaId, acao: "Cadastrou dizimista", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, nome, membroId: membroId || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dizimista cadastrado.", dizimistaId } };
    return;
  }

  if (req.method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/dizimistas/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT d.*, c.Nome AS congregacaoNome FROM Dizimistas d JOIN Congregacoes c ON c.CongregacaoId = d.CongregacaoId WHERE d.DizimistaId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Dizimista não encontrado." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, atual.recordset[0].congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).query(`UPDATE Dizimistas SET Ativo = 0 WHERE DizimistaId = @id`);
    await registrarAuditoria({
      tabela: "Dizimistas", registroId: Number(id), acao: "Inativou dizimista", usuarioId: usuario.membroId, dadosAntes: atual.recordset[0]
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dizimista inativado." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
