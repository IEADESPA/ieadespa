// CertificadoPdf (v6.5 — Certificado + página imprimível: geração de PDF
// no servidor)
// Mesmo esqueleto de CartaPdf (vB.6)/ApresentacaoCriancaPdf (vB.12): PDF
// gerado no servidor com pdfkit (shared/pdfInstitucional.js), pra sair
// igual em qualquer máquina, com o protocolo institucional único
// (shared/protocolo.js) já gravado na emissão (shared/certificados.js —
// aqui não há "rascunho": emitir já é o evento real, então o protocolo já
// existe desde o INSERT, nunca é gerado sob demanda neste arquivo).
// GET /api/certificados/{id}/pdf — exige login (Trava 6-B): o titular baixa o
// próprio; gestão da EBD/formação, só de quem está no seu escopo. Antes era
// anônimo, protegido só pelo par certificadoId + matrícula — dois números
// sequenciais —, e o PDF leva o código de verificação (segredo portador da
// v6.9): dava para enumerar certificados e códigos. O parâmetro ?matricula=,
// se vier, é ignorado.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");
const { novoDocumento, cabecalhoInstitucional, rodapeInstitucional, gerarBuffer, MARINHO, CINZA } = require("../shared/pdfInstitucional");
const { desenharQrNoPdf } = require("../shared/certificadoQr");

function fmtData(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR");
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const certificadoId = Number(context.bindingData.id);
  if (!certificadoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o certificado." } };
    return;
  }

  const pool = await getPool();
  const certificado = await certificados.buscarCertificadoPorId(pool, certificadoId);
  const temGestao = !!certificado && certificado.membroId !== usuario.membroId && await certificados.gestorAlcancaMembro(pool, usuario, certificado.membroId);
  if (!certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: usuario.membroId, temGestao })) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
    return;
  }

  const doc = novoDocumento({ titulo: `CERTIFICADO — ${certificado.titulo}` });
  cabecalhoInstitucional(doc);

  doc.fontSize(18).font("Helvetica-Bold").text("CERTIFICADO", { align: "center" }).moveDown(certificado.revogadoEm ? 0.5 : 1.5);

  // v6.9 — certificado revogado continua baixável (a pessoa precisa saber),
  // mas o papel diz com todas as letras que não vale mais.
  if (certificado.revogadoEm) {
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#B3261E")
      .text(`CERTIFICADO REVOGADO em ${fmtData(certificado.revogadoEm) || "—"} — não tem validade.`, { align: "center" })
      .fillColor("#000000").moveDown(1);
  }

  doc.fontSize(12).font("Helvetica");
  doc.text(
    `Certificamos que ${certificado.nome} (Cartão de Membro nº ${certificado.membroId}) ` +
    `${certificado.titulo}${certificado.conquistaNome ? `, referente à conquista "${certificado.conquistaNome}"` : ""}.`,
    { align: "justify" }
  ).moveDown(1);

  if (certificado.descricao) {
    doc.fontSize(11).font("Helvetica-Oblique").text(certificado.descricao, { align: "justify" }).font("Helvetica").fontSize(12).moveDown(1);
  }

  doc.text(`Emitido em ${fmtData(certificado.dataEmissao) || "—"}${certificado.validoAte ? `, válido até ${fmtData(certificado.validoAte + "T12:00:00")}` : ""}.`).moveDown(3);

  const larguraAssinatura = 200;
  const y = doc.y;
  doc.text("_______________________________", doc.page.margins.left, y, { width: larguraAssinatura, align: "center" });
  doc.text("Pastor Congregacional", doc.page.margins.left, doc.y, { width: larguraAssinatura, align: "center" });
  doc.text("_______________________________", doc.page.width - doc.page.margins.right - larguraAssinatura, y, { width: larguraAssinatura, align: "center" });
  doc.text("Secretário(a) da EBD", doc.page.width - doc.page.margins.right - larguraAssinatura, doc.y, { width: larguraAssinatura, align: "center" });

  // v6.9 — QR de verificação pública (vetorial). Fica acima do rodapé, no
  // canto esquerdo; o QR carrega só a URL pública com o código.
  if (certificado.codigoVerificacao) {
    const tamanho = 92;
    const yQr = doc.page.height - doc.page.margins.bottom - 24 - 14 - tamanho;
    const xTexto = doc.page.margins.left + tamanho + 14;
    const larguraTexto = doc.page.width - doc.page.margins.right - xTexto;
    desenharQrNoPdf(doc, certificados.urlVerificacao(certificado.codigoVerificacao), { x: doc.page.margins.left, y: yQr, tamanho });
    doc.fontSize(9).font("Helvetica-Bold").fillColor(MARINHO).text("Verifique a autenticidade deste certificado", xTexto, yQr + 10, { width: larguraTexto });
    doc.font("Helvetica").fillColor(CINZA).text("Aponte a câmera para o QR Code ou acesse o endereço abaixo e informe o código.", xTexto, doc.y + 2, { width: larguraTexto });
    doc.font("Helvetica-Bold").fillColor(MARINHO).text(certificados.urlVerificacao(certificado.codigoVerificacao).split("?")[0], xTexto, doc.y + 4, { width: larguraTexto });
    doc.text(`Código: ${certificado.codigoVerificacao}`, xTexto, doc.y + 2, { width: larguraTexto });
    doc.fillColor("#000000");
  }

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
