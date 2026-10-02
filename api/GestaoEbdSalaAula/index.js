// GestaoEbdSalaAula (v6.10 — EBD: Sala de aula assistida e material)
//
// Plano de aula + material publicados pelo Superintendente e o alerta de
// alunos ausentes. A chamada offline mora em GestaoEbdChamada (é chamada); o
// pedido de revistas pela matrícula, em GestaoEbdRevistas. Toda a lógica de
// decisão está em shared/ebdSalaAula.js (pura, testada em isolamento).
//
// Permissões — sem permissão nova:
//   * criar/editar/publicar/excluir plano e material: "ebd_gestao". Plano do
//     CAMPO INTEIRO (sem congregação) vale para todas as congregações, então
//     exige escopo GLOBAL — o mesmo critério do catálogo de trilhas (v6.9): um
//     superintendente local não publica para o campo. Plano de congregação
//     exige a congregação no escopo de quem age.
//   * ver o plano da turma (só PUBLICADO) e os alunos ausentes: professor
//     ativo da turma OU "ebd_gestao" no escopo da congregação da turma — a
//     mesma regra da chamada (v6.2).
//
// GET  /api/ebd-sala/planos?dataInicio=&dataFim=&congregacaoId=   -> gestão (rascunhos incluídos), no escopo
// GET  /api/ebd-sala/plano?planoId=                               -> gestão: um plano com materiais
// GET  /api/ebd-sala/planos/turma?turmaId=&data=                  -> professor: planos PUBLICADOS que valem para a turma
// POST /api/ebd-sala/planos            body:{data, congregacaoId?, faixaEtaria?, titulo, referencia?, objetivo?, roteiro?}
// POST /api/ebd-sala/planos/atualizar  body:{planoId, titulo, referencia?, objetivo?, roteiro?}
// POST /api/ebd-sala/planos/publicar   body:{planoId}
// POST /api/ebd-sala/planos/despublicar body:{planoId}
// POST /api/ebd-sala/planos/excluir    body:{planoId}
// POST /api/ebd-sala/planos/material   body:{planoId, titulo, url}
// POST /api/ebd-sala/planos/material/remover body:{materialId}
// GET  /api/ebd-sala/ausentes?turmaId=                            -> alunos sem presença há N+ domingos seguidos
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const salaAula = require("../shared/ebdSalaAula");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temEbdGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("ebd_gestao"));
}

// Revisão de escopo: FECHADO — sessão sem a lista de congregações (claim ausente) não é global e não alcança nada. "Global" aqui = escopo de TODAS as congregações.
function temEscopoGlobal(usuario) {
  return usuario.escopoCongregacoes === "TODAS";
}

function nomesPermitidos(usuario) {
  return temEscopoGlobal(usuario) ? null : (Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : []);
}

