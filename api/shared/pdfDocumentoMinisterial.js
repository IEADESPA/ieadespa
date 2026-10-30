// shared/pdfDocumentoMinisterial.js (v8.3 — Consagração e documentação)
// A página dos documentos ministeriais: o CHM (Certificado de Habilitação Ministerial, Regimento Art. 67) e o diploma de consagração (Art. 75, IV, e) ou de
// reconhecimento (Art. 10). Usada pelo CertificadoPdf (o documento já emitido) e pela impressão dos diplomas antes da cerimônia (shared/consagracaoDb.js) — o diploma é
// impresso com o código reservado e só passa a valer quando a cerimônia é registrada com a pessoa presente (até lá, a verificação pública não o encontra).
const { cabecalhoInstitucional, MARINHO, OURO, CINZA } = require("./pdfInstitucional");
const { desenharQrNoPdf } = require("./certificadoQr");
const certificados = require("./certificados");

// v8.7: o diploma de conclusão de curso da AFM e a declaração de matrícula (o histórico escolar tem página própria: shared/pdfHistoricoEscolar.js)
const CABECALHO = { CHM: "CERTIFICADO DE HABILITAÇÃO MINISTERIAL", DIPLOMA: "DIPLOMA", DIPLOMA_AFM: "DIPLOMA", DECLARACAO: "DECLARAÇÃO DE MATRÍCULA" };
const ASSINATURAS = { CHM: ["Reitor(a) da AFM", "Pastor Presidente"], DIPLOMA: ["Pastor Presidente", "Secretário(a) Geral"], DIPLOMA_AFM: ["Reitor(a) da AFM", "Pastor Presidente"],
  DECLARACAO: ["Reitor(a) da AFM", "Secretário(a) Geral"] };
const ABERTURA = { DECLARACAO: "Declaramos que" };

// `d`: { natureza, nome, membroId, titulo, descricao, revogadoEm (texto já formatado ou null), codigo, rodape, reitor? (o nome, sobre a linha do Reitor) }
function desenharDocumentoMinisterial(doc, d) {
  cabecalhoInstitucional(doc);
  doc.fontSize(20).font("Helvetica-Bold").fillColor(MARINHO).text(CABECALHO[d.natureza] || "CERTIFICADO", { align: "center" });
  doc.moveDown(0.4).fontSize(12).font("Helvetica").fillColor(CINZA).text(d.titulo, { align: "center" }).fillColor("#000000").moveDown(d.revogadoEm ? 0.6 : 1.6);
  if (d.revogadoEm) {
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#B3261E")
      .text(`DOCUMENTO REVOGADO em ${d.revogadoEm} — não tem validade.`, { align: "center" })
      .fillColor("#000000").moveDown(1);
  }
  doc.fontSize(13).font("Helvetica").text(`${ABERTURA[d.natureza] || "Certificamos que"} ${d.nome} (Cartão de Membro nº ${d.membroId}) ${d.descricao}`, { align: "justify", lineGap: 3 }).moveDown(4);

  const [esq, dir] = ASSINATURAS[d.natureza] || ["", ""];
  const largura = 200;
  const y = doc.y;
  doc.fontSize(11);
  doc.text("_______________________________", doc.page.margins.left, y, { width: largura, align: "center" });
  doc.text(d.reitor && esq.startsWith("Reitor") ? `${d.reitor}
${esq}` : esq, doc.page.margins.left, doc.y, { width: largura, align: "center" });
  doc.text("_______________________________", doc.page.width - doc.page.margins.right - largura, y, { width: largura, align: "center" });
  doc.text(dir, doc.page.width - doc.page.margins.right - largura, doc.y, { width: largura, align: "center" });

  if (d.codigo) {
    const codigo = certificados.formatarCodigo(certificados.normalizarCodigo(d.codigo));
    const url = certificados.urlVerificacao(codigo);
    const tamanho = 92;
    const yQr = doc.page.height - doc.page.margins.bottom - 24 - 14 - tamanho;
    const xTexto = doc.page.margins.left + tamanho + 14;
    const larguraTexto = doc.page.width - doc.page.margins.right - xTexto;
    desenharQrNoPdf(doc, url, { x: doc.page.margins.left, y: yQr, tamanho });
    doc.fontSize(9).font("Helvetica-Bold").fillColor(MARINHO).text("Verifique a autenticidade deste documento", xTexto, yQr + 10, { width: larguraTexto });
    doc.font("Helvetica").fillColor(CINZA).text("Aponte a câmera para o QR Code ou acesse o endereço abaixo e informe o código.", xTexto, doc.y + 2, { width: larguraTexto });
    doc.font("Helvetica-Bold").fillColor(MARINHO).text(url.split("?")[0], xTexto, doc.y + 4, { width: larguraTexto });
    doc.text(`Código: ${codigo}`, xTexto, doc.y + 2, { width: larguraTexto });
    doc.fillColor("#000000");
  }

  const yRodape = doc.page.height - doc.page.margins.bottom - 24;
  doc.moveTo(doc.page.margins.left, yRodape - 6).lineTo(doc.page.width - doc.page.margins.right, yRodape - 6).lineWidth(0.8).strokeColor(OURO).stroke();
  doc.fontSize(8).fillColor(CINZA).font("Helvetica")
    .text(d.rodape, doc.page.margins.left, yRodape, { align: "center", width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  doc.fillColor("#000000");
}

module.exports = { desenharDocumentoMinisterial };
