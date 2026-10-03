// AnexosGenericos (vB.4 — Anexos genéricos)
// Qualquer registro de qualquer módulo cadastrado em shared/anexos.js
// aceita documento, com o MESMO controle de acesso do registro-pai — nunca
// uma tela/permissão nova por módulo.
// GET    /api/anexos?tabela=X&registroId=Y   -> lista (com link assinado)
// POST   /api/anexos                          -> { tabela, registroId, nomeArquivo, mimeType, documentoBase64 }
// DELETE /api/anexos/{anexoId}
//
// ESCOPO (02/10/2026): além da permissão da tabela, vale a regra do registro-pai (shared/anexos.js): Projetos só o GERAL escreve; Fornecedores só o GERAL; Abandono só da
// pessoa dentro do escopo; denúncia da Ouvidoria com a regra de conflito de interesse da Diretoria. O registroId precisa existir no pai. Fora do escopo = a MESMA resposta
// de "não existe" (403 igual), para a rota não servir de sonda.
const auth = require("../shared/auth");
const { ehGeral, FORA_DO_ESCOPO, MSG_GERAL } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { regraDaTabela } = require("../shared/anexos");
const { calcularStatusRetencao } = require("../shared/retencao");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB — o mesmo limite de Documentos
const MSG_SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

// O conteúdo precisa ser do tipo declarado (o mimeType vem do cliente): PDF abre com "%PDF-", PNG e JPEG têm assinatura fixa.
function conteudoCombinaComTipo(buffer, mimeType) {
  if (mimeType === "application/pdf") return buffer.subarray(0, 1024).includes("%PDF-");
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return false;
}

