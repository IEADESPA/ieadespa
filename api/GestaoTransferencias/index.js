// GestaoTransferencias (FASE 10, v10.1b passo 3, 17/11/2026) — a TRANSFERÊNCIA DE CONGREGAÇÃO pela secretaria (permissão "pessoas"). Regras em
// shared/transferencias.js; gravação em shared/transferenciasDb.js.
//   GET  /api/transferencias?caixa=chegando|saindo|concluidos|paradas&pagina=1  — as caixas, no escopo (filtradas no banco)
//   GET  /api/transferencias/{id}                                                — acompanhar um pedido (os passos)
//   GET  /api/transferencias?destinos=1                                          — as congregações ativas (para escolher o destino)
//   POST /api/transferencias            { membroId, congregacaoDestinoId, motivo } — pedir (a origem ou a Geral)
//   POST /api/transferencias/{id}/aceitar | /recusar { motivo } | /cancelar
// Escopo: fora do escopo = a mesma resposta de "não existe". A área vê (acompanha) os pedidos das suas congregações, mas não pede nem decide.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { noEscopoDaPessoa } = require("../shared/escopoRotas");
const regras = require("../shared/transferencias");
const tdb = require("../shared/transferenciasDb");
const { criarNotificacao } = require("../shared/notificacoes");

const NAO_EXISTE = { sucesso: false, mensagem: regras.MSG.NAO_EXISTE };
const responder = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
// O que a tela pode fazer com o pedido (os botões): decidir, cancelar.
function comAcoes(visao, membroIdDeQuem, t) {
  return { ...t, podeDecidir: t.situacao === "PENDENTE" && t.regra === "ENTRE_AREAS" && !!regras.papelParaDecidir(visao, t.destinoNome),
    podeCancelar: regras.podeCancelar(visao, membroIdDeQuem, t) };
}

module.exports = async function (context, req) {
  const visao = auth.exigirPermissao(req, context, "pessoas");
  if (!visao) return;
  const pool = await getPool();
  const idBruto = context.bindingData && context.bindingData.id;
  const acao = context.bindingData && context.bindingData.acao ? String(context.bindingData.acao).toLowerCase() : null;
  const corpo = req.body || {};
  const eu = Number(visao.membroId);

  if (req.method === "GET") {
    if (!idBruto) {
      if (req.query && req.query.destinos) return responder(context, 200, { sucesso: true, congregacoes: await tdb.congregacoesAtivas(pool) });
      const caixa = req.query && ["chegando", "saindo", "concluidos", "paradas"].includes(req.query.caixa) ? req.query.caixa : null;
      const r = await tdb.listar(pool, visao, { caixa, pagina: req.query && req.query.pagina, porPagina: req.query && req.query.porPagina });
      if (r.soGeral) return responder(context, 403, { sucesso: false, mensagem: "A caixa dos pedidos parados é da Secretaria Geral." });
      // segunda conferência, item a item (o banco filtrou pela união dos escopos; aqui sai o que só uma Extensão alcançaria)
      const visiveis = r.itens.filter((t) => regras.visivelPara(visao, t));
      return responder(context, 200, { sucesso: true, ...r, total: r.total - (r.itens.length - visiveis.length), itens: visiveis.map((t) => comAcoes(visao, eu, t)) });
    }
    const id = auth.idDeRota(idBruto);
    if (!id) return responder(context, 200, NAO_EXISTE);
    const t = await tdb.lerTransferencia(() => pool.request(), id);
    if (!t || !regras.visivelPara(visao, t)) return responder(context, 200, NAO_EXISTE);
    return responder(context, 200, { sucesso: true, transferencia: comAcoes(visao, eu, t) });
  }

  if (req.method !== "POST") return responder(context, 405, { sucesso: false, mensagem: "Método não permitido." });

  // ---- pedir ----
  if (!idBruto) {
    // a pessoa (e a congregação dela) numa leitura só: o escopo, o papel e a origem esperada saem da MESMA leitura — se a ficha mudar até a gravação, a
    // transação vê a origem diferente e responde "mudou enquanto você olhava" (revisão do passo 3)
    const membroId = auth.idDeRota(corpo.membroId);
    const pessoa = membroId ? await tdb.lerPessoa(() => pool.request(), membroId) : null;
    if (!pessoa || !noEscopoDaPessoa(visao, pessoa.congregacaoNome, pessoa.extensaoNome)) return responder(context, 200, { sucesso: false, mensagem: "Matrícula não encontrada." });
    const destinoId = auth.idDeRota(corpo.congregacaoDestinoId);
    if (!destinoId) return responder(context, 200, { sucesso: false, mensagem: regras.MSG.DESTINO_INVALIDO });
    const papel = regras.papelParaPedir(visao, pessoa.congregacaoNome);
    if (!papel) return responder(context, 403, { sucesso: false, mensagem: regras.MSG.QUEM_PEDE });
    const r = await tdb.pedir(pool, { membroId: pessoa.membroId, destinoId, motivo: corpo.motivo, pedidoComo: papel, por: eu, origemEsperadaId: pessoa.congregacaoId });
    if (r.sucesso) await tdb.avisar(pool, criarNotificacao, r.situacao === "PENDENTE" ? "PEDIDO_PENDENTE" : "CONCLUIDA", r);
    return responder(context, r.conflito ? 409 : 200, r);
  }

  // ---- aceitar, recusar, cancelar ----
  const id = auth.idDeRota(idBruto);
  if (!id || !["aceitar", "recusar", "cancelar"].includes(acao)) return responder(context, 200, NAO_EXISTE);
  const t = await tdb.lerTransferencia(() => pool.request(), id);
  if (!t || !regras.visivelPara(visao, t)) return responder(context, 200, NAO_EXISTE);

  if (acao === "cancelar") {
    if (!regras.podeCancelar(visao, eu, t)) return responder(context, t.situacao === "PENDENTE" ? 403 : 409, { sucesso: false, mensagem: t.situacao === "PENDENTE" ? regras.MSG.QUEM_CANCELA : regras.MSG.NAO_PENDENTE });
    const r = await tdb.cancelar(pool, { transferenciaId: id, por: eu });
    return responder(context, r.conflito ? 409 : 200, r);
  }

  if (t.situacao !== "PENDENTE") return responder(context, 409, { sucesso: false, mensagem: regras.MSG.NAO_PENDENTE });
  const papel = regras.papelParaDecidir(visao, t.destinoNome);
  if (!papel) return responder(context, 403, { sucesso: false, mensagem: regras.MSG.QUEM_DECIDE });
  const r = await tdb.decidir(pool, { transferenciaId: id, aceitar: acao === "aceitar", motivoRecusa: corpo.motivo, decididoComo: papel, por: eu, destinoEsperadoId: t.destinoId });
  if (r.sucesso) await tdb.avisar(pool, criarNotificacao, r.situacao === "CONCLUIDA" ? "CONCLUIDA" : "RECUSADA", { ...r, transferenciaId: id });
  return responder(context, r.conflito ? 409 : 200, r);
};
