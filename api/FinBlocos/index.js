// FinBlocos (FASE 10, Financeiro, incremento 1a, 21/11/2026) — os BLOCOS DE RECIBO (migração 200; regra em shared/finBlocos.js, consultas em
// shared/finBlocosDb.js). Tela aprovada: rodada 17, "Blocos de recibo: os blocos", opção 1.
//  GET  financeiro/blocos?situacao=&procura=&pagina=&congregacaoId=    (financeiro, no escopo) a lista em páginas de 40 e o quadro da direita
//  POST financeiro/blocos/lote     {serie, primeiraFolha, totalFolhas, folhasPorBloco?}           (Tesouraria Geral) o lote da gráfica
//  POST financeiro/blocos/chegada  {loteId, ateFolha, data?}                                       (Tesouraria Geral) a chegada da gráfica
//  POST financeiro/blocos/entregar {primeiraFolha, congregacaoId, pessoa:{membroId|nome}, levadoPelaArea?, data?} (Tesouraria Geral) a saída do livro
// Incremento 2 (22/11/2026; telas r17-blocos-folhas e r17-blocos-livro, opção 1):
//  GET  financeiro/blocos/folhas?bloco=                 (financeiro, no escopo) as folhas de um bloco (vazio = o em uso mais recente) e o seletor
//  POST financeiro/blocos/folha    {folha, oQueAconteceu, observacao}  (financeiro, no escopo) a exceção: cancelada, arrancada, extraviada ou inexistente
//  GET  financeiro/blocos/livro?pagina=&porPagina=5|3   (financeiro, no escopo) o livro de entrada e saída e, fora da Geral, os blocos agora
//  GET  financeiro/blocos/historico?folha=              (financeiro, no escopo) o histórico da folha: quem marcou, quem desfez, quando e por quê (r30)
//  GET  financeiro/blocos/rastreio?folha=               (Tesouraria Geral) o rastreio do bloco pela primeira folha, no "Registrar entrada"
//  POST financeiro/blocos/devolver {primeiraFolha, pessoa:{membroId|nome}, parcial?, primeiraEmBranco?, data?} (Tesouraria Geral) a entrada do livro
// Regra dele de 24/11/2026, com o detalhe da r30: a devolução completa (o bloco fecha) ou parcial, com a primeira folha em branco (dela ao fim, as
// folhas voltam livres e o bloco fica na Geral, para sair de novo só com elas). Revisão de 23/11/2026 (regra dele): a exceção da folha se
// desfaz com o motivo:
//  POST financeiro/blocos/desfazer-folha {folha, motivo}   (Tesouraria Geral) a folha volta a ficar livre; o histórico em FinFolhasDesfeitas
// A congregação e a área veem só os blocos das congregações do seu escopo; o que está na Geral só a Geral vê. Congregação fora do escopo e
// congregação que não existe têm a mesma resposta.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { ehGeral, exigirGeral, congregacaoNoEscopo } = require("../shared/escopoRotas");
const { comConflito } = require("../shared/violacaoUnica");
const regra = require("../shared/finBlocos");
const db = require("../shared/finBlocosDb");

const SEM_CACHE = { "Cache-Control": "no-store" };
const erro = (context, status, mensagem) => { context.res = { status, headers: SEM_CACHE, body: { sucesso: false, mensagem } }; };
const responder = (context, r, statusOk = 200) => {
  if (r.naoExiste) return erro(context, 404, "Registro não encontrado.");
  const { naoExiste, conflito, ...corpo } = r;
  context.res = { status: r.sucesso ? statusOk : conflito ? 409 : 422, headers: SEM_CACHE, body: corpo };
};

