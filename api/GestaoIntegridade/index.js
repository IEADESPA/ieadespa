// GestaoIntegridade (v4.22 — Doações, Integridade e PLD-FT, item 3)
// Lei 12.846/2013 (alcança associações/fundações) + Decreto 11.129/2022:
// programa de integridade com política aprovada em ata, código de conduta
// com aceite individual registrado, due diligence de fornecedor (v4.5)
// antes do cadastro virar apto a pagamento, e declaração de conflito de
// interesses por dirigente, renovada por mandato. O canal de denúncia do
// programa é a Ouvidoria já existente (v3.7) — declarada aqui formalmente,
// sem duplicar mecanismo.
// GET  /api/integridade/politicas?tipo=DOACOES|CODIGO_CONDUTA
// POST /api/integridade/politicas -> { tipo, titulo, ataReferencia, dataAprovacao, documentoUrl? }
// GET  /api/integridade/aceites?politicaId=
// POST /api/integridade/aceites -> { membroId, politicaId }
// GET  /api/integridade/due-diligence
// POST /api/integridade/due-diligence -> { fornecedorId, status, observacao? }
// GET  /api/integridade/conflitos-interesse?mandatoReferencia=
// POST /api/integridade/conflitos-interesse -> { membroId, mandatoReferencia, temConflito, descricaoConflito? }
// GET  /api/integridade/canal-denuncia
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const TIPOS_POLITICA = ["DOACOES", "CODIGO_CONDUTA"];
const STATUS_DUE_DILIGENCE = ["PENDENTE", "APROVADO", "REPROVADO"];

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "auditoria");
  if (!usuario) return;
  const pool = await getPool();

  if (recurso === "canal-denuncia" && req.method === "GET") {
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        canal: "Ouvidoria",
        rotaApi: "/api/ouvidoria",
        declaracao: "O canal de denúncia do Programa de Integridade é a Ouvidoria já existente (v3.7) — Reg. Art. 65, não um mecanismo novo."
      }
    };
    return;
  }

  if (recurso === "politicas") {
    if (req.method === "GET") {
      const { tipo } = req.query || {};
      const request = pool.request();
      let where = "1=1";
      if (tipo) { request.input("tipo", sql.NVarChar(30), tipo); where += " AND Tipo = @tipo"; }
      const result = await request.query(`SELECT * FROM PoliticasInstitucionais WHERE ${where} ORDER BY DataAprovacao DESC`);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    if (req.method === "POST") {
      const { tipo, titulo, ataReferencia, dataAprovacao, documentoUrl } = req.body || {};
      if (!tipo || !TIPOS_POLITICA.includes(tipo) || !titulo || !titulo.trim() || !ataReferencia || !ataReferencia.trim() || !dataAprovacao) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: tipo (${TIPOS_POLITICA.join("|")}), titulo, ataReferencia (política precisa ser aprovada em ata), dataAprovacao.` } };
        return;
      }
      await pool.request().input("tipo", sql.NVarChar(30), tipo)
        .query(`UPDATE PoliticasInstitucionais SET Vigente = 0 WHERE Tipo = @tipo AND Vigente = 1`);
      const criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("titulo", sql.NVarChar(200), titulo.trim())
        .input("ata", sql.NVarChar(200), ataReferencia.trim()).input("data", sql.Date, dataAprovacao)
        .input("url", sql.NVarChar(500), documentoUrl || null).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO PoliticasInstitucionais (Tipo, Titulo, AtaReferencia, DataAprovacao, DocumentoUrl, RegistradoPor)
                OUTPUT INSERTED.PoliticaId VALUES (@tipo, @titulo, @ata, @data, @url, @por)`);
      await registrarAuditoria({
        tabela: "PoliticasInstitucionais", registroId: criada.recordset[0].PoliticaId, acao: "Aprovou política institucional", usuarioId: usuario.membroId,
        dadosDepois: { tipo, titulo, ataReferencia }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Política registrada e vigente.", politicaId: criada.recordset[0].PoliticaId } };
    }
    return;
  }

  if (recurso === "aceites") {
    if (req.method === "GET") {
      const { politicaId } = req.query || {};
      const request = pool.request();
      let where = "1=1";
      if (politicaId) { request.input("politicaId", sql.Int, politicaId); where += " AND a.PoliticaId = @politicaId"; }
      const result = await request.query(`
        SELECT a.*, m.Nome AS membroNome, p.Titulo AS politicaTitulo FROM CodigoCondutaAceites a
        JOIN MembroReferencia m ON m.MembroId = a.MembroId
        JOIN PoliticasInstitucionais p ON p.PoliticaId = a.PoliticaId
        WHERE ${where} ORDER BY a.DataAceite DESC
      `);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    if (req.method === "POST") {
      const { membroId, politicaId } = req.body || {};
      if (!membroId || !politicaId) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e politicaId." } };
        return;
      }
      const existente = await pool.request().input("m", sql.Int, membroId).input("p", sql.Int, politicaId)
        .query(`SELECT AceiteId FROM CodigoCondutaAceites WHERE MembroId = @m AND PoliticaId = @p`);
      if (existente.recordset.length > 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este membro já registrou aceite para esta política." } };
        return;
      }
      const criado = await pool.request().input("m", sql.Int, membroId).input("p", sql.Int, politicaId)
        .query(`INSERT INTO CodigoCondutaAceites (MembroId, PoliticaId) OUTPUT INSERTED.AceiteId VALUES (@m, @p)`);
      await registrarAuditoria({
        tabela: "CodigoCondutaAceites", registroId: criado.recordset[0].AceiteId, acao: "Registrou aceite de política/código de conduta", usuarioId: usuario.membroId,
        dadosDepois: { membroId, politicaId }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aceite registrado." } };
    }
    return;
  }

  if (recurso === "due-diligence") {
    if (req.method === "GET") {
      const result = await pool.request().query(`
        SELECT f.FornecedorId, f.Nome AS fornecedorNome, dd.Status, dd.Observacao, dd.DataRealizacao
        FROM Fornecedores f LEFT JOIN FornecedoresDueDiligence dd ON dd.FornecedorId = f.FornecedorId
        ORDER BY ISNULL(dd.Status, 'PENDENTE'), f.Nome
      `);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    if (req.method === "POST") {
      const { fornecedorId, status, observacao } = req.body || {};
      if (!fornecedorId || !status || !STATUS_DUE_DILIGENCE.includes(status)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Informe fornecedorId e status (${STATUS_DUE_DILIGENCE.join("|")}).` } };
        return;
      }
      const existente = await pool.request().input("f", sql.Int, fornecedorId).query(`SELECT DueDiligenceId FROM FornecedoresDueDiligence WHERE FornecedorId = @f`);
      if (existente.recordset.length === 0) {
        await pool.request().input("f", sql.Int, fornecedorId).input("status", sql.NVarChar(20), status)
          .input("obs", sql.NVarChar(500), observacao || null).input("realPor", sql.Int, usuario.membroId).input("por", sql.Int, usuario.membroId)
          .query(`INSERT INTO FornecedoresDueDiligence (FornecedorId, Status, Observacao, RealizadoPor, DataRealizacao, RegistradoPor)
                  VALUES (@f, @status, @obs, @realPor, SYSUTCDATETIME(), @por)`);
      } else {
        await pool.request().input("f", sql.Int, fornecedorId).input("status", sql.NVarChar(20), status)
          .input("obs", sql.NVarChar(500), observacao || null).input("realPor", sql.Int, usuario.membroId)
          .query(`UPDATE FornecedoresDueDiligence SET Status = @status, Observacao = @obs, RealizadoPor = @realPor, DataRealizacao = SYSUTCDATETIME() WHERE FornecedorId = @f`);
      }
      await registrarAuditoria({
        tabela: "FornecedoresDueDiligence", registroId: Number(fornecedorId), acao: "Registrou due diligence de fornecedor", usuarioId: usuario.membroId,
        dadosDepois: { status, observacao }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Due diligence registrada." } };
    }
    return;
  }

  if (recurso === "conflitos-interesse") {
    if (req.method === "GET") {
      const { mandatoReferencia } = req.query || {};
      const request = pool.request();
      let where = "1=1";
      if (mandatoReferencia) { request.input("mandato", sql.NVarChar(20), mandatoReferencia); where += " AND d.MandatoReferencia = @mandato"; }
      const result = await request.query(`
        SELECT d.*, m.Nome AS membroNome FROM DeclaracoesConflitoInteresse d
        JOIN MembroReferencia m ON m.MembroId = d.MembroId WHERE ${where} ORDER BY d.MandatoReferencia DESC
      `);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
      return;
    }
    if (req.method === "POST") {
      const { membroId, mandatoReferencia, temConflito, descricaoConflito } = req.body || {};
      if (!membroId || !mandatoReferencia || !mandatoReferencia.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e mandatoReferencia (ex: '2026-2028')." } };
        return;
      }
      if (temConflito && (!descricaoConflito || !descricaoConflito.trim())) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Havendo conflito de interesses, descreva-o em descricaoConflito." } };
        return;
      }
      const existente = await pool.request().input("m", sql.Int, membroId).input("mandato", sql.NVarChar(20), mandatoReferencia.trim())
        .query(`SELECT DeclaracaoId FROM DeclaracoesConflitoInteresse WHERE MembroId = @m AND MandatoReferencia = @mandato`);
      if (existente.recordset.length > 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este dirigente já declarou conflito de interesses para este mandato." } };
        return;
      }
      const criada = await pool.request().input("m", sql.Int, membroId).input("mandato", sql.NVarChar(20), mandatoReferencia.trim())
        .input("tem", sql.Bit, temConflito ? 1 : 0).input("desc", sql.NVarChar(500), descricaoConflito || null).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO DeclaracoesConflitoInteresse (MembroId, MandatoReferencia, TemConflito, DescricaoConflito, RegistradoPor)
                OUTPUT INSERTED.DeclaracaoId VALUES (@m, @mandato, @tem, @desc, @por)`);
      await registrarAuditoria({
        tabela: "DeclaracoesConflitoInteresse", registroId: criada.recordset[0].DeclaracaoId, acao: "Registrou declaração de conflito de interesses", usuarioId: usuario.membroId,
        dadosDepois: { membroId, mandatoReferencia, temConflito: !!temConflito }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Declaração de conflito de interesses registrada." } };
    }
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: politicas, aceites, due-diligence, conflitos-interesse ou canal-denuncia." } };
};
