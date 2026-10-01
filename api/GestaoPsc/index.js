// GestaoPsc (v7.1 — PSC: Programa de Saúde Congregacional, Regimento Art. 127-129)
//
// Avaliação anual obrigatória de cada congregação pela "Escada Bloqueada", em 5
// Sinais Vitais. Toda a lógica de decisão está em shared/psc.js (pura, testada
// em isolamento); a apuração assistida (sugestões a partir de dados que o
// sistema já tem) está em shared/pscApuracao.js. Este arquivo só expõe HTTP +
// permissão + escopo em cima delas.
//
// Duas permissões, nunca concedidas automaticamente a nenhum papel (migração 113):
//  - "psc_gestao": abrir a avaliação, responder, ENVIAR e VALIDAR as congregações
//    do próprio escopo (um local preenche; outra pessoa — o Pastor de Área, por
//    exemplo — valida). Quem enviou não valida.
//  - "psc_homologacao": HOMOLOGAR (a CLI diploma o exercício), decidir a
//    reclassificação compulsória, reabrir uma homologada, mexer no catálogo de
//    critérios e nos parâmetros. Vale para a igreja inteira, então exige escopo
//    GLOBAL. Quem enviou ou validou não homologa.
// Ler (painel, avaliações, catálogo) exige uma das duas, dentro do escopo.
//
// GET  /api/psc/catalogo[?todos=1]                -> Sinais Vitais e critérios por degrau ("todos" = com inativos, só homologação)
// GET  /api/psc/parametros                        -> primeiro exercício, prazo de envio, exercícios para reclassificar
// GET  /api/psc/painel?ano=                       -> visão geral das congregações do escopo no exercício
// GET  /api/psc/avaliacoes?ano=&congregacaoId=&status=
// GET  /api/psc/avaliacao?avaliacaoId=            -> uma avaliação com a escada completa
// GET  /api/psc/historico?congregacaoId=          -> exercícios e reclassificações de uma congregação
// GET  /api/psc/reclassificacoes[?status=]
// POST /api/psc/parametros                        body:{primeiroExercicio, prazoEnvioDias, exerciciosParaReclassificacao}  — homologação (global)
// POST /api/psc/catalogo/criterio                 body:{sinalId, nivel, texto, orientacao?}                                — homologação (global)
// POST /api/psc/catalogo/criterio/atualizar       body:{criterioId, texto?, orientacao?, ativo?}                           — homologação (global)
// POST /api/psc/avaliacoes/abrir                  body:{congregacaoId, ano}
// POST /api/psc/avaliacoes/sugestoes              body:{avaliacaoId}   -> recalcula as sugestões do sistema (só rascunho)
// POST /api/psc/avaliacoes/responder              body:{avaliacaoId, respostas:[{respostaId, situacao, observacao?, evidenciaUrl?}]}
// POST /api/psc/avaliacoes/enviar                 body:{avaliacaoId}
// POST /api/psc/avaliacoes/validar                body:{avaliacaoId, parecer?}
// POST /api/psc/avaliacoes/devolver               body:{avaliacaoId, motivo}   (enviada: gestão no escopo; validada: homologação)
// POST /api/psc/avaliacoes/homologar              body:{avaliacaoId, resolucao}                                            — homologação (global)
// POST /api/psc/avaliacoes/reabrir                body:{avaliacaoId, motivo}                                               — homologação (global)
// POST /api/psc/reclassificacoes/decretar         body:{reclassificacaoId, resolucao, encarregadoMembroId, congregacaoMaeId?} — homologação (global)
// POST /api/psc/reclassificacoes/arquivar         body:{reclassificacaoId, motivo, resolucao?}                             — homologação (global)
// POST /api/psc/reclassificacoes/restabelecer     body:{reclassificacaoId, resolucao, motivo}                              — homologação (global)
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const psc = require("../shared/psc");
const apuracao = require("../shared/pscApuracao");
const { hojeBrasilia } = require("../shared/dataBrasilia");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("psc_gestao"));
}

function temHomologacao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("psc_homologacao"));
}

function temEscopoGlobal(usuario) {
  return !usuario.escopoCongregacoes || usuario.escopoCongregacoes === "TODAS";
}

