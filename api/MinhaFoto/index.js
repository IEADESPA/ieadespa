// MinhaFoto (v1.10 — público, autoatendimento por matrícula)
// Até agora só existia upload de Foto pelo lado Secretaria (UploadFotoMembro,
// exige permissão "pessoas") — o próprio membro não tinha como ver/subir a
// própria foto pelo Meu Painel. Mesmo modelo de acesso de MeusDadosLGPD/
// GestaoConsentimentoLGPD (só a matrícula da sessão, sem exigir permissão).
// GET  /api/minha-foto/{matricula} -> { fotoUrl, consentimentoConcedido }
// POST /api/minha-foto/{matricula} -> body: { fotoBase64, mimeType } (mesma trava
//      de consentimento de UploadFotoMembro — aceita FOTO ou DADOS_CONTATO,
//      ver shared/consentimentoFoto.js)
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { fotoConsentimentoConcedido } = require("../shared/consentimentoFoto");

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, matricula).query(`SELECT MembroId, FotoUrl FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  if (req.method === "GET") {
    const concedido = await fotoConsentimentoConcedido(pool, sql, matricula);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, fotoUrl: membro.recordset[0].FotoUrl, consentimentoConcedido: concedido }
    };
    return;
  }

  if (req.method === "POST") {
    const { fotoBase64, mimeType } = req.body || {};
    if (!fotoBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe fotoBase64 e mimeType." } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato de imagem inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }

    // Mesma trava real de UploadFotoMembro (v1.7) — só o estado mais recente conta.
    const concedido = await fotoConsentimentoConcedido(pool, sql, matricula);
    if (!concedido) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Conceda o consentimento de Foto antes de fazer o upload." } };
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
      url = await storage.salvarFoto(matricula, buffer, mimeType);
    } catch (erro) {
      // Sem isso, uma falha aqui (ex: AZURE_STORAGE_CONNECTION_STRING ausente/
      // inválida no Function App) sobe sem tratamento e o Azure Functions devolve
      // um 500 de corpo vazio — o navegador não consegue nem mostrar mensagem
      // nenhuma (JSON.parse quebra em cima de resposta vazia).
      context.log.error("Falha ao salvar no Azure Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar a foto no armazenamento. Avise a equipe técnica: " + erro.message } };
      return;
    }
    await pool.request().input("id", sql.Int, matricula).input("url", sql.NVarChar(500), url)
      .query(`UPDATE MembroReferencia SET FotoUrl = @url WHERE MembroId = @id`);

    await registrarAuditoria({
      tabela: "MembroReferencia",
      registroId: Number(matricula),
      acao: "Atualizou a própria foto (autoatendimento)",
      usuarioId: Number(matricula),
      dadosDepois: { fotoUrl: url }
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Foto atualizada.", fotoUrl: url } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
