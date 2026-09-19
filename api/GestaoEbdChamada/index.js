// GestaoEbdChamada (v6.2 — EBD: Chamada e presença)
//
// Continua a FASE 6 (aberta em GestaoEbdTurmas, v6.1). Ver shared/
// ebdChamada.js pra toda a lógica de decisão (pura, testada em isolamento)
// — Lição é a versão MÍNIMA (congregação/data/aberta-fechada), a v6.3
// (ainda não construída) estende a MESMA EbdLicoes com conteúdo
// pedagógico, sem recriar nada do que existe aqui.
//
// Permissão — decisão deliberada, diferente de GestaoEbdTurmas: abrir/
// fechar/reabrir Lição e ver o painel de todas as lições da congregação
// continuam atrás de "ebd_gestao" (administração da EBD, mesma permissão
// de v6.1). MAS lançar chamada (roster/presença/visitante/resumo) de UMA
// turma específica NÃO exige "ebd_gestao": basta o usuário ser um
// professor ATIVO daquela turma (EbdTurmaProfessores, mesma tabela da
// v6.1) — sem isso, cada professor de sala precisaria que a Diretoria
// concedesse a permissão ampla de gestão da EBD só pra fazer chamada da
// própria turma, o que não faz sentido operacional (são dezenas de
// professores, um por turma, contra um punhado de gestores). Quem TEM
// "ebd_gestao" continua podendo lançar chamada de qualquer turma dentro
// do próprio escopo territorial (cobre licença/ausência do professor
// titular).
//
// GET  /api/ebd-chamada/licao?congregacaoId=&data=        -> lição do dia (ou null) — leitura livre pra quem acessa a congregação
// POST /api/ebd-chamada/licao/abrir   body:{congregacaoId, data}   -> exige ebd_gestao
// POST /api/ebd-chamada/licao/fechar  body:{licaoId}                -> exige ebd_gestao
// POST /api/ebd-chamada/licao/reabrir body:{licaoId}                -> exige ebd_gestao
// GET  /api/ebd-chamada/licoes?congregacaoId=              -> histórico de lições da congregação — exige ebd_gestao
// GET  /api/ebd-chamada/roster?turmaId=&licaoId=           -> alunos da turma + status já lançado nesta lição
// POST /api/ebd-chamada/presenca   body:{licaoId, turmaId, alunoId, status}
// POST /api/ebd-chamada/visitante  body:{licaoId, turmaId, visitanteNome, visitanteContato?}
// GET  /api/ebd-chamada/resumo?licaoId=&turmaId=           -> chamada completa (alunos + visitantes) + percentuais calculados
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const ebd = require("../shared/ebdTurmas");
const chamada = require("../shared/ebdChamada");

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

async function ehProfessorAtivoDaTurma(pool, membroId, turmaId) {
  if (!membroId) return false;
  const r = await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId AND Ativo = 1
  `);
  return r.recordset.length > 0;
}

// Lançar chamada de uma turma: "ebd_gestao" (dentro do escopo territorial)
// OU professor ativo da própria turma (ver preâmbulo acima).
async function podeLancarChamadaDaTurma(pool, usuario, turmaId) {
  const turma = await ebd.buscarTurmaPorId(pool, turmaId);
  if (!turma) return { ok: false, turma: null };
  if (usuario.permissoes && usuario.permissoes.includes("ebd_gestao") && await podeAcessarCongregacao(pool, usuario, turma.congregacaoId)) {
    return { ok: true, turma };
  }
  if (await ehProfessorAtivoDaTurma(pool, usuario.membroId, turmaId)) {
    return { ok: true, turma };
  }
  return { ok: false, turma };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Lição (administração — exige ebd_gestao) ----
    if (acao === "licao" && metodo === "GET") {
      const congregacaoId = Number(req.query && req.query.congregacaoId);
      const data = req.query && req.query.data;
      if (!congregacaoId || !data) return erro(context, 400, "Informe congregacaoId e data.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const licao = await chamada.buscarLicaoPorCongregacaoData(pool, congregacaoId, data);
      context.res = { status: 200, body: { sucesso: true, licao } };
      return;
    }

    if (acao === "licao/abrir" && metodo === "POST") {
      if (!usuario.permissoes || !usuario.permissoes.includes("ebd_gestao")) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { congregacaoId, data } = req.body || {};
      if (!congregacaoId || !data) return erro(context, 400, "Informe congregacaoId e data.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await chamada.abrirLicao(pool, { congregacaoId, data, abertoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "licao/fechar" && metodo === "POST") {
      if (!usuario.permissoes || !usuario.permissoes.includes("ebd_gestao")) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { licaoId } = req.body || {};
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await chamada.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await chamada.fecharLicao(pool, { licaoId, fechadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "licao/reabrir" && metodo === "POST") {
      if (!usuario.permissoes || !usuario.permissoes.includes("ebd_gestao")) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { licaoId } = req.body || {};
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await chamada.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await chamada.reabrirLicao(pool, { licaoId, reabertoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "licoes" && metodo === "GET") {
      if (!usuario.permissoes || !usuario.permissoes.includes("ebd_gestao")) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const congregacaoId = Number(req.query && req.query.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, licoes: await chamada.listarLicoesPorCongregacao(pool, congregacaoId) } };
      return;
    }

    // ---- Chamada por turma (ebd_gestao no escopo OU professor ativo da turma) ----
    if (acao === "roster" && metodo === "GET") {
      const turmaId = Number(req.query && req.query.turmaId);
      const licaoId = Number(req.query && req.query.licaoId);
      if (!turmaId || !licaoId) return erro(context, 400, "Informe turmaId e licaoId.");
      const { ok } = await podeLancarChamadaDaTurma(pool, usuario, turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      context.res = { status: 200, body: { sucesso: true, alunos: await chamada.listarRosterComPresenca(pool, { turmaId, licaoId }) } };
      return;
    }

    if (acao === "presenca" && metodo === "POST") {
      const { licaoId, turmaId, alunoId, status } = req.body || {};
      if (!licaoId || !turmaId || !alunoId || !status) return erro(context, 400, "Informe licaoId, turmaId, alunoId e status.");
      const { ok } = await podeLancarChamadaDaTurma(pool, usuario, turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await chamada.registrarPresencaAluno(pool, { licaoId, turmaId, alunoId, status, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "visitante" && metodo === "POST") {
      const { licaoId, turmaId, visitanteNome, visitanteContato } = req.body || {};
      if (!licaoId || !turmaId || !visitanteNome) return erro(context, 400, "Informe licaoId, turmaId e visitanteNome.");
      const { ok } = await podeLancarChamadaDaTurma(pool, usuario, turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await chamada.registrarVisitante(pool, { licaoId, turmaId, visitanteNome, visitanteContato, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "resumo" && metodo === "GET") {
      const licaoId = Number(req.query && req.query.licaoId);
      const turmaId = Number(req.query && req.query.turmaId);
      if (!licaoId || !turmaId) return erro(context, 400, "Informe licaoId e turmaId.");
      const { ok } = await podeLancarChamadaDaTurma(pool, usuario, turmaId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const registros = await chamada.listarChamadaPorLicaoTurma(pool, { licaoId, turmaId });
      context.res = { status: 200, body: { sucesso: true, chamada: registros, resumo: chamada.resumirChamada(registros) } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdChamada] erro:", e);
    erro(context, 500, "Erro interno ao processar chamada da EBD.");
  }
};
