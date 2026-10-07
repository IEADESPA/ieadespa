// SegundoFator (vD.4, 07/10/2026) — segunda etapa do login da liderança. Anônima de propósito: ainda não há sessão, há o
// BILHETE que a senha certa abriu (5 min, assinado — ver shared/segundoFator.js). Nada aqui concede permissão pelo bilhete:
// a linha de Lideranca é relida do banco na conclusão (shared/sessaoLideranca.js).
//
// POST /api/auth/segundo-fator/chave/opcoes   body:{bilhete}            -> { opcoes }        (desafio novo para a chave de acesso)
// POST /api/auth/segundo-fator/chave          body:{bilhete, resposta}  -> sessão            (resposta do aparelho)
// POST /api/auth/segundo-fator/codigo/enviar  body:{bilhete}            -> { sucesso }       (código por e-mail — reserva)
// POST /api/auth/segundo-fator/codigo         body:{bilhete, codigo}    -> sessão
const { getPool } = require("../shared/db");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const pinMembro = require("../shared/pinMembro");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const sessaoLideranca = require("../shared/sessaoLideranca");
const segundoFator = require("../shared/segundoFator");

const limitador = criarLimitador({ janelaMs: 60000, maximo: 30 });
const LIMITE_FALHAS_FATOR = 10; // erros somados na segunda etapa (chave recusada + código errado) antes do bloqueio escalonado da pessoa
const MENSAGEM_BILHETE = "A confirmação venceu. Entre de novo com matrícula e senha.";

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  const acao = String(context.bindingData.acao || "");
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const bilhete = segundoFator.lerBilhete(corpo.bilhete);
  if (!bilhete) { context.res = { status: 401, body: { sucesso: false, mensagem: MENSAGEM_BILHETE } }; return; }

  const pool = await getPool();
  const lideranca = await sessaoLideranca.reler(pool, bilhete);
  if (!lideranca || sessaoLideranca.suspensa(lideranca, hojeBrasilia())) { context.res = { status: 401, body: { sucesso: false, mensagem: MENSAGEM_BILHETE } }; return; }
  const membroId = lideranca.membroId;

  if (acao === "chave/opcoes") {
    const o = await segundoFator.opcoesDeUso(pool, req, membroId, "LOGIN");
    context.res = o.erro ? { status: 400, body: { sucesso: false, mensagem: o.erro } } : { status: 200, body: { sucesso: true, opcoes: o.opcoes } };
    return;
  }

  if (acao === "codigo/enviar") {
    const situacao = await segundoFator.situacaoDaPessoa(pool, membroId);
    if (!situacao.email) { context.res = { status: 400, body: { sucesso: false, mensagem: "Sua matrícula não tem e-mail cadastrado. Peça à Secretaria Geral." } }; return; }
    const e = await segundoFator.enviarCodigo(pool, { membroId, email: situacao.email, nome: lideranca.nome, motivo: "entrar no sistema" });
    context.res = e.erro ? { status: 200, body: { sucesso: false, mensagem: e.erro } } : { status: 200, body: { sucesso: true, mensagem: `Código enviado para ${situacao.emailMascarado}.` } };
    return;
  }

  if (acao === "chave" || acao === "codigo") {
    // tentativa reservada antes de conferir (como a senha): muitos erros bloqueiam a pessoa por um tempo
    const reserva = await pinMembro.reservarTentativa(pool, membroId, "FATOR", LIMITE_FALHAS_FATOR);
    if (reserva.bloqueado) { context.res = { status: 200, body: { sucesso: false, mensagem: "Muitas tentativas. Aguarde alguns minutos e entre de novo." } }; return; }
    const r = acao === "chave"
      ? await segundoFator.conferirUso(pool, req, membroId, "LOGIN", corpo.resposta)
      : await segundoFator.conferirCodigo(pool, membroId, corpo.codigo);
    if (r.erro) { context.res = { status: 200, body: { sucesso: false, mensagem: r.erro } }; return; }
    await pinMembro.limparTentativas(pool, membroId, "FATOR");
    const body = await sessaoLideranca.concluirLogin(pool, req, lideranca, { fator: { via: acao === "chave" ? "CHAVE" : "CODIGO", em: Date.now() } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body };
    return;
  }

  context.res = { status: 404, body: { sucesso: false, mensagem: "Ação inválida." } };
};
