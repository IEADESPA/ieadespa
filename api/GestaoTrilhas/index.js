// GestaoTrilhas (v6.9 — Trilhas de formação e certificação verificável)
//
// Ver shared/trilhas.js pra toda a lógica de decisão (pura, testada em
// isolamento). Este arquivo só expõe HTTP + permissão em cima dela.
//
// Permissão própria "trilhas_gestao" (migração 110), nunca concedida
// automaticamente a nenhum papel. Duas camadas, de propósito:
//  - Mexer no CATÁLOGO (trilhas, módulos, pré-requisitos) e nos REQUISITOS
//    por fluxo muda a regra pra igreja inteira (um requisito BLOQUEIA trava
//    consagração, nomeação, escala...). Por isso exige escopo territorial
//    GLOBAL ("TODAS"): um secretário local com trilhas_gestao não altera
//    política que vale pra todo mundo. "Global" aqui é o nível GERAL: papel GLOBAL e escopo TODAS (os dois).
//  - Matricular, registrar conclusão de módulo, cancelar, reemitir
//    certificado e ver a formação de uma pessoa exigem só que a pessoa esteja
//    no escopo do usuário (congregação do membro).
// Ler o catálogo ATIVO e a PRÓPRIA formação é aberto a qualquer login (mesmo
// espírito de "admin gerencia, todo mundo vê o seu" da v5.7/v6.4); as trilhas
// inativas (?todas=1) são da gestão. Matrícula/pessoa fora do escopo dá a MESMA
// resposta de "não existe" (404): a rota não serve de sonda de id.
//
// GET  /api/trilhas/catalogo[?todas=1]                     -> catálogo (trilhas + módulos + pré-requisitos) — login
// GET  /api/trilhas/minha-formacao                         -> a própria formação (matrículas, situação, certificados) — login
// GET  /api/trilhas/matricula?matriculaId=                 -> progresso detalhado — a própria pessoa ou gestão no escopo
// GET  /api/trilhas/formacao?membroId=                     -> formação de uma pessoa — gestão no escopo
// GET  /api/trilhas/pendencias[?congregacaoId=]            -> certificados vencidos/vencendo — gestão (no escopo)
// GET  /api/trilhas/requisitos                             -> onde cada trilha é exigida — gestão
// GET  /api/trilhas/requisitos/avaliar?contexto=&alvo=&membroId=  -> "esta pessoa cumpre?" — gestão no escopo
// POST /api/trilhas/criar                 body:{nome, descricao?, papelAlvo?, validadeMeses?, avisoDias?}   — catálogo (global)
// POST /api/trilhas/atualizar             body:{trilhaId, ativa?, descricao?, papelAlvo?, validadeMeses?, avisoDias?}
// POST /api/trilhas/modulos               body:{trilhaId, titulo, ordem?, cargaHoraria?, obrigatorio?}
// POST /api/trilhas/modulos/atualizar     body:{moduloId, ativo?, obrigatorio?, cargaHoraria?}
// POST /api/trilhas/modulos/pre-requisito body:{moduloId, preRequisitoModuloId}
// POST /api/trilhas/pre-requisito         body:{trilhaId, preRequisitoTrilhaId}
// POST /api/trilhas/pre-requisito/remover body:{trilhaId, preRequisitoTrilhaId}
// POST /api/trilhas/requisitos            body:{contexto, alvo?, trilhaId, modo?}   — global
// POST /api/trilhas/requisitos/remover    body:{requisitoId}                          — global
// POST /api/trilhas/matricular            body:{trilhaId, membroId}                   — gestão no escopo da pessoa
// POST /api/trilhas/modulos/concluir      body:{matriculaId, moduloId, data?, observacao?}
// POST /api/trilhas/matricula/cancelar    body:{matriculaId, motivo}
// POST /api/trilhas/matricula/emitir-certificado body:{matriculaId}   — reparo: emite o certificado de matrícula já concluída
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const escopoRotas = require("../shared/escopoRotas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("trilhas_gestao"));
}

// A pessoa está no escopo de quem gerencia (congregação e, para escopo de Extensão da Tenda, a Extensão)? Membro sem congregação só é alcançável por escopo TODAS.
// Pessoa inexistente e pessoa fora do escopo dão o MESMO resultado (`ok: false`): quem chama devolve a mesma resposta nos dois casos, sem sonda de matrícula.
async function membroNoEscopo(pool, usuario, membroId) {
  const pessoa = await escopoRotas.pessoaAlcancavel(pool, usuario, membroId);
  return { ok: !!pessoa };
}

function semPermissao(context) {
  return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
}

// Catálogo e requisitos valem para a igreja inteira (INSTITUCIONAL): gestão + nível GERAL (papel GLOBAL e escopo TODAS).
function exigirPoliticaGlobal(usuario, context) {
  if (!temGestao(usuario)) { semPermissao(context); return false; }
  if (!escopoRotas.ehGeral(usuario)) {
    erro(context, 403, "Alterar o catálogo de trilhas e os requisitos vale para a igreja inteira — exige o nível geral.");
    return false;
  }
  return true;
}

