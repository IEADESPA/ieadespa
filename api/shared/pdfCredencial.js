// shared/pdfCredencial.js (v8.4 — Credencial digital com QR Code)
// O cartão da credencial em PDF, no tamanho de cartão de crédito (CR-80, 85,6 × 54 mm — o da impressora de PVC da Secretaria Geral, Regimento Art. 76 §2º). Sem data
// de validade (§1º): o QR leva à página pública, que consulta a situação de agora.
const PDFDocument = require("pdfkit");
const { desenharQrNoPdf } = require("./certificadoQr");
const { gerarBuffer, MARINHO, OURO, CINZA } = require("./pdfInstitucional");

const LARGURA = 242.65;   // 85,6 mm
const ALTURA = 153.07;    // 54 mm
const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

// `c`: { nome, matricula, categoria, congregacao, via, codigo, url, emitidaEmDia }; `foto`: Buffer (JPEG/PNG) ou null.
async function pdfDaCredencial(c, foto) {
  const doc = new PDFDocument({ size: [LARGURA, ALTURA], margin: 0, info: { Title: `Credencial — ${c.nome}`, Author: "IEADESPA", Lang: "pt-BR" } });
  // faixa do topo
  doc.rect(0, 0, LARGURA, 26).fill(MARINHO);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5).text("IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS — IEADESPA", 8, 6, { width: LARGURA - 16, align: "center" });
  doc.font("Helvetica").fontSize(6.5).text("Identidade Eclesiástica (Regimento Interno, Art. 76)", 8, 16, { width: LARGURA - 16, align: "center" });
  doc.moveTo(0, 26).lineTo(LARGURA, 26).lineWidth(1.2).strokeColor(OURO).stroke();
  // foto (3 × 4)
  const fx = 8, fy = 32, fw = 50, fh = 66;
  let comFoto = false;
  if (foto) {
    try { doc.image(foto, fx, fy, { fit: [fw, fh], align: "center", valign: "center" }); comFoto = true; } catch (e) { comFoto = false; }
  }
  if (!comFoto) {
    doc.rect(fx, fy, fw, fh).lineWidth(0.6).strokeColor(CINZA).stroke();
    doc.fillColor(CINZA).fontSize(6).text("foto", fx, fy + fh / 2 - 3, { width: fw, align: "center" });
  }
  // dados
  const tx = 64, tw = 112;
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8.5).text(c.nome, tx, 33, { width: tw, height: 22, ellipsis: true });
  doc.font("Helvetica").fontSize(7).fillColor(MARINHO).text(c.categoria, tx, 56, { width: tw, ellipsis: true });
  doc.fillColor("#000000").fontSize(6.5);
  if (c.congregacao) doc.text(c.congregacao, tx, 67, { width: tw, height: 9, ellipsis: true });
  doc.text(`Cartão de Membro nº ${c.matricula}  ·  Via ${c.via}`, tx, 78, { width: tw });
  doc.text(`Emitida em ${br(c.emitidaEmDia)}`, tx, 87, { width: tw });
  doc.fillColor(CINZA).fontSize(5.6).text("Sem data de validade: a situação é a do QR, consultada na hora.", tx, 96, { width: tw });
  // QR e código
  const q = 58;
  desenharQrNoPdf(doc, c.url, { x: LARGURA - q - 6, y: 32, tamanho: q });
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(5.6).text(c.codigo, LARGURA - q - 10, 32 + q + 2, { width: q + 8, align: "center" });
  // rodapé
  doc.rect(0, ALTURA - 16, LARGURA, 16).fill("#F4F1E8");
  doc.fillColor(CINZA).font("Helvetica").fontSize(5.6)
    .text("Confira em app.ieadespa.org.br/credencial.html — emissão e impressão só na Secretaria Geral (Art. 76 §2º).", 6, ALTURA - 11, { width: LARGURA - 12, align: "center" });
  return gerarBuffer(doc);
}

module.exports = { pdfDaCredencial, LARGURA, ALTURA };
