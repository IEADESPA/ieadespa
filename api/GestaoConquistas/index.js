// GestaoConquistas (v6.4 — Motor de conquistas e gamificação)
//
// Ver shared/conquistas.js pra toda a lógica de decisão (pura, testada em
// isolamento) — este arquivo só expõe HTTP + permissão em cima do motor.
//
// Permissão — mesmo espírito do resto da FASE 6: administrar o CATÁLOGO
// (criar/editar conquista, criar/desativar regra, registrar tipo de
// evento) exige a permissão própria "conquistas_gestao" (nunca concedida
// por padrão — mesmo padrão de "ebd_gestao"/v6.1, "habilitacao_voluntarios"/
// v5.7, "assistencia_social"/v5.9: quem administra a mecânica de
// gamificação não é automaticamente todo mundo que usa o sistema). MAS
// consultar o próprio painel/pontuação e o ranking do escopo continua
// aberto a qualquer usuário logado — "admin gerencia, todo mundo vê o seu"
// (mesmo espírito de v5.6 Minhas Escalas / vB.5 self-service). Ver o
// painel de OUTRO Membro (não o próprio) exige "conquistas_gestao" e a pessoa dentro do escopo territorial.
//
// GET  /api/conquistas/tipos-evento                          -> lista tipos de evento cadastrados
// POST /api/conquistas/tipos-evento    body:{tipoEvento, descricao?, moduloOrigem?}   -> exige conquistas_gestao
// GET  /api/conquistas/catalogo?incluirInativas=              -> catálogo completo (com regras) — visão admin
// POST /api/conquistas/catalogo        body:{nome, icone?, descricao?, oculta?, preRequisitoConquistaId?, pontosBonus?}  -> exige conquistas_gestao
// POST /api/conquistas/catalogo/atualizar body:{conquistaId, ...}   -> exige conquistas_gestao
// POST /api/conquistas/regra           body:{conquistaId, tipoRegra, tipoEvento, config}  -> exige conquistas_gestao
// POST /api/conquistas/regra/desativar body:{regraId}                -> exige conquistas_gestao
// GET  /api/conquistas/painel?membroId=&congregacaoId=        -> painel individual (score + catálogo visível + desbloqueadas); o de outra pessoa: conquistas_gestao + pessoa no escopo
// GET  /api/conquistas/ranking?escopoTipo=&escopoId=          -> SEM conquistas_gestao: o pedido é ignorado; vale a turma de EBD (ou a congregação) do próprio membro, com nome abreviado,
//                                                                os 20 primeiros e a posição dele (sem matrícula). COM conquistas_gestao: Turma/Congregação/Área/Região/Quadrante/Distrito/GLOBAL,
//                                                                sempre cruzado com o escopo de quem pede (de fora = lista vazia, igual a um escopo que não existe)
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const conquistas = require("../shared/conquistas");
const escopoRotas = require("../shared/escopoRotas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("conquistas_gestao"));
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Administração do catálogo/regras/tipos de evento ----
    if (acao === "tipos-evento" && metodo === "GET") {
      context.res = { status: 200, body: { sucesso: true, tipos: await conquistas.listarTiposEvento(pool) } };
      return;
    }

    if (acao === "tipos-evento" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { tipoEvento, descricao, moduloOrigem } = req.body || {};
      const resultado = await conquistas.registrarTipoEvento(pool, { tipoEvento, descricao, moduloOrigem });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "catalogo" && metodo === "GET") {
      const incluirInativas = temGestao(usuario) && String(req.query && req.query.incluirInativas) === "true";
      const catalogo = await conquistas.listarCatalogoComRegras(pool, { incluirInativas });
      // Trava 6-A: rota aberta a qualquer login — sem este filtro, a conquista
      // `oculta` (e a regra de como desbloqueá-la) vazava pra todo mundo. A
      // oculta já desbloqueada continua aparecendo no painel pessoal.
      const visivel = temGestao(usuario) ? catalogo : catalogo.filter(c => !c.oculta);
      context.res = { status: 200, body: { sucesso: true, catalogo: visivel } };
      return;
    }

    if (acao === "catalogo" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus } = req.body || {};
      const resultado = await conquistas.criarConquista(pool, { nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus, criadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "catalogo/atualizar" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { conquistaId, nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus, ativa } = req.body || {};
      if (!conquistaId || !nome) return erro(context, 400, "Informe conquistaId e nome.");
      const resultado = await conquistas.atualizarConquista(pool, { conquistaId, nome, icone, descricao, oculta, preRequisitoConquistaId, pontosBonus, ativa, atualizadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "regra" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { conquistaId, tipoRegra, tipoEvento, config } = req.body || {};
      if (!conquistaId) return erro(context, 400, "Informe conquistaId.");
      const resultado = await conquistas.criarRegra(pool, { conquistaId, tipoRegra, tipoEvento, config, criadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "regra/desativar" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { regraId } = req.body || {};
      if (!regraId) return erro(context, 400, "Informe regraId.");
      const resultado = await conquistas.desativarRegra(pool, { regraId, atualizadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Consulta — aberta a qualquer usuário logado (visão do próprio, ranking do escopo) ----
    if (acao === "painel" && metodo === "GET") {
      const q = req.query || {};
      const proprio = Number(usuario.membroId);
      // Sem ?membroId= é o painel do próprio. O de OUTRA pessoa exige a permissão de gestão E a pessoa dentro do escopo; fora do escopo, inexistente e id malformado
      // dão a mesma recusa (a rota não serve de sonda de matrícula).
      const pedido = q.membroId === undefined || q.membroId === "" ? proprio : auth.idDeRota(q.membroId);
      if (pedido !== proprio) {
        if (!temGestao(usuario)) return erro(context, 403, "Só é possível ver o painel de conquistas de outra pessoa com a permissão de gestão.");
        if (!pedido || !(await escopoRotas.pessoaAlcancavel(pool, usuario, pedido))) return erro(context, 403, escopoRotas.FORA_DO_ESCOPO.mensagem);
      }
      const congregacaoId = auth.idDeRota(q.congregacaoId) || undefined;   // só escolhe a tabela de pesos; id inválido é ignorado
      const painel = await conquistas.buscarPainelMembro(pool, pedido, { congregacaoId });
      context.res = { status: 200, body: { sucesso: true, ...painel } };
      return;
    }

    if (acao === "ranking" && metodo === "GET") {
      const q = req.query || {};
      if (!temGestao(usuario)) {
        // Membro comum: o pedido (escopoTipo/escopoId) é IGNORADO. Vale só a turma de EBD dele (ou, se não é aluno, a congregação dele), lida do banco; nome abreviado,
        // sem matrícula, os 20 primeiros e a posição da própria pessoa.
        const proprio = await conquistas.rankingDoProprioMembro(pool, usuario.membroId);
        context.res = { status: 200, body: { sucesso: true, escopo: proprio.escopo, ...conquistas.recortarRankingParaMembro(proprio.linhas, usuario.membroId) } };
        return;
      }
      // Gestão: o escopo pedido é cruzado com o escopo de quem pede (turma/congregação de fora, pedido malformado e escopo desconhecido dão a mesma lista vazia).
      const escopoTipo = typeof q.escopoTipo === "string" && q.escopoTipo ? q.escopoTipo.toUpperCase() : "GLOBAL";
      const todas = usuario.escopoCongregacoes === "TODAS";
      const ranking = await conquistas.listarRanking(pool, {
        escopoTipo, escopoId: q.escopoId,
        nomesPermitidos: todas ? null : (Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : []),
        extensaoNome: usuario.escopoExtensaoNome || null
      });
      context.res = { status: 200, body: { sucesso: true, ranking } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoConquistas] erro:", e);
    erro(context, 500, "Erro interno ao processar conquistas.");
  }
};
