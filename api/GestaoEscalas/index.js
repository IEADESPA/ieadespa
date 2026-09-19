// GestaoEscalas (v5.6 — Escalas de Serviço com Auto-Escalador)
//
// A grade em si é só a metade fácil do problema; a outra metade — que hoje
// vira corrente de WhatsApp e o secretário refazendo tudo na mão — é:
// indisponibilidade declarada (a escala nunca sugere quem avisou que não
// pode), troca entre voluntários com aprovação do líder da equipe (tira o
// secretário do meio), auto-escalador por "quem serviu por último" +
// frequência preferida com conflito entre equipes detectado, convite em
// cadeia quando alguém recusa, e publicação + confirmação de recebimento
// (quem não confirma até X dias vira pendência do líder).
//
// GET  /api/escalas/equipes?congregacaoId=                 -> lista equipes da congregação
// POST /api/escalas/equipes            body: {nome, congregacaoId, liderMembroId}
// GET  /api/escalas/equipes-membros?equipeId=               -> membros da equipe
// POST /api/escalas/equipes-membros    body: {equipeId, membroId, frequenciaPreferidaDias}
// GET  /api/escalas/servicos?congregacaoId=                 -> lista serviços da congregação
// POST /api/escalas/servicos           body: {congregacaoId, dataHora, descricao, prazoConfirmacaoDias}
// GET  /api/escalas/servicos-detalhe?servicoId=              -> serviço + alocações por equipe
// POST /api/escalas/auto-escalar       body: {servicoId}   -> roda o auto-escalador (convida o topo da fila por equipe)
// POST /api/escalas/publicar           body: {servicoId}   -> publica (RASCUNHO -> PUBLICADA), inicia prazo de confirmação
// POST /api/escalas/responder          body: {alocacaoId, resposta: 'ACEITO'|'RECUSADO'} -> voluntário aceita/recusa (dono da alocação)
// POST /api/escalas/confirmar          body: {alocacaoId}  -> voluntário confirma recebimento (dono da alocação)
// GET  /api/escalas/indisponibilidade                        -> minhas indisponibilidades declaradas
// POST /api/escalas/indisponibilidade  body: {dataInicio, dataFim, motivo}
// POST /api/escalas/trocas             body: {alocacaoOrigemId, membroDestinoId} -> pede troca (dono da alocação)
// GET  /api/escalas/trocas?equipeId=                         -> fila de trocas pendentes (líder da equipe / 'escalas')
// POST /api/escalas/trocas-aprovar     body: {trocaId, aprovar, observacao}       -> líder da equipe decide
// GET  /api/escalas/pendencias-confirmacao?equipeId=         -> quem não confirmou (líder da equipe / 'escalas')
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const es = require("../shared/escalas");
const { enviarCanaisNotificacao } = require("../shared/notificacaoMotor");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeGerenciarCongregacao(pool, usuario, congregacaoId) {
  if (!usuario.permissoes || !usuario.permissoes.includes("escalas")) return false;
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

// Líder da equipe (dono do posto) OU alguém com a permissão geral de
// escalas (Presidente/Secretário Geral) sempre pode agir por cima — mesmo
// princípio de "nível mais alto cobre o de baixo" usado no resto do
// sistema (shared/escopo.js::membroAutorizadoNoOrgaoLocal).
function ehLiderOuAdmin(usuario, equipe) {
  if (usuario.permissoes && usuario.permissoes.includes("escalas")) return true;
  return equipe && Number(equipe.liderMembroId) === Number(usuario.membroId);
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Equipes ----
    if (acao === "equipes") {
      if (metodo === "GET") {
        const congregacaoId = Number(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const nome = await nomeCongregacao(pool, congregacaoId);
        if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, equipes: await es.listarEquipes(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { nome, congregacaoId, liderMembroId } = req.body || {};
        if (!nome || !congregacaoId || !liderMembroId) return erro(context, 400, "Informe nome, congregacaoId e liderMembroId.");
        if (!(await podeGerenciarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        const equipeId = await es.criarEquipe(pool, { nome, congregacaoId, liderMembroId });
        context.res = { status: 201, body: { sucesso: true, equipeId } };
        return;
      }
    }

    // ---- Membros da equipe ----
    if (acao === "equipes-membros") {
      const equipeId = Number((req.query && req.query.equipeId) || (req.body && req.body.equipeId));
      if (!equipeId) return erro(context, 400, "Informe equipeId.");
      const equipe = await es.buscarEquipe(pool, equipeId);
      if (!equipe) return erro(context, 404, "Equipe não encontrada.");
      if (!ehLiderOuAdmin(usuario, equipe) && !(usuario.permissoes && usuario.permissoes.includes("escalas"))) {
        return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");
      }
      if (metodo === "GET") {
        context.res = { status: 200, body: { sucesso: true, membros: await es.listarMembrosEquipe(pool, equipeId) } };
        return;
      }
      if (metodo === "POST") {
        const { membroId, frequenciaPreferidaDias } = req.body || {};
        if (!membroId) return erro(context, 400, "Informe membroId.");
        await es.adicionarMembroEquipe(pool, { equipeId, membroId, frequenciaPreferidaDias });
        context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Voluntário incluído na equipe." } };
        return;
      }
    }

    // ---- Serviços ----
    if (acao === "servicos") {
      if (metodo === "GET") {
        const congregacaoId = Number(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const nome = await nomeCongregacao(pool, congregacaoId);
        if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, servicos: await es.listarServicos(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { congregacaoId, dataHora, descricao, prazoConfirmacaoDias } = req.body || {};
        if (!congregacaoId || !dataHora) return erro(context, 400, "Informe congregacaoId e dataHora.");
        if (!(await podeGerenciarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        const servicoId = await es.criarServico(pool, { congregacaoId, dataHora, descricao, prazoConfirmacaoDias, criadoPorMembroId: usuario.membroId });
        context.res = { status: 201, body: { sucesso: true, servicoId } };
        return;
      }
    }

    if (acao === "servicos-detalhe" && metodo === "GET") {
      const servicoId = Number(req.query && req.query.servicoId);
      if (!servicoId) return erro(context, 400, "Informe servicoId.");
      const servico = await es.buscarServico(pool, servicoId);
      if (!servico) return erro(context, 404, "Serviço não encontrado.");
      const nome = await nomeCongregacao(pool, servico.congregacaoId);
      if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      const alocacoes = await es.buscarAlocacoesAtivasDoServico(pool, servicoId);
      context.res = { status: 200, body: { sucesso: true, servico, alocacoes } };
      return;
    }

    // ---- Auto-escalador ----
    if (acao === "auto-escalar" && metodo === "POST") {
      const { servicoId } = req.body || {};
      if (!servicoId) return erro(context, 400, "Informe servicoId.");
      const servico = await es.buscarServico(pool, servicoId);
      if (!servico) return erro(context, 404, "Serviço não encontrado.");
      if (!(await podeGerenciarCongregacao(pool, usuario, servico.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");

      const equipes = await es.listarEquipes(pool, servico.congregacaoId);
      const equipesComCandidatos = [];
      for (const equipe of equipes) {
        if (!equipe.ativa) continue;
        equipesComCandidatos.push({ equipeId: equipe.equipeId, candidatos: await es.buscarCandidatosDaEquipe(pool, equipe.equipeId, servico.dataHora) });
      }
      const alocacoesExistentes = await es.buscarAlocacoesAtivasDoServico(pool, servicoId);
      const plano = es.autoEscalarServico({ dataServico: servico.dataHora, equipes: equipesComCandidatos, alocacoesExistentes });

      for (const item of plano) {
        if (item.convidadoAtual) await es.gravarAlocacao(pool, { servicoId, equipeId: item.equipeId, membroId: item.convidadoAtual, ordemConvite: 1 });
      }
      context.res = { status: 200, body: { sucesso: true, plano } };
      return;
    }

    // ---- Publicação ----
    if (acao === "publicar" && metodo === "POST") {
      const { servicoId } = req.body || {};
      if (!servicoId) return erro(context, 400, "Informe servicoId.");
      const servico = await es.buscarServico(pool, servicoId);
      if (!servico) return erro(context, 404, "Serviço não encontrado.");
      if (!(await podeGerenciarCongregacao(pool, usuario, servico.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      await es.publicarServico(pool, servicoId);
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Escala publicada. Prazo de confirmação em andamento." } };
      return;
    }

    // ---- "Minhas Escalas" (hook do Portal do Membro, vB.5) ----
    if (acao === "minhas-alocacoes" && metodo === "GET") {
      context.res = { status: 200, body: { sucesso: true, alocacoes: await es.listarAlocacoesDoMembro(pool, usuario.membroId) } };
      return;
    }

    // ---- Resposta do voluntário (aceitar/recusar convite) ----
    if (acao === "responder" && metodo === "POST") {
      const { alocacaoId, resposta } = req.body || {};
      if (!alocacaoId || !["ACEITO", "RECUSADO"].includes(resposta)) return erro(context, 400, "Informe alocacaoId e resposta ('ACEITO' ou 'RECUSADO').");
      const alocacao = await es.buscarAlocacao(pool, alocacaoId);
      if (!alocacao) return erro(context, 404, "Convite não encontrado.");
      if (Number(alocacao.membroId) !== Number(usuario.membroId)) return erro(context, 403, "Este convite não é seu.");
      await es.responderConvite(pool, alocacaoId, resposta);

      // Convite em cadeia: recusou, convida automaticamente o próximo
      // elegível da mesma equipe/serviço — e já avisa o novo convidado
      // (vB.2/vB.5: e-mail/push imediato, não espera a rodada diária do
      // avaliador de regras).
      if (resposta === "RECUSADO") {
        const servico = await es.buscarServico(pool, alocacao.servicoId);
        const candidatos = await es.buscarCandidatosDaEquipe(pool, alocacao.equipeId, servico.dataHora);
        const alocacoesExistentes = await es.buscarAlocacoesAtivasDoServico(pool, alocacao.servicoId);
        const fila = es.ordenarCandidatosElegiveis(candidatos, servico.dataHora)
          .map(c => c.membroId)
          .filter(id => !alocacoesExistentes.some(a => a.membroId === id && a.equipeId !== alocacao.equipeId && es.STATUS_ALOCACAO_ATIVOS.includes(a.status)));
        const { proximoConvidado } = es.proximoConviteAposRecusa(fila, alocacao.membroId, []);
        if (proximoConvidado) {
          await es.gravarAlocacao(pool, { servicoId: alocacao.servicoId, equipeId: alocacao.equipeId, membroId: proximoConvidado, ordemConvite: (alocacao.ordemConvite || 1) + 1 });
          const destino = (await pool.request().input("id", sql.Int, proximoConvidado).query(`SELECT Nome, Email FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
          if (destino) {
            const titulo = "Convite de escala em cadeia";
            const mensagem = `Você foi convidado pra servir em ${new Date(servico.dataHora).toLocaleString("pt-BR")} (${servico.descricao || "serviço"}) — o voluntário anterior não pôde.`;
            await enviarCanaisNotificacao(pool, { regraChave: "ESCALA_CONVITE_CADEIA", destinatarioMembroId: proximoConvidado, notificacaoId: null, titulo, mensagem, categoria: "ESCALAS", email: destino.Email });
          }
        }
      }
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Resposta registrada." } };
      return;
    }

    // ---- Confirmação de recebimento ----
    if (acao === "confirmar" && metodo === "POST") {
      const { alocacaoId } = req.body || {};
      if (!alocacaoId) return erro(context, 400, "Informe alocacaoId.");
      const alocacao = await es.buscarAlocacao(pool, alocacaoId);
      if (!alocacao) return erro(context, 404, "Alocação não encontrada.");
      if (Number(alocacao.membroId) !== Number(usuario.membroId)) return erro(context, 403, "Esta alocação não é sua.");
      await es.confirmarRecebimento(pool, alocacaoId);
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Recebimento confirmado." } };
      return;
    }

    // ---- Indisponibilidade declarada pelo voluntário ----
    if (acao === "indisponibilidade") {
      if (metodo === "GET") {
        context.res = { status: 200, body: { sucesso: true, indisponibilidades: await es.listarIndisponibilidades(pool, usuario.membroId) } };
        return;
      }
      if (metodo === "POST") {
        const { dataInicio, dataFim, motivo } = req.body || {};
        if (!dataInicio || !dataFim) return erro(context, 400, "Informe dataInicio e dataFim.");
        const indisponibilidadeId = await es.criarIndisponibilidade(pool, { membroId: usuario.membroId, dataInicio, dataFim, motivo });
        context.res = { status: 201, body: { sucesso: true, indisponibilidadeId } };
        return;
      }
    }

    // ---- Trocas entre voluntários ----
    if (acao === "trocas") {
      if (metodo === "POST") {
        const { alocacaoOrigemId, membroDestinoId } = req.body || {};
        if (!alocacaoOrigemId || !membroDestinoId) return erro(context, 400, "Informe alocacaoOrigemId e membroDestinoId.");
        const alocacao = await es.buscarAlocacao(pool, alocacaoOrigemId);
        if (!alocacao) return erro(context, 404, "Alocação não encontrada.");
        if (Number(alocacao.membroId) !== Number(usuario.membroId)) return erro(context, 403, "Só quem está escalado nesse posto pode pedir troca.");
        const servico = await es.buscarServico(pool, alocacao.servicoId);
        const indisponibilidades = await es.listarIndisponibilidades(pool, membroDestinoId);
        const alocacoesDoServico = await es.buscarAlocacoesAtivasDoServico(pool, alocacao.servicoId);
        const validacao = es.validarTroca({
          servicoId: alocacao.servicoId, equipeId: alocacao.equipeId, membroDestinoId, dataServico: servico.dataHora,
          indisponibilidadesDestino: indisponibilidades, alocacoesDoServico
        });
        if (!validacao.valido) return erro(context, 422, validacao.mensagem);
        const trocaId = await es.criarTroca(pool, { alocacaoOrigemId, membroDestinoId, solicitadaPorMembroId: usuario.membroId });
        context.res = { status: 201, body: { sucesso: true, trocaId, mensagem: "✅ Pedido de troca enviado ao líder da equipe." } };
        return;
      }
      if (metodo === "GET") {
        const equipeId = Number(req.query && req.query.equipeId);
        if (!equipeId) return erro(context, 400, "Informe equipeId.");
        const equipe = await es.buscarEquipe(pool, equipeId);
        if (!equipe) return erro(context, 404, "Equipe não encontrada.");
        if (!ehLiderOuAdmin(usuario, equipe)) return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");
        context.res = { status: 200, body: { sucesso: true, trocas: await es.listarTrocasPendentesDaEquipe(pool, equipeId) } };
        return;
      }
    }

    if (acao === "trocas-aprovar" && metodo === "POST") {
      const { trocaId, aprovar, observacao } = req.body || {};
      if (!trocaId || typeof aprovar !== "boolean") return erro(context, 400, "Informe trocaId e aprovar (true/false).");
      const troca = await es.buscarTroca(pool, trocaId);
      if (!troca) return erro(context, 404, "Troca não encontrada.");
      const equipe = await es.buscarEquipe(pool, troca.equipeId);
      if (!ehLiderOuAdmin(usuario, equipe)) return erro(context, 403, "Só o líder da equipe pode aprovar/recusar trocas.");
      const resultado = await es.decidirTroca(pool, { trocaId, aprovar, observacao, decididoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Pendências de confirmação (visão do líder) ----
    if (acao === "pendencias-confirmacao" && metodo === "GET") {
      const equipeId = Number(req.query && req.query.equipeId);
      if (!equipeId) return erro(context, 400, "Informe equipeId.");
      const equipe = await es.buscarEquipe(pool, equipeId);
      if (!equipe) return erro(context, 404, "Equipe não encontrada.");
      if (!ehLiderOuAdmin(usuario, equipe)) return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");

      const alocacoesResult = await pool.request().input("equipeId", sql.Int, equipeId).query(`
        SELECT a.AlocacaoId AS alocacaoId, a.ServicoId AS servicoId, a.EquipeId AS equipeId, a.MembroId AS membroId, a.Status AS status,
               s.PublicadaEm AS publicadaEm, s.PrazoConfirmacaoDias AS prazoConfirmacaoDias
        FROM EscalasAlocacoes a JOIN EscalasServicos s ON s.ServicoId = a.ServicoId
        WHERE a.EquipeId = @equipeId AND s.Status = 'PUBLICADA'
      `);
      const pendentes = [];
      for (const a of alocacoesResult.recordset) {
        const p = es.listarPendenciasConfirmacao([a], a.publicadaEm, a.prazoConfirmacaoDias, new Date());
        pendentes.push(...p);
      }
      context.res = { status: 200, body: { sucesso: true, pendencias: pendentes } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEscalas] erro:", e);
    erro(context, 500, "Erro interno ao processar escalas.");
  }
};
