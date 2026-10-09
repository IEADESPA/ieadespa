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
// POST /api/escalas/indisponibilidade  body: {dataInicio, dataFim, motivo, liberarEscalas?}  (v7.5: true libera as escalas já marcadas no período,
//                                      sem penalidade, e avisa o líder — Reg. Art. 133 §7º, II; resposta traz { liberadas, conflitosRestantes })
// GET  /api/escalas/indisponibilidade-conflitos?dataInicio=&dataFim= -> (v7.5) as minhas escalas que caem no período, antes de declarar
// Rodízio voluntário, Termo de Adesão, remoção da escala: ver GestaoVoluntariado (v7.5).
// POST /api/escalas/trocas             body: {alocacaoOrigemId, membroDestinoId} -> pede troca (dono da alocação)
// GET  /api/escalas/trocas?equipeId=                         -> fila de trocas pendentes (líder da equipe / 'escalas')
// POST /api/escalas/trocas-aprovar     body: {trocaId, aprovar, observacao}       -> líder da equipe decide
// GET  /api/escalas/pendencias-confirmacao?equipeId=         -> quem não confirmou (líder da equipe / 'escalas')
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const es = require("../shared/escalas");
const trilhas = require("../shared/trilhas");
const cal = require("../shared/calendario");
const vdb = require("../shared/voluntariadoDb");
const adesaoMenor = require("../shared/adesaoMenor");
const mmDb = require("../shared/ministerioMenoresDb");
const { isoInstante } = require("../shared/canaisDb");
const { enviarCanaisNotificacao } = require("../shared/notificacaoMotor");

