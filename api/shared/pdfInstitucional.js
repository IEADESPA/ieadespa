// shared/pdfInstitucional.js (vB.6 — Documento institucional)
// Geração de PDF no servidor pros documentos que o sistema já emite (hoje
// só "salvar como PDF no navegador" via window.print(), que sai diferente
// em cada máquina). Mesma paleta institucional do site (site/src/lib/
// certificado.ts — dourado/marinho/cinza), sem duplicar a lib: lá é
// client-side (jsPDF, pro certificado bonito do site público), aqui é
// server-side (pdfkit, documento funcional — carta, recibo, relatório).
const PDFDocument = require("pdfkit");

const MARINHO = "#0F1B33";
const OURO = "#D9B34F";
const CINZA = "#5A6270";

function novoDocumento({ titulo }) {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: titulo, Author: "IEADESPA", Lang: "pt-BR" } });
  return doc;
}

// Cabeçalho institucional padrão — mesmo texto em toda emissão, pra não
// depender de cada Function redigitar o nome oficial da igreja.
function cabecalhoInstitucional(doc) {
  doc.fillColor(MARINHO).fontSize(14).font("Helvetica-Bold")
    .text("IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS", { align: "center" });
  doc.fontSize(10).font("Helvetica").fillColor(CINZA)
    .text("Ministério do SETA em Parauapebas — PA · IEADESPA", { align: "center" });
  doc.moveTo(doc.page.margins.left, doc.y + 8).lineTo(doc.page.width - doc.page.margins.right, doc.y + 8)
    .lineWidth(1.5).strokeColor(OURO).stroke();
  doc.moveDown(1.5);
  doc.fillColor("#000000");
}

// Rodapé com protocolo (vB.4 — mesmo gerador atômico institucional, nunca
// um número inventado por módulo) + identificação de quem emitiu + data/hora
// — README v10.5 já previa "cabeçalho institucional, identificação de quem
// emitiu, data/hora e protocolo" como padrão de qualquer relatório impresso;
// esta função é a implementação de referência que futuros PDFs reaproveitam.
function rodapeInstitucional(doc, { protocolo, emitidoPor }) {
  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const y = doc.page.height - doc.page.margins.bottom - 24;
  doc.fontSize(8).fillColor(CINZA).font("Helvetica")
    .text(
      `Protocolo ${protocolo} — emitido${emitidoPor ? ` por ${emitidoPor}` : ""} em ${dataHora} — documento gerado eletronicamente pelo sistema de governança da IEADESPA.`,
      doc.page.margins.left, y, { align: "center", width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );
}

// Coleta os chunks do stream do pdfkit num Buffer único — pdfkit escreve
// incrementalmente, mas as Functions HTTP precisam do corpo inteiro pra
// devolver de uma vez (sem streaming de resposta no modelo clássico).
function gerarBuffer(doc) {
  return new Promise((resolve, reject) => {
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    doc.end();
  });
}

module.exports = { novoDocumento, cabecalhoInstitucional, rodapeInstitucional, gerarBuffer, MARINHO, OURO, CINZA };
