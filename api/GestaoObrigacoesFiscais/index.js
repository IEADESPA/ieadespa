// GestaoObrigacoesFiscais (v4.19 — Obrigações Acessórias Fiscais)
// A igreja é IMUNE, não DISPENSADA: acompanha o calendário de ECF, ECD,
// eSocial/DCTFWeb e EFD-Reinf (com recibo de entrega) e as retenções na
// fonte (R-4000). Status e alertas (D-60/D-30/D-7, vencida) calculados na
// leitura; o medidor da ECD mostra a receita do exercício vs. R$ 1,2 mi.
// INSTITUCIONAL (CNPJ e obrigações da igreja inteira, sem congregação): todos os métodos são só do nível geral (papel Global com escopo de todas as congregações).
// GET  /api/obrigacoes-fiscais -> calendário
// POST /api/obrigacoes-fiscais -> { tipo, anoReferencia, cnpj, prazoEntrega, observacao? }
// PUT  /api/obrigacoes-fiscais -> { obrigacaoId, acao: 'TRANSMITIR', reciboBase64?, mimeType? } — uma vez só por obrigação
// GET  /api/obrigacoes-fiscais/medidor-ecd -> receita do exercício vs. R$ 1,2 mi
// GET  /api/obrigacoes-fiscais/retencoes -> retenções (R-4000)
// POST /api/obrigacoes-fiscais/retencoes -> { naturezaRendimento, competencia, valorBase, valorRetido, observacao? }
// PUT  /api/obrigacoes-fiscais/retencoes -> { retencaoId, acao: 'RECOLHER', dataRecolhimento? } — uma vez só por retenção
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { numeroEntre, inteiroEntre, dataIso, textoAte, textoOpcionalAte, afetadas, violouChaveUnica, conteudoCombinaComTipo, MAX_DECIMAL_12_2, MB } = require("../shared/entradaFinanceira");

const TIPOS = ["ECF", "ECD", "ESOCIAL", "DCTFWEB", "EFD_REINF", "INFORME_RENDIMENTOS"];
const NATUREZAS = ["SERVICO_PJ", "ALUGUEL_PF", "AUTONOMO", "IRRF_PREBENDA", "OUTROS"];
const GATILHO_ECD = 1200000.00;
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const LIMITE_RECIBO_BYTES = 15 * MB;

