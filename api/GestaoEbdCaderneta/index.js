// GestaoEbdCaderneta (v6.8 — EBD: Caderneta digital no padrão CPAD)
//
// Continua a FASE 6 (v6.1-v6.7). Ver shared/ebdCaderneta.js pra toda a
// lógica de decisão (pura, testada em isolamento). Três frentes:
//   - a caderneta do domingo (por classe: matriculados, presentes, ausentes,
//     visitantes, Bíblias, revistas, oferta) — tudo derivado da chamada
//     (v6.2) e da oferta (v6.7), menos Bíblias/Revistas, que se digitam aqui;
//   - o fechamento trimestral e o Relatório do Superintendente
//     (Área → Congregação → Turma);
//   - a importação de cadernetas antigas (CSV), com simulação antes.
// O aluno não-membro mora em GestaoEbdTurmas (junto da matrícula).
//
// Permissão — mesma granularidade da chamada (v6.2): salvar Bíblias/Revistas
// de UMA turma e ver a linha dela exige "ebd_gestao" (no escopo) OU ser
// professor ATIVO daquela turma. Tudo que olha a congregação inteira ou
// vários domingos (caderneta do domingo, relatório, fechamento, importação)
// exige "ebd_gestao" dentro do escopo territorial. Nenhuma permissão nova.
//
// GET  /api/ebd-caderneta/caderneta?licaoId=                      -> o domingo inteiro da congregação (todas as classes + totais) — ebd_gestao
// GET  /api/ebd-caderneta/caderneta/turma?licaoId=&turmaId=       -> a linha de UMA classe (tela do professor)
// POST /api/ebd-caderneta/caderneta/salvar  body:{licaoId, turmaId, biblias?, revistas?, observacao?}
// GET  /api/ebd-caderneta/relatorio?trimestre=AAAA-Tn&congregacaoId?  -> Relatório do Superintendente — ebd_gestao
// GET  /api/ebd-caderneta/fechamentos?trimestre?&congregacaoId?       -> trimestres já fechados — ebd_gestao
// POST /api/ebd-caderneta/fechamento         body:{congregacaoId, trimestre}  -> fecha o trimestre — ebd_gestao
// POST /api/ebd-caderneta/fechamento/refazer body:{congregacaoId, trimestre}  -> refaz a foto de um trimestre já fechado — ebd_gestao
// POST /api/ebd-caderneta/importar           body:{csv | linhas, simular?}    -> importa cadernetas antigas (simular é o padrão) — ebd_gestao
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const ebd = require("../shared/ebdTurmas");
const chamada = require("../shared/ebdChamada");
const caderneta = require("../shared/ebdCaderneta");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temEbdGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("ebd_gestao"));
}

