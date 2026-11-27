// FinDizimoDigital (FASE 10, Financeiro, incremento 4, 27/11/2026) — O DÍZIMO DIGITAL, o lado da tesouraria (migração 206; regra em
// shared/finDizimoDigital.js, consultas em shared/finDizimoDigitalDb.js). Tela aprovada: rodada 22, "r22-dizimo-digital", opção 1.
//  GET  financeiro/dizimo-digital?congregacaoId=          (financeiro, no escopo) os Pix da congregação: os que esperam (todos) e os outros do mês de
//                                                         agora e do anterior, com os 3 passos; o último lançamento; quantos houve no mês na Igreja
//                                                         toda. A congregação de quem tem uma só vem sozinha; a Geral escolhe no seletor
//  GET  financeiro/dizimo-digital/area                    (financeiro, no escopo) a área acompanha: os Pix do mês e os que esperam, por congregação
//  GET  financeiro/dizimo-digital/folha?congregacaoId=&folha=  (quem liga) a folha digitada vale? ("livre · bloco 1.401"), sem gravar nada
//  POST financeiro/dizimo-digital/ligar   {id, folha}     (quem liga) liga o Pix à folha do recibo de papel: a folha fica reservada para ele
//  POST financeiro/dizimo-digital/excluir {id, motivo}    (quem liga) exclui o Pix com o motivo; o membro é avisado do porquê
// Quem liga e exclui: a congregação (o nível dela) ou a Tesouraria Geral por ela; a área acompanha (o mesmo 403 para qualquer Pix). Fora do escopo e o
// que não existe têm a mesma resposta (404).
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { ehGeral, congregacaoNoEscopo } = require("../shared/escopoRotas");
const { comConflito } = require("../shared/violacaoUnica");
const db = require("../shared/finDizimoDigitalDb");
const lancamentos = require("../shared/finLancamentosDb");

const SEM_CACHE = { "Cache-Control": "no-store" };
const MSG_SO_ACOMPANHA = "Quem liga o dízimo por Pix é a congregação ou a Tesouraria Geral por ela; a área acompanha.";
const erro = (context, status, mensagem) => { context.res = { status, headers: SEM_CACHE, body: { sucesso: false, mensagem } }; };
const responder = (context, r, statusOk = 200) => {
  if (r.naoExiste) return erro(context, 404, "Registro não encontrado.");
  const { naoExiste, conflito, ...corpo } = r;
  context.res = { status: r.sucesso ? statusOk : conflito ? 409 : 422, headers: SEM_CACHE, body: corpo };
};

module.exports = comConflito(async function (context, req) {
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  // a porta vem antes de tudo: sem sessão é 401 e sem a permissão é 403, mesmo numa ação que não existe (a rota não serve de sonda)
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const geral = ehGeral(usuario);
  const podeLigar = geral || usuario.nivel === "CONGREGACAO";
  const q = req.query || {};

  // a congregação pedida, no escopo (a de quem tem uma só vem sozinha); null quando a Geral ainda não escolheu
  async function congregacaoPedida(pool, valor) {
    if (valor !== undefined && valor !== "") {
      const id = auth.idDeRota(valor);
      return id && (await congregacaoNoEscopo(pool, usuario, id)) ? id : false;
    }
    if (geral) return null;
    const minhas = await lancamentos.congregacoesDoEscopo(pool, usuario);
    return minhas.length === 1 ? minhas[0].id : null;
  }

  if (metodo === "GET" && !acao) {
    const pool = await getPool();
    const congregacaoId = await congregacaoPedida(pool, q.congregacaoId);
    if (congregacaoId === false) return erro(context, 404, "Congregação não encontrada.");
    if (!congregacaoId) { context.res = { status: 200, headers: SEM_CACHE, body: { sucesso: true, congregacao: null, podeLigar } }; return; }
    return responder(context, await db.lista(pool, { congregacaoId, podeLigar }));
  }
  if (metodo === "GET" && acao === "area") {
    context.res = { status: 200, headers: SEM_CACHE, body: await db.area(await getPool(), usuario) };
    return;
  }
  if (metodo === "GET" && acao === "folha") {
    if (!podeLigar) return erro(context, 403, MSG_SO_ACOMPANHA);
    const pool = await getPool();
    const congregacaoId = await congregacaoPedida(pool, q.congregacaoId);
    if (!congregacaoId) return erro(context, 404, "Congregação não encontrada.");
    const folha = auth.idDeRota(q.folha);
    return responder(context, await db.folhaParaLigar(pool, { congregacaoId, folha: folha || 0 }));
  }
  if (metodo === "POST" && (acao === "ligar" || acao === "excluir")) {
    if (!podeLigar) return erro(context, 403, MSG_SO_ACOMPANHA);
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const pool = await getPool();
    const por = Number(usuario.membroId);
    const r = acao === "ligar" ? await db.ligar(pool, usuario, { geral, dados: corpo, por }) : await db.excluir(pool, usuario, { geral, dados: corpo, por });
    return responder(context, r);
  }
  return erro(context, 404, "Ação inválida.");
}, "Outra gravação do mesmo Pix ou da mesma folha chegou ao mesmo tempo. Confira a lista e tente de novo.");
