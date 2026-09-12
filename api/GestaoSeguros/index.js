// GestaoSeguros (v4.16 — Seguros institucionais)
// Art. 65-A: apólice MANDATÓRIA para Templo Sede e grandes eventos, com
// cobertura mínima de Incêndio, Danos Elétricos e RC (a ausência é
// negligência grave). Art. 42-A: RC para Administradores (sem dolo/fraude).
// GET  /api/seguros -> apólices (vigência calculada na leitura)
// POST /api/seguros -> { tipo, seguradora, numeroApolice, dataInicio, dataFim, coberturas[], valorPremio?, bemId?, eventoDescricao?, documentoBase64?, mimeType?, observacao? }
// PUT  /api/seguros -> { apoliceId, acao: 'CANCELAR' }
// GET  /api/seguros/alertas -> apólices vencidas + falta de cobertura obrigatória
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const TIPOS = ["TEMPLO_SEDE", "GRANDE_EVENTO", "RC_ADMINISTRADORES", "OUTROS"];
const COBERTURAS_MINIMAS = ["INCENDIO", "DANOS_ELETRICOS", "RC"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

function estadoVigencia(a, hoje) {
  const ini = new Date(a.DataInicio);
  const fim = new Date(a.DataFim);
  if (a.Status === "CANCELADA") return "CANCELADA";
  if (fim < hoje) return "VENCIDA";
  if (ini > hoje) return "A_VENCER";
  return "VIGENTE";
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Seguros institucionais são matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && recurso === "alertas") {
    const result = await pool.request().query(`SELECT * FROM ApolicesSeguro ORDER BY DataFim`);
    const vencidas = result.recordset.filter(a => a.Status === "ATIVA" && new Date(a.DataFim) < hoje);
    const temploSedeVigente = result.recordset.some(a => a.Status === "ATIVA" && a.Tipo === "TEMPLO_SEDE" && new Date(a.DataInicio) <= hoje && new Date(a.DataFim) >= hoje);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        temploSedeSemCobertura: !temploSedeVigente,
        mensagemTemploSede: temploSedeVigente ? null : "⚠️ Sem apólice VIGENTE para o Templo Sede — negligência grave da gestão (Art. 65-A §2º).",
        vencidas
      }
    };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const result = await pool.request().query(`
      SELECT a.*, b.Descricao AS bemDescricao FROM ApolicesSeguro a
      LEFT JOIN BensPatrimoniais b ON b.BemId = a.BemId ORDER BY a.DataFim DESC
    `);
    const lista = result.recordset.map(a => Object.assign({}, a, { vigencia: estadoVigencia(a, hoje) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { tipo, seguradora, numeroApolice, dataInicio, dataFim, coberturas, valorPremio, bemId, eventoDescricao, documentoBase64, mimeType, observacao } = req.body || {};
    if (!tipo || !TIPOS.includes(tipo) || !seguradora || !seguradora.trim() || !numeroApolice || !numeroApolice.trim() || !dataInicio || !dataFim) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, seguradora, numeroApolice, dataInicio, dataFim." } };
      return;
    }
    const listaCoberturas = Array.isArray(coberturas) ? coberturas.map(c => String(c).toUpperCase()) : [];
    if (tipo === "TEMPLO_SEDE" || tipo === "GRANDE_EVENTO") {
      const faltando = COBERTURAS_MINIMAS.filter(c => !listaCoberturas.includes(c));
      if (faltando.length > 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Apólice de ${tipo} exige cobertura mínima de ${COBERTURAS_MINIMAS.join(", ")}. Faltando: ${faltando.join(", ")}.` } };
        return;
      }
    }
    let documentoUrl = null;
    if (documentoBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de documento inválido." } };
        return;
      }
      documentoUrl = await storage.salvarDocumento(Buffer.from(documentoBase64, "base64"), mimeType);
    }
    const criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("seguradora", sql.NVarChar(150), seguradora.trim())
      .input("numero", sql.NVarChar(50), numeroApolice.trim()).input("ini", sql.Date, dataInicio).input("fim", sql.Date, dataFim)
      .input("coberturas", sql.NVarChar(500), listaCoberturas.join(",")).input("premio", sql.Decimal(12, 2), valorPremio || null)
      .input("bemId", sql.Int, bemId || null).input("evento", sql.NVarChar(300), eventoDescricao || null)
      .input("url", sql.NVarChar(500), documentoUrl).input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ApolicesSeguro (Tipo, Seguradora, NumeroApolice, DataInicio, DataFim, Coberturas, ValorPremio, BemId, EventoDescricao, DocumentoUrl, Observacao, RegistradoPor)
              OUTPUT INSERTED.ApoliceId VALUES (@tipo, @seguradora, @numero, @ini, @fim, @coberturas, @premio, @bemId, @evento, @url, @obs, @por)`);
    await registrarAuditoria({
      tabela: "ApolicesSeguro", registroId: criada.recordset[0].ApoliceId, acao: "Registrou apólice de seguro", usuarioId: usuario.membroId,
      dadosDepois: { tipo, seguradora, numeroApolice, coberturas: listaCoberturas, dataInicio, dataFim }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Apólice de seguro registrada.", apoliceId: criada.recordset[0].ApoliceId } };
    return;
  }

  if (req.method === "PUT" && !recurso) {
    const { apoliceId, acao } = req.body || {};
    if (acao !== "CANCELAR" || !apoliceId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe apoliceId e acao: 'CANCELAR'." } };
      return;
    }
    await pool.request().input("id", sql.Int, apoliceId).query(`UPDATE ApolicesSeguro SET Status = 'CANCELADA' WHERE ApoliceId = @id`);
    await registrarAuditoria({
      tabela: "ApolicesSeguro", registroId: Number(apoliceId), acao: "Cancelou apólice de seguro", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Apólice cancelada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: alertas." } };
};

