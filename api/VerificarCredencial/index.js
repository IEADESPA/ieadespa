// VerificarCredencial (v8.4 — leitura PÚBLICA do QR da credencial, sem login; Regimento Art. 76 §1º)
//
// Quem lê o QR (o porteiro de outra igreja, a Mesa de uma cerimônia) vê a situação de AGORA — a credencial não tem validade impressa. O código é um segredo portador
// (16 caracteres, ~80 bits): não há listagem, busca por nome nem outra forma de achar uma credencial sem ter o código. A resposta traz só o mínimo (shared/credencial.js,
// situacaoPublica): nome, membro ou obreiro (com o cargo), congregação, ativa/inativa e, do obreiro, habilitado/inativo. Nunca o motivo, a matrícula, a foto nem contato.
// "Não encontrada" e "código com formato inválido" respondem igual (404).
//
// GET /api/verificacao-credencial/{codigo} — 30 leituras por minuto por origem (por instância — shared/limiteTaxa.js).
const { getPool } = require("../shared/db");
const credencialDb = require("../shared/credencialDb");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 30 });

module.exports = async function (context, req) {
  const cabecalhos = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { ...cabecalhos, "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas leituras seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  try {
    const r = await credencialDb.verificarPublica(await getPool(), context.bindingData.codigo);
    if (r.situacao === "NAO_ENCONTRADA") {
      context.res = { status: 404, headers: cabecalhos, body: { sucesso: false, situacao: "NAO_ENCONTRADA", mensagem: "Credencial não encontrada. Confira o código impresso no documento." } };
      return;
    }
    context.res = { status: 200, headers: cabecalhos, body: { sucesso: true, ...r, consultadoEm: new Date().toISOString() } };
  } catch (e) {
    context.log.error("[VerificarCredencial] erro:", e);
    context.res = { status: 500, headers: cabecalhos, body: { sucesso: false, mensagem: "Não foi possível consultar agora. Tente de novo." } };
  }
};
