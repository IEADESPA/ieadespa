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
  // Só a forma canônica do número vale; id malformado = a mesma resposta de certificado que não existe.
  const certificadoId = auth.idDeRota(context.bindingData.id);
  if (!certificadoId) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
    return;
  }

  try {
    const pool = await getPool();
    const certificado = await certificados.buscarCertificadoPorId(pool, certificadoId);
    const temGestao = !!certificado && certificado.membroId !== usuario.membroId && await certificados.gestorAlcancaMembro(pool, usuario, certificado.membroId);
    if (!certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: usuario.membroId, temGestao }) || !certificado.codigoVerificacao) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Certificado não encontrado." } };
      return;
    }

    const svg = matrizParaSvg(gerarMatriz(certificados.urlVerificacao(certificado.codigoVerificacao)));
    context.res = { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" }, body: svg };
  } catch (e) {
    context.log.error("[CertificadoQr] erro:", e);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Erro interno ao gerar o QR do certificado." } };
  }
};
