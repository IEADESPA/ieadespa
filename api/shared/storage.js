// shared/storage.js
// Wrapper fino do Azure Blob Storage para a Foto do membro (v1.7) — mesmo espírito de
// shared/db.js: client único reaproveitado, sem estado espalhado pelas Functions.
// Guardar como base64 na própria linha do MembroReferencia degradaria com o
// crescimento do cadastro (centenas/milhares de membros); Blob Storage escala sem
// exigir migração de dado depois.
// Exige AZURE_STORAGE_CONNECTION_STRING nas Application Settings (Storage Account
// próprio, criado fora do código — mesmo padrão de AZURE_SQL_CONNECTION_STRING).
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "fotos-membros";
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
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(`membro-${membroId}`);
  await blob.uploadData(bufferImagem, { blobHTTPHeaders: { blobContentType: mimeType } });
  return blob.url;
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

module.exports = { salvarFoto, excluirFoto };
