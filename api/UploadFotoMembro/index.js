// UploadFotoMembro
// Sobe a Foto do membro (v1.7 — opcional) pro Azure Blob Storage (shared/storage.js) e
// grava a URL em MembroReferencia.FotoUrl. Diferente do padrão de Telefone/E-mail/
// Endereço (onde o consentimento é só um registro paralelo), aqui o consentimento
// (ConsentimentosLGPD, Tipo='FOTO') é uma TRAVA de verdade: sem um registro concedido
// mais recente que qualquer revogação, o upload é rejeitado. Exige a permissão "pessoas".
// POST /api/pessoas/{membroId}/foto -> body: { fotoBase64, mimeType }
//
// ESCOPO: a foto é da PESSOA — só troca quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo, matrícula inexistente ou malformada: a mesma resposta de
// "Matrícula não encontrada". A matrícula só vale na forma canônica (o blob se chama membro-<matrícula>): sem grafias alternativas ("0x10", "1e1") que deixariam um blob
// órfão que a exclusão LGPD (ExecutarExclusaoLGPD) não acharia.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { situacaoDoConsentimentoFoto } = require("../shared/consentimentoFoto");
const { MSG_FOTO_MENOR_SECRETARIA } = require("../shared/menoresConsentimento");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB
// 5 MB em base64 ocupam ~6,7 milhões de caracteres: acima disso nem se decodifica.
const TAMANHO_MAXIMO_BASE64 = Math.ceil(TAMANHO_MAXIMO_BYTES / 3) * 4 + 16;

// O conteúdo precisa ser mesmo uma imagem do tipo declarado (o mimeType vem do cliente e vira o Content-Type do blob).
function assinaturaConfere(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const membroIdBruto = context.bindingData.membroId;
  const { fotoBase64, mimeType } = req.body || {};
  if (!membroIdBruto || !fotoBase64 || !mimeType) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId na rota, fotoBase64 e mimeType." } };
    return;
  }
  if (!MIME_PERMITIDOS.includes(mimeType)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Formato de imagem inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
    return;
  }
  if (typeof fotoBase64 !== "string" || fotoBase64.length > TAMANHO_MAXIMO_BASE64) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Imagem vazia ou maior que 5 MB." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const membroId = pessoa.membroId;

  // Consentimento como trava real (v1.7) — aceita FOTO ou DADOS_CONTATO (ver
  // shared/consentimentoFoto.js — bug real da v1.10: o autoatendimento só tem a
  // caixa de DADOS_CONTATO na tela, então travar só em FOTO deixava o upload
  // impossível mesmo com o consentimento concedido).
  // v7.7 — menor de 18 anos (idade conhecida): só vale o consentimento de IMAGEM do RESPONSÁVEL (Meu Painel dele, ou a ficha assinada que a Secretaria registra em
  // Ministério com menores); o consentimento genérico da própria pessoa não destrava a foto de um menor.
  const situacao = await situacaoDoConsentimentoFoto(pool, sql, membroId);
  if (!situacao.concedido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: situacao.menor ? MSG_FOTO_MENOR_SECRETARIA : "Registre o consentimento de Foto (LGPD) antes de fazer o upload." } };
    return;
  }

  const buffer = Buffer.from(fotoBase64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Imagem vazia ou maior que 5 MB." } };
    return;
  }
  if (!assinaturaConfere(buffer, mimeType)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "O arquivo não é uma imagem do formato informado." } };
    return;
  }

  let url;
  try {
    url = await storage.salvarFoto(membroId, buffer, mimeType);
  } catch (erro) {
    // Sem isso, uma falha aqui (ex: AZURE_STORAGE_CONNECTION_STRING ausente/
    // inválida no Function App) sobe sem tratamento e o Azure Functions devolve
    // um 500 de corpo vazio — o navegador não consegue nem mostrar mensagem
    // nenhuma (JSON.parse quebra em cima de resposta vazia). O motivo fica só no log: o texto do erro do Storage não vai para o cliente.
    context.log.error("Falha ao salvar no Azure Blob Storage:", erro.message);
    context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar a foto no armazenamento. Avise a equipe técnica." } };
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
