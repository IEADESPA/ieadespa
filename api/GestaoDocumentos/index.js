// GestaoDocumentos (v2.9)
// Catálogo de REFERÊNCIAS a arquivos que já existem (ata já assinada fora do
// sistema, termo escaneado, memorando etc.) — nunca edita o conteúdo, só
// registra onde está e de que tipo é. Geração de Ata/assinatura eletrônica
// foi descartada de propósito (README v2.9): sem editor de texto no
// sistema, o fluxo real é escrever fora, assinar (ITI/GOV.BR) e só então
// subir o arquivo pronto aqui.
// GET    /api/documentos?tipo=&orgaoId=  -> lista (com prazo de cartório calculado se Tipo=ATA)
// POST   /api/documentos                 -> body: { tipo, orgaoId?, referenciaId?, descricao?, arquivoBase64, mimeType, registradoPor }
// DELETE /api/documentos/{id}             -> exclui só o registro (não apaga o blob)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const estatuto = require("../shared/estatuto");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB
const DIAS_LAVRATURA = 30; // Art. 75 §1º — Secretário lavra e entrega ao Presidente
const DIAS_CARTORIO = 45;  // Art. 75 §2º — Presidente protocola no cartório

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const pool = await getPool();

  if (req.method === "GET") {
    const { tipo, orgaoId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (tipo) { request.input("tipo", sql.NVarChar(50), tipo); where += " AND d.Tipo = @tipo"; }
    if (orgaoId) { request.input("orgaoId", sql.Int, orgaoId); where += " AND d.OrgaoId = @orgaoId"; }

    const result = await request.query(`
      SELECT d.DocumentoId AS documentoId, d.Tipo AS tipo, d.OrgaoId AS orgaoId, o.Nome AS orgaoNome,
             d.ReferenciaId AS referenciaId, d.Descricao AS descricao, d.UrlBlob AS urlBlob,
             d.RegistradoPor AS registradoPor, m.Nome AS registradoPorNome,
             CONVERT(varchar(33), d.CriadoEm, 126) AS criadoEm,
             CONVERT(varchar(10), s.DataSessao, 120) AS dataSessaoReferencia
      FROM Documentos d
      LEFT JOIN Orgaos o ON o.OrgaoId = d.OrgaoId
      LEFT JOIN MembroReferencia m ON m.MembroId = d.RegistradoPor
      LEFT JOIN Sessoes s ON d.Tipo = 'ATA' AND s.SessaoId = d.ReferenciaId
      WHERE ${where}
      ORDER BY d.CriadoEm DESC
    `);

    const hoje = new Date().toISOString().slice(0, 10);
    const documentos = result.recordset.map(doc => {
      const base = Object.assign({}, doc, { urlAssinada: storage.urlDocumentoComSas(doc.urlBlob) });
      delete base.urlBlob;
      if (doc.tipo === "ATA" && doc.dataSessaoReferencia) {
        const diasDesdeSessao = estatuto.diasDesde(doc.dataSessaoReferencia, hoje);
        return Object.assign(base, {
          diasDesdeSessao,
          prazoLavraturaVencido: diasDesdeSessao > DIAS_LAVRATURA,
          prazoCartorioVencido: diasDesdeSessao > DIAS_CARTORIO
        });
      }
      return base;
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: documentos };
    return;
  }

  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  if (req.method === "POST") {
    const { tipo, orgaoId, referenciaId, descricao, arquivoBase64, mimeType } = req.body || {};
    if (!tipo || !arquivoBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, arquivoBase64, mimeType." } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    let buffer;
    try {
      buffer = Buffer.from(arquivoBase64, "base64");
    } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "arquivoBase64 inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }

    let urlBlob;
    try {
      urlBlob = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar Documento no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar no armazenamento. Avise a equipe técnica: " + erro.message } };
      return;
    }

    const criado = await pool.request()
      .input("tipo", sql.NVarChar(50), tipo)
      .input("orgaoId", sql.Int, orgaoId || null)
      .input("referenciaId", sql.Int, referenciaId || null)
      .input("descricao", sql.NVarChar(300), descricao || null)
      .input("urlBlob", sql.NVarChar(500), urlBlob)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO Documentos (Tipo, OrgaoId, ReferenciaId, Descricao, UrlBlob, RegistradoPor)
              OUTPUT INSERTED.DocumentoId VALUES (@tipo, @orgaoId, @referenciaId, @descricao, @urlBlob, @registradoPor)`);
    const documentoId = criado.recordset[0].DocumentoId;

    await registrarAuditoria({
      tabela: "Documentos", registroId: documentoId, acao: "Registrou documento", usuarioId: usuario.membroId,
      dadosDepois: { tipo, orgaoId: orgaoId || null, referenciaId: referenciaId || null, descricao: descricao || null }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Documento registrado.", documentoId } };
    return;
  }

  if (req.method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/documentos/{id}" } };
      return;
    }
    const dadosAntes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Documentos WHERE DocumentoId = @id`);
    const del = await pool.request().input("id", sql.Int, id).query(`DELETE FROM Documentos WHERE DocumentoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Documento não encontrado." } };
      return;
    }
    await registrarAuditoria({
      tabela: "Documentos", registroId: Number(id), acao: "Excluiu registro de documento (arquivo permanece no armazenamento)",
      usuarioId: usuario.membroId, dadosAntes: dadosAntes.recordset[0]
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro excluído." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
