// GestaoObrigacoesFiscais (v4.19 — Obrigações Acessórias Fiscais)
// A igreja é IMUNE, não DISPENSADA: acompanha o calendário de ECF, ECD,
// eSocial/DCTFWeb e EFD-Reinf (com recibo de entrega) e as retenções na
// fonte (R-4000). Status e alertas (D-60/D-30/D-7, vencida) calculados na
// leitura; o medidor da ECD mostra a receita do exercício vs. R$ 1,2 mi.
// GET  /api/obrigacoes-fiscais -> calendário
// POST /api/obrigacoes-fiscais -> { tipo, anoReferencia, cnpj, prazoEntrega, observacao? }
// PUT  /api/obrigacoes-fiscais -> { obrigacaoId, acao: 'TRANSMITIR', reciboBase64?, mimeType? }
// GET  /api/obrigacoes-fiscais/medidor-ecd -> receita do exercício vs. R$ 1,2 mi
// GET  /api/obrigacoes-fiscais/retencoes -> retenções (R-4000)
// POST /api/obrigacoes-fiscais/retencoes -> { naturezaRendimento, competencia, valorBase, valorRetido, observacao? }
// PUT  /api/obrigacoes-fiscais/retencoes -> { retencaoId, acao: 'RECOLHER', dataRecolhimento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const TIPOS = ["ECF", "ECD", "ESOCIAL", "DCTFWEB", "EFD_REINF", "INFORME_RENDIMENTOS"];
const NATUREZAS = ["SERVICO_PJ", "ALUGUEL_PF", "AUTONOMO", "IRRF_PREBENDA", "OUTROS"];
const GATILHO_ECD = 1200000.00;
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

