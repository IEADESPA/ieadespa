// GestaoEbdAtividades (v6.3 — EBD: Lições e atividades)
//
// Continua a FASE 6 (aberta em GestaoEbdTurmas/v6.1, GestaoEbdChamada/v6.2).
// Ver shared/ebdAtividades.js pra toda a lógica de decisão (pura, testada
// em isolamento) — conteúdo da Lição, Atividade com as 5 formas de
// questão, resposta de aluno com auto-correção e correção manual.
//
// Permissão — mesmo espírito de GestaoEbdChamada (v6.2): "ebd_gestao"
// sempre pode administrar (dentro do escopo territorial). Mas quem gerencia
// o CONTEÚDO da lição/atividade de uma turma específica não precisa dessa
// permissão ampla: qualquer professor ATIVO em alguma turma da MESMA
// CONGREGAÇÃO da lição pode autorar/editar (a lição — e a atividade que
// pende dela — é compartilhada por todas as turmas da congregação, ver
// migração 102/v6.2: UNIQUE (CongregacaoId, Data)). Já lançar/corrigir a
// RESPOSTA de um aluno específico exige ser professor ativo NA TURMA
// daquele aluno (ou ebd_gestao) — mesma granularidade de
// podeLancarChamadaDaTurma/v6.2, porque é lá que o vínculo aluno-professor
// existe de fato.
//
// Como o Aluno (v6.1) não tem login próprio neste sistema, é sempre o
// professor (ou ebd_gestao) quem registra a resposta em nome do aluno —
// mesmo modelo da chamada de presença.
//
// Decisão deliberada (documentada também na migração 103): a Atividade NÃO
// fica bloqueada quando a Lição está FECHADA — fechar a lição só encerra a
// janela de CHAMADA daquele domingo; revisar/responder a atividade depois
// (dever de casa) continua liberado.
//
// GET  /api/ebd-atividades/licao/conteudo?licaoId=                 -> título/referência/conteúdo da lição
// POST /api/ebd-atividades/licao/conteudo  body:{licaoId, titulo?, referencia?, conteudo?}
// GET  /api/ebd-atividades/atividade?licaoId=                      -> atividade + questões (com gabarito) da lição
// POST /api/ebd-atividades/atividade       body:{licaoId, titulo?}  -> cria (idempotente) a atividade da lição
// POST /api/ebd-atividades/questao         body:{atividadeId, tipo, enunciado, opcoes?, gabarito, ordem?}
// POST /api/ebd-atividades/resposta        body:{questaoId, alunoId, resposta}         -> auto-corrigida
// POST /api/ebd-atividades/resposta/corrigir body:{respostaId, correta}                -> correção manual
// GET  /api/ebd-atividades/respostas?atividadeId=&alunoId=         -> respostas + resumo de um aluno
// GET  /api/ebd-atividades/resumo?atividadeId=&turmaId=            -> nota de cada aluno ativo da turma
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const ebdTurmas = require("../shared/ebdTurmas");
const chamada = require("../shared/ebdChamada");
const atividades = require("../shared/ebdAtividades");

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

function temEbdGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("ebd_gestao"));
}

async function ehProfessorAtivoDaTurma(pool, membroId, turmaId) {
  if (!membroId) return false;
  const r = await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId AND Ativo = 1
  `);
  return r.recordset.length > 0;
}

async function ehProfessorAtivoDaCongregacao(pool, membroId, congregacaoId) {
  if (!membroId) return false;
  const r = await pool.request().input("congregacaoId", sql.Int, congregacaoId).input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores tp
    JOIN EbdTurmas t ON t.TurmaId = tp.TurmaId
    WHERE t.CongregacaoId = @congregacaoId AND tp.MembroId = @membroId AND tp.Ativo = 1
  `);
  return r.recordset.length > 0;
}

// Gerenciar conteúdo/atividade da lição: ebd_gestao (no escopo) OU
// professor ativo em alguma turma da mesma congregação da lição.
async function podeGerenciarLicao(pool, usuario, congregacaoId) {
  if (temEbdGestao(usuario) && (await podeAcessarCongregacao(pool, usuario, congregacaoId))) return true;
  return ehProfessorAtivoDaCongregacao(pool, usuario.membroId, congregacaoId);
}

