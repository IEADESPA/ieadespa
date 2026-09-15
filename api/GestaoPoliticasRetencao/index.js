// GestaoPoliticasRetencao (vB.6 — Arquivo institucional com tabela de
// temporalidade). PoliticasRetencao (v0.1) era só catálogo — sem CRUD
// nenhum até aqui (as 5 linhas seed continuavam sendo as únicas possíveis).
// Restrito a nível Global: mudar prazo de retenção é decisão de governança
// e compliance/LGPD, não de módulo.
// GET  /api/politicas-retencao       -> catálogo completo
// POST /api/politicas-retencao       -> { categoria, baseLegal, diasRetencao? }
// PUT  /api/politicas-retencao/{id}  -> { baseLegal?, diasRetencao?, ativo? }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirNivelGlobal(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT PoliticaId AS politicaId, Categoria AS categoria, BaseLegal AS baseLegal, DiasRetencao AS diasRetencao, Ativo AS ativo
      FROM PoliticasRetencao ORDER BY Categoria
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && !id) {
    const { categoria, baseLegal, diasRetencao } = req.body || {};
    if (!categoria || !categoria.trim() || !baseLegal || !baseLegal.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe categoria e baseLegal." } };
      return;
    }
    const existente = await pool.request().input("categoria", sql.NVarChar(60), categoria.trim()).query(`SELECT 1 FROM PoliticasRetencao WHERE Categoria = @categoria`);
    if (existente.recordset.length > 0) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "Já existe uma política com essa categoria." } };
      return;
    }
    const criada = await pool.request()
      .input("categoria", sql.NVarChar(60), categoria.trim()).input("baseLegal", sql.NVarChar(300), baseLegal.trim())
      .input("diasRetencao", sql.Int, diasRetencao != null ? diasRetencao : null)
      .query(`INSERT INTO PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) OUTPUT INSERTED.PoliticaId VALUES (@categoria, @baseLegal, @diasRetencao)`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Política de retenção criada.", politicaId: criada.recordset[0].PoliticaId } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { baseLegal, diasRetencao, ativo } = req.body || {};
    const existente = await pool.request().input("id", sql.Int, id).query(`SELECT 1 FROM PoliticasRetencao WHERE PoliticaId = @id`);
    if (existente.recordset.length === 0) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Política não encontrada." } };
      return;
    }
    await pool.request()
      .input("id", sql.Int, id)
      .input("baseLegal", sql.NVarChar(300), baseLegal || null)
      .input("diasRetencao", sql.Int, diasRetencao !== undefined ? diasRetencao : null)
      .input("temDiasRetencao", sql.Bit, diasRetencao !== undefined ? 1 : 0)
      .input("ativo", sql.Bit, typeof ativo === "boolean" ? ativo : null)
      .query(`
        UPDATE PoliticasRetencao SET
          BaseLegal = COALESCE(@baseLegal, BaseLegal),
          DiasRetencao = CASE WHEN @temDiasRetencao = 1 THEN @diasRetencao ELSE DiasRetencao END,
          Ativo = COALESCE(@ativo, Ativo)
        WHERE PoliticaId = @id
      `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Política de retenção atualizada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
