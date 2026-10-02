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
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const TIPOS_POLITICA = ["DOACOES", "CODIGO_CONDUTA"];
const STATUS_DUE_DILIGENCE = ["PENDENTE", "APROVADO", "REPROVADO"];
const DATA_AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
// Dia que existe no calendário ("2026-02-30" não existe; o SQL recusaria com erro 500): reconverte e compara.
function diaExiste(v) {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  // Programa de integridade da igreja toda (políticas, aceites e declarações de conflito de interesses de dirigentes de qualquer congregação, due diligence de fornecedores):
  // só o nível GERAL (papel Global E escopo de todas as congregações) com a permissão de auditoria.
  const usuario = exigirGeral(req, context, "auditoria");
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
      if (!tipo || !TIPOS_POLITICA.includes(tipo) || typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 200
          || typeof ataReferencia !== "string" || !ataReferencia.trim() || ataReferencia.trim().length > 200
          || typeof dataAprovacao !== "string" || !DATA_AAAA_MM_DD.test(dataAprovacao) || !diaExiste(dataAprovacao)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: tipo (${TIPOS_POLITICA.join("|")}), titulo, ataReferencia (política precisa ser aprovada em ata), dataAprovacao (AAAA-MM-DD).` } };
        return;
      }
      // O link do documento, se vier, é só endereço https (nada de javascript: nem texto solto que a tela depois vire link).
      if (documentoUrl != null && documentoUrl !== "" && (typeof documentoUrl !== "string" || documentoUrl.length > 500 || !/^https:\/\//i.test(documentoUrl))) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "documentoUrl deve ser um endereço https." } };
        return;
      }
      // Troca da política vigente numa transação só: se o INSERT falhar, a anterior continua vigente (antes o tipo ficava sem nenhuma política vigente).
      const criada = await pool.request().input("tipo", sql.NVarChar(30), tipo).input("titulo", sql.NVarChar(200), titulo.trim())
        .input("ata", sql.NVarChar(200), ataReferencia.trim()).input("data", sql.Date, dataAprovacao)
        .input("url", sql.NVarChar(500), documentoUrl || null).input("por", sql.Int, usuario.membroId)
        .query(`SET XACT_ABORT ON;
                BEGIN TRANSACTION;
                UPDATE PoliticasInstitucionais SET Vigente = 0 WHERE Tipo = @tipo AND Vigente = 1;
                INSERT INTO PoliticasInstitucionais (Tipo, Titulo, AtaReferencia, DataAprovacao, DocumentoUrl, RegistradoPor)
                OUTPUT INSERTED.PoliticaId VALUES (@tipo, @titulo, @ata, @data, @url, @por);
                COMMIT TRANSACTION;`);
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
      if (politicaId) {
        const politicaIdValido = auth.idDeRota(politicaId);
        if (!politicaIdValido) { context.res = { status: 400, body: { sucesso: false, mensagem: "politicaId inválido." } }; return; }
        request.input("politicaId", sql.Int, politicaIdValido); where += " AND a.PoliticaId = @politicaId";
      }
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
      const corpoAceite = req.body || {};
      const membroId = auth.idDeRota(corpoAceite.membroId);
      const politicaId = auth.idDeRota(corpoAceite.politicaId);
      if (!membroId || !politicaId) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e politicaId." } };
        return;
      }
      // Pessoa e política precisam existir (antes a chave estrangeira estourava em erro 500).
      const pessoa = await pool.request().input("m", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @m`);
      if (pessoa.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Pessoa não encontrada." } };
        return;
      }
      const politica = await pool.request().input("p", sql.Int, politicaId).query(`SELECT PoliticaId FROM PoliticasInstitucionais WHERE PoliticaId = @p`);
      if (politica.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Política não encontrada." } };
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
      const corpoDd = req.body || {};
      const fornecedorId = auth.idDeRota(corpoDd.fornecedorId);
      const { status, observacao } = corpoDd;
      if (!fornecedorId || !status || !STATUS_DUE_DILIGENCE.includes(status) || (observacao != null && (typeof observacao !== "string" || observacao.length > 500))) {
        context.res = { status: 400, body: { sucesso: false, mensagem: `Informe fornecedorId e status (${STATUS_DUE_DILIGENCE.join("|")}); observacao com até 500 caracteres.` } };
        return;
      }
      const fornecedor = await pool.request().input("f", sql.Int, fornecedorId).query(`SELECT FornecedorId FROM Fornecedores WHERE FornecedorId = @f`);
      if (fornecedor.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
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
      const corpoConflito = req.body || {};
      const membroId = auth.idDeRota(corpoConflito.membroId);
      const { mandatoReferencia, temConflito, descricaoConflito } = corpoConflito;
      if (!membroId || typeof mandatoReferencia !== "string" || !mandatoReferencia.trim() || mandatoReferencia.trim().length > 20) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e mandatoReferencia (ex: '2026-2028')." } };
        return;
      }
      if (descricaoConflito != null && (typeof descricaoConflito !== "string" || descricaoConflito.length > 500)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "descricaoConflito deve ter até 500 caracteres." } };
        return;
      }
      if (temConflito && (!descricaoConflito || !descricaoConflito.trim())) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Havendo conflito de interesses, descreva-o em descricaoConflito." } };
        return;
      }
      const pessoa = await pool.request().input("m", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @m`);
      if (pessoa.recordset.length === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Pessoa não encontrada." } };
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
