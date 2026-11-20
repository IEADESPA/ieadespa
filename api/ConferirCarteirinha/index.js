// ConferirCarteirinha (FASE 10, v10.1b passo 8, 19/11/2026) — a leitura PÚBLICA do QR da carteirinha (sem login): o que a página conferir.html mostra.
//
// Regra do responsável (rodada 10): cada pessoa tem UM QR, que nunca vence nem muda — o mesmo na física e na digital, funcionando 10 anos depois; o que muda é o que
// esta leitura mostra, calculado agora (em comunhão, congregado, em disciplina, não é mais membro). O código é um segredo portador (o mesmo gerador da credencial da
// v8.4, ~80 bits): não há listagem nem busca por nome. A resposta traz só o mínimo (shared/carteirinha.js, situacaoConferencia): nome; de quem está no rol, a foto
// (endereço assinado e curto, para conferir quem está na frente), e do membro em comunhão o cargo, a função, a congregação, a área e "membro desde". Nunca CPF,
// endereço, contato, matrícula nem o motivo de uma disciplina ou de uma saída. "Não encontrado" e "código com formato inválido" respondem igual (404).
//
// GET /api/conferencia/{codigo} — 30 leituras por minuto por origem (por instância — shared/limiteTaxa.js), como a credencial.
const { getPool } = require("../shared/db");
const db = require("../shared/carteirinhaDb");
const storage = require("../shared/storage");
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
    const r = await db.conferir(await getPool(), context.bindingData.codigo, { urlFoto: storage.urlComSas });
    if (r.situacao === "NAO_ENCONTRADA") {
      context.res = { status: 404, headers: cabecalhos, body: { sucesso: false, situacao: "NAO_ENCONTRADA", mensagem: "Carteirinha não encontrada. Confira se o QR é desta Igreja." } };
      return;
    }
    context.res = { status: 200, headers: cabecalhos, body: { sucesso: true, ...r, consultadoEm: new Date().toISOString() } };
  } catch (e) {
    context.log.error("[ConferirCarteirinha] erro:", e);
    context.res = { status: 500, headers: cabecalhos, body: { sucesso: false, mensagem: "Não foi possível conferir agora. Tente de novo." } };
  }
};
