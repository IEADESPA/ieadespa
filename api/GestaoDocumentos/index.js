// GestaoDocumentos (v2.9)
// Catálogo de REFERÊNCIAS a arquivos que já existem (ata já assinada fora do
// sistema, termo escaneado, memorando etc.) — nunca edita o conteúdo, só
// registra onde está e de que tipo é. Geração de Ata/assinatura eletrônica
// foi descartada de propósito (README v2.9): sem editor de texto no
// sistema, o fluxo real é escrever fora, assinar (ITI/GOV.BR) e só então
// subir o arquivo pronto aqui.
// GET    /api/documentos?tipo=&orgaoId=  -> lista o que a pessoa PODE VER (ver "Visibilidade"); sem login, só os públicos
// POST   /api/documentos                 -> body: { tipo, orgaoId?, referenciaId?, descricao?, visibilidade?, arquivoBase64, mimeType }
// PUT    /api/documentos/{id}            -> body: { visibilidade } (muda para quem o documento é)
// DELETE /api/documentos/{id}            -> exclui só o registro (não apaga o blob)
//
// Visibilidade (migração 121; decisão do responsável pelo projeto, 02/10/2026) — cada documento diz para quem é:
//   PUBLICO    qualquer pessoa vê, até sem login (só o nível GERAL marca um documento assim: publicar é ato da administração);
//   MEMBROS    qualquer membro logado vê (padrão, e o que todos os documentos já existentes passaram a ser);
//   LIDERANCA  só quem entrou com a senha de liderança.
// Quem REGISTRA e quem APAGA: o geral faz tudo; um líder local só registra ata de sessão de órgão LOCAL em que ele atua e só apaga o que ele mesmo registrou.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const estatuto = require("../shared/estatuto");
const { calcularStatusRetencao } = require("../shared/retencao");
const { ehGeral } = require("../shared/escopoRotas");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB
const DIAS_LAVRATURA = 30; // Art. 75 §1º — Secretário lavra e entrega ao Presidente
const DIAS_CARTORIO = 45;  // Art. 75 §2º — Presidente protocola no cartório
const VISIBILIDADES = ["PUBLICO", "MEMBROS", "LIDERANCA"];
const NAO_ENCONTRADO = { sucesso: false, mensagem: "Documento não encontrado." };

