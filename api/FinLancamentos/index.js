// FinLancamentos (FASE 10, Financeiro, incremento 3, 26/11/2026) — LANÇAR DÍZIMOS E OFERTAS (migração 204; regra em shared/finLancamentos.js,
// consultas em shared/finLancamentosDb.js). Tela aprovada: rodada 24, "r24-lancamento", opção 1, sem "marcada em novembro".
//  GET  financeiro/lancamentos?congregacaoId=&mes=AAAA-MM   (financeiro, no escopo) a planilha do mês: as linhas, a próxima folha, os totais e a
//                                                           tira do bloco; a congregação de quem tem uma só vem sozinha
//  GET  financeiro/lancamentos/congregacoes                 (financeiro) as congregações do escopo, com a área e a situação de agora (o
//                                                           seletor "Lançando por / Trocar", r20-seletor)
//  GET  financeiro/lancamentos/area?mes=AAAA-MM             (financeiro, no escopo) a área acompanha: cada congregação, o último lançamento, o
//                                                           lançado no mês, o bloco e a folha agora, o que precisa
//  GET  financeiro/lancamentos/historico?folha=             (financeiro, no escopo) quem lançou, quem preencheu e cada correção
//  GET  financeiro/lancamentos/membros?procura=             (quem lança) a procura do dizimista: a Igreja inteira, só o nome, o número e a congregação
//  POST financeiro/lancamentos/salvar   {congregacaoId, dia, linhas:[{folha, referente, tipo, forma, valor, voluntaria, pessoa:{membroId|nome}}
//                                         | {folha, excecao:{oQueAconteceu, observacao}}]}
//                                                           (quem lança) as linhas de uma vez, tudo ou nada; a cancelada, a arrancada e a
//                                                           inexistente se marcam aqui, com o motivo (a decisão 4 corrigida de 26/11/2026)
//  POST financeiro/lancamentos/corrigir {folha, motivo, tipo, forma, valor, voluntaria, pessoa}  (quem lança) a correção com o motivo (a r27)
// Quem lança: a congregação (o nível dela) ou a Tesouraria Geral por ela; a área acompanha (as respostas de 22/11 e 26/11). Fora do escopo e o
// que não existe têm a mesma resposta; a área que tenta gravar recebe o mesmo 403 para qualquer congregação.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { ehGeral, congregacaoNoEscopo } = require("../shared/escopoRotas");
const { comConflito } = require("../shared/violacaoUnica");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const regra = require("../shared/finLancamentos");
const db = require("../shared/finLancamentosDb");

const SEM_CACHE = { "Cache-Control": "no-store" };
const MSG_SO_ACOMPANHA = "Quem lança é a congregação ou a Tesouraria Geral por ela; a área acompanha.";
const erro = (context, status, mensagem) => { context.res = { status, headers: SEM_CACHE, body: { sucesso: false, mensagem } }; };
const responder = (context, r, statusOk = 200) => {
  if (r.naoExiste) return erro(context, 404, "Registro não encontrado.");
  const { naoExiste, conflito, ...corpo } = r;
  context.res = { status: r.sucesso ? statusOk : conflito ? 409 : 422, headers: SEM_CACHE, body: corpo };
};
// a congregação lança (o nível dela); a Geral lança por qualquer uma; a área (e os níveis acima dela, fora da Geral) só acompanha
const lanca = (usuario, geral) => geral || usuario.nivel === "CONGREGACAO";

module.exports = comConflito(async function (context, req) {
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  // a porta vem antes de tudo: sem sessão é 401 e sem a permissão é 403, mesmo numa ação que não existe (a rota não serve de sonda)
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const geral = ehGeral(usuario);
  const podeLancar = lanca(usuario, geral);
  const q = req.query || {};

  if (metodo === "GET" && (!acao || acao === "area")) {
    const mes = regra.mesDaTela(q.mes, hojeBrasilia());
    if (!mes) return erro(context, 422, "Confira o mês.");
    const pool = await getPool();
    if (acao === "area") return responder(context, await db.area(pool, usuario, { mes }));
    let congregacaoId = null;
    if (q.congregacaoId !== undefined && q.congregacaoId !== "") {
      congregacaoId = auth.idDeRota(q.congregacaoId);
      if (!congregacaoId || !(await congregacaoNoEscopo(pool, usuario, congregacaoId))) return erro(context, 404, "Congregação não encontrada.");
    } else if (!geral) {
      const minhas = await db.congregacoesDoEscopo(pool, usuario);
      if (minhas.length === 1) congregacaoId = minhas[0].id;
    }
    // a Geral (e quem alcança mais de uma) escolhe a congregação no seletor "Lançando por"
    if (!congregacaoId) { context.res = { status: 200, headers: SEM_CACHE, body: { sucesso: true, congregacao: null, mes, podeLancar } }; return; }
    return responder(context, await db.planilha(pool, { congregacaoId, mes, podeLancar }));
  }
  if (metodo === "GET" && acao === "congregacoes") {
    const pool = await getPool();
    context.res = { status: 200, headers: SEM_CACHE, body: { sucesso: true, congregacoes: await db.seletor(pool, usuario) } };
    return;
  }
  if (metodo === "GET" && acao === "historico") {
    const folha = auth.idDeRota(q.folha);
    if (!folha) return erro(context, 404, "Registro não encontrado.");
    return responder(context, await db.historico(await getPool(), usuario, { geral, folha }));
  }
  if (metodo === "GET" && acao === "membros") {
    if (!podeLancar) return erro(context, 403, MSG_SO_ACOMPANHA);
    context.res = { status: 200, headers: SEM_CACHE, body: await db.procurarMembros(await getPool(), { procura: q.procura }) };
    return;
  }
  if (metodo === "POST" && (acao === "salvar" || acao === "corrigir")) {
    if (!podeLancar) return erro(context, 403, MSG_SO_ACOMPANHA);
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const pool = await getPool();
    const por = Number(usuario.membroId);
    if (acao === "corrigir") return responder(context, await db.corrigir(pool, usuario, { geral, dados: corpo, por }));
    const congregacaoId = auth.idDeRota(corpo.congregacaoId);
    if (!congregacaoId || !(await congregacaoNoEscopo(pool, usuario, congregacaoId))) return erro(context, 404, "Congregação não encontrada.");
    return responder(context, await db.salvar(pool, usuario, { congregacaoId, dados: corpo, por, pelaGeral: geral }));
  }
  return erro(context, 404, "Ação inválida.");
}, "Outra gravação da mesma folha chegou ao mesmo tempo. Confira a planilha e tente de novo.");
