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
// painel de OUTRO Membro (não o próprio) exige "conquistas_gestao".
//
// GET  /api/conquistas/tipos-evento                          -> lista tipos de evento cadastrados
// POST /api/conquistas/tipos-evento    body:{tipoEvento, descricao?, moduloOrigem?}   -> exige conquistas_gestao
// GET  /api/conquistas/catalogo?incluirInativas=              -> catálogo completo (com regras) — visão admin
// POST /api/conquistas/catalogo        body:{nome, icone?, descricao?, oculta?, preRequisitoConquistaId?, pontosBonus?}  -> exige conquistas_gestao
// POST /api/conquistas/catalogo/atualizar body:{conquistaId, ...}   -> exige conquistas_gestao
// POST /api/conquistas/regra           body:{conquistaId, tipoRegra, tipoEvento, config}  -> exige conquistas_gestao
// POST /api/conquistas/regra/desativar body:{regraId}                -> exige conquistas_gestao
// GET  /api/conquistas/painel?membroId=&congregacaoId=        -> painel individual (score + catálogo visível + desbloqueadas)
// GET  /api/conquistas/ranking?escopoTipo=&escopoId=          -> ranking por Turma/Congregação/Área/Região/Quadrante/Distrito/GLOBAL
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const conquistas = require("../shared/conquistas");

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
      context.res = { status: 200, body: { sucesso: true, catalogo: await conquistas.listarCatalogoComRegras(pool, { incluirInativas }) } };
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
      const membroId = Number((req.query && req.query.membroId) || usuario.membroId);
      if (membroId !== usuario.membroId && !temGestao(usuario)) {
        return erro(context, 403, "Só é possível ver o painel de conquistas de outra pessoa com a permissão de gestão.");
      }
      const congregacaoId = req.query && req.query.congregacaoId ? Number(req.query.congregacaoId) : undefined;
      const painel = await conquistas.buscarPainelMembro(pool, membroId, { congregacaoId });
      context.res = { status: 200, body: { sucesso: true, ...painel } };
      return;
    }

    if (acao === "ranking" && metodo === "GET") {
      const escopoTipo = (req.query && req.query.escopoTipo) || "GLOBAL";
      const escopoId = req.query && req.query.escopoId ? Number(req.query.escopoId) : null;
      const ranking = await conquistas.listarRanking(pool, { escopoTipo, escopoId });
      context.res = { status: 200, body: { sucesso: true, ranking } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoConquistas] erro:", e);
    erro(context, 500, "Erro interno ao processar conquistas.");
  }
};