// Lançar/corrigir resposta de um aluno: ebd_gestao (no escopo) OU
// professor ativo NA TURMA daquele aluno — mesma granularidade da chamada.
async function podeGerenciarRespostaDoAluno(pool, usuario, alunoId) {
  const alunoResult = await pool.request().input("id", sql.Int, alunoId).query(`SELECT AlunoId, TurmaId FROM EbdAlunos WHERE AlunoId = @id AND Ativo = 1`);
  const aluno = alunoResult.recordset[0];
  if (!aluno) return { ok: false, aluno: null };
  const turma = await ebdTurmas.buscarTurmaPorId(pool, aluno.TurmaId);
  if (!turma) return { ok: false, aluno };
  if (temEbdGestao(usuario) && (await podeAcessarCongregacao(pool, usuario, turma.congregacaoId))) return { ok: true, aluno, turma };
  if (await ehProfessorAtivoDaTurma(pool, usuario.membroId, aluno.TurmaId)) return { ok: true, aluno, turma };
  return { ok: false, aluno, turma };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Conteúdo da lição ----
    if (acao === "licao/conteudo" && metodo === "GET") {
      const licaoId = Number(req.query && req.query.licaoId);
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await atividades.buscarConteudoLicao(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, licao } };
      return;
    }

    if (acao === "licao/conteudo" && metodo === "POST") {
      const { licaoId, titulo, referencia, conteudo } = req.body || {};
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await atividades.buscarConteudoLicao(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeGerenciarLicao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação nesta congregação.");
      const resultado = await atividades.atualizarConteudoLicao(pool, { licaoId, titulo, referencia, conteudo });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Atividade ----
    if (acao === "atividade" && metodo === "GET") {
      const licaoId = Number(req.query && req.query.licaoId);
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await chamada.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const atividade = await atividades.buscarAtividadePorLicao(pool, licaoId);
      context.res = { status: 200, body: { sucesso: true, atividade } };
      return;
    }

    if (acao === "atividade" && metodo === "POST") {
      const { licaoId, titulo } = req.body || {};
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await chamada.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeGerenciarLicao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação nesta congregação.");
      const resultado = await atividades.criarOuBuscarAtividade(pool, { licaoId, titulo, criadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "questao" && metodo === "POST") {
      const { atividadeId, tipo, enunciado, opcoes, gabarito, ordem } = req.body || {};
      if (!atividadeId || !tipo || !enunciado) return erro(context, 400, "Informe atividadeId, tipo e enunciado.");
      const atividadeResult = await pool.request().input("id", sql.Int, atividadeId).query(`SELECT LicaoId FROM EbdAtividades WHERE AtividadeId = @id`);
      const atividadeRow = atividadeResult.recordset[0];
      if (!atividadeRow) return erro(context, 404, "Atividade não encontrada.");
      const licao = await chamada.buscarLicaoPorId(pool, atividadeRow.LicaoId);
      if (!(await podeGerenciarLicao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação nesta congregação.");
      const resultado = await atividades.adicionarQuestao(pool, { atividadeId, tipo, enunciado, opcoes, gabarito, ordem, criadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    // ---- Resposta ----
    if (acao === "resposta" && metodo === "POST") {
      const { questaoId, alunoId, resposta } = req.body || {};
      if (!questaoId || !alunoId) return erro(context, 400, "Informe questaoId e alunoId.");
      const { ok } = await podeGerenciarRespostaDoAluno(pool, usuario, alunoId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await atividades.registrarRespostaAluno(pool, { questaoId, alunoId, resposta, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "resposta/corrigir" && metodo === "POST") {
      const { respostaId, correta, alunoId } = req.body || {};
      if (!respostaId || !alunoId || correta === undefined) return erro(context, 400, "Informe respostaId, alunoId e correta.");
      const { ok } = await podeGerenciarRespostaDoAluno(pool, usuario, alunoId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await atividades.corrigirRespostaManual(pool, { respostaId, correta, corrigidoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "respostas" && metodo === "GET") {
      const atividadeId = Number(req.query && req.query.atividadeId);
      const alunoId = Number(req.query && req.query.alunoId);
      if (!atividadeId || !alunoId) return erro(context, 400, "Informe atividadeId e alunoId.");
      const { ok } = await podeGerenciarRespostaDoAluno(pool, usuario, alunoId);
      if (!ok) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const respostas = await atividades.listarRespostasAluno(pool, { atividadeId, alunoId });
      context.res = { status: 200, body: { sucesso: true, respostas, resumo: atividades.calcularNotaAtividade(respostas) } };
      return;
    }

    if (acao === "resumo" && metodo === "GET") {
      const atividadeId = Number(req.query && req.query.atividadeId);
      const turmaId = Number(req.query && req.query.turmaId);
      if (!atividadeId || !turmaId) return erro(context, 400, "Informe atividadeId e turmaId.");
      const turma = await ebdTurmas.buscarTurmaPorId(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      const temGestao = temEbdGestao(usuario) && (await podeAcessarCongregacao(pool, usuario, turma.congregacaoId));
      const ehProfessor = await ehProfessorAtivoDaTurma(pool, usuario.membroId, turmaId);
      if (!temGestao && !ehProfessor) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resumo = await atividades.listarResumoTurma(pool, { atividadeId, turmaId });
      context.res = { status: 200, body: { sucesso: true, resumo } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdAtividades] erro:", e);
    erro(context, 500, "Erro interno ao processar atividade da EBD.");
  }
};
