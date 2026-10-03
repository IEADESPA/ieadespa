// GestaoCompliance (v4.12 — CCM + Recertificação + Parâmetros)
// Monitoramento Contínuo de Controles (CCM) e Revisão Periódica de Acessos.
// GET  /api/compliance/alertas -> varre e lista alertas ativos
// PUT  /api/compliance/alertas -> { alertaId, acao: 'RESOLVER' }
// GET  /api/compliance/recertificacoes -> gera e lista recertificações
// PUT  /api/compliance/recertificacoes -> { recertificacaoId, acao: 'CONFIRMAR'|'EXPIRAR' }
// GET  /api/compliance/parametros
// PUT  /api/compliance/parametros -> { valorCriticoQuatroOlhos?, periodicidadeRecertificacaoMeses? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const compliance = require("../shared/compliance");

// Faixa dos parâmetros: o valor crítico é DECIMAL(12,2) no banco (máximo 9.999.999.999,99) e precisa ser positivo; a periodicidade é em meses inteiros.
const VALOR_CRITICO_MAXIMO = 9999999999.99;
const PERIODICIDADE_MAXIMA_MESES = 120;

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  // Compliance olha a igreja toda (alertas de fornecedores e pagamentos, recertificação do acesso de todos os líderes): só o nível GERAL (papel Global E escopo de todas as
  // congregações) com a permissão de auditoria. Papel local com "auditoria", ou Global com escopo de lista, é recusado antes de tocar no banco.
  const usuario = exigirGeral(req, context, "auditoria");
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
    const { alertaId: alertaIdBruto, acao } = req.body || {};
    const alertaId = auth.idDeRota(alertaIdBruto);
    if (acao !== "RESOLVER" || !alertaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe alertaId e acao: 'RESOLVER'." } };
      return;
    }
    // Só resolve alerta que está ATIVO: inexistente ou já resolvido não vira "✅ resolvido" nem ganha linha na trilha.
    const resolvido = await pool.request().input("id", sql.Int, alertaId).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE AlertasCompliance SET Status = 'RESOLVIDO', ResolvidoPor = @por, ResolvidoEm = SYSUTCDATETIME() WHERE AlertaId = @id AND Status = 'ATIVO'`);
    if (!resolvido.rowsAffected || resolvido.rowsAffected[0] === 0) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Alerta não encontrado ou já resolvido." } };
      return;
    }
    await registrarAuditoria({
      tabela: "AlertasCompliance", registroId: alertaId, acao: "Resolveu alerta de compliance", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Alerta resolvido." } };
    return;
  }

  if (req.method === "GET" && recurso === "recertificacoes") {
    await compliance.gerarRecertificacoesTodasPermissoes(pool, sql);
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
    const { recertificacaoId: recertificacaoIdBruto, acao } = req.body || {};
    const recertificacaoId = auth.idDeRota(recertificacaoIdBruto);
    if (!recertificacaoId || (acao !== "CONFIRMAR" && acao !== "EXPIRAR")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe recertificacaoId e acao: 'CONFIRMAR' ou 'EXPIRAR'." } };
      return;
    }
    const alvo = (await pool.request().input("id", sql.Int, recertificacaoId)
      .query(`SELECT MembroId, Status FROM RecertificacoesAcesso WHERE RecertificacaoId = @id`)).recordset[0];
    if (!alvo) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Recertificação não encontrada." } };
      return;
    }
    // Ninguém recertifica (nem expira) o próprio acesso: a revisão é feita por OUTRA pessoa.
    if (Number(alvo.MembroId) === Number(usuario.membroId)) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Você não pode recertificar o seu próprio acesso — peça a outra pessoa da auditoria." } };
      return;
    }
    // Só a pendente é decidida: uma já confirmada ou expirada não é revertida por aqui (reabrir uma expirada ressuscitava a permissão sem revisão).
    if (alvo.Status !== "PENDENTE") {
      context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Só uma recertificação pendente pode ser decidida." } };
      return;
    }
    const novoStatus = acao === "CONFIRMAR" ? "CONFIRMADA" : "EXPIRADA";
    const decidida = await pool.request().input("id", sql.Int, recertificacaoId).input("status", sql.NVarChar(20), novoStatus).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE RecertificacoesAcesso SET Status = @status, RecertificadoPor = @por, RecertificadoEm = SYSUTCDATETIME() WHERE RecertificacaoId = @id AND Status = 'PENDENTE'`);
    if (!decidida.rowsAffected || decidida.rowsAffected[0] === 0) {
      context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Só uma recertificação pendente pode ser decidida." } };
      return;
    }
    await registrarAuditoria({
      tabela: "RecertificacoesAcesso", registroId: recertificacaoId, acao: acao === "CONFIRMAR" ? "Recertificou acesso" : "Expirou acesso (não recertificado)", usuarioId: usuario.membroId
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
    // Faixa: o valor crítico (teto do princípio dos quatro olhos) é um número positivo que cabe no DECIMAL(12,2) (um valor gigante desligaria o controle na prática); a periodicidade
    // é um número inteiro de meses, de 1 em diante.
    // (Number.isFinite/Number.isInteger não convertem texto: "10000" e "3" são recusados sem um teste de tipo à parte.)
    const criticoOk = valorCriticoQuatroOlhos === undefined || (Number.isFinite(valorCriticoQuatroOlhos) && valorCriticoQuatroOlhos > 0 && valorCriticoQuatroOlhos <= VALOR_CRITICO_MAXIMO);
    const periodoOk = periodicidadeRecertificacaoMeses === undefined || (Number.isInteger(periodicidadeRecertificacaoMeses) && periodicidadeRecertificacaoMeses >= 1 && periodicidadeRecertificacaoMeses <= PERIODICIDADE_MAXIMA_MESES);
    if (!criticoOk || !periodoOk) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Parâmetros inválidos: valorCriticoQuatroOlhos deve ser maior que zero (até ${VALOR_CRITICO_MAXIMO}) e periodicidadeRecertificacaoMeses um inteiro de 1 a ${PERIODICIDADE_MAXIMA_MESES}.` } };
      return;
    }
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