// Porta única das três operações. `uniforme`: toda recusa devolve a MESMA resposta (usado no DELETE, onde o anexo pode nem existir).
// Ordem: tabela conhecida → permissão da tabela → exigência de nível geral → registro-pai existe e está no escopo.
async function autorizar(context, pool, usuario, tabela, registroId, { escrita, uniforme }) {
  const recusar = (status, mensagem) => {
    context.res = uniforme ? { status: 403, body: FORA_DO_ESCOPO } : { status, body: { sucesso: false, mensagem } };
    return false;
  };
  const regra = regraDaTabela(tabela);
  if (!regra) return recusar(400, "Tabela não aceita anexo genérico.");
  // v7.6 — a visão só com as concessões que têm a permissão da tabela: o nível geral e o escopo do registro-pai são os DELA.
  const visao = auth.visaoDaPermissao(usuario, regra.permissoes);
  if (!visao) return recusar(403, MSG_SEM_PERMISSAO);
  if ((regra.soGeral || (escrita && regra.escritaSoGeral)) && !ehGeral(visao)) return recusar(403, MSG_GERAL);
  if (!(await regra.alcance(pool, visao, registroId))) {
    context.res = { status: 403, body: FORA_DO_ESCOPO };
    return false;
  }
  return true;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { tabela } = req.query || {};
    const registroId = auth.idDeRota((req.query || {}).registroId);
    if (!tabela || !registroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe tabela e registroId." } };
      return;
    }
    if (!(await autorizar(context, pool, usuario, tabela, registroId, { escrita: false, uniforme: false }))) return;
    const result = await pool.request().input("tabela", sql.NVarChar(60), tabela).input("registroId", sql.Int, registroId).query(`
      SELECT a.AnexoId, a.NomeArquivo, a.Url, a.MimeType, a.CriadoEm, a.Categoria, pr.DiasRetencao AS diasRetencaoPolitica
      FROM AnexosGenericos a LEFT JOIN PoliticasRetencao pr ON pr.Categoria = a.Categoria
      WHERE a.Tabela = @tabela AND a.RegistroId = @registroId ORDER BY a.CriadoEm DESC
    `);
    const lista = result.recordset.map(a => ({
      anexoId: a.AnexoId, nomeArquivo: a.NomeArquivo, mimeType: a.MimeType, criadoEm: a.CriadoEm, categoria: a.Categoria,
      urlAssinada: storage.urlDocumentoComSas(a.Url),
      statusRetencao: a.Categoria ? calcularStatusRetencao({ diasRetencao: a.diasRetencaoPolitica, criadoEm: a.CriadoEm }) : null
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !id) {
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { tabela, nomeArquivo, mimeType, documentoBase64, categoria } = corpo;
    const registroId = auth.idDeRota(corpo.registroId);
    if (typeof tabela !== "string" || !tabela || !registroId || typeof nomeArquivo !== "string" || !nomeArquivo.trim() || typeof mimeType !== "string" || typeof documentoBase64 !== "string" || !documentoBase64) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe tabela, registroId, nomeArquivo, mimeType e documentoBase64." } };
      return;
    }
    if (nomeArquivo.length > 255 || (categoria != null && (typeof categoria !== "string" || categoria.length > 60))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Nome do arquivo (até 255) ou categoria (até 60) inválido." } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de arquivo inválido. Use PDF, JPEG ou PNG." } };
      return;
    }
    // O tamanho do texto já entrega o do arquivo (base64 = 4/3): recusa antes de decodificar e antes de tocar o banco.
    if (documentoBase64.length > Math.ceil(TAMANHO_MAXIMO_BYTES / 3) * 4 + 4) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo maior que 15 MB." } };
      return;
    }
    if (!(await autorizar(context, pool, usuario, tabela, registroId, { escrita: true, uniforme: false }))) return;

    const buffer = Buffer.from(documentoBase64, "base64");
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }
    if (!conteudoCombinaComTipo(buffer, mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "O conteúdo do arquivo não é do formato informado (PDF, JPEG ou PNG)." } };
      return;
    }
    let url;
    try {
      url = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar anexo no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o arquivo. Avise a equipe técnica." } };
      return;
    }
    let anexoId;
    try {
      const inserido = await pool.request()
        .input("tabela", sql.NVarChar(60), tabela).input("registroId", sql.Int, registroId)
        .input("nomeArquivo", sql.NVarChar(255), nomeArquivo).input("url", sql.NVarChar(500), url)
        .input("mimeType", sql.NVarChar(100), mimeType).input("por", sql.Int, usuario.membroId)
        .input("categoria", sql.NVarChar(60), categoria || null)
        .query(`INSERT INTO AnexosGenericos (Tabela, RegistroId, NomeArquivo, Url, MimeType, EnviadoPorMembroId, Categoria)
                OUTPUT INSERTED.AnexoId VALUES (@tabela, @registroId, @nomeArquivo, @url, @mimeType, @por, @categoria)`);
      anexoId = inserido.recordset[0].AnexoId;
    } catch (erro) {
      await storage.excluirDocumento(url); // não deixa o arquivo órfão no armazenamento
      if (erro && erro.number === 547) { // categoria que não existe na política de retenção
        context.res = { status: 400, body: { sucesso: false, mensagem: "Categoria inválida." } };
        return;
      }
      throw erro;
    }
    await registrarAuditoria({ tabela: "AnexosGenericos", registroId: anexoId, acao: `Anexou documento em ${tabela}#${registroId}`, usuarioId: usuario.membroId, dadosDepois: { tabela, registroId, nomeArquivo } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Anexo enviado.", anexoId } };
    return;
  }

  if (req.method === "DELETE" && id) {
    const anexoId = auth.idDeRota(id);
    if (!anexoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Anexo inválido." } };
      return;
    }
    const anexo = (await pool.request().input("id", sql.Int, anexoId).query(`SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos WHERE AnexoId = @id`)).recordset[0];
    // Anexo inexistente, tabela sem regra, sem permissão, fora do escopo: tudo a mesma resposta (403 igual).
    if (!anexo) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }
    if (!(await autorizar(context, pool, usuario, anexo.Tabela, anexo.RegistroId, { escrita: true, uniforme: true }))) return;
    await pool.request().input("id", sql.Int, anexoId).query(`DELETE FROM AnexosGenericos WHERE AnexoId = @id`);
    await storage.excluirDocumento(anexo.Url);
    await registrarAuditoria({
      tabela: "AnexosGenericos", registroId: anexoId, acao: "Excluiu anexo", usuarioId: usuario.membroId,
      dadosAntes: { tabela: anexo.Tabela, registroId: anexo.RegistroId, nomeArquivo: anexo.NomeArquivo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Anexo excluído." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