function semPermissao(context) {
  return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
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

// Mesma regra da chamada (v6.2): ebd_gestao no escopo da turma OU professor
// ativo dela.
async function podeGerenciarTurma(pool, usuario, turmaId) {
  const turma = await ebd.buscarTurmaPorId(pool, turmaId);
  if (!turma) return false;
  if (temEbdGestao(usuario) && await podeAcessarCongregacao(pool, usuario, turma.congregacaoId)) return true;
  return ehProfessorAtivoDaTurma(pool, usuario.membroId, turmaId);
}

function nomesPermitidos(usuario) {
  return usuario.escopoCongregacoes === "TODAS" ? null : (Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : []);
}

function hojeIso() {
  return require("../shared/dataBrasilia").hojeBrasilia(); // Trava 6-B: dia de Brasília, não do servidor (UTC)
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Caderneta do domingo (congregação inteira) ----
    if (acao === "caderneta" && metodo === "GET") {
      if (!temEbdGestao(usuario)) return semPermissao(context);
      const licaoId = auth.idDeRota(req.query && req.query.licaoId);
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await chamada.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, caderneta: await caderneta.montarCadernetaDaLicao(pool, licaoId) } };
      return;
    }

    // ---- Uma classe (ebd_gestao OU professor ativo da turma) ----
    if (acao === "caderneta/turma" && metodo === "GET") {
      const licaoId = auth.idDeRota(req.query && req.query.licaoId);
      const turmaId = auth.idDeRota(req.query && req.query.turmaId);
      if (!licaoId || !turmaId) return erro(context, 400, "Informe licaoId e turmaId.");
      if (!(await podeGerenciarTurma(pool, usuario, turmaId))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const dados = await caderneta.montarLinhaDaTurma(pool, licaoId, turmaId);
      if (!dados) return erro(context, 404, "Lição não encontrada.");
      // A turma é da congregação da lição? Senão nada da lição (data, status) é devolvido — o
      // professor só enxerga a lição da própria congregação.
      if (!dados.linha) return erro(context, 404, "Esta turma não pertence à congregação desta lição (ou está inativa e sem lançamentos).");
      context.res = { status: 200, body: { sucesso: true, ...dados } };
      return;
    }

    if (acao === "caderneta/salvar" && metodo === "POST") {
      const { biblias, revistas, observacao } = req.body || {};
      const licaoId = auth.idDeRota(req.body && req.body.licaoId);
      const turmaId = auth.idDeRota(req.body && req.body.turmaId);
      if (!licaoId || !turmaId) return erro(context, 400, "Informe licaoId e turmaId.");
      if (!(await podeGerenciarTurma(pool, usuario, turmaId))) return erro(context, 403, "Fora do seu escopo de atuação nesta turma.");
      const resultado = await caderneta.salvarCaderneta(pool, {
        licaoId, turmaId, biblias, revistas, observacao, registradoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Relatório do Superintendente ----
    if (acao === "relatorio" && metodo === "GET") {
      if (!temEbdGestao(usuario)) return semPermissao(context);
      const trimestre = req.query && req.query.trimestre;
      if (!trimestre || !caderneta.intervaloDoTrimestre(trimestre)) return erro(context, 400, "Informe o trimestre no formato AAAA-T1 a AAAA-T4 (ex: 2026-T3).");
      const congregacaoBruta = req.query && req.query.congregacaoId;
      const congregacaoId = congregacaoBruta ? auth.idDeRota(congregacaoBruta) : null;
      if (congregacaoBruta && !congregacaoId) return erro(context, 400, "congregacaoId inválido.");
      if (congregacaoId && !(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const relatorio =await caderneta.gerarRelatorioTrimestre(pool, {
        trimestre, congregacaoId, nomesCongregacoesPermitidas: nomesPermitidos(usuario)
      });
      context.res = { status: 200, body: { sucesso: true, relatorio } };
      return;
    }

    // ---- Fechamento trimestral ----
    if (acao === "fechamentos" && metodo === "GET") {
      if (!temEbdGestao(usuario)) return semPermissao(context);
      const congregacaoBruta = req.query && req.query.congregacaoId;
      const congregacaoId = congregacaoBruta ? auth.idDeRota(congregacaoBruta) : null;
      if (congregacaoBruta && !congregacaoId) return erro(context, 400, "congregacaoId inválido.");
      if (congregacaoId && !(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const fechamentos =await caderneta.listarFechamentos(pool, {
        congregacaoId, trimestre: (req.query && req.query.trimestre) || null, nomesCongregacoesPermitidas: nomesPermitidos(usuario)
      });
      context.res = { status: 200, body: { sucesso: true, fechamentos } };
      return;
    }

    if ((acao === "fechamento" || acao === "fechamento/refazer") && metodo === "POST") {
      if (!temEbdGestao(usuario)) return semPermissao(context);
      const { trimestre } = req.body || {};
      const congregacaoId = auth.idDeRota(req.body && req.body.congregacaoId);
      if (!congregacaoId || !trimestre) return erro(context, 400, "Informe congregacaoId e trimestre.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await caderneta.fecharTrimestre(pool, {
        congregacaoId, trimestre: String(trimestre).trim(),
        origem: caderneta.ORIGEM_FECHAMENTO.MANUAL, fechadoPorMembroId: usuario.membroId, refazer: acao === "fechamento/refazer"
      });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Importação de cadernetas antigas ----
    if (acao === "importar" && metodo === "POST") {
      if (!temEbdGestao(usuario)) return semPermissao(context);
      const { csv, linhas } = req.body || {};
      const simular = !(req.body && req.body.simular === false); // simular é o padrão; gravar exige simular:false explícito
      const lido = csv != null
        ? caderneta.lerCsvImportacao(csv, hojeIso())
        : caderneta.validarLinhasImportacaoJson(linhas, hojeIso());
      if (lido.erroGeral) return erro(context, 422, lido.erroGeral);
      const resultado = await caderneta.importarCadernetas(pool, {
        itens: lido.itens, simular, importadoPorMembroId: usuario.membroId,
        podeCongregacao: (nome) => auth.estaNoEscopo(usuario, nome)
      });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdCaderneta] erro:", e);
    erro(context, 500, "Erro interno ao processar a caderneta da EBD.");
  }
};
