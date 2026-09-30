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
//    política que vale pra todo mundo.
//  - Matricular, registrar conclusão de módulo, cancelar, reemitir
//    certificado e ver a formação de uma pessoa exigem só que a pessoa esteja
//    no escopo do usuário (congregação do membro).
// Ler o catálogo e a PRÓPRIA formação é aberto a qualquer login (mesmo
// espírito de "admin gerencia, todo mundo vê o seu" da v5.7/v6.4).
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
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("trilhas_gestao"));
}

function temEscopoGlobal(usuario) {
  return !usuario.escopoCongregacoes || usuario.escopoCongregacoes === "TODAS";
}

// A pessoa está no escopo de quem gerencia? Membro sem congregação só é
// alcançável por escopo global (auth.estaNoEscopo já trata nome vazio).
async function membroNoEscopo(pool, usuario, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id
  `);
  const membro = r.recordset[0];
  if (!membro) return { existe: false, ok: false };
  return { existe: true, ok: auth.estaNoEscopo(usuario, membro.CongregacaoNome) };
}

function semPermissao(context) {
  return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
}

// Catálogo e requisitos: gestão + escopo global.
function exigirPoliticaGlobal(usuario, context) {
  if (!temGestao(usuario)) { semPermissao(context); return false; }
  if (!temEscopoGlobal(usuario)) {
    erro(context, 403, "Alterar o catálogo de trilhas e os requisitos vale para a igreja inteira — exige escopo global.");
    return false;
  }
  return true;
}

function nomesPermitidos(usuario) {
  return temEscopoGlobal(usuario) ? null : (usuario.escopoCongregacoes || []);
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
      context.res = { status: 200, body: { sucesso: true, trilhas: await trilhas.listarTrilhas(pool, { apenasAtivas: q.todas !== "1" }) } };
      return;
    }

    if (acao === "minha-formacao" && metodo === "GET") {
      context.res = { status: 200, body: { sucesso: true, formacao: await trilhas.listarFormacaoDoMembro(pool, usuario.membroId) } };
      return;
    }

    if (acao === "matricula" && metodo === "GET") {
      const matriculaId = Number(q.matriculaId);
      if (!matriculaId) return erro(context, 400, "Informe matriculaId.");
      const matricula = await trilhas.buscarMatricula(pool, matriculaId);
      if (!matricula) return erro(context, 404, "Matrícula não encontrada.");
      if (matricula.membroId !== usuario.membroId) {
        if (!temGestao(usuario)) return erro(context, 403, "Só é possível ver a matrícula de outra pessoa com a permissão de gestão da formação.");
        if (!(await membroNoEscopo(pool, usuario, matricula.membroId)).ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      }
      context.res = { status: 200, body: { sucesso: true, matricula } };
      return;
    }

    // ---------- Daqui em diante: permissão de gestão ----------
    if (metodo === "GET" && acao === "formacao") {
      if (!temGestao(usuario)) return semPermissao(context);
      const membroId = Number(q.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      const alcance = await membroNoEscopo(pool, usuario, membroId);
      if (!alcance.existe) return erro(context, 404, "Membro não encontrado.");
      if (!alcance.ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, formacao: await trilhas.listarFormacaoDoMembro(pool, membroId) } };
      return;
    }

    if (metodo === "GET" && acao === "pendencias") {
      if (!temGestao(usuario)) return semPermissao(context);
      const pendencias = await trilhas.listarPendenciasVencimento(pool, {
        nomesCongregacoesPermitidas: nomesPermitidos(usuario), congregacaoId: Number(q.congregacaoId) || null
      });
      context.res = { status: 200, body: { sucesso: true, pendencias } };
      return;
    }

    if (metodo === "GET" && acao === "requisitos") {
      if (!temGestao(usuario)) return semPermissao(context);
      context.res = { status: 200, body: { sucesso: true, contextos: trilhas.CONTEXTOS.map(c => ({ contexto: c, rotulo: trilhas.ROTULO_CONTEXTO[c] })), requisitos: await trilhas.listarRequisitos(pool) } };
      return;
    }

    if (metodo === "GET" && acao === "requisitos/avaliar") {
      if (!temGestao(usuario)) return semPermissao(context);
      const membroId = Number(q.membroId);
      if (!q.contexto || !membroId) return erro(context, 400, "Informe contexto e membroId.");
      if (!trilhas.CONTEXTOS.includes(q.contexto)) return erro(context, 400, "Contexto inválido.");
      const alcance = await membroNoEscopo(pool, usuario, membroId);
      if (!alcance.existe) return erro(context, 404, "Membro não encontrado.");
      if (!alcance.ok) return erro(context, 403, "Fora do seu escopo de atuação.");
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
      if (!body.trilhaId || !body.membroId) return erro(context, 400, "Informe trilhaId e membroId.");
      const alcance = await membroNoEscopo(pool, usuario, Number(body.membroId));
      if (!alcance.existe) return erro(context, 404, "Membro não encontrado.");
      if (!alcance.ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      return resposta(context, await trilhas.matricular(pool, { trilhaId: Number(body.trilhaId), membroId: Number(body.membroId), registradoPorMembroId: usuario.membroId }), 201);
    }

    if (acao === "modulos/concluir" || acao === "matricula/cancelar" || acao === "matricula/emitir-certificado") {
      if (!temGestao(usuario)) return semPermissao(context);
      if (!body.matriculaId) return erro(context, 400, "Informe matriculaId.");
      const matricula = await trilhas.buscarMatricula(pool, Number(body.matriculaId));
      if (!matricula) return erro(context, 404, "Matrícula não encontrada.");
      if (!(await membroNoEscopo(pool, usuario, matricula.membroId)).ok) return erro(context, 403, "Fora do seu escopo de atuação.");

      if (acao === "modulos/concluir") {
        if (!body.moduloId) return erro(context, 400, "Informe moduloId.");
        return resposta(context, await trilhas.concluirModulo(pool, {
          matriculaId: Number(body.matriculaId), moduloId: Number(body.moduloId), dataConclusao: body.data, observacao: body.observacao, registradoPorMembroId: usuario.membroId
        }));
      }
      if (acao === "matricula/cancelar") {
        return resposta(context, await trilhas.cancelarMatricula(pool, { matriculaId: Number(body.matriculaId), motivo: body.motivo, registradoPorMembroId: usuario.membroId }));
      }
      return resposta(context, await trilhas.garantirCertificadoDaMatricula(pool, { matriculaId: Number(body.matriculaId), emitidoPorMembroId: usuario.membroId }));
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoTrilhas] erro:", e);
    erro(context, 500, "Erro interno ao processar as trilhas de formação.");
  }
};
