// GestaoLideranca
// Conceder liderança é o que dá acesso de login à Secretaria (ver
// api/shared/auth.js) — por isso exige a permissão "permissoes" pra mexer
// aqui: só quem já administra acesso pode conceder acesso a outra pessoa.
// GET    /api/lideranca            -> lista todos os líderes
// POST   /api/lideranca            -> body: { membroId, papelId, escopoTipo, escopoId, senha } -> concede/atualiza acesso
// DELETE /api/lideranca/{membroId} -> remove liderança (e o acesso de login) daquele membro
//
// "Papel" (Papeis) é quem carrega as Permissões de verdade (Papeis.Permissoes,
// chaves separadas por vírgula). "Tipo"/"Escopo" (colunas antigas da tabela)
// não são mais usadas — ver migração 003 (Lideranca.Tipo/Escopo viraram opcionais).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

// Níveis da Governança Escalonada aceitos como escopo de acesso. "Extensão da
// Tenda" fica de fora por enquanto: MembroReferencia ainda não tem vínculo com
// ExtensoesTenda, então não haveria ninguém pra esse escopo enxergar.
const ESCOPO_TIPOS_VALIDOS = ["GLOBAL", "CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "permissoes");
  if (!usuario) return;

  const method = req.method;
  const membroIdRota = context.bindingData.membroId;
  const usuarioId = usuario.membroId;
  const pool = await getPool();

  // ---- GET: listar ----
  if (method === "GET") {
    const result = await pool.request().query(`
      SELECT l.LiderancaId AS liderancaId, l.MembroId AS membroId, m.Nome AS nome,
             l.PapelId AS papelId, p.Nome AS papel, p.Nivel AS nivel,
             l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, p.Permissoes AS permissoesStr
      FROM Lideranca l
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      JOIN Papeis p ON p.PapelId = l.PapelId
    `);
    const liderancas = result.recordset.map(l => ({
      liderancaId: l.liderancaId,
      membroId: l.membroId,
      nome: l.nome,
      papelId: l.papelId,
      papel: l.papel,
      nivel: l.nivel,
      escopoTipo: l.escopoTipo,
      escopoId: l.escopoId,
      permissoes: l.permissoesStr ? l.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : []
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: liderancas };
    return;
  }

  // ---- POST: conceder ou atualizar acesso ----
  if (method === "POST") {
    const { membroId, papelId, escopoTipo, escopoId, senha } = req.body || {};
    if (!membroId || !papelId) {
      context.res = { status: 400, body: { erro: "Campos obrigatórios: membroId, papelId." } };
      return;
    }
    if (escopoTipo && !ESCOPO_TIPOS_VALIDOS.includes(escopoTipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Tipo de escopo inválido." } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cadastre a pessoa antes de conceder liderança." } };
      return;
    }
    const papel = await pool.request().input("id", sql.Int, papelId).query(`SELECT PapelId FROM Papeis WHERE PapelId = @id`);
    if (papel.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Papel inválido." } };
      return;
    }
    const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT LiderancaId FROM Lideranca WHERE MembroId = @id`);
    const jaTemAcesso = existente.recordset.length > 0;
    if (!jaTemAcesso && !senha) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Defina uma senha para o primeiro acesso desta pessoa." } };
      return;
    }

    if (jaTemAcesso) {
      const request = pool.request()
        .input("id", sql.Int, membroId)
        .input("papelId", sql.Int, papelId)
        .input("escopoTipo", sql.NVarChar(30), escopoTipo || "GLOBAL")
        .input("escopoId", sql.Int, escopoId || null);
      let query = `UPDATE Lideranca SET PapelId = @papelId, EscopoTipo = @escopoTipo, EscopoId = @escopoId`;
      if (senha) {
        request.input("senhaHash", sql.NVarChar(200), auth.hashSenha(senha));
        query += `, SenhaHash = @senhaHash`;
      }
      query += ` WHERE MembroId = @id`;
      await request.query(query);
    } else {
      await pool.request()
        .input("membroId", sql.Int, membroId)
        .input("papelId", sql.Int, papelId)
        .input("escopoTipo", sql.NVarChar(30), escopoTipo || "GLOBAL")
        .input("escopoId", sql.Int, escopoId || null)
        .input("senhaHash", sql.NVarChar(200), auth.hashSenha(senha))
        .query(`INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) VALUES (@membroId, @papelId, @escopoTipo, @escopoId, @senhaHash)`);
    }

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
    const del = await pool.request().input("id", sql.Int, membroIdRota).query(`DELETE FROM Lideranca WHERE MembroId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta pessoa não tem liderança registrada." } };
      return;
    }
    await registrarAuditoria({ tabela: "Lideranca", registroId: Number(membroIdRota), acao: "Removeu liderança", usuarioId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Liderança removida." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