function nomesPermitidos(usuario) {
  return temEscopoGlobal(usuario) ? null : (usuario.escopoCongregacoes || []);
}

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : 422, body: resultado };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao || "";
  const metodo = req.method;
  const q = req.query || {};
  const corpo = req.body || {};

  const podeLer = temGestao(usuario) || temHomologacao(usuario);

  // Decisões da CLI valem para a igreja inteira: permissão + escopo global.
  function exigirHomologacao() {
    if (!temHomologacao(usuario)) { erro(context, 403, SEM_PERMISSAO); return false; }
    if (!temEscopoGlobal(usuario)) {
      erro(context, 403, "Homologar, decidir reclassificação e mexer no catálogo do PSC valem para a igreja inteira — exige escopo global.");
      return false;
    }
    return true;
  }

  // Carrega a avaliação do corpo e confere o escopo (sem checar a permissão).
  async function avaliacaoDoCorpo(origem) {
    const avaliacaoId = Number(origem.avaliacaoId);
    if (!avaliacaoId) { erro(context, 400, "Informe avaliacaoId."); return null; }
    const avaliacao = await psc.buscarAvaliacao(pool, avaliacaoId);
    if (!avaliacao) { erro(context, 404, "Avaliação não encontrada."); return null; }
    if (!auth.estaNoEscopo(usuario, avaliacao.congregacaoNome)) { erro(context, 403, "Fora do seu escopo de atuação."); return null; }
    return avaliacao;
  }

  async function reclassificacaoDoCorpo() {
    const id = Number(corpo.reclassificacaoId);
    if (!id) { erro(context, 400, "Informe reclassificacaoId."); return null; }
    const r = await psc.buscarReclassificacao(pool, id);
    if (!r) { erro(context, 404, "Reclassificação não encontrada."); return null; }
    return r;
  }

  try {
    // ---------- Leitura ----------
    if (metodo === "GET") {
      if (!podeLer) return erro(context, 403, SEM_PERMISSAO);

      if (acao === "catalogo") {
        const incluirInativos = q.todos === "1" && temHomologacao(usuario);
        context.res = { status: 200, body: { sucesso: true, sinais: await psc.listarCatalogo(pool, { incluirInativos }) } };
        return;
      }

      if (acao === "parametros") {
        context.res = { status: 200, body: { sucesso: true, parametros: await psc.lerParametros(pool) } };
        return;
      }

      if (acao === "painel") {
        const hoje = hojeBrasilia();
        const ano = q.ano ? Number(q.ano) : Number(hoje.slice(0, 4));
        if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) return erro(context, 400, "Ano inválido.");
        const painel = await psc.montarPainel(pool, { ano, nomesCongregacoesPermitidas: nomesPermitidos(usuario), hoje });
        context.res = { status: 200, body: { sucesso: true, ...painel, escopoGlobal: temEscopoGlobal(usuario) } };
        return;
      }

      if (acao === "avaliacoes") {
        const ano = q.ano ? Number(q.ano) : null;
        if (q.ano && (!Number.isInteger(ano) || ano < 2000 || ano > 2200)) return erro(context, 400, "Ano inválido.");
        const lista = await psc.listarAvaliacoes(pool, {
          ano, congregacaoId: q.congregacaoId ? Number(q.congregacaoId) : null, status: q.status || null,
          nomesCongregacoesPermitidas: nomesPermitidos(usuario)
        });
        context.res = { status: 200, body: { sucesso: true, avaliacoes: lista.itens, truncado: lista.truncado } };
        return;
      }

      if (acao === "avaliacao") {
        const avaliacaoId = Number(q.avaliacaoId);
        if (!avaliacaoId) return erro(context, 400, "Informe avaliacaoId.");
        const detalhe = await psc.detalharAvaliacao(pool, avaliacaoId);
        if (!detalhe) return erro(context, 404, "Avaliação não encontrada.");
        if (!auth.estaNoEscopo(usuario, detalhe.congregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, avaliacao: detalhe } };
        return;
      }

      if (acao === "historico") {
        const congregacaoId = Number(q.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const historico = await psc.historicoDaCongregacao(pool, congregacaoId);
        if (!historico) return erro(context, 404, "Congregação não encontrada.");
        if (!auth.estaNoEscopo(usuario, historico.congregacao.nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, ...historico } };
        return;
      }

      if (acao === "reclassificacoes") {
        const lista = await psc.listarReclassificacoes(pool, { status: q.status || null, nomesCongregacoesPermitidas: nomesPermitidos(usuario) });
        context.res = { status: 200, body: { sucesso: true, reclassificacoes: lista.itens, truncado: lista.truncado } };
        return;
      }

      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    // ---------- Catálogo e parâmetros (CLI, escopo global) ----------
    if (acao === "parametros") {
      if (!exigirHomologacao()) return;
      const v = psc.validarParametros(corpo);
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await psc.atualizarParametros(pool, { dados: v.dados, membroId: usuario.membroId }));
    }

    if (acao === "catalogo/criterio") {
      if (!exigirHomologacao()) return;
      const v = psc.validarNovoCriterio(corpo);
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await psc.criarCriterio(pool, { dados: v.dados, membroId: usuario.membroId }), 201);
    }

    if (acao === "catalogo/criterio/atualizar") {
      if (!exigirHomologacao()) return;
      const criterioId = Number(corpo.criterioId);
      if (!criterioId) return erro(context, 400, "Informe criterioId.");
      return resposta(context, await psc.atualizarCriterio(pool, {
        criterioId, texto: corpo.texto, orientacao: corpo.orientacao, ativo: corpo.ativo, membroId: usuario.membroId
      }));
    }

    // ---------- Avaliação (gestão no escopo) ----------
    if (acao === "avaliacoes/abrir") {
      if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const congregacaoId = Number(corpo.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const congregacao = await psc.buscarCongregacao(pool, congregacaoId);
      if (!congregacao) return erro(context, 404, "Congregação não encontrada.");
      if (!auth.estaNoEscopo(usuario, congregacao.Nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await psc.abrirAvaliacao(pool, { congregacaoId, ano: corpo.ano, membroId: usuario.membroId });
      if (resultado.sucesso) {
        // Sugestões do sistema: ajuda, nunca condição (fail-soft).
        try {
          const ano = Number(corpo.ano);
          resultado.sugestoesAplicadas = await apuracao.aplicarSugestoes(pool, { avaliacaoId: resultado.avaliacaoId, congregacaoId, ano });
        } catch (e) {
          context.log.error("[GestaoPsc] sugestões falharam:", e);
          resultado.sugestoesAplicadas = 0;
        }
      }
      return resposta(context, resultado, 201);
    }

    if (acao === "avaliacoes/sugestoes") {
      if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      if (avaliacao.status !== "RASCUNHO") return erro(context, 422, "As sugestões só se atualizam enquanto a avaliação está em preenchimento.");
      const aplicadas = await apuracao.aplicarSugestoes(pool, { avaliacaoId: avaliacao.avaliacaoId, congregacaoId: avaliacao.congregacaoId, ano: avaliacao.ano });
      context.res = { status: 200, body: { sucesso: true, mensagem: `Sugestões do sistema atualizadas (${aplicadas} alínea(s)).`, aplicadas } };
      return;
    }

    if (acao === "avaliacoes/responder") {
      if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      const v = psc.validarRespostasEntrada(corpo.respostas);
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await psc.salvarRespostas(pool, { avaliacao, itens: v.itens, membroId: usuario.membroId }));
    }

    if (acao === "avaliacoes/enviar") {
      if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      return resposta(context, await psc.enviarAvaliacao(pool, { avaliacao, membroId: usuario.membroId }));
    }

    if (acao === "avaliacoes/validar") {
      if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      return resposta(context, await psc.validarAvaliacao(pool, { avaliacao, parecer: corpo.parecer, membroId: usuario.membroId }));
    }

    if (acao === "avaliacoes/devolver") {
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      // Enviada: a gestão no escopo devolve. Validada: já passou pela validação, então só a CLI.
      if (avaliacao.status === "VALIDADA") { if (!exigirHomologacao()) return; }
      else if (!temGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      return resposta(context, await psc.devolverAvaliacao(pool, { avaliacao, motivo: corpo.motivo, membroId: usuario.membroId }));
    }

    if (acao === "avaliacoes/homologar") {
      if (!exigirHomologacao()) return;
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      return resposta(context, await psc.homologarAvaliacao(pool, { avaliacao, resolucao: corpo.resolucao, membroId: usuario.membroId }));
    }

    if (acao === "avaliacoes/reabrir") {
      if (!exigirHomologacao()) return;
      const avaliacao = await avaliacaoDoCorpo(corpo);
      if (!avaliacao) return;
      return resposta(context, await psc.reabrirAvaliacao(pool, { avaliacao, motivo: corpo.motivo, membroId: usuario.membroId }));
    }

    // ---------- Reclassificação compulsória (CLI, escopo global) ----------
    if (acao === "reclassificacoes/decretar") {
      if (!exigirHomologacao()) return;
      const reclassificacao = await reclassificacaoDoCorpo();
      if (!reclassificacao) return;
      const v = psc.validarDecreto({ ...corpo, congregacaoId: reclassificacao.congregacaoId });
      if (!v.valido) return erro(context, 400, v.mensagem);
      return resposta(context, await psc.decretarReclassificacao(pool, { reclassificacao, dados: v.dados, membroId: usuario.membroId }));
    }

    if (acao === "reclassificacoes/arquivar") {
      if (!exigirHomologacao()) return;
      const reclassificacao = await reclassificacaoDoCorpo();
      if (!reclassificacao) return;
      return resposta(context, await psc.arquivarReclassificacao(pool, { reclassificacao, motivo: corpo.motivo, resolucao: corpo.resolucao, membroId: usuario.membroId }));
    }

    if (acao === "reclassificacoes/restabelecer") {
      if (!exigirHomologacao()) return;
      const reclassificacao = await reclassificacaoDoCorpo();
      if (!reclassificacao) return;
      return resposta(context, await psc.restabelecerReclassificacao(pool, { reclassificacao, resolucao: corpo.resolucao, motivo: corpo.motivo, membroId: usuario.membroId }));
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoPsc] erro:", e);
    erro(context, 500, "Erro interno ao processar o PSC.");
  }
};
