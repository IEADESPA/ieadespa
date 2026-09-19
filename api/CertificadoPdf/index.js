// CertificadoPdf (v6.5 — Certificado + página imprimível: geração de PDF
// no servidor)
// Mesmo esqueleto de CartaPdf (vB.6)/ApresentacaoCriancaPdf (vB.12): PDF
// gerado no servidor com pdfkit (shared/pdfInstitucional.js), pra sair
// igual em qualquer máquina, com o protocolo institucional único
// (shared/protocolo.js) já gravado na emissão (shared/certificados.js —
// aqui não há "rascunho": emitir já é o evento real, então o protocolo já
// existe desde o INSERT, nunca é gerado sob demanda neste arquivo).
// GET /api/certificados/{id}/pdf?matricula=123 — mesmo modelo de
// autoatendimento de CartaPdf: só a PRÓPRIA matrícula baixa o próprio
// certificado.
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");
const { novoDocumento, cabecalhoInstitucional, rodapeInstitucional, gerarBuffer } = require("../shared/pdfInstitucional");

function fmtData(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR");
}

module.exports = async function (context, req) {
  const certificadoId = context.bindingData.id;
  const matricula = Number((req.query || {}).matricula);
  if (!certificadoId || !matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: /api/certificados/{id}/pdf?matricula=123" } };
    return;
  }

  const pool = await getPool();
  const certificado = await certificados.buscarCertificadoPorId(pool, certificadoId);
  if (!certificado || certificado.membroId !== matricula) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
    return;
  }

  const doc = novoDocumento({ titulo: `CERTIFICADO — ${certificado.titulo}` });
  cabecalhoInstitucional(doc);

  doc.fontSize(18).font("Helvetica-Bold").text("CERTIFICADO", { align: "center" }).moveDown(1.5);

  doc.fontSize(12).font("Helvetica");
  doc.text(
    `Certificamos que ${certificado.nome} (Cartão de Membro nº ${certificado.membroId}) ` +
    `${certificado.titulo}${certificado.conquistaNome ? `, referente à conquista "${certificado.conquistaNome}"` : ""}.`,
    { align: "justify" }
  ).moveDown(1);

  if (certificado.descricao) {
    doc.fontSize(11).font("Helvetica-Oblique").text(certificado.descricao, { align: "justify" }).font("Helvetica").fontSize(12).moveDown(1);
  }

  doc.text(`Emitido em ${fmtData(certificado.dataEmissao) || "—"}.`).moveDown(3);

  const larguraAssinatura = 200;
  const y = doc.y;
  doc.text("_______________________________", doc.page.margins.left, y, { width: larguraAssinatura, align: "center" });
  doc.text("Pastor Congregacional", doc.page.margins.left, doc.y, { width: larguraAssinatura, align: "center" });
  doc.text("_______________________________", doc.page.width - doc.page.margins.right - larguraAssinatura, y, { width: larguraAssinatura, align: "center" });
  doc.text("Secretário(a) da EBD", doc.page.width - doc.page.margins.right - larguraAssinatura, doc.y, { width: larguraAssinatura, align: "center" });

  rodapeInstitucional(doc, { protocolo: certificado.protocolo, emitidoPor: null });
  const buffer = await gerarBuffer(doc);

  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${certificado.certificadoId}.pdf"`
    },
    body: buffer,
    isRaw: true
  };
};
