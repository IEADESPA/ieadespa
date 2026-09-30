// CertificadoQr (v6.9 — QR de verificação do certificado, em SVG)
// O PDF (CertificadoPdf) já leva o QR; este é o mesmo QR em SVG pra página
// imprimível do navegador (renderizarImpressaoCertificado). Mesmo modelo de
// autoatendimento de CertificadoPdf: só a PRÓPRIA matrícula pede o QR do
// próprio certificado. O QR carrega só a URL pública de verificação.
// GET /api/certificados/{id}/qr?matricula=123
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");
const { gerarMatriz, matrizParaSvg } = require("../shared/certificadoQr");

module.exports = async function (context, req) {
  const certificadoId = context.bindingData.id;
  const matricula = Number((req.query || {}).matricula);
  if (!certificadoId || !matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: /api/certificados/{id}/qr?matricula=123" } };
    return;
  }

  const pool = await getPool();
  const certificado = await certificados.buscarCertificadoPorId(pool, certificadoId);
  if (!certificado || certificado.membroId !== matricula || !certificado.codigoVerificacao) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
    return;
  }

  const svg = matrizParaSvg(gerarMatriz(certificados.urlVerificacao(certificado.codigoVerificacao)));
  context.res = { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" }, body: svg };
};
