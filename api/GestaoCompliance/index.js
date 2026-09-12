// GestaoCompliance (v4.12 — CCM + Recertificação + Parâmetros)
// Monitoramento Contínuo de Controles (CCM) e Revisão Periódica de Acessos.
// GET  /api/compliance/alertas -> varre e lista alertas ativos
// PUT  /api/compliance/alertas -> { alertaId, acao: 'RESOLVER' }
// GET  /api/compliance/recertificacoes -> gera e lista recertificações
// PUT  /api/compliance/recertificacoes -> { recertificacaoId, acao: 'CONFIRMAR'|'EXPIRAR' }
// GET  /api/compliance/parametros
// PUT  /api/compliance/parametros -> { valorCriticoQuatroOlhos?, periodicidadeRecertificacaoMeses? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const compliance = require("../shared/compliance");

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "auditoria");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && recurso === "alertas") {
    const novos = await compliance.escanearAlertasCompliance(pool, sql);
    const result = await pool.request().query(`
      SELECT AlertaId AS alertaId, Tipo AS tipo, Severidade AS severidade, Descricao AS descricao,
             TabelaOrigem AS tabelaOrigem, RegistroOrigemId AS registroOrigemId, Status AS status,
             CONVERT(varchar(33), CriadoEm, 126) AS criadoEm
      FROM AlertasCompliance WHERE Status = 'ATIVO' ORDER BY Severidade DESC, CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { novosDetectados: novos, alertas: result.recordset } };
    return;
  }

  if (req.method === "PUT" && recurso === "alertas") {
    const { alertaId, acao } = req.body || {};
    if (acao !== "RESOLVER" || !alertaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe alertaId e acao: 'RESOLVER'." } };
      return;
    }
    await pool.request().input("id", sql.Int, alertaId).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE AlertasCompliance SET Status = 'RESOLVIDO', ResolvidoPor = @por, ResolvidoEm = SYSUTCDATETIME() WHERE AlertaId = @id`);
    await registrarAuditoria({
      tabela: "AlertasCompliance", registroId: Number(alertaId), acao: "Resolveu alerta de compliance", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Alerta resolvido." } };
    return;
  }

  if (req.method === "GET" && recurso === "recertificacoes") {
    await compliance.gerarRecertificacoesFinanceiro(pool, sql);
    await pool.request().query(`UPDATE RecertificacoesAcesso SET Status = 'EXPIRADA' WHERE Status = 'PENDENTE' AND Prazo < CAST(SYSUTCDATETIME() AS DATE)`);
    const result = await pool.request().query(`
      SELECT r.RecertificacaoId AS recertificacaoId, r.MembroId AS membroId, m.Nome AS nome, r.PapelId AS papelId,
             p.Nome AS papelNome, r.Permissao AS permissao, r.Status AS status, CONVERT(varchar(10), r.Prazo, 120) AS prazo
      FROM RecertificacoesAcesso r
      JOIN MembroReferencia m ON m.MembroId = r.MembroId
      JOIN Papeis p ON p.PapelId = r.PapelId
      ORDER BY r.Status, r.Prazo
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "PUT" && recurso === "recertificacoes") {
    const { recertificacaoId, acao } = req.body || {};
    if (!recertificacaoId || (acao !== "CONFIRMAR" && acao !== "EXPIRAR")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe recertificacaoId e acao: 'CONFIRMAR' ou 'EXPIRAR'." } };
      return;
    }
    const novoStatus = acao === "CONFIRMAR" ? "CONFIRMADA" : "EXPIRADA";
    await pool.request().input("id", sql.Int, recertificacaoId).input("status", sql.NVarChar(20), novoStatus).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE RecertificacoesAcesso SET Status = @status, RecertificadoPor = @por, RecertificadoEm = SYSUTCDATETIME() WHERE RecertificacaoId = @id`);
    await registrarAuditoria({
      tabela: "RecertificacoesAcesso", registroId: Number(recertificacaoId), acao: acao === "CONFIRMAR" ? "Recertificou acesso" : "Expirou acesso (não recertificado)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: acao === "CONFIRMAR" ? "✅ Acesso recertificado." : "⚠️ Acesso expirado." } };
    return;
  }

  if (req.method === "GET" && recurso === "parametros") {
    const p = await compliance.parametrosCompliance(pool, sql);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { valorCriticoQuatroOlhos: p.ValorCriticoQuatroOlhos, periodicidadeRecertificacaoMeses: p.PeriodicidadeRecertificacaoMeses } };
    return;
  }

  if (req.method === "PUT" && recurso === "parametros") {
    const { valorCriticoQuatroOlhos, periodicidadeRecertificacaoMeses } = req.body || {};
    const antes = await compliance.parametrosCompliance(pool, sql);
    await pool.request()
      .input("critico", sql.Decimal(12, 2), valorCriticoQuatroOlhos !== undefined ? valorCriticoQuatroOlhos : antes.ValorCriticoQuatroOlhos)
      .input("periodo", sql.Int, periodicidadeRecertificacaoMeses !== undefined ? periodicidadeRecertificacaoMeses : antes.PeriodicidadeRecertificacaoMeses)
      .query(`UPDATE ParametrosCompliance SET ValorCriticoQuatroOlhos = @critico, PeriodicidadeRecertificacaoMeses = @periodo WHERE ParametroId = 1`);
    await registrarAuditoria({
      tabela: "ParametrosCompliance", registroId: 1, acao: "Atualizou parâmetros de compliance", usuarioId: usuario.membroId,
      dadosAntes: antes, dadosDepois: { valorCriticoQuatroOlhos, periodicidadeRecertificacaoMeses }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parâmetros de compliance atualizados." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: alertas, recertificacoes ou parametros." } };
};

