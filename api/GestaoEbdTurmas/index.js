// GestaoEbdTurmas (v6.1 — EBD: Hierarquia e cadastros)
//
// Abre a FASE 6 (Escola Bíblica Dominical) — reescrita do zero em Functions
// + front estático (ver README, preâmbulo da FASE 6: existe um protótipo
// `chamada-ebd` em Next.js, banido neste projeto; nada de lá foi copiado).
//
// Toda rota exige a permissão própria "ebd_gestao" (nunca concedida
// automaticamente a nenhum papel, migração 101 — mesmo padrão de
// "habilitacao_voluntarios"/v5.7 e "assistencia_social"/v5.9), diferente
// do Departamento cadastral "EBD" usado pelos Relatórios Departamentais
// (v5.2/v5.5/v5.8) — são cadastros de naturezas diferentes, sem relação.
// Ver shared/ebdTurmas.js pra toda a lógica de decisão (pura, testada em
// isolamento).
//
// GET  /api/ebd-turmas/turmas?congregacaoId=          -> turmas da congregação (+ contagem de professores/alunos)
// POST /api/ebd-turmas/turmas   body:{congregacaoId, nome, faixaEtaria?}
// GET  /api/ebd-turmas/professores?turmaId=
// POST /api/ebd-turmas/professores          body:{turmaId, membroId, principal?}
// POST /api/ebd-turmas/professores/encerrar body:{turmaId, membroId}
// GET  /api/ebd-turmas/alunos?turmaId=
// POST /api/ebd-turmas/alunos               body:{membroId, turmaId}          -> matrícula (vínculo de MembroReferencia)
// POST /api/ebd-turmas/alunos/transferir    body:{membroId, novaTurmaId}
// GET  /api/ebd-turmas/aluno?membroId=                -> vínculo de aluno de um membro específico
// GET  /api/ebd-turmas/visao-agrupada?busca=          -> Área -> Congregação -> Turmas, dentro do escopo do usuário
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const ebd = require("../shared/ebdTurmas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeAcessarCongregacao(pool, usuario, congregacaoId) {
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

async function podeAcessarTurma(pool, usuario, turmaId) {
  const turma = await ebd.buscarTurmaPorId(pool, turmaId);
  if (!turma) return { ok: false, turma: null };
  return { ok: await podeAcessarCongregacao(pool, usuario, turma.congregacaoId), turma };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "ebd_gestao");
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Turmas ----
    if (acao === "turmas") {
      if (metodo === "GET") {
        const congregacaoId = Number(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, turmas: await ebd.listarTurmasPorCongregacao(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { congregacaoId, nome, faixaEtaria } = req.body || {};
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        const resultado = await ebd.criarTurma(pool, { congregacaoId, nome, faixaEtaria, criadoPorMembroId: usuario.membroId });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    // ---- Professores ----
    if (acao === "professores") {
      if (metodo === "GET") {
        const turmaId = Number(req.query && req.query.turmaId);
        if (!turmaId) return erro(context, 400, "Informe turmaId.");
        const { ok } = await podeAcessarTurma(pool, usuario, turmaId);
        if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, professores: await ebd.listarProfessoresPorTurma(pool, turmaId) } };
        return;
      }
      if (metodo === "POST") {
        const { turmaId, membroId, principal } = req.body || {};
        if (!turmaId || !membroId) return erro(context, 400, "Informe turmaId e membroId.");
        const { ok } = await podeAcessarTurma(pool, usuario, turmaId);
        if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
        const resultado = await ebd.designarProfessor(pool, { turmaId, membroId, principal, designadoPorMembroId: usuario.membroId });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    if (acao === "professores/encerrar" && metodo === "POST") {
      const { turmaId, membroId } = req.body || {};
      if (!turmaId || !membroId) return erro(context, 400, "Informe turmaId e membroId.");
      const { ok } = await podeAcessarTurma(pool, usuario, turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await ebd.encerrarProfessor(pool, { turmaId, membroId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Alunos (vínculo de MembroReferencia) ----
    if (acao === "alunos") {
      if (metodo === "GET") {
        const turmaId = Number(req.query && req.query.turmaId);
        if (!turmaId) return erro(context, 400, "Informe turmaId.");
        const { ok } = await podeAcessarTurma(pool, usuario, turmaId);
        if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, alunos: await ebd.listarAlunosPorTurma(pool, turmaId) } };
        return;
      }
      if (metodo === "POST") {
        const { membroId, turmaId } = req.body || {};
        if (!membroId || !turmaId) return erro(context, 400, "Informe membroId e turmaId.");
        const { ok } = await podeAcessarTurma(pool, usuario, turmaId);
        if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
        const resultado = await ebd.matricularAluno(pool, { membroId, turmaId, criadoPorMembroId: usuario.membroId });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    if (acao === "alunos/transferir" && metodo === "POST") {
      const { membroId, novaTurmaId } = req.body || {};
      if (!membroId || !novaTurmaId) return erro(context, 400, "Informe membroId e novaTurmaId.");
      const { ok } = await podeAcessarTurma(pool, usuario, novaTurmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await ebd.transferirAluno(pool, { membroId, novaTurmaId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "aluno" && metodo === "GET") {
      const membroId = Number(req.query && req.query.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      const aluno = await ebd.buscarAlunoPorMembro(pool, membroId);
      if (!aluno) return erro(context, 404, "Este membro não tem matrícula na EBD.");
      const { ok } = await podeAcessarTurma(pool, usuario, aluno.turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, aluno } };
      return;
    }

    // ---- Visão agrupada Área -> Congregação (busca), item 3 do v6.1 ----
    if (acao === "visao-agrupada" && metodo === "GET") {
      const nomesCongregacoesPermitidas = usuario.escopoCongregacoes === "TODAS" ? null : (usuario.escopoCongregacoes || []);
      const turmas = await ebd.listarTurmasParaVisaoAgrupada(pool, { nomesCongregacoesPermitidas });
      const agrupado = ebd.agruparPorAreaCongregacao(turmas);
      const busca = req.query && req.query.busca;
      context.res = { status: 200, body: { sucesso: true, areas: ebd.filtrarBuscaAgrupada(agrupado, busca) } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdTurmas] erro:", e);
    erro(context, 500, "Erro interno ao processar EBD.");
  }
};
