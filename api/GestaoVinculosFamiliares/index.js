// GestaoVinculosFamiliares
// Núcleo mínimo (v0.2) — cadastro de relacionamentos entre membros (cônjuge, pai/mãe-
// filho, irmão, sogro/genro/nora), base para as vedações de nepotismo de fases futuras
// (v2.6 Conselho Fiscal, v3.1 CEI). Sem cálculo de grau de parentesco por travessia
// ainda (shared/parentesco.js nasce quando houver um consumidor de verdade).
// Exige a permissão "pessoas" (mesma que já vê telefone/e-mail/endereço).
// GET    /api/vinculos-familiares?membroId=123 -> vínculos de uma pessoa (ou todos, sem o filtro)
// POST   /api/vinculos-familiares              -> body: { membroId, membroParenteId, tipoVinculoId }
// DELETE /api/vinculos-familiares/{id}
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.id;
  const pool = await getPool();

  // ---- GET: listar vínculos (de uma pessoa, ou todos) ----
  if (method === "GET") {
    const membroId = (req.query || {}).membroId;
    if (membroId) {
      const result = await pool.request().input("membroId", sql.Int, membroId).query(`
        SELECT v.VinculoId AS vinculoId,
               CASE WHEN v.MembroId = @membroId THEN v.MembroParenteId ELSE v.MembroId END AS outraPessoaId,
               m2.Nome AS outraPessoaNome,
               t.Codigo AS tipoCodigo,
               CASE WHEN v.MembroId = @membroId THEN t.RotuloDireto ELSE COALESCE(t.RotuloInverso, t.RotuloDireto) END AS rotulo
        FROM VinculosFamiliares v
        JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
        JOIN MembroReferencia m2 ON m2.MembroId = CASE WHEN v.MembroId = @membroId THEN v.MembroParenteId ELSE v.MembroId END
        WHERE v.MembroId = @membroId OR v.MembroParenteId = @membroId
        ORDER BY m2.Nome`);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    const result = await pool.request().query(`
      SELECT v.VinculoId AS vinculoId, v.MembroId AS membroId, m1.Nome AS nome,
             v.MembroParenteId AS membroParenteId, m2.Nome AS parenteNome,
             t.Codigo AS tipoCodigo, t.RotuloDireto AS rotulo
      FROM VinculosFamiliares v
      JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
      JOIN MembroReferencia m1 ON m1.MembroId = v.MembroId
      JOIN MembroReferencia m2 ON m2.MembroId = v.MembroParenteId
      ORDER BY m1.Nome`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  // ---- POST: criar vínculo ----
  if (method === "POST") {
    const { membroId, membroParenteId, tipoVinculoId } = req.body || {};
    if (!membroId || !membroParenteId || !tipoVinculoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, membroParenteId, tipoVinculoId." } };
      return;
    }
    if (Number(membroId) === Number(membroParenteId)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Uma pessoa não pode ter vínculo familiar consigo mesma." } };
      return;
    }
    const membrosExistem = await pool.request().input("a", sql.Int, membroId).input("b", sql.Int, membroParenteId)
      .query(`SELECT MembroId FROM MembroReferencia WHERE MembroId IN (@a, @b)`);
    if (membrosExistem.recordset.length < 2) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cadastre as duas pessoas antes de vincular." } };
      return;
    }
    const tipo = await pool.request().input("id", sql.Int, tipoVinculoId).query(`SELECT TipoVinculoId FROM TiposVinculoFamiliar WHERE TipoVinculoId = @id AND Ativo = 1`);
    if (tipo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Tipo de vínculo inválido." } };
      return;
    }
    const duplicado = await pool.request().input("a", sql.Int, membroId).input("b", sql.Int, membroParenteId)
      .query(`SELECT 1 FROM VinculosFamiliares WHERE (MembroId = @a AND MembroParenteId = @b) OR (MembroId = @b AND MembroParenteId = @a)`);
    if (duplicado.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe um vínculo familiar cadastrado entre essas duas pessoas." } };
      return;
    }

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("membroParenteId", sql.Int, membroParenteId)
      .input("tipoVinculoId", sql.Int, tipoVinculoId)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`
        INSERT INTO VinculosFamiliares (MembroId, MembroParenteId, TipoVinculoId, CriadoPor)
        OUTPUT INSERTED.VinculoId
        VALUES (@membroId, @membroParenteId, @tipoVinculoId, @criadoPor)`);
    const vinculoId = result.recordset[0].VinculoId;

    await registrarAuditoria({
      tabela: "VinculosFamiliares",
      registroId: vinculoId,
      acao: "Criou vínculo familiar",
      usuarioId: usuario.membroId,
      dadosDepois: { membroId, membroParenteId, tipoVinculoId }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Vínculo familiar cadastrado.", vinculoId } };
    return;
  }

  // ---- DELETE: remover vínculo ----
  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/vinculos-familiares/{id}" } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, MembroParenteId, TipoVinculoId FROM VinculosFamiliares WHERE VinculoId = @id`);
    const del = await pool.request().input("id", sql.Int, idRota).query(`DELETE FROM VinculosFamiliares WHERE VinculoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Vínculo não encontrado." } };
      return;
    }
    await registrarAuditoria({ tabela: "VinculosFamiliares", registroId: Number(idRota), acao: "Removeu vínculo familiar", usuarioId: usuario.membroId, dadosAntes: antes.recordset[0] });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Vínculo removido." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