const CAMPOS_ID = ["servicoId", "alocacaoId", "alocacaoOrigemId", "membroDestinoId", "trocaId", "equipeId", "membroId", "congregacaoId", "liderMembroId"];
// v7.7: rota nova → criancas-previstas (POST {servicoId, equipeId, criancas}); servicos-detalhe passa a trazer `menores` (as salas com menores do serviço);
// publicar recusa (422 com `problemas`) a sala com menores sem dois adultos habilitados ou fora da proporção.

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeGerenciarCongregacao(pool, usuario, congregacaoId) {
  if (!auth.temPermissao(usuario, "escalas")) return false;
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

// Líder da equipe (dono do posto) OU alguém com a permissão geral de
// escalas (Presidente/Secretário Geral) sempre pode agir por cima — mesmo
// princípio de "nível mais alto cobre o de baixo" usado no resto do
// sistema (shared/escopo.js::membroAutorizadoNoOrgaoLocal).
// v7.5 (achado da revisão de segurança): a permissão "escalas" só vale na congregação que o ESCOPO de quem pede alcança. Antes, quem a tinha
// agia em QUALQUER congregação (incluir voluntário em equipe alheia, aprovar troca, ver pendências).
async function ehLiderOuAdmin(pool, usuario, equipe) {
  if (!equipe) return false;
  // O líder removido da própria equipe (Art. 133-D) perde os poderes de líder dela até ser reintegrado.
  if (await vdb.liderAtivo(pool, { equipe, membroId: usuario.membroId })) return true;
  return auth.temPermissao(usuario, "escalas") && auth.estaNoEscopo(usuario, equipe.congregacaoNome);
}

// Texto livre que vai para coluna de tamanho fixo: recusa o que não é texto ou passa do limite (antes estourava o banco e virava erro 500).
function textoValido(valor, max) {
  if (valor == null || valor === "") return { ok: true, valor: null };
  if (typeof valor !== "string") return { ok: false };
  const v = valor.trim();
  return v.length <= max ? { ok: true, valor: v || null } : { ok: false };
}
function inteiroEntre(valor, min, max) {
  if (valor == null || valor === "") return { ok: true, valor: null };
  if (typeof valor === "boolean" || typeof valor === "object") return { ok: false };
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? { ok: true, valor: n } : { ok: false };
}

module.exports = async function (context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // v7.6 — escopo, nível e departamento conferidos adiante são os da permissão escalas (a visão só com as concessões que a têm; ver shared/auth.js,
  // "Concessões"), não o somado de outro cargo ou delegação. Sem a permissão, a sessão inteira (quem usa a rota como aluno, professor, membro...).
  const usuario = auth.visaoDaPermissao(sessao, "escalas") || sessao;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  // v7.5 (achado da revisão): todo identificador que chega de fora precisa ser um número inteiro positivo. "abc", lista, objeto, booleano ou número
  // gigante chegavam ao banco e viravam erro 500; agora são recusados na entrada.
  const ehIdRuim = (v) => v != null && v !== "" && !((typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v.trim()))) && Number(v) >= 1 && Number(v) <= 2147483647);
  for (const campo of CAMPOS_ID) {
    for (const origem of [req.body, req.query]) {
      if (origem && typeof origem === "object" && !Array.isArray(origem) && campo in origem && ehIdRuim(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }

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
        if (!textoValido(nome, 100).ok || !inteiroEntre(congregacaoId, 1, 2147483647).ok || !inteiroEntre(liderMembroId, 1, 2147483647).ok) return erro(context, 400, "Dados inválidos: o nome aceita até 100 caracteres e as matrículas são números.");
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
      if (!(await ehLiderOuAdmin(pool, usuario, equipe))) {
        return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");
      }
      if (metodo === "GET") {
        context.res = { status: 200, body: { sucesso: true, membros: await es.listarMembrosEquipe(pool, equipeId) } };
        return;
      }
      if (metodo === "POST") {
        const { membroId, frequenciaPreferidaDias } = req.body || {};
        if (!membroId) return erro(context, 400, "Informe membroId.");
        if (!inteiroEntre(membroId, 1, 2147483647).ok || !inteiroEntre(frequenciaPreferidaDias, 1, 365).ok) return erro(context, 400, "Dados inválidos: a matrícula é um número e a frequência vai de 1 a 365 dias.");
        // v7.5 (Art. 133-D): quem foi removido da escala desta equipe não volta por outra porta — só pela reintegração.
        const removido = await vdb.removidoDaEquipe(pool, { membroId: Number(membroId), equipeId });
        if (removido) return erro(context, 422, vdb.mensagemRemovido(removido, await vdb.nomeDoMembro(pool, Number(membroId))));
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
        if (!inteiroEntre(congregacaoId, 1, 2147483647).ok || typeof dataHora !== "string" || Number.isNaN(Date.parse(dataHora)) || !textoValido(descricao, 200).ok || !inteiroEntre(prazoConfirmacaoDias, 1, 30).ok) {
          return erro(context, 400, "Dados inválidos: informe uma data e hora válidas, descrição de até 200 caracteres e prazo de 1 a 30 dias.");
        }
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
      // v7.7: as salas com menores deste serviço (crianças previstas, adultos habilitados, quantos são necessários) para o líder ver antes de publicar.
      const menores = await mmDb.avaliarPublicacao(pool, servicoId);
      context.res = { status: 200, body: { sucesso: true, servico, alocacoes, menores } };
      return;
    }

    // v7.7 — quantas crianças a sala espera naquele serviço (a proporção adulto/criança só se confere com esse número). O líder da equipe ou quem administra escalas.
    if (acao === "criancas-previstas" && metodo === "POST") {
      const { servicoId, equipeId, criancas } = req.body || {};
      if (!servicoId || !equipeId) return erro(context, 400, "Informe servicoId e equipeId.");
      const servico = await es.buscarServico(pool, servicoId);
      const equipe = await es.buscarEquipe(pool, equipeId);
      // 404 igual para "não existe" e "não é desta congregação": quem pergunta não descobre serviços nem equipes alheias.
      if (!servico || !equipe || Number(servico.congregacaoId) !== Number(equipe.congregacaoId)) return erro(context, 404, "Serviço ou equipe não encontrados.");
      if (!(await ehLiderOuAdmin(pool, usuario, equipe))) return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");
      if (servico.status === "CANCELADA") return erro(context, 422, "Este serviço foi cancelado.");
      if (!(await mmDb.equipeComMenores(pool, equipe.equipeId))) return erro(context, 422, "Esta equipe não está marcada como contato com menores.");
      const resultado = await mmDb.definirCriancasPrevistas(pool, { servicoId: Number(servicoId), equipeId: Number(equipeId), criancas, por: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Auto-escalador ----
    if (acao === "auto-escalar" && metodo === "POST") {
      const { servicoId } = req.body || {};
      if (!servicoId) return erro(context, 400, "Informe servicoId.");
      const servico = await es.buscarServico(pool, servicoId);
      if (!servico) return erro(context, 404, "Serviço não encontrado.");
      if (!(await podeGerenciarCongregacao(pool, usuario, servico.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      // v7.5: o serviço de rodízio já nasce escalado com o grupo da vez; o auto-escalador traria gente de fora do revezamento.
      if (servico.rodizioId) return erro(context, 422, "Este serviço é de um rodízio voluntário: a escala é do grupo da vez (Regimento Art. 135 §1º), e o auto-escalador não mexe nele.");

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
      // v7.7 (Lei 14.811/2024): sala com menores não publica com um adulto sozinho nem fora da proporção por faixa etária. Não é alerta: é bloqueio.
      const conformidade = await mmDb.avaliarPublicacao(pool, servicoId);
      if (!conformidade.ok) {
        context.res = { status: 422, body: { sucesso: false, mensagem: `Não dá para publicar: ${conformidade.problemas.map(p => p.mensagem).join(" ")}`, problemas: conformidade.problemas, salas: conformidade.salas } };
        return;
      }
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
      // Só responde quem ainda está convidado ou aceito: recusar de novo (ou uma escala cancelada) reenviaria o convite em cadeia ao próximo da fila.
      if (!["CONVIDADO", "ACEITO"].includes(alocacao.status)) return erro(context, 422, "Este convite já foi respondido ou a escala foi cancelada.");
      // 03/10/2026: menor sem adesão que valha (nunca dada, ou suspensa: ficou sem responsável ativo) não ACEITA escala; recusar continua livre.
      if (resposta === "ACEITO") {
        const semAdesao = await adesaoMenor.menoresSemAdesaoVigente(pool, [alocacao.membroId]);
        if (semAdesao.has(Number(alocacao.membroId))) return erro(context, 422, semAdesao.get(Number(alocacao.membroId)));
        // v7.7 (Lei 14.811/2024): equipe com menores só aceita quem está habilitado hoje (certidões em dia, treinamento, política, 6 meses...).
        const menores = await mmDb.conferirParaServir(pool, { equipeId: alocacao.equipeId, membroId: alocacao.membroId, visao: "PROPRIO" });
        if (!menores.ok) return erro(context, 422, menores.mensagem);
      }
      await es.responderConvite(pool, alocacaoId, resposta);

      // Convite em cadeia: recusou, convida automaticamente o próximo
      // elegível da mesma equipe/serviço — e já avisa o novo convidado
      // (vB.2/vB.5: e-mail/push imediato, não espera a rodada diária do
      // avaliador de regras).
      if (resposta === "RECUSADO") {
        const servico = await es.buscarServico(pool, alocacao.servicoId);
        // v7.5: no rodízio a vaga não é repassada a quem é de outro grupo — o líder é avisado e decide (recusar é direito, sem penalidade).
        if (servico.rodizioId) {
          await vdb.avisarRecusaEmRodizio(pool, { alocacao, servico });
          context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Resposta registrada. O líder da equipe foi avisado — recusar é um direito seu, sem penalidade." } };
          return;
        }
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
      const semAdesao = await adesaoMenor.menoresSemAdesaoVigente(pool, [alocacao.membroId]);       // 03/10/2026: idem ao aceitar
      if (semAdesao.has(Number(alocacao.membroId))) return erro(context, 422, semAdesao.get(Number(alocacao.membroId)));
      const menores = await mmDb.conferirParaServir(pool, { equipeId: alocacao.equipeId, membroId: alocacao.membroId, visao: "PROPRIO" });       // v7.7: idem ao aceitar
      if (!menores.ok) return erro(context, 422, menores.mensagem);
      await es.confirmarRecebimento(pool, alocacaoId);
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Recebimento confirmado." } };
      return;
    }

    // ---- Indisponibilidade declarada pelo voluntário (afastamento temporário, Reg. Art. 133 §7º, II) ----
    // v7.5: declarar o afastamento libera, se a pessoa quiser, as escalas já marcadas no período — sem penalidade — e avisa o líder da vaga.
    if (acao === "indisponibilidade-conflitos" && metodo === "GET") {
      const dataInicio = String((req.query && req.query.dataInicio) || ""), dataFim = String((req.query && req.query.dataFim) || "");
      if (!cal.dataIsoValida(dataInicio) || !cal.dataIsoValida(dataFim) || dataFim < dataInicio) return erro(context, 400, "Informe dataInicio e dataFim válidas (AAAA-MM-DD), com o fim depois do início.");
      const conflitos = await vdb.conflitosDoAfastamento(pool, { membroId: usuario.membroId, dataInicio, dataFim });
      context.res = { status: 200, body: { sucesso: true, conflitos: conflitos.map(c => ({ alocacaoId: c.alocacaoId, equipeNome: c.equipeNome, descricao: c.descricao, dataHora: isoInstante(c.dataHora), status: c.status })) } };
      return;
    }
    if (acao === "indisponibilidade") {
      if (metodo === "GET") {
        context.res = { status: 200, body: { sucesso: true, indisponibilidades: await es.listarIndisponibilidades(pool, usuario.membroId) } };
        return;
      }
      if (metodo === "POST") {
        const { dataInicio, dataFim, motivo, liberarEscalas } = req.body || {};
        if (!dataInicio || !dataFim) return erro(context, 400, "Informe dataInicio e dataFim.");
        if (typeof dataInicio !== "string" || typeof dataFim !== "string" || !cal.dataIsoValida(dataInicio) || !cal.dataIsoValida(dataFim) || dataFim < dataInicio) return erro(context, 400, "Datas inválidas: use AAAA-MM-DD, com o fim depois do início.");
        if (!textoValido(motivo, 200).ok) return erro(context, 400, "O motivo aceita até 200 caracteres.");
        const indisponibilidadeId = await es.criarIndisponibilidade(pool, { membroId: usuario.membroId, dataInicio, dataFim, motivo });
        let liberadas = 0;
        const conflitos = await vdb.conflitosDoAfastamento(pool, { membroId: usuario.membroId, dataInicio: String(dataInicio), dataFim: String(dataFim) });
        if (liberarEscalas === true && conflitos.length) liberadas = (await vdb.liberarPorAfastamento(pool, { membroId: usuario.membroId, dataInicio: String(dataInicio), dataFim: String(dataFim), por: usuario.membroId })).liberadas;
        context.res = {
          status: 201,
          body: {
            sucesso: true, indisponibilidadeId, liberadas, conflitosRestantes: conflitos.length - liberadas,
            mensagem: liberadas ? `✅ Afastamento registrado e ${liberadas} escala(s) liberada(s). O líder foi avisado — é um direito seu, sem penalidade.` : conflitos.length ? `✅ Afastamento registrado, mas você ainda tem ${conflitos.length} escala(s) marcada(s) no período.` : "✅ Indisponibilidade declarada."
          }
        };
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
        if (!es.STATUS_ALOCACAO_ATIVOS.includes(alocacao.status)) return erro(context, 422, "Esta escala não está mais ativa.");
        // O destino precisa ser da equipe, estar ativo nela e não ter sido removido da escala dela (Art. 133-D). A recusa não diz qual dos motivos foi.
        const destinoId = Number(membroDestinoId);
        const destinoAtivo = (await pool.request().input("e", sql.Int, alocacao.equipeId).input("m", sql.Int, destinoId)
          .query(`SELECT 1 AS ok FROM EscalasEquipeMembros WHERE EquipeId = @e AND MembroId = @m AND Ativo = 1`)).recordset.length > 0;
        if (destinoId === Number(usuario.membroId) || !destinoAtivo || await vdb.removidoDaEquipe(pool, { membroId: destinoId, equipeId: alocacao.equipeId })) {
          return erro(context, 422, "O voluntário destino não pode assumir esta escala.");
        }
        const servico = await es.buscarServico(pool, alocacao.servicoId);
        const indisponibilidades = await es.listarIndisponibilidades(pool, membroDestinoId);
        const alocacoesDoServico = await es.buscarAlocacoesAtivasDoServico(pool, alocacao.servicoId);
        const validacao = es.validarTroca({
          servicoId: alocacao.servicoId, equipeId: alocacao.equipeId, membroDestinoId, dataServico: servico.dataHora,
          indisponibilidadesDestino: indisponibilidades, alocacoesDoServico
        });
        if (!validacao.valido) return erro(context, 422, validacao.mensagem);
        // v6.9 — o destino da troca também precisa atender à formação que a equipe exige.
        const formacao = await trilhas.filtrarMembrosQueAtendem(pool, { contexto: "ESCALA_EQUIPE", alvoChave: String(alocacao.equipeId), membroIds: [membroDestinoId] });
        if (formacao.bloqueados.has(Number(membroDestinoId))) return erro(context, 422, formacao.bloqueados.get(Number(membroDestinoId)));
        const destinoSemAdesao = await adesaoMenor.menoresSemAdesaoVigente(pool, [destinoId]);     // 03/10/2026: menor sem adesão que valha não assume escala
        if (destinoSemAdesao.has(destinoId)) return erro(context, 422, destinoSemAdesao.get(destinoId));
        const destinoMenores = await mmDb.conferirParaServir(pool, { equipeId: alocacao.equipeId, membroId: destinoId });       // v7.7: o destino também precisa estar habilitado
        if (!destinoMenores.ok) return erro(context, 422, destinoMenores.mensagem);
        const trocaId = await es.criarTroca(pool, { alocacaoOrigemId, membroDestinoId, solicitadaPorMembroId: usuario.membroId });
        context.res = { status: 201, body: { sucesso: true, trocaId, mensagem: "✅ Pedido de troca enviado ao líder da equipe." } };
        return;
      }
      if (metodo === "GET") {
        const equipeId = Number(req.query && req.query.equipeId);
        if (!equipeId) return erro(context, 400, "Informe equipeId.");
        const equipe = await es.buscarEquipe(pool, equipeId);
        if (!equipe) return erro(context, 404, "Equipe não encontrada.");
        if (!(await ehLiderOuAdmin(pool, usuario, equipe))) return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");
        context.res = { status: 200, body: { sucesso: true, trocas: await es.listarTrocasPendentesDaEquipe(pool, equipeId) } };
        return;
      }
    }

    if (acao === "trocas-aprovar" && metodo === "POST") {
      const { trocaId, aprovar, observacao } = req.body || {};
      if (!trocaId || typeof aprovar !== "boolean") return erro(context, 400, "Informe trocaId e aprovar (true/false).");
      if (!inteiroEntre(trocaId, 1, 2147483647).ok || !textoValido(observacao, 300).ok) return erro(context, 400, "Dados inválidos: a observação aceita até 300 caracteres.");
      const troca = await es.buscarTroca(pool, trocaId);
      if (!troca) return erro(context, 404, "Troca não encontrada.");
      const equipe = await es.buscarEquipe(pool, troca.equipeId);
      if (!(await ehLiderOuAdmin(pool, usuario, equipe))) return erro(context, 403, "Só o líder da equipe pode aprovar/recusar trocas.");
      // 03/10/2026: entre o pedido e a aprovação o destino pode ter ficado sem adesão que valha (menor cujo último responsável foi revogado): não aprova.
      if (aprovar && troca.status === "PENDENTE") {
        const destinoSemAdesao = await adesaoMenor.menoresSemAdesaoVigente(pool, [troca.membroDestinoId]);
        if (destinoSemAdesao.has(Number(troca.membroDestinoId))) return erro(context, 422, `Não dá para aprovar: ${destinoSemAdesao.get(Number(troca.membroDestinoId))}`);
        // v7.7: e entre o pedido e a aprovação a habilitação do destino pode ter vencido.
        const destinoMenores = await mmDb.conferirParaServir(pool, { equipeId: troca.equipeId, membroId: troca.membroDestinoId, visao: "LIDER" });
        if (!destinoMenores.ok) return erro(context, 422, `Não dá para aprovar: ${destinoMenores.mensagem}`);
      }
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
      if (!(await ehLiderOuAdmin(pool, usuario, equipe))) return erro(context, 403, "Só o líder da equipe ou quem administra escalas.");

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
