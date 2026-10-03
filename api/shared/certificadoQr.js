// shared/certificadoQr.js (v6.9 — QR de verificação pública do certificado)
//
// Gera o QR como MATRIZ de módulos (biblioteca `qrcode`, só a parte que
// calcula — nada de PNG nem canvas) e a desenha de duas formas vetoriais:
// dentro do PDF do certificado (pdfkit, shared/pdfInstitucional.js) e como
// SVG (impressão pelo navegador). Vetorial de propósito: nítido em qualquer
// impressora e sem arquivo de imagem intermediário.
//
// O QR carrega só a URL pública de verificação (certificados.urlVerificacao)
// — nunca dado da pessoa. Quem lê o QR cai na página de verificação, que
// consulta o servidor: o papel não "prova" nada sozinho.
const QRCode = require("qrcode");

const MARGEM_MODULOS = 4; // "quiet zone" exigida pela norma do QR

function gerarMatriz(texto, nivelCorrecao = "M") {
  const qr = QRCode.create(String(texto), { errorCorrectionLevel: nivelCorrecao });
  return { size: qr.modules.size, get: (linha, coluna) => !!qr.modules.get(linha, coluna) };
}

// Sequências horizontais de módulos escuros por linha -> menos retângulos
// (um QR 33x33 vira algumas dezenas de retângulos, não ~500 quadradinhos).
function sequenciasEscuras(matriz) {
  const seq = [];
  for (let l = 0; l < matriz.size; l++) {
    let inicio = -1;
    for (let c = 0; c <= matriz.size; c++) {
      const escuro = c < matriz.size && matriz.get(l, c);
      if (escuro && inicio === -1) inicio = c;
      if (!escuro && inicio !== -1) { seq.push({ linha: l, coluna: inicio, largura: c - inicio }); inicio = -1; }
    }
  }
  return seq;
}

function matrizParaSvg(matriz, { margem = MARGEM_MODULOS, escuro = "#000000", claro = "#ffffff" } = {}) {
  const total = matriz.size + 2 * margem;
  const caminho = sequenciasEscuras(matriz)
    .map(s => `M${s.coluna + margem} ${s.linha + margem}h${s.largura}v1h-${s.largura}z`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code de verificação">`
    + `<rect width="${total}" height="${total}" fill="${claro}"/><path d="${caminho}" fill="${escuro}"/></svg>`;
}

// Desenha o QR no PDF, no quadrado [x, y, tamanho, tamanho] (fundo branco
// incluso: a margem faz parte do tamanho).
function desenharQrNoPdf(doc, texto, { x, y, tamanho }) {
  const matriz = gerarMatriz(texto);
  const total = matriz.size + 2 * MARGEM_MODULOS;
  const modulo = tamanho / total;
  doc.save();
  doc.rect(x, y, tamanho, tamanho).fill("#ffffff");
  for (const s of sequenciasEscuras(matriz)) {
    doc.rect(x + (s.coluna + MARGEM_MODULOS) * modulo, y + (s.linha + MARGEM_MODULOS) * modulo, s.largura * modulo, modulo).fill("#000000");
  }
  doc.restore();
}

module.exports = { gerarMatriz, matrizParaSvg, desenharQrNoPdf, sequenciasEscuras, MARGEM_MODULOS };
