// shared/storage.js
// Wrapper fino do Azure Blob Storage para a Foto do membro (v1.7) — mesmo espírito de
// shared/db.js: client único reaproveitado, sem estado espalhado pelas Functions.
// Guardar como base64 na própria linha do MembroReferencia degradaria com o
// crescimento do cadastro (centenas/milhares de membros); Blob Storage escala sem
// exigir migração de dado depois.
// Exige AZURE_STORAGE_CONNECTION_STRING nas Application Settings (Storage Account
// próprio, criado fora do código — mesmo padrão de AZURE_SQL_CONNECTION_STRING).
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");

const CONTAINER = "fotos-membros";
const VALIDADE_SAS_MS = 60 * 60 * 1000; // 1 hora
let containerClient;

function getContainerClient() {
  if (!containerClient) {
    const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    containerClient = client.getContainerClient(CONTAINER);
  }
  return containerClient;
}

async function salvarFoto(membroId, bufferImagem, mimeType) {
  const container = getContainerClient();
  // De propósito SEM { access: 'blob' } — o container fica privado (padrão do
  // Azure). É dado sensível (LGPD): nomes de blob são previsíveis
  // ("membro-123"), então deixar público de verdade permitiria ver a foto de
  // qualquer um só adivinhando a URL, sem passar pelas travas de consentimento
  // que o resto do sistema já aplica. Quem serve a foto pra tela é
  // urlComSas(), com link assinado e temporário.
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(`membro-${membroId}`);
  await blob.uploadData(bufferImagem, { blobHTTPHeaders: { blobContentType: mimeType } });
  return blob.url;
}

// Gera uma URL assinada (SAS) de leitura, válida por 1 hora — o FotoUrl salvo
// no banco é só a URL "crua" do blob (sem SAS, porque expiraria); esta função
// é chamada toda vez que uma tela pede a foto, nunca guardada em disco.
function urlComSas(fotoUrlOuNomeBlob) {
  if (!fotoUrlOuNomeBlob) return null;
  let nomeBlob;
  try {
    nomeBlob = new URL(fotoUrlOuNomeBlob).pathname.split("/").pop();
  } catch (e) {
    nomeBlob = fotoUrlOuNomeBlob; // já veio só o nome do blob
  }
  if (!nomeBlob) return null;

  const container = getContainerClient();
  if (!container.credential || !container.credential.accountName) {
    // Sem chave de conta (ex: connection string não tem AccountKey) não dá pra
    // assinar SAS — melhor não mostrar foto nenhuma do que quebrar a tela toda.
    console.error("Não foi possível gerar URL assinada da foto: credencial de conta indisponível.");
    return null;
  }
  const blob = container.getBlockBlobClient(nomeBlob);
  const sas = generateBlobSASQueryParameters({
    containerName: CONTAINER,
    blobName: nomeBlob,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + VALIDADE_SAS_MS)
  }, container.credential).toString();
  return `${blob.url}?${sas}`;
}

// Best-effort: a exclusão LGPD (ExecutarExclusaoLGPD) não pode falhar por causa de um
// problema no Storage — o dado principal (FotoUrl) já foi zerado no SQL de qualquer forma.
async function excluirFoto(membroId) {
  try {
    await getContainerClient().getBlockBlobClient(`membro-${membroId}`).deleteIfExists();
  } catch (e) {
    console.error("Falha ao excluir foto do Blob Storage (ignorado):", e.message);
  }
}

module.exports = { salvarFoto, excluirFoto, urlComSas };
