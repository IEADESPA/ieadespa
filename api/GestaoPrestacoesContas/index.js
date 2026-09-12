// GestaoPrestacoesContas (v4.12 — itens 9 e 10)
// Prestação de contas mensal (Reg. Art. 120): comprovantes de água/luz,
// prazo fatal (1º útil, tolerância dia 5), Ata de Pendência automática e
// bloqueio de repasse por falta de prestação.
// GET  /api/prestacoes-contas?mesReferencia=&congregacaoId=
// POST /api/prestacoes-contas -> { congregacaoId, mesReferencia, comprovanteAguaBase64?, mimeTypeAgua?, comprovanteLuzBase64?, mimeTypeLuz? }
// PUT  /api/prestacoes-contas/{id} -> { acao: 'LIBERAR'|'BLOQUEAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Prestação de contas é conferida pela Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { mesReferencia, congregacaoId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (mesReferencia) { request.input("mes", sql.Char(7), mesReferencia); where += " AND p.MesReferencia = @mes"; }
    if (congregacaoId) { request.input("cong", sql.Int, congregacaoId); where += " AND p.CongregacaoId = @cong"; }
    const result = await request.query(`
      SELECT p.PrestacaoId AS prestacaoId, p.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
             p.MesReferencia AS mesReferencia, p.Status AS status, p.BloqueioRepasse AS bloqueioRepasse,
             CASE WHEN p.ComprovanteAguaUrl IS NOT NULL THEN 1 ELSE 0 END AS temAgua,
             CASE WHEN p.ComprovanteLuzUrl IS NOT NULL THEN 1 ELSE 0 END AS temLuz
      FROM PrestacoesContas p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
      WHERE ${where} ORDER BY p.MesReferencia DESC, c.Nome
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, mesReferencia, comprovanteAguaBase64, mimeTypeAgua, comprovanteLuzBase64, mimeTypeLuz } = req.body || {};
    if (!congregacaoId || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, mesReferencia." } };
      return;
    }
    const existente = await pool.request().input("cong", sql.Int, congregacaoId).input("mes", sql.Char(7), mesReferencia)
      .query(`SELECT PrestacaoId FROM PrestacoesContas WHERE CongregacaoId = @cong AND MesReferencia = @mes`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe prestação de contas para esta congregação e mês." } };
      return;
    }

    let aguaUrl = null;
    let luzUrl = null;
    if (comprovanteAguaBase64) {
      if (!mimeTypeAgua || !MIME_PERMITIDOS.includes(mimeTypeAgua)) { context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de comprovante de água inválido." } }; return; }
      aguaUrl = await storage.salvarDocumento(Buffer.from(comprovanteAguaBase64, "base64"), mimeTypeAgua);
    }
    if (comprovanteLuzBase64) {
      if (!mimeTypeLuz || !MIME_PERMITIDOS.includes(mimeTypeLuz)) { context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de comprovante de luz inválido." } }; return; }
      luzUrl = await storage.salvarDocumento(Buffer.from(comprovanteLuzBase64, "base64"), mimeTypeLuz);
    }

    // Sem os dois comprovantes → Ata de Pendência automática + bloqueio de
    // repasse (Reg. Art. 120 §3º, II — o "Sinal Vermelho").
    const completa = aguaUrl && luzUrl;
    const status = completa ? "COMPLETA" : "ATA_PENDENCIA";
    const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("mes", sql.Char(7), mesReferencia)
      .input("agua", sql.NVarChar(500), aguaUrl).input("luz", sql.NVarChar(500), luzUrl)
      .input("status", sql.NVarChar(20), status).input("bloqueio", sql.Bit, completa ? 0 : 1).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO PrestacoesContas (CongregacaoId, MesReferencia, ComprovanteAguaUrl, ComprovanteLuzUrl, Status, BloqueioRepasse, RegistradoPor)
              OUTPUT INSERTED.PrestacaoId VALUES (@cong, @mes, @agua, @luz, @status, @bloqueio, @por)`);
    await registrarAuditoria({
      tabela: "PrestacoesContas", registroId: criada.recordset[0].PrestacaoId, acao: "Registrou prestação de contas", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, mesReferencia, status, bloqueioRepasse: !completa }
    });
    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: completa ? "✅ Prestação de contas completa." : "⚠️ Prestação recebida SEM comprovantes de água/luz — Ata de Pendência gerada e repasse BLOQUEADO (Reg. Art. 120 §3º)." }
    };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    if (acao !== "LIBERAR" && acao !== "BLOQUEAR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida — use 'LIBERAR' ou 'BLOQUEAR'." } };
      return;
    }
    const novoBloqueio = acao === "BLOQUEAR" ? 1 : 0;
    await pool.request().input("id", sql.Int, id).input("bloqueio", sql.Bit, novoBloqueio)
      .query(`UPDATE PrestacoesContas SET BloqueioRepasse = @bloqueio WHERE PrestacaoId = @id`);
    await registrarAuditoria({
      tabela: "PrestacoesContas", registroId: Number(id), acao: acao === "BLOQUEAR" ? "Bloqueou repasse por prestação de contas" : "Liberou repasse (prestação regularizada)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: acao === "BLOQUEAR" ? "🔒 Repasse bloqueado." : "✅ Repasse liberado." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Rota inválida." } };
};