// A lista pública responde a qualquer pessoa da internet e consulta o banco: contenção por origem (por instância).
const limitadorPublico = criarLimitador({ janelaMs: 60000, maximo: 60 });

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const pool = await getPool();

  if (req.method === "GET") {
    // Quem vê o quê: sem sessão, só os PÚBLICOS; membro logado, públicos + de membros; quem entrou com a senha de liderança, também os de liderança. Sessão inválida/vencida
    // é 401 (não se trata como "visitante": a tela precisa pedir o login de novo).
    let usuario = null;
    if (auth.extrairToken(req)) {
      usuario = auth.exigirLoginIgnorandoTermos(req, context);
      if (!usuario) return;
    } else {
      const limite = limitadorPublico.registrar(chaveDeOrigem(req));
      if (!limite.permitido) {
        context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas consultas seguidas. Aguarde um minuto." } };
        return;
      }
    }
    const niveisVisiveis = !usuario ? ["PUBLICO"] : auth.ehSessaoDeLideranca(usuario) ? VISIBILIDADES : ["PUBLICO", "MEMBROS"];

    const { tipo, orgaoId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (tipo) { request.input("tipo", sql.NVarChar(50), tipo); where += " AND d.Tipo = @tipo"; }
    if (orgaoId) { request.input("orgaoId", sql.Int, orgaoId); where += " AND d.OrgaoId = @orgaoId"; }
    // (os níveis vêm de constante do código, nunca do pedido)
    where += ` AND d.Visibilidade IN (${niveisVisiveis.map(n => `'${n}'`).join(", ")})`;

    const result = await request.query(`
      SELECT d.DocumentoId AS documentoId, d.Tipo AS tipo, d.OrgaoId AS orgaoId, o.Nome AS orgaoNome,
             d.ReferenciaId AS referenciaId, d.Descricao AS descricao, d.UrlBlob AS urlBlob,
             d.RegistradoPor AS registradoPor, m.Nome AS registradoPorNome,
             CONVERT(varchar(33), d.CriadoEm, 126) AS criadoEm,
             CONVERT(varchar(10), s.DataSessao, 120) AS dataSessaoReferencia,
             d.Categoria AS categoria, pr.DiasRetencao AS diasRetencaoPolitica, d.Visibilidade AS visibilidade
      FROM Documentos d
      LEFT JOIN Orgaos o ON o.OrgaoId = d.OrgaoId
      LEFT JOIN MembroReferencia m ON m.MembroId = d.RegistradoPor
      LEFT JOIN Sessoes s ON d.Tipo = 'ATA' AND s.SessaoId = d.ReferenciaId
      LEFT JOIN PoliticasRetencao pr ON pr.Categoria = d.Categoria
      WHERE ${where}
      ORDER BY d.CriadoEm DESC
    `);

    const hoje = new Date().toISOString().slice(0, 10);
    const documentos = result.recordset.map(doc => {
      const base = Object.assign({}, doc, {
        urlAssinada: storage.urlDocumentoComSas(doc.urlBlob),
        // vB.6 — arquivo institucional: status calculado na leitura contra
        // PoliticasRetencao, nunca expurgo automático (decisão da v0.1 continua de pé).
        statusRetencao: doc.categoria ? calcularStatusRetencao({ diasRetencao: doc.diasRetencaoPolitica, criadoEm: doc.criadoEm }) : null
      });
      delete base.urlBlob;
      delete base.diasRetencaoPolitica;
      if (!usuario) {                       // visitante: o documento e quando saiu; nada sobre quem registrou nem ligação interna
        delete base.registradoPor;
        delete base.registradoPorNome;
        delete base.referenciaId;
      }
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
  const geral = ehGeral(usuario);

  if (req.method === "POST") {
    const { tipo, orgaoId, referenciaId, descricao, arquivoBase64, mimeType, categoria } = req.body || {};
    const visibilidade = (req.body || {}).visibilidade === undefined ? "MEMBROS" : (req.body || {}).visibilidade;
    if (!tipo || !arquivoBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, arquivoBase64, mimeType." } };
      return;
    }
    if (!VISIBILIDADES.includes(visibilidade)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Visibilidade inválida. Use PUBLICO, MEMBROS ou LIDERANCA." } };
      return;
    }
    if (visibilidade === "PUBLICO" && !geral) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Só a administração geral publica um documento para todo mundo." } };
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

    // Escopo de quem registra: o geral registra qualquer documento; um líder local só registra a ata de uma sessão de órgão LOCAL em que ele atua (órgão central,
    // documento solto e sessão de outro órgão são da administração geral). Antes, qualquer "reunioes" injetava documento em qualquer órgão ou sessão.
    if (!geral) {
      const sessaoId = tipo === "ATA" ? auth.idDeRota(referenciaId) : null;
      const sessao = !orgaoId && sessaoId
        ? (await pool.request().input("id", sql.Int, sessaoId).query(`SELECT OrgaoLocalId FROM Sessoes WHERE SessaoId = @id`)).recordset[0]
        : null;
      if (!sessao || !sessao.OrgaoLocalId || !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, sessao.OrgaoLocalId))) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
        return;
      }
    }

    let urlBlob;
    try {
      urlBlob = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar Documento no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar no armazenamento. Avise a equipe técnica." } };
      return;
    }

    // vB.6 — Ata sempre entra categorizada pra arquivo/temporalidade, mesmo
    // sem o usuário escolher nada (mesma categoria que a migração 083
    // aplicou retroativamente às Atas já existentes).
    const categoriaFinal = categoria || (tipo === "ATA" ? "Atas e Registros de Sessão/Presença" : null);
    const criado = await pool.request()
      .input("tipo", sql.NVarChar(50), tipo)
      .input("orgaoId", sql.Int, orgaoId || null)
      .input("referenciaId", sql.Int, referenciaId || null)
      .input("descricao", sql.NVarChar(300), descricao || null)
      .input("urlBlob", sql.NVarChar(500), urlBlob)
      .input("registradoPor", sql.Int, usuario.membroId)
      .input("categoria", sql.NVarChar(60), categoriaFinal)
      .input("visibilidade", sql.NVarChar(10), visibilidade)
      .query(`INSERT INTO Documentos (Tipo, OrgaoId, ReferenciaId, Descricao, UrlBlob, RegistradoPor, Categoria, Visibilidade)
              OUTPUT INSERTED.DocumentoId VALUES (@tipo, @orgaoId, @referenciaId, @descricao, @urlBlob, @registradoPor, @categoria, @visibilidade)`);
    const documentoId = criado.recordset[0].DocumentoId;

    await registrarAuditoria({
      tabela: "Documentos", registroId: documentoId, acao: "Registrou documento", usuarioId: usuario.membroId,
      dadosDepois: { tipo, orgaoId: orgaoId || null, referenciaId: referenciaId || null, descricao: descricao || null, visibilidade }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Documento registrado.", documentoId } };
    return;
  }

  // PUT e DELETE agem sobre UM documento: o geral age em qualquer um; o líder local só no que ele mesmo registrou. Fora disso a resposta é a de "não encontrado".
  if (req.method === "PUT" || req.method === "DELETE") {
    const documentoId = auth.idDeRota(id);
    if (!documentoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/documentos/{id}" } };
      return;
    }
    const atual = (await pool.request().input("id", sql.Int, documentoId).query(`SELECT * FROM Documentos WHERE DocumentoId = @id`)).recordset[0];
    if (!atual || (!geral && Number(atual.RegistradoPor) !== Number(usuario.membroId))) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }

    if (req.method === "PUT") {
      const novaVisibilidade = (req.body || {}).visibilidade;
      if (!VISIBILIDADES.includes(novaVisibilidade)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Visibilidade inválida. Use PUBLICO, MEMBROS ou LIDERANCA." } };
        return;
      }
      if (novaVisibilidade === "PUBLICO" && !geral) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Só a administração geral publica um documento para todo mundo." } };
        return;
      }
      await pool.request().input("id", sql.Int, documentoId).input("v", sql.NVarChar(10), novaVisibilidade).query(`UPDATE Documentos SET Visibilidade = @v WHERE DocumentoId = @id`);
      await registrarAuditoria({
        tabela: "Documentos", registroId: documentoId, acao: "Alterou a visibilidade do documento", usuarioId: usuario.membroId,
        dadosAntes: { visibilidade: atual.Visibilidade }, dadosDepois: { visibilidade: novaVisibilidade }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Visibilidade alterada." } };
      return;
    }

    const del = await pool.request().input("id", sql.Int, documentoId).query(`DELETE FROM Documentos WHERE DocumentoId = @id`);
    if (del.rowsAffected[0] === 0) {
      context.res = { status: 200, body: NAO_ENCONTRADO };
      return;
    }
    await registrarAuditoria({
      tabela: "Documentos", registroId: documentoId, acao: "Excluiu registro de documento (arquivo permanece no armazenamento)",
      usuarioId: usuario.membroId, dadosAntes: atual
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro excluído." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
