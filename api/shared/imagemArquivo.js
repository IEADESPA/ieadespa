// shared/imagemArquivo.js — conferir um arquivo de imagem que chega do navegador: o conteúdo é mesmo do tipo declarado (o tipo vem do cliente e vira o
// Content-Type do blob) e, quando precisa (a arte de fundo da carteirinha, FASE 10 passo 8), o tamanho em pixels, lido do cabeçalho do próprio arquivo — sem
// abrir nem recomprimir a imagem (a arte entra no armazenamento exatamente como veio, em alta resolução).
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

function assinaturaConfere(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

// { largura, altura } ou null (cabeçalho que não se entende = recusado por quem chama)
function dimensoes(buffer, mimeType) {
  try {
    if (mimeType === "image/png") {
      if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
      return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
    }
    if (mimeType === "image/jpeg") {
      let i = 2;
      while (i + 9 < buffer.length) {
        if (buffer[i] !== 0xff) { i++; continue; }
        const marca = buffer[i + 1];
        if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }
        const tam = buffer.readUInt16BE(i + 2);
        // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC)
        if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { altura: buffer.readUInt16BE(i + 5), largura: buffer.readUInt16BE(i + 7) };
        if (tam < 2) return null;
        i += 2 + tam;
      }
      return null;
    }
    if (mimeType === "image/webp") {
      const tipo = buffer.toString("ascii", 12, 16);
      if (tipo === "VP8X" && buffer.length >= 30) return { largura: 1 + buffer.readUIntLE(24, 3), altura: 1 + buffer.readUIntLE(27, 3) };
      if (tipo === "VP8 " && buffer.length >= 30) return { largura: buffer.readUInt16LE(26) & 0x3fff, altura: buffer.readUInt16LE(28) & 0x3fff };
      if (tipo === "VP8L" && buffer.length >= 25) {
        const b = buffer.readUInt32LE(21);
        return { largura: (b & 0x3fff) + 1, altura: ((b >> 14) & 0x3fff) + 1 };
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

module.exports = { TIPOS, assinaturaConfere, dimensoes };
