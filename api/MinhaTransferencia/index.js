// MinhaTransferencia (FASE 10, v10.1b passo 3, 17/11/2026) — a PRÓPRIA pessoa pede a sua transferência de congregação e acompanha os seus pedidos
// (decisão 3 do responsável: "quem pede é a origem ou o próprio membro"). Mesma regra da secretaria (shared/transferencias.js): na mesma área entra na hora;
// entre áreas, a secretaria do destino (ou a Geral) aceita ou recusa.
//   GET  /api/minha-transferencia/{matricula}                — a congregação de hoje, os meus pedidos e as congregações para escolher
//   POST /api/minha-transferencia/{matricula}                { congregacaoDestinoId, motivo } — pedir a minha
//   POST /api/minha-transferencia/{matricula}/cancelar       { transferenciaId } — cancelar o pedido que EU fiz
// Só a matrícula da própria sessão (auth.exigirTitular, como Meus Dados). A pessoa não vê nomes de quem decidiu, só a situação e o motivo da recusa.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const regras = require("../shared/transferencias");
const tdb = require("../shared/transferenciasDb");
const { criarNotificacao } = require("../shared/notificacoes");

const responder = (context, status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
// O que a própria pessoa vê do pedido: sem os nomes de quem pediu ou decidiu (só "a secretaria" ou "você").
const paraAPessoa = (t, eu) => ({ transferenciaId: t.transferenciaId, origemNome: t.origemNome, destinoNome: t.destinoNome, regra: t.regra, situacao: t.situacao,
  pedidoPorVoce: t.pedidoComo === "PROPRIO" && Number(t.pedidoPor) === Number(eu), pedidoEm: t.pedidoEm, decididoEm: t.decididoEm, canceladoEm: t.canceladoEm,
  motivoRecusa: t.motivoRecusa, diasParado: t.diasParado, podeCancelar: t.situacao === "PENDENTE" && t.pedidoComo === "PROPRIO" && Number(t.pedidoPor) === Number(eu) });

module.exports = async function (context, req) {
  const matricula = context.bindingData && context.bindingData.matricula;
  const usuario = auth.exigirTitular(req, context, matricula);
  if (!usuario) return;
  const eu = Number(usuario.membroId);
  const pool = await getPool();
  const acao = context.bindingData && context.bindingData.acao ? String(context.bindingData.acao).toLowerCase() : null;
  const corpo = req.body || {};

  if (req.method === "GET") {
    const p = await tdb.lerPessoa(() => pool.request(), eu);
    if (!p) return responder(context, 200, { sucesso: false, mensagem: "Matrícula não encontrada." });
    const pedidos = (await tdb.daPessoa(pool, eu)).map((t) => paraAPessoa(t, eu));
    return responder(context, 200, { sucesso: true, congregacaoAtual: p.congregacaoNome, pedidos, congregacoes: await tdb.congregacoesAtivas(pool) });
  }
  if (req.method !== "POST") return responder(context, 405, { sucesso: false, mensagem: "Método não permitido." });

  if (acao === "cancelar") {
    const id = auth.idDeRota(corpo.transferenciaId);
    if (!id) return responder(context, 200, { sucesso: false, mensagem: regras.MSG.NAO_EXISTE });
    const r = await tdb.cancelar(pool, { transferenciaId: id, por: eu, somenteSeProprio: true, membroIdDono: eu });
    return responder(context, r.conflito ? 409 : r.proibido ? 403 : 200, r);
  }
  if (acao) return responder(context, 200, { sucesso: false, mensagem: regras.MSG.NAO_EXISTE });

  const destinoId = auth.idDeRota(corpo.congregacaoDestinoId);
  if (!destinoId) return responder(context, 200, { sucesso: false, mensagem: regras.MSG.DESTINO_INVALIDO });
  const r = await tdb.pedir(pool, { membroId: eu, destinoId, motivo: corpo.motivo, pedidoComo: "PROPRIO", por: eu });
  if (r.sucesso) await tdb.avisar(pool, criarNotificacao, r.situacao === "PENDENTE" ? "PEDIDO_PENDENTE" : "CONCLUIDA", r);
  const corpoResposta = r.sucesso
    ? { sucesso: true, transferenciaId: r.transferenciaId, situacao: r.situacao, regra: r.regra, destinoNome: r.destinoNome,
      mensagem: r.situacao === "CONCLUIDA" ? `Pronto: você passou para ${r.destinoNome} (mesma área: entra na hora).` : `Pedido enviado: a secretaria de ${r.destinoNome} aceita ou recusa. Você recebe o aviso.` }
    : r;
  return responder(context, r.conflito ? 409 : 200, corpoResposta);
};