// null = sem restrição (escopo TODAS); senão a lista de congregações. Sessão sem lista não alcança nenhuma (falha fechada).
function nomesPermitidos(usuario) {
  if (usuario.escopoCongregacoes === "TODAS") return null;
  return Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : [];
}

function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : 422, body: resultado };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao || "";
  // Toda ação tem nome próprio: catch-all {*acao} chamado sem segmento nenhum
  // (/api/trilhas) não é um caso que dê pra confiar no roteador do Functions.
  const metodo = req.method;
  const q = req.query || {};
  const body = req.body || {};

  try {
    // ---------- Leitura aberta a qualquer login ----------
    if (acao === "catalogo" && metodo === "GET") {
      // As trilhas inativas (rascunho) são da gestão: `?todas=1` só vale com trilhas_gestao.
      const todas = q.todas === "1" && temGestao(usuario);
      context.res = { status: 200, body: { sucesso: true, trilhas: await trilhas.listarTrilhas(pool, { apenasAtivas: !todas }) } };
      return;
    }

    if (acao === "minha-formacao" && metodo === "GET") {
      context.res = { status: 200, body: { sucesso: true, formacao: await trilhas.listarFormacaoDoMembro(pool, usuario.membroId) } };
      return;
    }

    if (acao === "matricula" && metodo === "GET") {
      const matriculaId = auth.idDeRota(q.matriculaId);
      if (!matriculaId) return erro(context, 400, "Informe matriculaId.");
      const matricula = await trilhas.buscarMatricula(pool, matriculaId);
      // Matrícula de outra pessoa: sem a permissão, ou com ela mas fora do escopo, a resposta é a MESMA de matrícula que não existe (sem sonda de id).
      if (!matricula) return erro(context, 404, "Matrícula não encontrada.");
      if (matricula.membroId !== usuario.membroId) {
        if (!temGestao(usuario) || !(await membroNoEscopo(pool, usuario, matricula.membroId)).ok) return erro(context, 404, "Matrícula não encontrada.");
      }
      context.res = { status: 200, body: { sucesso: true, matricula } };
      return;
    }

    // ---------- Daqui em diante: permissão de gestão ----------
    if (metodo === "GET" && acao === "formacao") {
      if (!temGestao(usuario)) return semPermissao(context);
      const membroId = auth.idDeRota(q.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      if (!(await membroNoEscopo(pool, usuario, membroId)).ok) return erro(context, 404, "Membro não encontrado.");
      context.res = { status: 200, body: { sucesso: true, formacao: await trilhas.listarFormacaoDoMembro(pool, membroId) } };
      return;
    }

    if (metodo === "GET" && acao === "pendencias") {
      if (!temGestao(usuario)) return semPermissao(context);
      const pendencias = await trilhas.listarPendenciasVencimento(pool, {
        nomesCongregacoesPermitidas: nomesPermitidos(usuario), congregacaoId: auth.idDeRota(q.congregacaoId)
      });
      // Escopo de Extensão da Tenda é mais estreito que a congregação-mãe: o SQL filtra pelas congregações, aqui se confere a Extensão de cada pessoa.
      const dentro = escopoRotas.filtrarPorEscopo(usuario, pendencias, p => p.congregacaoNome, p => p.extensaoNome);
      context.res = { status: 200, body: { sucesso: true, pendencias: dentro } };
      return;
    }

    if (metodo === "GET" && acao === "requisitos") {
      if (!temGestao(usuario)) return semPermissao(context);
      context.res = { status: 200, body: { sucesso: true, contextos: trilhas.CONTEXTOS.map(c => ({ contexto: c, rotulo: trilhas.ROTULO_CONTEXTO[c] })), requisitos: await trilhas.listarRequisitos(pool) } };
      return;
    }

    if (metodo === "GET" && acao === "requisitos/avaliar") {
      if (!temGestao(usuario)) return semPermissao(context);
      const membroId = auth.idDeRota(q.membroId);
      if (!q.contexto || !membroId) return erro(context, 400, "Informe contexto e membroId.");
      if (!trilhas.CONTEXTOS.includes(q.contexto)) return erro(context, 400, "Contexto inválido.");
      if (!(await membroNoEscopo(pool, usuario, membroId)).ok) return erro(context, 404, "Membro não encontrado.");
      context.res = { status: 200, body: { sucesso: true, avaliacao: await trilhas.avaliarRequisitos(pool, { contexto: q.contexto, alvoChave: q.alvo || "", membroId }) } };
      return;
    }

    if (metodo !== "POST") return erro(context, 404, "Ação inválida.");

    // ---------- Catálogo e requisitos (escopo global) ----------
    if (acao === "criar") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      return resposta(context, await trilhas.criarTrilha(pool, body, usuario.membroId), 201);
    }
    if (acao === "atualizar") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.trilhaId) return erro(context, 400, "Informe trilhaId.");
      return resposta(context, await trilhas.atualizarTrilha(pool, { ...body, trilhaId: Number(body.trilhaId), atualizadoPorMembroId: usuario.membroId }));
    }
    if (acao === "modulos") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.trilhaId) return erro(context, 400, "Informe trilhaId.");
      return resposta(context, await trilhas.adicionarModulo(pool, { ...body, trilhaId: Number(body.trilhaId), criadoPorMembroId: usuario.membroId }), 201);
    }
    if (acao === "modulos/atualizar") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.moduloId) return erro(context, 400, "Informe moduloId.");
      return resposta(context, await trilhas.atualizarModulo(pool, { ...body, moduloId: Number(body.moduloId), atualizadoPorMembroId: usuario.membroId }));
    }
    if (acao === "modulos/pre-requisito") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.moduloId || !body.preRequisitoModuloId) return erro(context, 400, "Informe moduloId e preRequisitoModuloId.");
      return resposta(context, await trilhas.adicionarPreRequisitoModulo(pool, { moduloId: Number(body.moduloId), preRequisitoModuloId: Number(body.preRequisitoModuloId), registradoPorMembroId: usuario.membroId }), 201);
    }
    if (acao === "pre-requisito" || acao === "pre-requisito/remover") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.trilhaId || !body.preRequisitoTrilhaId) return erro(context, 400, "Informe trilhaId e preRequisitoTrilhaId.");
      const dados = { trilhaId: Number(body.trilhaId), preRequisitoTrilhaId: Number(body.preRequisitoTrilhaId), registradoPorMembroId: usuario.membroId };
      return acao === "pre-requisito"
        ? resposta(context, await trilhas.adicionarPreRequisitoTrilha(pool, dados), 201)
        : resposta(context, await trilhas.removerPreRequisitoTrilha(pool, dados));
    }
    if (acao === "requisitos") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      return resposta(context, await trilhas.criarRequisito(pool, { contexto: body.contexto, alvoChave: body.alvo, trilhaId: body.trilhaId, modo: body.modo, criadoPorMembroId: usuario.membroId }), 201);
    }
    if (acao === "requisitos/remover") {
      if (!exigirPoliticaGlobal(usuario, context)) return;
      if (!body.requisitoId) return erro(context, 400, "Informe requisitoId.");
      return resposta(context, await trilhas.removerRequisito(pool, { requisitoId: Number(body.requisitoId), removidoPorMembroId: usuario.membroId }));
    }

    // ---------- Matrícula e progresso (escopo da pessoa) ----------
    if (acao === "matricular") {
      if (!temGestao(usuario)) return semPermissao(context);
      const alvoId = auth.idDeRota(body.membroId);
      if (!body.trilhaId || !alvoId) return erro(context, 400, "Informe trilhaId e membroId.");
      if (!(await membroNoEscopo(pool, usuario, alvoId)).ok) return erro(context, 404, "Membro não encontrado.");
      return resposta(context, await trilhas.matricular(pool, { trilhaId: Number(body.trilhaId), membroId: alvoId, registradoPorMembroId: usuario.membroId }), 201);
    }

    if (acao === "modulos/concluir" || acao === "matricula/cancelar" || acao === "matricula/emitir-certificado") {
      if (!temGestao(usuario)) return semPermissao(context);
      const matriculaId = auth.idDeRota(body.matriculaId);
      if (!matriculaId) return erro(context, 400, "Informe matriculaId.");
      const matricula = await trilhas.buscarMatricula(pool, matriculaId);
      // Matrícula de pessoa fora do escopo = a mesma resposta de matrícula que não existe.
      if (!matricula || !(await membroNoEscopo(pool, usuario, matricula.membroId)).ok) return erro(context, 404, "Matrícula não encontrada.");

      if (acao === "modulos/concluir") {
        if (!body.moduloId) return erro(context, 400, "Informe moduloId.");
        return resposta(context, await trilhas.concluirModulo(pool, {
          matriculaId: matriculaId, moduloId: Number(body.moduloId), dataConclusao: body.data, observacao: body.observacao, registradoPorMembroId: usuario.membroId
        }));
      }
      if (acao === "matricula/cancelar") {
        return resposta(context, await trilhas.cancelarMatricula(pool, { matriculaId: matriculaId, motivo: body.motivo, registradoPorMembroId: usuario.membroId }));
      }
      return resposta(context, await trilhas.garantirCertificadoDaMatricula(pool, { matriculaId: matriculaId, emitidoPorMembroId: usuario.membroId }));
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoTrilhas] erro:", e);
    erro(context, 500, "Erro interno ao processar as trilhas de formação.");
  }
};
