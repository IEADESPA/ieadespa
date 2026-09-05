// UploadFotoMembro
// Sobe a Foto do membro (v1.7 — opcional) pro Azure Blob Storage (shared/storage.js) e
// grava a URL em MembroReferencia.FotoUrl. Diferente do padrão de Telefone/E-mail/
// Endereço (onde o consentimento é só um registro paralelo), aqui o consentimento
// (ConsentimentosLGPD, Tipo='FOTO') é uma TRAVA de verdade: sem um registro concedido
// mais recente que qualquer revogação, o upload é rejeitado. Exige a permissão "pessoas".
// POST /api/pessoas/{membroId}/foto -> body: { fotoBase64, mimeType }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { fotoConsentimentoConcedido } = require("../shared/consentimentoFoto");

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const membroId = context.bindingData.membroId;
  const { fotoBase64, mimeType } = req.body || {};
  if (!membroId || !fotoBase64 || !mimeType) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId na rota, fotoBase64 e mimeType." } };
    return;
  }
  if (!MIME_PERMITIDOS.includes(mimeType)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Formato de imagem inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  // Consentimento como trava real (v1.7) — aceita FOTO ou DADOS_CONTATO (ver
  // shared/consentimentoFoto.js — bug real da v1.10: o autoatendimento só tem a
  // caixa de DADOS_CONTATO na tela, então travar só em FOTO deixava o upload
  // impossível mesmo com o consentimento concedido).
  const concedido = await fotoConsentimentoConcedido(pool, sql, membroId);
  if (!concedido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Registre o consentimento de Foto (LGPD) antes de fazer o upload." } };
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(fotoBase64, "base64");
  } catch (e) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "fotoBase64 inválido." } };
    return;
  }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Imagem vazia ou maior que 5 MB." } };
    return;
  }

  let url;
  try {
    url = await storage.salvarFoto(membroId, buffer, mimeType);
  } catch (erro) {
    // Sem isso, uma falha aqui (ex: AZURE_STORAGE_CONNECTION_STRING ausente/
    // inválida no Function App) sobe sem tratamento e o Azure Functions devolve
    // um 500 de corpo vazio — o navegador não consegue nem mostrar mensagem
    // nenhuma (JSON.parse quebra em cima de resposta vazia).
    context.log.error("Falha ao salvar no Azure Blob Storage:", erro.message);
    context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar a foto no armazenamento. Avise a equipe técnica: " + erro.message } };
    return;
  }
  await pool.request().input("id", sql.Int, membroId).input("url", sql.NVarChar(500), url)
    .query(`UPDATE MembroReferencia SET FotoUrl = @url WHERE MembroId = @id`);

  await registrarAuditoria({
    tabela: "MembroReferencia",
    registroId: Number(membroId),
    acao: "Atualizou foto do membro",
    usuarioId: usuario.membroId,
    dadosDepois: { fotoUrl: url }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Foto atualizada.", fotoUrl: storage.urlComSas(url) } };
};