function diasAte(data, hoje) {
  return Math.ceil((new Date(data) - hoje) / (1000 * 60 * 60 * 24));
}
function alertaPrazo(dias) {
  if (dias <= 7) return "D7";
  if (dias <= 30) return "D30";
  if (dias <= 60) return "D60";
  return null;
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Obrigações fiscais são matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && recurso === "medidor-ecd") {
    const ano = new Date().getFullYear();
    const receita = await pool.request().input("inicio", sql.Date, `${ano}-01-01`).query(`
      SELECT ISNULL(SUM(Valor), 0) AS total FROM LancamentosTesouraria
      WHERE Status = 'ATIVO' AND StatusConfirmacao = 'CONFIRMADO' AND CriadoEm >= @inicio
    `);
    const total = Number(receita.recordset[0].total);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { ano, receitaExercicio: total, gatilhoEcd: GATILHO_ECD, ultrapassou: total >= GATILHO_ECD, percentual: GATILHO_ECD > 0 ? Math.min(100, Math.round(total / GATILHO_ECD * 100)) : 0 }
    };
    return;
  }

  if (req.method === "GET" && recurso === "retencoes") {
    const result = await pool.request().query(`SELECT * FROM RetencoesFonte ORDER BY Competencia DESC, RetencaoId DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "retencoes") {
    const { naturezaRendimento, competencia, valorBase, valorRetido, observacao } = req.body || {};
    if (!naturezaRendimento || !NATUREZAS.includes(naturezaRendimento) || !competencia || !valorBase || !valorRetido) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: naturezaRendimento (${NATUREZAS.join("|")}), competencia, valorBase, valorRetido.` } };
      return;
    }
    const criada = await pool.request().input("natureza", sql.NVarChar(30), naturezaRendimento).input("comp", sql.Char(7), competencia)
      .input("base", sql.Decimal(12, 2), valorBase).input("retido", sql.Decimal(12, 2), valorRetido)
      .input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO RetencoesFonte (NaturezaRendimento, Competencia, ValorBase, ValorRetido, Observacao, RegistradoPor)
              OUTPUT INSERTED.RetencaoId VALUES (@natureza, @comp, @base, @retido, @obs, @por)`);
    await registrarAuditoria({
      tabela: "RetencoesFonte", registroId: criada.recordset[0].RetencaoId, acao: "Registrou retenção na fonte (R-4000)", usuarioId: usuario.membroId,
      dadosDepois: { naturezaRendimento, competencia, valorBase, valorRetido }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Retenção na fonte registrada (R-4000)." } };
    return;
  }

  if (req.method === "PUT" && recurso === "retencoes") {
    const { retencaoId, acao, dataRecolhimento } = req.body || {};
    if (acao !== "RECOLHER" || !retencaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe retencaoId e acao: 'RECOLHER'." } };
      return;
    }
    await pool.request().input("id", sql.Int, retencaoId).input("data", sql.Date, dataRecolhimento || hoje.toISOString().slice(0, 10))
      .query(`UPDATE RetencoesFonte SET Status = 'RECOLHIDA', DataRecolhimento = @data WHERE RetencaoId = @id`);
    await registrarAuditoria({ tabela: "RetencoesFonte", registroId: Number(retencaoId), acao: "Recolheu retenção na fonte", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Retenção recolhida." } };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const result = await pool.request().query(`SELECT * FROM ObrigacoesFiscais ORDER BY AnoReferencia DESC, PrazoEntrega`);
    const lista = result.recordset.map(o => {
      const dias = diasAte(o.PrazoEntrega, hoje);
      const vencida = o.Status !== "TRANSMITIDA" && dias < 0;
      return Object.assign({}, o, { diasParaPrazo: dias, alerta: alertaPrazo(dias), vencida });
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { tipo, anoReferencia, cnpj, prazoEntrega, observacao } = req.body || {};
    if (!tipo || !TIPOS.includes(tipo) || !anoReferencia || !cnpj || !cnpj.trim() || !prazoEntrega) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: tipo (${TIPOS.join("|")}), anoReferencia, cnpj, prazoEntrega.` } };
      return;
    }
    const criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("ano", sql.Int, anoReferencia)
      .input("cnpj", sql.VarChar(18), cnpj.trim()).input("prazo", sql.Date, prazoEntrega)
      .input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ObrigacoesFiscais (Tipo, AnoReferencia, Cnpj, PrazoEntrega, Observacao, RegistradoPor)
              OUTPUT INSERTED.ObrigacaoId VALUES (@tipo, @ano, @cnpj, @prazo, @obs, @por)`);
    await registrarAuditoria({
      tabela: "ObrigacoesFiscais", registroId: criada.recordset[0].ObrigacaoId, acao: "Registrou obrigação fiscal", usuarioId: usuario.membroId,
      dadosDepois: { tipo, anoReferencia, cnpj, prazoEntrega }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Obrigação fiscal registrada." } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { obrigacaoId, acao, reciboBase64, mimeType } = req.body || {};
    if (acao !== "TRANSMITIR" || !obrigacaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe obrigacaoId e acao: 'TRANSMITIR'." } };
      return;
    }
    let reciboUrl = null;
    if (reciboBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de recibo inválido." } };
        return;
      }
      reciboUrl = await storage.salvarDocumento(Buffer.from(reciboBase64, "base64"), mimeType);
    }
    await pool.request().input("id", sql.Int, obrigacaoId).input("url", sql.NVarChar(500), reciboUrl)
      .query(`UPDATE ObrigacoesFiscais SET Status = 'TRANSMITIDA', DataTransmissao = SYSUTCDATETIME(), ReciboUrl = ISNULL(@url, ReciboUrl) WHERE ObrigacaoId = @id`);
    await registrarAuditoria({
      tabela: "ObrigacoesFiscais", registroId: Number(obrigacaoId), acao: "Transmitiu obrigação fiscal (recibo)", usuarioId: usuario.membroId,
      dadosDepois: { comRecibo: !!reciboUrl }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Obrigação transmitida — recibo guardado no cofre." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: medidor-ecd ou retencoes." } };
};

