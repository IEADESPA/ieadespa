// GestaoInvestimentos (v4.14 — Gestão de Investimentos)
// Aplicações do Fundo de Reserva (Reg. Art. 64): CDB, poupança, fundos DI e
// títulos públicos de baixo risco — vedada renda variável/cripto (§2º).
// Rentabilidade e valor atual são CALCULADOS NA LEITURA (shared/investimentos.js).
// GET  /api/investimentos -> portfólio consolidado
// GET  /api/investimentos/aplicacoes -> lista de aplicações
// POST /api/investimentos/aplicacoes -> { fonteId?, tipo, instituicao, valorAplicado, taxaAnual?, dataAplicacao, dataVencimento?, liquidez?, observacao? }
// PUT  /api/investimentos/aplicacoes -> { aplicacaoId, acao: 'RESGATAR'|'ENCERRAR', valorResgatado?, dataResgate? }
// GET  /api/investimentos/liquidez?meses= -> previsão de liquidez com faixa
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const investimentos = require("../shared/investimentos");

const TIPOS = ["CDB", "POUPANCA", "FUNDO_RENDA_FIXA", "TITULO_PUBLICO", "OUTROS"];
const LIQUIDEZES = ["DIARIA", "D30", "D90", "NO_VENCIMENTO"];

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Investimentos são matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !recurso) {
    const portfolio = await investimentos.calcularPortfolio(pool, sql);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: portfolio };
    return;
  }

  if (req.method === "GET" && recurso === "liquidez") {
    const meses = Math.min(Math.max(parseInt((req.query && req.query.meses) || 6, 10), 1), 12);
    const previsao = await investimentos.previsaoLiquidezComFaixa(pool, sql, meses);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: previsao };
    return;
  }

  if (req.method === "GET" && recurso === "aplicacoes") {
    const result = await pool.request().query(`
      SELECT a.*, ISNULL((SELECT SUM(ValorResgatado) FROM ResgatesAplicacoes r WHERE r.AplicacaoId = a.AplicacaoId), 0) AS totalResgatado
      FROM AplicacoesFinanceiras a ORDER BY a.DataVencimento
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "aplicacoes") {
    const { fonteId, tipo, instituicao, valorAplicado, taxaAnual, dataAplicacao, dataVencimento, liquidez, observacao } = req.body || {};
    if (!tipo || !instituicao || !instituicao.trim() || !valorAplicado || !dataAplicacao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, instituicao, valorAplicado, dataAplicacao." } };
      return;
    }
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (Number(valorAplicado) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valorAplicado deve ser maior que zero." } };
      return;
    }
    if (liquidez && !LIQUIDEZES.includes(liquidez)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `liquidez inválida. Use uma de: ${LIQUIDEZES.join(", ")}.` } };
      return;
    }
    const criada = await pool.request().input("fonte", sql.Int, fonteId || null).input("tipo", sql.NVarChar(30), tipo)
      .input("inst", sql.NVarChar(150), instituicao.trim()).input("valor", sql.Decimal(12, 2), valorAplicado)
      .input("taxa", sql.Decimal(7, 4), taxaAnual || null).input("dataAplic", sql.Date, dataAplicacao)
      .input("venc", sql.Date, dataVencimento || null).input("liq", sql.NVarChar(20), liquidez || "NO_VENCIMENTO")
      .input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO AplicacoesFinanceiras (FonteId, Tipo, Instituicao, ValorAplicado, TaxaAnual, DataAplicacao, DataVencimento, Liquidez, Observacao, RegistradoPor)
              OUTPUT INSERTED.AplicacaoId VALUES (@fonte, @tipo, @inst, @valor, @taxa, @dataAplic, @venc, @liq, @obs, @por)`);
    await registrarAuditoria({
      tabela: "AplicacoesFinanceiras", registroId: criada.recordset[0].AplicacaoId, acao: "Registrou aplicação financeira", usuarioId: usuario.membroId,
      dadosDepois: { tipo, instituicao, valorAplicado, taxaAnual: taxaAnual || null, dataVencimento: dataVencimento || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aplicação financeira registrada.", aplicacaoId: criada.recordset[0].AplicacaoId } };
    return;
  }

  if (req.method === "PUT" && recurso === "aplicacoes") {
    const { aplicacaoId, acao, valorResgatado, dataResgate } = req.body || {};
    if (!aplicacaoId || (acao !== "RESGATAR" && acao !== "ENCERRAR")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe aplicacaoId e acao: 'RESGATAR' ou 'ENCERRAR'." } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, aplicacaoId).query(`SELECT * FROM AplicacoesFinanceiras WHERE AplicacaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Aplicação não encontrada." } };
      return;
    }
    if (acao === "RESGATAR") {
      if (!valorResgatado || Number(valorResgatado) <= 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe valorResgatado maior que zero." } };
        return;
      }
      await pool.request().input("apl", sql.Int, aplicacaoId).input("valor", sql.Decimal(12, 2), valorResgatado)
        .input("data", sql.Date, dataResgate || new Date().toISOString().slice(0, 10)).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ResgatesAplicacoes (AplicacaoId, ValorResgatado, DataResgate, RegistradoPor) VALUES (@apl, @valor, @data, @por)`);
      await registrarAuditoria({
        tabela: "ResgatesAplicacoes", registroId: aplicacaoId, acao: "Resgatou aplicação financeira", usuarioId: usuario.membroId,
        dadosDepois: { valorResgatado, dataResgate }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Resgate registrado." } };
      return;
    }
    // ENCERRAR (resgatar total e marcar RESGATADA).
    const resgatado = await pool.request().input("id", sql.Int, aplicacaoId).query(`SELECT ISNULL(SUM(ValorResgatado), 0) AS total FROM ResgatesAplicacoes WHERE AplicacaoId = @id`);
    const restante = Number(atual.recordset[0].ValorAplicado) - Number(resgatado.recordset[0].total);
    if (restante > 0) {
      await pool.request().input("apl", sql.Int, aplicacaoId).input("valor", sql.Decimal(12, 2), investimentos.round2(restante))
        .input("data", sql.Date, new Date().toISOString().slice(0, 10)).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ResgatesAplicacoes (AplicacaoId, ValorResgatado, DataResgate, RegistradoPor) VALUES (@apl, @valor, @data, @por)`);
    }
    await pool.request().input("id", sql.Int, aplicacaoId).query(`UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA' WHERE AplicacaoId = @id`);
    await registrarAuditoria({
      tabela: "AplicacoesFinanceiras", registroId: aplicacaoId, acao: "Encerrou aplicação financeira", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aplicação encerrada (resgate total)." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: aplicacoes ou liquidez." } };
};