module.exports = comConflito(async function (context, req) {
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();

  if (metodo === "GET" && !acao) {
    const usuario = auth.exigirPermissao(req, context, "financeiro");
    if (!usuario) return;
    const q = req.query || {};
    const pool = await getPool();
    let congregacaoId = null;
    if (q.congregacaoId !== undefined && q.congregacaoId !== "") {
      congregacaoId = auth.idDeRota(q.congregacaoId);
      if (!congregacaoId || !(await congregacaoNoEscopo(pool, usuario, congregacaoId))) return erro(context, 404, "Congregação não encontrada.");
    }
    const lista = await db.listar(pool, usuario, {
      geral: ehGeral(usuario), congregacaoId,
      filtro: regra.filtroDaLista(q.situacao), procura: regra.procuraDaLista(q.procura), pagina: regra.paginaDaLista(q.pagina)
    });
    context.res = { status: 200, headers: SEM_CACHE, body: { sucesso: true, ...lista } };
    return;
  }

  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  // as folhas, a exceção da folha, o histórico dela e o livro: quem tem a permissão financeiro, nas congregações do seu escopo
  if ((metodo === "GET" && (acao === "folhas" || acao === "livro" || acao === "historico")) || (metodo === "POST" && acao === "folha")) {
    const usuario = auth.exigirPermissao(req, context, "financeiro");
    if (!usuario) return;
    const q = req.query || {};
    const pool = await getPool();
    const geral = ehGeral(usuario);
    if (acao === "folha") return responder(context, await db.registrarFolha(pool, usuario, { geral, dados: corpo, por: Number(usuario.membroId) }));
    // o número que não é folha tem a resposta da folha que não existe, sem tocar no banco
    if (acao === "historico") {
      const folha = auth.idDeRota(q.folha);
      if (!folha) return erro(context, 404, "Registro não encontrado.");
      return responder(context, await db.historicoDaFolha(pool, usuario, { geral, folha }));
    }
    if (acao === "livro") {
      return responder(context, await db.livroDosBlocos(pool, usuario, { geral, pagina: regra.paginaDaLista(q.pagina), porPagina: regra.porPaginaDoLivro(q.porPagina) }));
    }
    let blocoId = null;
    if (q.bloco !== undefined && q.bloco !== "") {
      blocoId = auth.idDeRota(q.bloco);
      if (!blocoId) return erro(context, 404, "Registro não encontrado.");
    }
    return responder(context, await db.folhasDoBloco(pool, usuario, { geral, blocoId }));
  }

  // a porta vem antes de tudo: sem sessão é 401 e fora da Tesouraria Geral é 403, mesmo numa ação que não existe (a rota não serve de sonda)
  const geral = exigirGeral(req, context, "financeiro");
  if (!geral) return;
  const pool = await getPool();
  if (metodo === "GET" && acao === "rastreio") return responder(context, await db.rastreio(pool, { folha: (req.query || {}).folha }));
  if (metodo !== "POST" || !["lote", "chegada", "entregar", "devolver", "desfazer-folha"].includes(acao)) return erro(context, 404, "Ação inválida.");
  const por = Number(geral.membroId);
  if (acao === "desfazer-folha") return responder(context, await db.desfazerFolha(pool, { dados: corpo, por }));
  if (acao === "devolver") return responder(context, await db.devolver(pool, { primeiraFolha: corpo.primeiraFolha, pessoa: corpo.pessoa, parcial: corpo.parcial, primeiraEmBranco: corpo.primeiraEmBranco, data: corpo.data, por }));
  if (acao === "lote") return responder(context, await db.cadastrarLote(pool, { dados: corpo, por }), 201);
  if (acao === "chegada") {
    const loteId = auth.idDeRota(corpo.loteId);
    if (!loteId) return erro(context, 404, "Registro não encontrado.");
    return responder(context, await db.registrarChegada(pool, { loteId, ateFolha: corpo.ateFolha, data: corpo.data, por }));
  }
  return responder(context, await db.entregar(pool, {
    primeiraFolha: corpo.primeiraFolha, congregacaoId: corpo.congregacaoId, pessoa: corpo.pessoa, levadoPelaArea: corpo.levadoPelaArea, data: corpo.data, por
  }));
}, "Outro registro igual chegou ao mesmo tempo. Confira a lista e tente de novo.");
