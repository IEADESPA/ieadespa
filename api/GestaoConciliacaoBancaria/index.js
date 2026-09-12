// GestaoConciliacaoBancaria (v4.13 — conciliação por importação de extrato)
// Sem Open Finance pago: a Tesouraria sobe o extrato (OFX/CSV) que o banco
// entrega de graça no internet banking e o sistema cruza automaticamente
// contra Entradas/Saídas, apontando só as divergências. Dinheiro vivo fica
// na trilha CAIXA_FISICO (cofre), não no banco.
// GET  /api/conciliacao-bancaria/fontes -> fontes de caixa
// GET  /api/conciliacao-bancaria/extratos -> extratos importados
// POST /api/conciliacao-bancaria/extratos -> { fonteId, mesReferencia, arquivoBase64, mimeType }
// GET  /api/conciliacao-bancaria?mesReferencia=&fonteId= -> conciliações
// GET  /api/conciliacao-bancaria/{id} -> detalhe + divergências
// PUT  /api/conciliacao-bancaria/divergencias -> { divergenciaId, acao: 'RESOLVER' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const conciliacao = require("../shared/conciliação");

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Conciliação bancária é matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && recurso === "fontes") {
    const result = await pool.request().query(`SELECT FonteId AS fonteId, Nome AS nome, Tipo AS tipo FROM FontesCaixa WHERE Ativa = 1 ORDER BY FonteId`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && recurso === "extratos") {
    const result = await pool.request().query(`
      SELECT e.ExtratoId AS extratoId, e.FonteId AS fonteId, f.Nome AS fonteNome, e.MesReferencia AS mesReferencia,
             e.TipoArquivo AS tipoArquivo, e.TotalLinhas AS totalLinhas, e.SaldoFinal AS saldoFinal,
             CONVERT(varchar(33), e.CriadoEm, 126) AS criadoEm
      FROM ExtratosBancarios e JOIN FontesCaixa f ON f.FonteId = e.FonteId ORDER BY e.CriadoEm DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "extratos") {
    const { fonteId, mesReferencia, arquivoBase64, mimeType } = req.body || {};
    if (!fonteId || !mesReferencia || !arquivoBase64) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: fonteId, mesReferencia, arquivoBase64." } };
      return;
    }
    let buffer;
    try { buffer = Buffer.from(arquivoBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo inválido." } };
      return;
    }
    const conteudo = buffer.toString("utf-8");
    const tipo = conciliacao.detectarTipo(conteudo);
    if (tipo === "CSV" && !conteudo.includes(",") && !conteudo.includes(";")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Não reconheci o arquivo — use OFX ou CSV do extrato (PDF não tem dado estruturado pra conciliar)." } };
      return;
    }
    const linhas = conciliacao.parsearExtrato(conteudo, tipo);
    if (linhas.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Nenhuma movimentação encontrada no arquivo — confira se é o extrato certo (OFX/CSV)." } };
      return;
    }

    const arquivoUrl = await storage.salvarDocumento(buffer, mimeType || "text/plain");
    const saldoFinal = linhas.reduce((a, l) => a + Number(l.valor), 0);
    const extrato = await pool.request().input("fonte", sql.Int, fonteId).input("mes", sql.Char(7), mesReferencia)
      .input("tipo", sql.NVarChar(10), tipo).input("url", sql.NVarChar(500), arquivoUrl)
      .input("saldo", sql.Decimal(12, 2), conciliacao.round2(saldoFinal)).input("linhas", sql.Int, linhas.length).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ExtratosBancarios (FonteId, MesReferencia, TipoArquivo, ArquivoUrl, SaldoFinal, TotalLinhas, ImportadoPor)
              OUTPUT INSERTED.ExtratoId VALUES (@fonte, @mes, @tipo, @url, @saldo, @linhas, @por)`);
    const extratoId = extrato.recordset[0].ExtratoId;

    for (const l of linhas) {
      await pool.request().input("extrato", sql.Int, extratoId).input("data", sql.Date, l.data || `${mesReferencia}-01`)
        .input("valor", sql.Decimal(12, 2), l.valor).input("historico", sql.NVarChar(300), l.historico || null)
        .input("identificador", sql.NVarChar(100), l.identificador || null)
        .query(`INSERT INTO ExtratoLinhas (ExtratoId, DataLancamento, Valor, Historico, Identificador) VALUES (@extrato, @data, @valor, @historico, @identificador)`);
    }

    const resultado = await conciliacao.conciliarExtrato(pool, sql, extratoId, fonteId, mesReferencia);
    const divergente = resultado.soBanco.length > 0 || resultado.soSistema.length > 0;


    const existente = await pool.request().input("fonte", sql.Int, fonteId).input("mes", sql.Char(7), mesReferencia)
      .query(`SELECT ConciliacaoId FROM ConciliacoesBancarias WHERE FonteId = @fonte AND MesReferencia = @mes`);
    let conciliacaoId;
    if (existente.recordset.length === 0) {
      const criada = await pool.request().input("fonte", sql.Int, fonteId).input("mes", sql.Char(7), mesReferencia)
        .input("extrato", sql.Decimal(12, 2), resultado.totalExtrato).input("sistema", sql.Decimal(12, 2), resultado.totalSistema)
        .query(`INSERT INTO ConciliacoesBancarias (FonteId, MesReferencia, TotalExtrato, TotalSistema, TotalBatidas) OUTPUT INSERTED.ConciliacaoId VALUES (@fonte, @mes, @extrato, @sistema, 0)`);
      conciliacaoId = criada.recordset[0].ConciliacaoId;
    } else {
      conciliacaoId = existente.recordset[0].ConciliacaoId;
      await pool.request().input("id", sql.Int, conciliacaoId).query(`DELETE FROM ConciliacaoDivergencias WHERE ConciliacaoId = @id`);
    }

    let totalBatidas = 0;
    for (const b of resultado.batidas) totalBatidas += Math.abs(Number(b.valor));
    for (const d of resultado.soBanco) {
      await pool.request().input("conc", sql.Int, conciliacaoId).input("tipo", sql.NVarChar(20), "SO_BANCO")
        .input("valor", sql.Decimal(12, 2), d.valor).input("ref", sql.NVarChar(300), d.referencia || null).input("linha", sql.Int, d.linhaId || null)
        .query(`INSERT INTO ConciliacaoDivergencias (ConciliacaoId, Tipo, Valor, Referencia, LinhaExtratoId) VALUES (@conc, @tipo, @valor, @ref, @linha)`);
    }
    for (const d of resultado.soSistema) {
      await pool.request().input("conc", sql.Int, conciliacaoId).input("tipo", sql.NVarChar(20), "SO_SISTEMA")
        .input("valor", sql.Decimal(12, 2), d.valor).input("ref", sql.NVarChar(300), d.referencia || null)
        .input("lanc", sql.Int, d.tipo === "ENTRADA" ? d.id : null).input("saida", sql.Int, d.tipo === "SAIDA" ? d.id : null)
        .query(`INSERT INTO ConciliacaoDivergencias (ConciliacaoId, Tipo, Valor, Referencia, LancamentoId, SaidaId) VALUES (@conc, @tipo, @valor, @ref, @lanc, @saida)`);
    }

    await pool.request().input("id", sql.Int, conciliacaoId)
      .input("status", sql.NVarChar(20), divergente ? "DIVERGENTE" : "BATIDO")
      .input("extrato", sql.Decimal(12, 2), resultado.totalExtrato).input("sistema", sql.Decimal(12, 2), resultado.totalSistema)
      .input("batidas", sql.Decimal(12, 2), conciliacao.round2(totalBatidas))
      .query(`UPDATE ConciliacoesBancarias SET Status = @status, TotalExtrato = @extrato, TotalSistema = @sistema, TotalBatidas = @batidas WHERE ConciliacaoId = @id`);

    await registrarAuditoria({
      tabela: "ExtratosBancarios", registroId: extratoId, acao: "Importou extrato bancário e conciliou", usuarioId: usuario.membroId,
      dadosDepois: { fonteId, mesReferencia, tipo, totalLinhas: linhas.length, batidas: resultado.batidas.length, soBanco: resultado.soBanco.length, soSistema: resultado.soSistema.length }
    });

    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true, extratoId, conciliacaoId,
        mensagem: divergente
          ? `⚠️ Extrato importado (${linhas.length} linha(s)) — ${resultado.batidas.length} batida(s), ${resultado.soBanco.length} só no banco, ${resultado.soSistema.length} só no sistema.`
          : `✅ Extrato importado e tudo bateu — ${resultado.batidas.length} movimentação(ões) conciliada(s).`,
        resumo: { totalBatidas: resultado.batidas.length, soBanco: resultado.soBanco.length, soSistema: resultado.soSistema.length, totalExtrato: resultado.totalExtrato, totalSistema: resultado.totalSistema }
      }
    };
    return;
  }


  if (req.method === "GET" && !recurso) {
    const { mesReferencia, fonteId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (mesReferencia) { request.input("mes", sql.Char(7), mesReferencia); where += " AND c.MesReferencia = @mes"; }
    if (fonteId) { request.input("fonte", sql.Int, fonteId); where += " AND c.FonteId = @fonte"; }
    const result = await request.query(`
      SELECT c.ConciliacaoId AS conciliacaoId, c.FonteId AS fonteId, f.Nome AS fonteNome, c.MesReferencia AS mesReferencia,
             c.Status AS status, c.TotalExtrato AS totalExtrato, c.TotalSistema AS totalSistema, c.TotalBatidas AS totalBatidas,
             (SELECT COUNT(*) FROM ConciliacaoDivergencias d WHERE d.ConciliacaoId = c.ConciliacaoId AND d.Status = 'PENDENTE') AS divergenciasPendentes
      FROM ConciliacoesBancarias c JOIN FontesCaixa f ON f.FonteId = c.FonteId
      WHERE ${where} ORDER BY c.MesReferencia DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && recurso) {
    const id = Number(recurso);
    if (!Number.isInteger(id)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido." } };
      return;
    }
    const conc = await pool.request().input("id", sql.Int, id).query(`
      SELECT c.*, f.Nome AS fonteNome FROM ConciliacoesBancarias c JOIN FontesCaixa f ON f.FonteId = c.FonteId WHERE c.ConciliacaoId = @id
    `);
    if (conc.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Conciliação não encontrada." } };
      return;
    }
    const divergencias = await pool.request().input("id", sql.Int, id).query(`
      SELECT DivergenciaId AS divergenciaId, Tipo AS tipo, Valor AS valor, Referencia AS referencia, Status AS status
      FROM ConciliacaoDivergencias WHERE ConciliacaoId = @id ORDER BY Tipo, Valor
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, conc.recordset[0], { divergencias: divergencias.recordset }) };
    return;
  }

  if (req.method === "PUT" && recurso === "divergencias") {
    const { divergenciaId, acao } = req.body || {};
    if (acao !== "RESOLVER" || !divergenciaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe divergenciaId e acao: 'RESOLVER'." } };
      return;
    }
    await pool.request().input("id", sql.Int, divergenciaId).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE ConciliacaoDivergencias SET Status = 'RESOLVIDA', ResolvidoPor = @por, ResolvidoEm = SYSUTCDATETIME() WHERE DivergenciaId = @id`);
    await registrarAuditoria({
      tabela: "ConciliacaoDivergencias", registroId: Number(divergenciaId), acao: "Resolveu divergência de conciliação", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Divergência resolvida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: fontes, extratos ou divergencias." } };
};

