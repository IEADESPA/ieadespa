// CertificadoQr (v6.9 — QR de verificação do certificado, em SVG)
// O PDF (CertificadoPdf) já leva o QR; este é o mesmo QR em SVG pra página
// imprimível do navegador (renderizarImpressaoCertificado). Mesma regra de
// CertificadoPdf (Trava 6-B): exige login — o titular, ou gestão que alcança o
// titular. O QR carrega só a URL pública de verificação.
// GET /api/certificados/{id}/qr
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");
const { gerarMatriz, matrizParaSvg } = require("../shared/certificadoQr");

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
  if (!certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: usuario.membroId, temGestao }) || !certificado.codigoVerificacao) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
    return;
  }

  const svg = matrizParaSvg(gerarMatriz(certificados.urlVerificacao(certificado.codigoVerificacao)));
  context.res = { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" }, body: svg };
};
