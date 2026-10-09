// ProtecaoAjuda (v7.8) — o canal de ajuda da criança e do adolescente (e de quem quer contar algo em nome deles).
// POST /api/protecao-ajuda — SEM login (a criança pode não ter conta): body { texto, quemSou?, contato?, congregacaoId? }.
//
// A Lei 13.431/2017 manda a Igreja ACOLHER e ENCAMINHAR, não interrogar: por isso só o texto é obrigatório, não há pergunta nenhuma e nada é verificado. O que chega vira uma
// SUSPEITA DE VIOLÊNCIA (o relógio de 24 horas para comunicar o Conselho Tutelar começa na hora) e a liderança de proteção é avisada. O sistema NÃO guarda quem escreveu:
// nem o IP (a origem só entra, em hash truncado, no limite por minuto em memória), nem cabeçalhos. O contato é só o que a pessoa quiser deixar.
//
// A resposta SEMPRE traz o que fazer agora (Disque 100, 190), mesmo quando o pedido não pôde ser registrado (limite, erro): quem pede ajuda nunca fica sem caminho.
const { getPool } = require("../shared/db");
const db = require("../shared/protecaoDb");
const pm = require("../shared/protecaoMenores");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

const limitador = criarLimitador({ janelaMs: 3600000, maximo: 5 });          // 5 pedidos por hora por origem (e a Igreja aceita, no total, 40 por hora: shared/protecaoDb.js)
const ORIENTACAO = "Se existe perigo agora, ligue 190. Para contar que uma criança ou adolescente está sofrendo violência, ligue 100 (de graça, a qualquer hora).";

module.exports = async function (context, req) {
  const cabecalhos = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { ...cabecalhos, "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: `Você já enviou mensagens demais por agora. ${ORIENTACAO}`, contatosDeAjuda: pm.CONTATOS_DE_AJUDA } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  try {
    const pool = await getPool();
    const r = await db.registrarPedidoDeAjuda(pool, { dados: corpo });
    if (r.sucesso) { context.res = { status: 201, headers: cabecalhos, body: { sucesso: true, protocolo: r.protocolo, mensagem: r.mensagem, contatosDeAjuda: pm.CONTATOS_DE_AJUDA } }; return; }
    context.res = { status: r.limite ? 429 : 422, headers: cabecalhos, body: { sucesso: false, mensagem: r.mensagem, contatosDeAjuda: pm.CONTATOS_DE_AJUDA } };
  } catch (e) {
    context.log.error("[ProtecaoAjuda] erro:", e && e.message);       // nunca registra o corpo: é o relato de uma criança
    context.res = { status: 500, headers: cabecalhos, body: { sucesso: false, mensagem: `Não conseguimos registrar agora. ${ORIENTACAO}`, contatosDeAjuda: pm.CONTATOS_DE_AJUDA } };
  }
};
