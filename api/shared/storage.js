// shared/storage.js
// Wrapper fino do Azure Blob Storage — client único reaproveitado por
// container (mesmo espírito de shared/db.js), sem estado espalhado pelas
// Functions. Guardar como base64 na própria linha do SQL degradaria com o
// crescimento do cadastro; Blob Storage escala sem exigir migração de dado
// depois. Começou só pra Foto do membro (v1.7); v2.9 generaliza pra
// qualquer container (ex: Documentos institucionais), sem mudar o
// comportamento das funções de foto existentes.
// Exige AZURE_STORAGE_CONNECTION_STRING nas Application Settings (Storage Account
// próprio, criado fora do código — mesmo padrão de AZURE_SQL_CONNECTION_STRING).
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");

const CONTAINER_FOTOS = "fotos-membros";
const CONTAINER_DOCUMENTOS = "documentos-institucionais";
const VALIDADE_SAS_MS = 60 * 60 * 1000; // 1 hora
const clientesPorContainer = new Map();

function getContainerClient(nomeContainer) {
  if (!clientesPorContainer.has(nomeContainer)) {
    const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    clientesPorContainer.set(nomeContainer, client.getContainerClient(nomeContainer));
  }
  return clientesPorContainer.get(nomeContainer);
}

async function salvarFoto(membroId, bufferImagem, mimeType) {
  const container = getContainerClient(CONTAINER_FOTOS);
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
function gerarUrlComSas(nomeContainer, urlOuNomeBlob) {
  if (!urlOuNomeBlob) return null;
  let nomeBlob;
  try {
    nomeBlob = new URL(urlOuNomeBlob).pathname.split("/").pop();
  } catch (e) {
    nomeBlob = urlOuNomeBlob; // já veio só o nome do blob
  }
  if (!nomeBlob) return null;

  const container = getContainerClient(nomeContainer);
  if (!container.credential || !container.credential.accountName) {
    // Sem chave de conta (ex: connection string não tem AccountKey) não dá pra
    // assinar SAS — melhor não mostrar nada do que quebrar a tela toda.
    console.error("Não foi possível gerar URL assinada: credencial de conta indisponível.");
    return null;
  }
  const blob = container.getBlockBlobClient(nomeBlob);
  const sas = generateBlobSASQueryParameters({
    containerName: nomeContainer,
    blobName: nomeBlob,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + VALIDADE_SAS_MS)
  }, container.credential).toString();
  return `${blob.url}?${sas}`;
}

function urlComSas(fotoUrlOuNomeBlob) {
  return gerarUrlComSas(CONTAINER_FOTOS, fotoUrlOuNomeBlob);
}

// Best-effort: a exclusão LGPD (ExecutarExclusaoLGPD) não pode falhar por causa de um
// problema no Storage — o dado principal (FotoUrl) já foi zerado no SQL de qualquer forma.
async function excluirFoto(membroId) {
  try {
    await getContainerClient(CONTAINER_FOTOS).getBlockBlobClient(`membro-${membroId}`).deleteIfExists();
  } catch (e) {
    console.error("Falha ao excluir foto do Blob Storage (ignorado):", e.message);
  }
}

// Documentos institucionais (v2.9) — catálogo de REFERÊNCIA a arquivos que já
// existem (ata já assinada fora do sistema, termo escaneado etc.), nunca
// editados aqui. Nome de blob único (timestamp + aleatório) porque, ao
// contrário da foto, não há 1 arquivo por matrícula — pode haver vários
// documentos por órgão/sessão.
async function salvarDocumento(bufferArquivo, mimeType) {
  const container = getContainerClient(CONTAINER_DOCUMENTOS);
  await container.createIfNotExists();
  const nomeBlob = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const blob = container.getBlockBlobClient(nomeBlob);
  await blob.uploadData(bufferArquivo, { blobHTTPHeaders: { blobContentType: mimeType } });
  return blob.url;
}

function urlDocumentoComSas(urlBlob) {
  return gerarUrlComSas(CONTAINER_DOCUMENTOS, urlBlob);
}

module.exports = { salvarFoto, excluirFoto, urlComSas, salvarDocumento, urlDocumentoComSas };