async function podeAcessarCongregacao(pool, usuario, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  const nome = r.recordset[0] ? r.recordset[0].Nome : null;
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

// Gestor que pode mexer no plano: campo inteiro → escopo global; senão, a
// congregação do plano no escopo.
async function podeGerirPlano(pool, usuario, plano) {
  if (!temEbdGestao(usuario)) return false;
  if (plano.congregacaoId == null) return temEscopoGlobal(usuario);
  return podeAcessarCongregacao(pool, usuario, plano.congregacaoId);
}

// Gestor que pode VER o plano: o do campo inteiro vale para todos, então
// qualquer "ebd_gestao" vê; o de congregação, só no escopo.
async function podeVerPlanoComoGestor(pool, usuario, plano) {
  if (!temEbdGestao(usuario)) return false;
  if (plano.congregacaoId == null) return true;
  return podeAcessarCongregacao(pool, usuario, plano.congregacaoId);
}

async function podeVerTurma(pool, usuario, turma) {
  if (temEbdGestao(usuario) && (await podeAcessarCongregacao(pool, usuario, turma.congregacaoId))) return true;
  if (!usuario.membroId) return false;
  const r = await pool.request().input("turmaId", sql.Int, turma.turmaId).input("membroId", sql.Int, usuario.membroId).query(`
    SELECT TOP 1 1 FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId AND Ativo = 1
  `);
  return r.recordset.length > 0;
}

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body || {};

  // Carrega o plano do corpo e confere se quem age pode geri-lo.
  async function planoGerivel() {
    const planoId = auth.idDeRota(corpo.planoId);
    if (!planoId) { erro(context, 400, "Informe planoId."); return null; }
    const plano = await salaAula.buscarPlanoPorId(pool, planoId);
    if (!plano) { erro(context, 404, "Plano não encontrado."); return null; }
    if (!(await podeGerirPlano(pool, usuario, plano))) {
      erro(context, 403, plano.congregacaoId == null ? "Plano do campo inteiro: só quem tem escopo global pode alterar." : "Fora do seu escopo de atuação.");
      return null;
    }
    return plano;
  }

  try {
    if (acao === "planos" && metodo === "GET") {
      if (!temEbdGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const hoje = salaAula.hojeBrasilia();
      const dataInicio = (req.query && req.query.dataInicio) || hoje;
      const dataFim = (req.query && req.query.dataFim) || dataInicio;
      if (!salaAula.dataIsoValida(dataInicio) || !salaAula.dataIsoValida(dataFim) || dataFim < dataInicio) return erro(context, 400, "Intervalo de datas inválido.");
      if (salaAula.diasEntre(dataInicio, dataFim) > 366) return erro(context, 400, "Intervalo de no máximo 1 ano.");
      const congregacaoBruta = req.query && req.query.congregacaoId;
      const congregacaoId = congregacaoBruta ? auth.idDeRota(congregacaoBruta) : null;
      if (congregacaoBruta && !congregacaoId) return erro(context, 400, "congregacaoId inválido.");
      if (congregacaoId &&!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const planos = await salaAula.listarPlanosGestao(pool, { dataInicio, dataFim, congregacaoId, nomesCongregacoesPermitidas: nomesPermitidos(usuario) });
      context.res = { status: 200, body: { sucesso: true, planos, escopoGlobal: temEscopoGlobal(usuario) } };
      return;
    }

    if (acao === "plano" && metodo === "GET") {
      const planoId = auth.idDeRota(req.query && req.query.planoId);
      if (!planoId) return erro(context, 400, "Informe planoId.");
      const plano = await salaAula.buscarPlanoPorId(pool, planoId);
      if (!plano) return erro(context, 404, "Plano não encontrado.");
      if (!(await podeVerPlanoComoGestor(pool, usuario, plano))) return erro(context, 403, SEM_PERMISSAO);
      context.res = { status: 200, body: { sucesso: true, plano } };
      return;
    }

    if (acao === "planos/turma" && metodo === "GET") {
      const turmaId = auth.idDeRota(req.query && req.query.turmaId);
      const data = (req.query && req.query.data) || salaAula.hojeBrasilia();
      if (!turmaId) return erro(context, 400, "Informe turmaId.");
      if (!salaAula.dataIsoValida(data)) return erro(context, 400, "Data inválida — use AAAA-MM-DD.");
      const turma = await salaAula.buscarTurmaComCongregacao(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      if (!(await podeVerTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      context.res = { status: 200, body: { sucesso: true, data, planos: await salaAula.listarPlanosParaTurma(pool, { turma, data }) } };
      return;
    }

    if (acao === "planos" && metodo === "POST") {
      if (!temEbdGestao(usuario)) return erro(context, 403, SEM_PERMISSAO);
      const congregacaoId = corpo.congregacaoId ? auth.idDeRota(corpo.congregacaoId) : null;
      if (corpo.congregacaoId && !congregacaoId) return erro(context, 400, "congregacaoId inválido.");
      if (congregacaoId == null) {
        if (!temEscopoGlobal(usuario)) return erro(context, 403, "Plano para o campo inteiro exige escopo global — escolha a sua congregação.");
      } else if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) {
        return erro(context, 403, "Fora do seu escopo de atuação.");
      }
      const resultado = await salaAula.criarPlanoAula(pool, {
        data: corpo.data, congregacaoId, faixaEtaria: corpo.faixaEtaria, titulo: corpo.titulo,
        referencia: corpo.referencia, objetivo: corpo.objetivo, roteiro: corpo.roteiro, criadoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "planos/atualizar" && metodo === "POST") {
      const plano = await planoGerivel();
      if (!plano) return;
      const resultado = await salaAula.atualizarPlanoAula(pool, {
        plano, titulo: corpo.titulo, referencia: corpo.referencia, objetivo: corpo.objetivo, roteiro: corpo.roteiro, membroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if ((acao === "planos/publicar" || acao === "planos/despublicar") && metodo === "POST") {
      const plano = await planoGerivel();
      if (!plano) return;
      const resultado = await salaAula.alterarPublicacaoPlano(pool, { plano, publicar: acao === "planos/publicar", membroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "planos/excluir" && metodo === "POST") {
      const plano = await planoGerivel();
      if (!plano) return;
      const resultado = await salaAula.excluirPlanoAula(pool, { plano, membroId: usuario.membroId });
      context.res = { status: 200, body: resultado };
      return;
    }

    if (acao === "planos/material" && metodo === "POST") {
      const plano = await planoGerivel();
      if (!plano) return;
      const resultado = await salaAula.adicionarMaterial(pool, { plano, titulo: corpo.titulo, url: corpo.url, membroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "planos/material/remover" && metodo === "POST") {
      const materialId = auth.idDeRota(corpo.materialId);
      if (!materialId) return erro(context, 400, "Informe materialId.");
      const material = await salaAula.buscarMaterialPorId(pool, materialId);
      if (!material) return erro(context, 404, "Material não encontrado.");
      const plano = await salaAula.buscarPlanoPorId(pool, material.planoId);
      if (!plano) return erro(context, 404, "Plano não encontrado.");
      if (!(await podeGerirPlano(pool, usuario, plano))) return erro(context, 403, SEM_PERMISSAO);
      const resultado = await salaAula.removerMaterial(pool, { material, membroId: usuario.membroId });
      context.res = { status: 200, body: resultado };
      return;
    }

    if (acao === "ausentes" && metodo === "GET") {
      const turmaId = auth.idDeRota(req.query && req.query.turmaId);
      if (!turmaId) return erro(context, 400, "Informe turmaId.");
      const turma = await salaAula.buscarTurmaComCongregacao(pool, turmaId);
      if (!turma) return erro(context, 404, "Turma não encontrada.");
      if (!(await podeVerTurma(pool, usuario, turma))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await salaAula.listarAusentesDaTurma(pool, turmaId);
      context.res = { status: 200, body: { sucesso: true, turmaId, ...resultado } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdSalaAula] erro:", e);
    erro(context, 500, "Erro interno ao processar a sala de aula da EBD.");
  }
};
