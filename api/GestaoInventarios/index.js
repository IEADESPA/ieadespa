// GestaoInventarios (v4.11 — item 1)
// Inventário físico anual de bens (dezembro — Reg. Art. 59, I/II): cada
// congregação/departamento abre o inventário do ano e relaciona cada bem
// com estado de conservação e presença física. Restrito ao escopo.
// GET  /api/inventarios?anoReferencia=&congregacaoId= -> lista
// GET  /api/inventarios/{id} -> detalhe + itens
// POST /api/inventarios -> { anoReferencia, congregacaoId? } abre inventário
// POST /api/inventarios/{id} -> { bemId, estadoConservacao, presente?, observacao? } adiciona item
// PUT  /api/inventarios/{id} -> { acao: 'CONCLUIR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ESTADOS = ["BOM", "REGULAR", "RUIM", "INSERVIVEL"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { anoReferencia, congregacaoId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (anoReferencia) { request.input("ano", sql.Int, anoReferencia); where += " AND i.AnoReferencia = @ano"; }
    if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); where += " AND i.CongregacaoId = @cong"; }
    const result = await request.query(`
      SELECT i.InventarioId AS inventarioId, i.AnoReferencia AS anoReferencia, i.CongregacaoId AS congregacaoId,
             c.Nome AS congregacaoNome, i.Status AS status, (SELECT COUNT(*) FROM InventarioItens it WHERE it.InventarioId = i.InventarioId) AS totalItens
      FROM InventariosAnuais i LEFT JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
      WHERE ${where} ORDER BY i.AnoReferencia DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const inventario = await pool.request().input("id", sql.Int, id).query(`
      SELECT i.*, c.Nome AS congregacaoNome FROM InventariosAnuais i
      LEFT JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId WHERE i.InventarioId = @id
    `);
    if (inventario.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Inventário não encontrado." } };
      return;
    }
    const itens = await pool.request().input("id", sql.Int, id).query(`
      SELECT it.InventarioItemId AS inventarioItemId, it.BemId AS bemId, b.Descricao AS bemDescricao,
             b.Tipo AS bemTipo, it.EstadoConservacao AS estadoConservacao, it.Presente AS presente, it.Observacao AS observacao
      FROM InventarioItens it JOIN BensPatrimoniais b ON b.BemId = it.BemId WHERE it.InventarioId = @id ORDER BY b.Descricao
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, inventario.recordset[0], { itens: itens.recordset }) };
    return;
  }

  if (req.method === "POST" && !id) {
    const { anoReferencia, congregacaoId } = req.body || {};
    if (!anoReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o anoReferencia." } };
      return;
    }
    const existente = await pool.request().input("ano", sql.Int, anoReferencia).input("cong", sql.Int, congregacaoId || null)
      .query(`SELECT InventarioId FROM InventariosAnuais WHERE AnoReferencia = @ano AND ISNULL(CongregacaoId, -1) = ISNULL(@cong, -1)`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe inventário aberto para este ano/escopo." } };
      return;
    }
    const criado = await pool.request().input("ano", sql.Int, anoReferencia).input("cong", sql.Int, congregacaoId || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO InventariosAnuais (AnoReferencia, CongregacaoId, RegistradoPor) OUTPUT INSERTED.InventarioId VALUES (@ano, @cong, @por)`);
    await registrarAuditoria({
      tabela: "InventariosAnuais", registroId: criado.recordset[0].InventarioId, acao: "Abriu inventário anual", usuarioId: usuario.membroId,
      dadosDepois: { anoReferencia, congregacaoId: congregacaoId || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Inventário aberto.", inventarioId: criado.recordset[0].InventarioId } };
    return;
  }

  if (req.method === "POST" && id) {
    const { bemId, estadoConservacao, presente, observacao } = req.body || {};
    if (!bemId || !estadoConservacao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: bemId, estadoConservacao." } };
      return;
    }
    if (!ESTADOS.includes(estadoConservacao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `estadoConservacao inválido. Use um de: ${ESTADOS.join(", ")}.` } };
      return;
    }
    const inv = await pool.request().input("id", sql.Int, id).query(`SELECT Status FROM InventariosAnuais WHERE InventarioId = @id`);
    if (inv.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Inventário não encontrado." } };
      return;
    }
    if (inv.recordset[0].Status !== "ABERTO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este inventário já foi concluído." } };
      return;
    }
    await pool.request().input("inv", sql.Int, id).input("bemId", sql.Int, bemId)
      .input("estado", sql.NVarChar(30), estadoConservacao).input("presente", sql.Bit, presente === false ? 0 : 1)
      .input("obs", sql.NVarChar(300), observacao || null)
      .query(`INSERT INTO InventarioItens (InventarioId, BemId, EstadoConservacao, Presente, Observacao)
              VALUES (@inv, @bemId, @estado, @presente, @obs)`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Item lançado no inventário." } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    if (acao !== "CONCLUIR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida — use 'CONCLUIR'." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).query(`UPDATE InventariosAnuais SET Status = 'CONCLUIDO' WHERE InventarioId = @id`);
    await registrarAuditoria({
      tabela: "InventariosAnuais", registroId: Number(id), acao: "Concluiu inventário anual", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Inventário concluído." } };
    return;
  }
};