function diasAte(data, hoje) {
  return Math.ceil((new Date(data) - hoje) / (1000 * 60 * 60 * 24));
}
function alertaPrazo(dias) {
  if (dias <= 7) return "D7";
  if (dias <= 30) return "D30";
  if (dias <= 60) return "D60";
  return null;
}
function recusar400(context, mensagem) {
  context.res = { status: 400, body: { sucesso: false, mensagem } };
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
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
      return recusar400(context, `Campos obrigatórios: naturezaRendimento (${NATUREZAS.join("|")}), competencia, valorBase, valorRetido.`);
    }
    const base = numeroEntre(valorBase, 0.01, MAX_DECIMAL_12_2);
    const retido = numeroEntre(valorRetido, 0.01, MAX_DECIMAL_12_2);
    if (typeof competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) || base === null || retido === null) {
      return recusar400(context, "Confira a competência (AAAA-MM) e os valores (maiores que zero).");
    }
    const obs = textoOpcionalAte(observacao, 300);
    if (obs === null) return recusar400(context, "observacao: até 300 caracteres.");
    const criada = await pool.request().input("natureza", sql.NVarChar(30), naturezaRendimento).input("comp", sql.Char(7), competencia)
      .input("base", sql.Decimal(12, 2), base).input("retido", sql.Decimal(12, 2), retido)
      .input("obs", sql.NVarChar(300), obs || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO RetencoesFonte (NaturezaRendimento, Competencia, ValorBase, ValorRetido, Observacao, RegistradoPor)
              OUTPUT INSERTED.RetencaoId VALUES (@natureza, @comp, @base, @retido, @obs, @por)`);
    await registrarAuditoria({
      tabela: "RetencoesFonte", registroId: criada.recordset[0].RetencaoId, acao: "Registrou retenção na fonte (R-4000)", usuarioId: usuario.membroId,
      dadosDepois: { naturezaRendimento, competencia, valorBase: base, valorRetido: retido }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Retenção na fonte registrada (R-4000)." } };
    return;
  }

  if (req.method === "PUT" && recurso === "retencoes") {
    const { retencaoId: retencaoBruto, acao, dataRecolhimento } = req.body || {};
    const retencaoId = auth.idDeRota(retencaoBruto);
    if (acao !== "RECOLHER" || !retencaoId) {
      return recusar400(context, "Informe retencaoId e acao: 'RECOLHER'.");
    }
    const data = dataRecolhimento ? dataIso(dataRecolhimento) : hoje.toISOString().slice(0, 10);
    if (!data) return recusar400(context, "dataRecolhimento inválida (use AAAA-MM-DD).");
    // Recolher é uma vez só: repetir trocaria a data de uma retenção que já consta como recolhida. A conferência vai no próprio UPDATE.
    const recolhida = await pool.request().input("id", sql.Int, retencaoId).input("data", sql.Date, data)
      .query(`UPDATE RetencoesFonte SET Status = 'RECOLHIDA', DataRecolhimento = @data WHERE RetencaoId = @id AND Status <> 'RECOLHIDA'`);
    if (afetadas(recolhida) === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Retenção não encontrada ou já recolhida." } };
      return;
    }
    await registrarAuditoria({
      tabela: "RetencoesFonte", registroId: retencaoId, acao: "Recolheu retenção na fonte", usuarioId: usuario.membroId,
      dadosAntes: { status: "PENDENTE" }, dadosDepois: { status: "RECOLHIDA", dataRecolhimento: data }
    });
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
    if (!tipo || !TIPOS.includes(tipo) || !anoReferencia || typeof cnpj !== "string" || !cnpj.trim() || !prazoEntrega) {
      return recusar400(context, `Campos obrigatórios: tipo (${TIPOS.join("|")}), anoReferencia, cnpj, prazoEntrega.`);
    }
    const ano = inteiroEntre(anoReferencia, 1990, 2200);
    const cnpjOk = textoAte(cnpj, 18);
    const prazo = dataIso(prazoEntrega);
    const obs = textoOpcionalAte(observacao, 300);
    if (ano === null || !cnpjOk || !prazo || obs === null) {
      return recusar400(context, "Confira o ano (AAAA), o CNPJ (até 18 caracteres), o prazo (AAAA-MM-DD) e a observação (até 300 caracteres).");
    }
    let criada;
    try {
      criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("ano", sql.Int, ano)
        .input("cnpj", sql.VarChar(18), cnpjOk).input("prazo", sql.Date, prazo)
        .input("obs", sql.NVarChar(300), obs || null).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ObrigacoesFiscais (Tipo, AnoReferencia, Cnpj, PrazoEntrega, Observacao, RegistradoPor)
                OUTPUT INSERTED.ObrigacaoId VALUES (@tipo, @ano, @cnpj, @prazo, @obs, @por)`);
    } catch (erro) {
      // A tabela tem chave única (Tipo, AnoReferencia, Cnpj): repetir não é erro de servidor.
      if (violouChaveUnica(erro)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe essa obrigação para esse tipo, ano e CNPJ." } };
        return;
      }
      throw erro;
    }
    await registrarAuditoria({
      tabela: "ObrigacoesFiscais", registroId: criada.recordset[0].ObrigacaoId, acao: "Registrou obrigação fiscal", usuarioId: usuario.membroId,
      dadosDepois: { tipo, anoReferencia: ano, cnpj: cnpjOk, prazoEntrega: prazo }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Obrigação fiscal registrada." } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { obrigacaoId: obrigacaoBruto, acao, reciboBase64, mimeType } = req.body || {};
    const obrigacaoId = auth.idDeRota(obrigacaoBruto);
    if (acao !== "TRANSMITIR" || !obrigacaoId) {
      return recusar400(context, "Informe obrigacaoId e acao: 'TRANSMITIR'.");
    }
    const atual = await pool.request().input("id", sql.Int, obrigacaoId).query(`SELECT Status FROM ObrigacoesFiscais WHERE ObrigacaoId = @id`);
    if (atual.recordset.length === 0 || atual.recordset[0].Status === "TRANSMITIDA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obrigação não encontrada ou já transmitida." } };
      return;
    }
    let reciboUrl = null;
    if (reciboBase64) {
      if (typeof reciboBase64 !== "string" || !mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        return recusar400(context, "Formato de recibo inválido.");
      }
      // O limite é conferido pelo tamanho do texto ANTES de decodificar (nada de alocar o que vai ser recusado) e de novo pelo arquivo já decodificado.
      if (Math.floor(reciboBase64.length * 3 / 4) > LIMITE_RECIBO_BYTES) {
        return recusar400(context, "O recibo passa do limite de 15 MB.");
      }
      const arquivo = Buffer.from(reciboBase64, "base64");
      if (arquivo.length > LIMITE_RECIBO_BYTES) {
        return recusar400(context, "O recibo passa do limite de 15 MB.");
      }
      if (!conteudoCombinaComTipo(arquivo, mimeType)) {
        return recusar400(context, "O conteúdo do recibo não é do formato informado.");
      }
      reciboUrl = await storage.salvarDocumento(arquivo, mimeType);
    }
    // Transmitir é uma vez só: repetir trocaria a data e o recibo de uma obrigação já entregue. A conferência vai no próprio UPDATE.
    const transmitida = await pool.request().input("id", sql.Int, obrigacaoId).input("url", sql.NVarChar(500), reciboUrl)
      .query(`UPDATE ObrigacoesFiscais SET Status = 'TRANSMITIDA', DataTransmissao = SYSUTCDATETIME(), ReciboUrl = ISNULL(@url, ReciboUrl) WHERE ObrigacaoId = @id AND Status <> 'TRANSMITIDA'`);
    if (afetadas(transmitida) === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Obrigação não encontrada ou já transmitida." } };
      return;
    }
    await registrarAuditoria({
      tabela: "ObrigacoesFiscais", registroId: obrigacaoId, acao: "Transmitiu obrigação fiscal (recibo)", usuarioId: usuario.membroId,
      dadosAntes: { status: atual.recordset[0].Status }, dadosDepois: { status: "TRANSMITIDA", comRecibo: !!reciboUrl }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Obrigação transmitida — recibo guardado no cofre." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: medidor-ecd ou retencoes." } };
};
