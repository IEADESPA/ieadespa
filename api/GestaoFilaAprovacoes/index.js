// GestaoFilaAprovacoes (v1.11 — staff, permissão "pessoas") — a CAIXA DE SUGESTÕES do membro.
// O pedido de mudança que o membro manda (SolicitarEdicaoPessoa) é decidido campo a campo: APLICAR (vale na ficha) ou RECUSAR COM MOTIVO (a pessoa lê o motivo).
// FASE 10, v10.1b passo 5 (18/11/2026, rodada 10 da gestão de membros): a secretaria LOCAL aplica as da sua congregação; a área e a Geral acompanham; a Geral
// aplica tudo. As travas da ficha valem aqui também (shared/edicaoFicha.js: o CPF preenchido só a Geral, o nome só a Geral, nascimento/admissão/estado civil
// com processo de cargo só a Geral, a readmissão só a Geral). Cada campo é decidido numa transação (shared/edicaoFichaDb.js) e nunca é aplicado por cima de uma
// mudança feita depois do pedido (409). O CPF na caixa sai mascarado para quem não é a Geral.
// GET  /api/fila-aprovacoes                         -> ?situacao=PENDENTE (padrão) | DECIDIDAS — os pedidos no escopo (lista com os campos aninhados)
// POST /api/fila-aprovacoes/{solicitacaoId}/decidir -> body: { decisoes: [{ campoId, decisao: 'APROVADO'|'REJEITADO', motivo? }] } (motivo obrigatório ao recusar)
//
// ESCOPO: o pedido é sobre a ficha de uma PESSOA — só entra na caixa (e só se decide) o pedido de quem está na congregação que o decisor alcança
// (shared/escopoRotas.js, filtrado no banco); fora do escopo vale a resposta de "não existe". Ninguém decide o PRÓPRIO pedido: o pedido do próprio usuário nem aparece.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const edicaoFichaDb = require("../shared/edicaoFichaDb");

const MAX_DECISOES = 50;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const solicitacaoIdBruto = context.bindingData.solicitacaoId;
  const solicitacaoId = auth.idDeRota(solicitacaoIdBruto);
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- GET: a caixa (só do escopo, e não as do próprio usuário) ----
  if (req.method === "GET" && !solicitacaoIdBruto) {
    const situacao = req.query && String(req.query.situacao || "").toUpperCase() === "DECIDIDAS" ? "DECIDIDAS" : "PENDENTE";
    const lista = await edicaoFichaDb.listarSugestoes(pool, usuario, { situacao });
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: lista };
    return;
  }

  // ---- POST /{solicitacaoId}/decidir: aplica/recusa campo a campo ----
  if (req.method === "POST" && solicitacaoIdBruto && acao === "decidir") {
    const decisoes = (req.body || {}).decisoes;
    if (!Array.isArray(decisoes) || decisoes.length === 0 || decisoes.length > MAX_DECISOES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Envie de 1 a ${MAX_DECISOES} decisões { campoId, decisao, motivo }.` } };
      return;
    }
    const solicitacao = solicitacaoId
      ? await pool.request().input("id", sql.Int, solicitacaoId).query(`SELECT SolicitacaoId, MembroId FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @id`)
      : { recordset: [] };
    // Pedido inexistente e pedido de pessoa fora do escopo têm a MESMA resposta.
    const dono = solicitacao.recordset.length ? await pessoaAlcancavel(pool, usuario, solicitacao.recordset[0].MembroId) : null;
    if (!dono) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitação não encontrada." } };
      return;
    }
    if (Number(dono.membroId) === Number(usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Você não pode decidir o seu próprio pedido — peça a outra pessoa da Secretaria." } };
      return;
    }

    let aplicados = 0, recusados = 0;
    const erros = [];
    const hoje = hojeBrasilia();
    for (const item of decisoes) {
      const campoId = item ? auth.idDeRota(item.campoId) : null;
      if (!campoId) { erros.push({ campoId: item ? item.campoId : null, status: 400, mensagem: "Campo inválido." }); continue; }
      const r = await edicaoFichaDb.decidirCampo(pool, { visao: usuario, solicitacaoId, campoId, decisao: item.decisao, motivo: item.motivo, hoje });
      if (r.sucesso) { if (r.aplicado) aplicados++; else recusados++; } else erros.push({ campoId, status: r.status || 200, mensagem: r.mensagem });
    }
    const feitos = aplicados + recusados;
    const mensagem = erros.length === 0 ? `✅ ${aplicados} campo(s) aplicado(s), ${recusados} recusado(s).`
      : decisoes.length === 1 ? erros[0].mensagem
        : `${feitos ? `${aplicados} aplicado(s), ${recusados} recusado(s); ` : ""}${erros.length} não decidido(s): ${erros.map((e) => e.mensagem).join(" · ")}`;
    // com UMA decisão, a resposta leva o status dela (403 da área, 409 de quem chegou depois); com várias, 200 e a lista do que não foi decidido
    const status = erros.length && decisoes.length === 1 ? erros[0].status : 200;
    context.res = { status, headers: { "Content-Type": "application/json" }, body: { sucesso: erros.length === 0, mensagem, aplicados, recusados, ...(erros.length ? { erros } : {}) } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
