// VerificarCertificado (v6.9 — verificação PÚBLICA de certificado, sem login)
//
// Qualquer pessoa com o código impresso no certificado (ou lido no QR)
// confere se ele é autêntico, se está vigente, vencido ou revogado — sem
// login, porque quem confere é o pastor de outra igreja, o empregador, a
// instituição parceira. O código é um segredo portador (16 caracteres, ~80
// bits, shared/certificados.js): não há listagem, busca por nome nem
// qualquer forma de descobrir um certificado sem ter o código.
//
// Privacidade: a resposta mostra só o que já está impresso no certificado
// (título, nome, datas, protocolo) — nunca matrícula, congregação, quem
// emitiu nem o motivo de uma revogação. "Não encontrado" e "código com
// formato inválido" respondem igual (404), pra a rota não servir de oráculo
// de formato. Selo de integridade divergente NÃO mostra os dados do
// registro (não se exibe como autêntico algo que o selo contesta).
//
// GET /api/verificacao-certificado/{codigo}
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = async function (context, req) {
  const cabecalhos = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const codigo = context.bindingData.codigo;

  try {
    if (!certificados.codigoValido(codigo)) {
      context.res = { status: 404, headers: cabecalhos, body: { sucesso: false, situacao: "NAO_ENCONTRADO", mensagem: "Certificado não encontrado. Confira o código impresso no documento." } };
      return;
    }

    const pool = await getPool();
    const certificado = await certificados.buscarCertificadoPorCodigo(pool, codigo);
    const avaliacao = certificados.avaliarVerificacaoPublica({ certificado, hojeIso: hojeIso() });

    if (avaliacao.situacao === "NAO_ENCONTRADO") {
      context.res = { status: 404, headers: cabecalhos, body: { sucesso: false, situacao: "NAO_ENCONTRADO", mensagem: "Certificado não encontrado. Confira o código impresso no documento." } };
      return;
    }
    if (avaliacao.situacao === "INTEGRIDADE_FALHOU") {
      context.log.warn(`[VerificarCertificado] selo de integridade divergente (certificado ${certificado.certificadoId}).`);
      context.res = { status: 200, headers: cabecalhos, body: { sucesso: true, situacao: "INTEGRIDADE_FALHOU", mensagem: "Os dados registrados para este código não conferem com o selo de emissão. Procure a Secretaria da IEADESPA antes de confiar neste documento." } };
      return;
    }

    context.res = { status: 200, headers: cabecalhos, body: { sucesso: true, ...avaliacao } };
  } catch (e) {
    context.log.error("[VerificarCertificado] erro:", e);
    context.res = { status: 500, headers: cabecalhos, body: { sucesso: false, mensagem: "Não foi possível verificar agora. Tente novamente em instantes." } };
  }
};
