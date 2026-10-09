// GestaoHabilitacaoVoluntarios (v5.7 — Triagem e habilitação de voluntários)
//
// Esteira sequencial de habilitação (ficha de inscrição -> referências
// internas -> entrevista registrada -> antecedentes -> treinamento ->
// termo assinado -> apto), a marcação "contato com menores" por equipe
// (v5.6/EscalasEquipes reaproveitada) e o desligamento de voluntário —
// tudo isso é o pré-requisito direto da v7.7 (Habilitação para Ministério
// com Menores). Ver shared/habilitacaoVoluntarios.js pra toda a lógica de
// decisão (pura, testada em isolamento).
//
// GET  /api/habilitacao-voluntarios/equipes-flag?congregacaoId=        -> equipes da congregação + ContatoComMenores
// POST /api/habilitacao-voluntarios/equipes-flag  body:{equipeId, contatoComMenores}
// GET  /api/habilitacao-voluntarios/lista?congregacaoId=               -> esteiras da congregação, com status calculado
// POST /api/habilitacao-voluntarios/iniciar        body:{membroId, congregacaoId}      -> abre (ou reaproveita) a esteira
// GET  /api/habilitacao-voluntarios/detalhe?membroId=                  -> esteira + status calculado de um voluntário
// POST /api/habilitacao-voluntarios/concluir-etapa body:{habilitacaoId, etapa, observacao, entrevistadorId}
// POST /api/habilitacao-voluntarios/marcar-inapto  body:{habilitacaoId, motivo}
// POST /api/habilitacao-voluntarios/reabilitar     body:{habilitacaoId}
// GET  /api/habilitacao-voluntarios/elegibilidade-menores?membroId=&equipeId= -> hook de leitura pra v7.7 (apto + regra dos 6 meses)
// POST /api/habilitacao-voluntarios/desligamento   body:{membroId, equipeId, tipoMotivo, motivo, removidoDaEscala}
//        (v7.5: com removidoDaEscala:true tem efeito imediato — cancela as escalas futuras e avisa; ver GestaoVoluntariado "remover-da-escala")
// A etapa TERMO da esteira só fecha se o voluntário aderiu ao Termo de Adesão (v7.5; ver GestaoVoluntariado).
// GET  /api/habilitacao-voluntarios/desligamentos?membroId=
// GET  /api/habilitacao-voluntarios/minha-habilitacao                  -> autoatendimento (Meu Painel): minha própria esteira
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const hv = require("../shared/habilitacaoVoluntarios");
const mm = require("../shared/ministerioMenores");
const mmDb = require("../shared/ministerioMenoresDb");
const { registrarAuditoria } = require("../shared/auditoria");
const { carregarPessoa, noEscopoDaPessoa, pessoaAlcancavel, FORA_DO_ESCOPO } = require("../shared/escopoRotas");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

// Revisão de escopo (02/10/2026): fora do escopo = a MESMA resposta de "não existe", para a rota não servir de sonda (quem tem esteira, quem é voluntário, que equipe existe).
const MSG_SEM_ESTEIRA = "Esteira de habilitação não encontrada para este voluntário (ou fora do seu escopo de atuação).";
const MSG_MEMBRO_OU_EQUIPE = "Membro ou equipe não encontrados (ou fora do seu escopo de atuação).";
const foraDoEscopo = (context) => erro(context, 403, FORA_DO_ESCOPO.mensagem);

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeGerenciarCongregacao(pool, usuario, congregacaoId) {
  if (!auth.temPermissao(usuario, "habilitacao_voluntarios")) return false;
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

// Identificador vindo de fora: só número inteiro positivo (texto de dígitos ou número). Booleano, array, objeto, decimal e vazio não valem.
function idValido(v) {
  const ok = (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v.trim()))) && Number(v) >= 1 && Number(v) <= 2147483647 && Number.isInteger(Number(v));
  return ok ? Number(v) : null;
}
const temPermissao = (usuario) => auth.temPermissao(usuario, "habilitacao_voluntarios");

// A pessoa está ATIVA em alguma equipe de uma congregação que o escopo de quem age alcança? (voluntário cadastrado numa congregação que serve em outra)
async function ativoEmEquipeDoEscopo(pool, usuario, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT c.Nome AS CongregacaoNome
    FROM EscalasEquipeMembros em
    JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE em.MembroId = @m AND em.Ativo = 1 AND e.Ativa = 1`);
  return r.recordset.some(x => auth.estaNoEscopo(usuario, x.CongregacaoNome));
}

// Equipe (por id) dentro do escopo? Inexistente ou fora do escopo → false (mesma resposta).
async function equipeNoEscopo(pool, usuario, equipeId) {
  const eq = (await pool.request().input("id", sql.Int, equipeId).query(`SELECT c.Nome AS CongregacaoNome FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId WHERE e.EquipeId = @id`)).recordset[0];
  return !!eq && auth.estaNoEscopo(usuario, eq.CongregacaoNome);
}

// A esteira (por id), se existir E a congregação dela estiver no escopo de quem age; senão null (o chamador responde "não encontrada", igual nos dois casos).
async function esteiraDoEscopo(pool, usuario, habilitacaoId) {
  const id = idValido(habilitacaoId);
  if (!id) return null;
  const habilitacao = await hv.buscarHabilitacaoPorId(pool, id);
  if (!habilitacao) return null;
  const nome = await nomeCongregacao(pool, habilitacao.congregacaoId);
  return nome && auth.estaNoEscopo(usuario, nome) ? habilitacao : null;
}

function comStatusCalculado(hab) {
  if (!hab) return null;
  return { ...hab, statusCalculado: hv.calcularStatusHabilitacao(hab), proximaEtapa: hv.proximaEtapaPendente(hab), etapasConcluidas: hv.etapasConcluidas(hab) };
}

module.exports = async function (context, req) {
  const sessao = auth.exigirLogin(req, context);
  if (!sessao) return;
  // v7.6 — escopo, nível e departamento conferidos adiante são os da permissão habilitacao_voluntarios (a visão só com as concessões que a têm; ver shared/auth.js,
  // "Concessões"), não o somado de outro cargo ou delegação. Sem a permissão, a sessão inteira (quem usa a rota como aluno, professor, membro...).
  const usuario = auth.visaoDaPermissao(sessao, "habilitacao_voluntarios") || sessao;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  // v7.5 (achado da revisão): identificador que chega de fora tem de ser inteiro positivo; "abc", lista, objeto, booleano ou número gigante viravam erro 500.
  for (const campo of ["habilitacaoId", "membroId", "congregacaoId", "equipeId", "entrevistadorId"]) {
    for (const origem of [req.body, req.query]) {
      if (origem && typeof origem === "object" && !Array.isArray(origem) && campo in origem && origem[campo] != null && origem[campo] !== "" && !idValido(origem[campo])) return erro(context, 400, `${campo} inválido.`);
    }
  }

  try {
    // ---- Equipes/ministérios: marcação "contato com menores" ----
    if (acao === "equipes-flag") {
      if (metodo === "GET") {
        // Revisão de escopo: a leitura das equipes e da marca "contato com menores" também exige a permissão (as outras leituras da esteira já exigiam desde a v7.5).
        if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
        const congregacaoId = idValido(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const nome = await nomeCongregacao(pool, congregacaoId);
        if (!nome || !auth.estaNoEscopo(usuario, nome)) return foraDoEscopo(context);
        context.res = { status: 200, body: { sucesso: true, equipes: await hv.listarEquipesComFlag(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { equipeId, contatoComMenores } = req.body || {};
        if (!equipeId || typeof contatoComMenores !== "boolean") return erro(context, 400, "Informe equipeId e contatoComMenores (true/false).");
        if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
        const eqId = idValido(equipeId);
        if (!eqId) return erro(context, 400, "equipeId inválido.");
        const eq = (await pool.request().input("id", sql.Int, eqId).query(`SELECT c.Nome AS CongregacaoNome, e.ContatoComMenores AS ContatoComMenores FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId WHERE e.EquipeId = @id`)).recordset[0];
        // equipe que não existe e equipe fora do escopo: a mesma resposta
        if (!eq || !auth.estaNoEscopo(usuario, eq.CongregacaoNome)) return erro(context, 404, "Equipe não encontrada.");
        // v7.7: desligar a marca derruba todo o portão da equipe (certidões, dois adultos, proporção): pede a confirmação reforçada. Ligar é livre.
        if (!contatoComMenores && eq.ContatoComMenores && !auth.exigirFatorRecente(req, context)) return;
        await hv.atualizarContatoComMenores(pool, eqId, contatoComMenores);
        // v7.7: ao ligar a marca, quem já estava escalado e não está habilitado sai das escalas futuras da equipe na hora (não espera a rotina diária).
        let retirada = null;
        if (contatoComMenores && !eq.ContatoComMenores) { try { retirada = await mmDb.retirarInaptosDasEscalas(pool, { equipeId: eqId }); } catch (e) { context.log.error("[GestaoHabilitacaoVoluntarios] varredura da equipe:", e); } }
        // Desligar a marca "contato com menores" tira a trava do ministério com menores: a mudança deixa rastro (quem, de quê para quê).
        await registrarAuditoria({
          tabela: "EscalasEquipes", registroId: eqId, acao: "CONTATO_COM_MENORES_ALTERADO", usuarioId: usuario.membroId,
          dadosAntes: { contatoComMenores: !!eq.ContatoComMenores }, dadosDepois: { contatoComMenores }
        });
        context.res = { status: 200, body: { sucesso: true, mensagem: retirada && retirada.alocacoes ? `✅ Marcação atualizada. ${retirada.alocacoes} escala(s) futura(s) de quem ainda não está habilitado foram desmarcadas.` : "✅ Marcação atualizada." } };
        return;
      }
    }

    // ---- Esteiras da congregação ----
    // v7.5 (achado da revisão): a lista, o detalhe e a elegibilidade só olhavam o escopo — qualquer pessoa logada com escopo na congregação (ou
    // qualquer login, no caso da elegibilidade) via o estado da habilitação dos voluntários. Passam a exigir a permissão, como o resto da esteira.
    if ((acao === "lista" || acao === "detalhe" || acao === "elegibilidade-menores") && metodo === "GET"
        && !auth.temPermissao(usuario, "habilitacao_voluntarios")) {
      return erro(context, 403, "Você não tem permissão para isso.");
    }
    if (acao === "lista" && metodo === "GET") {
      const congregacaoId = idValido(req.query && req.query.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const nome = await nomeCongregacao(pool, congregacaoId);
      if (!nome || !auth.estaNoEscopo(usuario, nome)) return foraDoEscopo(context);
      context.res = { status: 200, body: { sucesso: true, habilitacoes: await hv.listarHabilitacoesPorCongregacao(pool, congregacaoId) } };
      return;
    }

    // ---- Iniciar (ou reaproveitar) esteira ----
    // Revisão de escopo: a esteira é de uma PESSOA e fica presa a uma congregação (UNIQUE por membro). Antes só a congregação do corpo era conferida: dava para abrir (e
    // depois ler e alterar) a esteira de gente de outra unidade, e uma esteira que já existia noutra unidade era devolvida por inteiro. Agora a pessoa precisa estar no escopo
    // de quem abre (ou estar ATIVA numa equipe de congregação do escopo — voluntário cadastrado numa congregação que serve noutra), e uma esteira existente só volta
    // se a congregação dela também está no escopo. Tudo que falha aqui responde igual: 403 "fora do seu escopo".
    if (acao === "iniciar" && metodo === "POST") {
      const { membroId, congregacaoId } = req.body || {};
      if (!membroId || !congregacaoId) return erro(context, 400, "Informe membroId e congregacaoId.");
      const mId = idValido(membroId);
      const cId = idValido(congregacaoId);
      if (!mId || !cId) return erro(context, 400, "membroId e congregacaoId precisam ser números inteiros positivos.");
      if (!(await podeGerenciarCongregacao(pool, usuario, cId))) return foraDoEscopo(context);
      const pessoa = await carregarPessoa(pool, mId);
      if (!pessoa) return foraDoEscopo(context);
      if (!noEscopoDaPessoa(usuario, pessoa.congregacaoNome, pessoa.extensaoNome) && !(await ativoEmEquipeDoEscopo(pool, usuario, mId))) return foraDoEscopo(context);
      const habilitacao = await hv.buscarOuCriarHabilitacao(pool, { membroId: mId, congregacaoId: cId, criadoPorMembroId: usuario.membroId });
      // A esteira devolvida (a que já existia, ou a que outra unidade abriu no mesmo instante) só volta se a congregação DELA está no escopo; senão, a mesma resposta de "fora do escopo".
      if (!habilitacao || !(await podeGerenciarCongregacao(pool, usuario, habilitacao.congregacaoId))) return foraDoEscopo(context);
      context.res = { status: 201, body: { sucesso: true, habilitacao: comStatusCalculado(habilitacao) } };
      return;
    }

    // ---- Detalhe por voluntário ----
    // "Sem esteira" e "esteira de outra unidade" respondem IGUAL (404): senão a rota diria quem está em processo de habilitação para ministério com menores em outra unidade.
    if (acao === "detalhe" && metodo === "GET") {
      const membroId = idValido(req.query && req.query.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      const habilitacao = await hv.buscarHabilitacaoPorMembro(pool, membroId);
      if (!habilitacao) return erro(context, 404, MSG_SEM_ESTEIRA);
      const nome = await nomeCongregacao(pool, habilitacao.congregacaoId);
      if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 404, MSG_SEM_ESTEIRA);
      context.res = { status: 200, body: { sucesso: true, habilitacao: comStatusCalculado(habilitacao) } };
      return;
    }

    // ---- Concluir etapa (sequencial — shared/habilitacaoVoluntarios.js::podeConcluirEtapa) ----
    if (acao === "concluir-etapa" && metodo === "POST") {
      const { habilitacaoId, etapa, observacao, entrevistadorId } = req.body || {};
      if (!habilitacaoId || !etapa) return erro(context, 400, "Informe habilitacaoId e etapa.");
      if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
      const habilitacao = await esteiraDoEscopo(pool, usuario, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      const resultado = await hv.concluirEtapa(pool, { habilitacaoId, etapa, observacao, entrevistadorId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Marcar inapto ----
    if (acao === "marcar-inapto" && metodo === "POST") {
      const { habilitacaoId, motivo } = req.body || {};
      if (!habilitacaoId) return erro(context, 400, "Informe habilitacaoId.");
      if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
      const habilitacao = await esteiraDoEscopo(pool, usuario, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      const resultado = await hv.marcarInapto(pool, { habilitacaoId, motivo, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Reabilitar ----
    if (acao === "reabilitar" && metodo === "POST") {
      const { habilitacaoId } = req.body || {};
      if (!habilitacaoId) return erro(context, 400, "Informe habilitacaoId.");
      if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
      const habilitacao = await esteiraDoEscopo(pool, usuario, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      // v7.7: o "inapto" passou a ser uma trava de proteção de crianças: ninguém o levanta de si mesmo.
      if (Number(habilitacao.membroId) === Number(usuario.membroId)) return erro(context, 403, "Ninguém reabilita a si mesmo: peça a outra pessoa da Secretaria.");
      const resultado = await hv.reabilitar(pool, { habilitacaoId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Elegibilidade a ministério com menores (hook de leitura pra v7.7) ----
    if (acao === "elegibilidade-menores" && metodo === "GET") {
      const membroId = idValido(req.query && req.query.membroId);
      const equipeBruta = req.query && req.query.equipeId;
      const equipeId = equipeBruta ? idValido(equipeBruta) : null;
      if (!membroId) return erro(context, 400, "Informe membroId.");
      if (equipeBruta && !equipeId) return erro(context, 400, "equipeId inválido.");
      // pessoa inexistente e pessoa fora do escopo: a mesma resposta; a equipe também precisa estar no escopo (senão a rota entregava a marca "contato com menores" de qualquer equipe)
      const alvo = await pessoaAlcancavel(pool, usuario, membroId);
      if (!alvo) return erro(context, 404, MSG_MEMBRO_OU_EQUIPE);
      if (equipeId && !(await equipeNoEscopo(pool, usuario, equipeId))) return erro(context, 404, MSG_MEMBRO_OU_EQUIPE);
      const dados = await hv.buscarDadosElegibilidade(pool, { membroId, equipeId });
      if (!dados) return erro(context, 404, MSG_MEMBRO_OU_EQUIPE);
      const resultado = hv.podeServirComMenores(dados);
      // v7.7: a decisão passa a ser a aptidão completa (esteira + certidões em dia + treinamento + ficha + política + 6 meses...); a gestão da congregação vê o que a
      // pessoa precisa fazer, mas não o motivo de uma pendência com a Diretoria. Os campos antigos (elegivel, motivo) seguem, agora coerentes com a aptidão.
      const aptidao = await mmDb.aptidaoDe(pool, membroId);
      const bloqueios = mm.mascararParaGestao(aptidao.bloqueios);
      const elegivel = !dados.contatoComMenores || aptidao.apto;
      context.res = { status: 200, body: { sucesso: true, ...dados, ...resultado, elegivel, motivo: elegivel ? null : (bloqueios[0] && bloqueios[0].mensagem) || resultado.motivo,
        aptidao: { apto: aptidao.apto, contaComoAdulto: aptidao.contaComoAdulto, bloqueios, validades: mm.validadesParaGestao(aptidao.validades), proximoVencimento: aptidao.proximoVencimento } } };
      return;
    }

    // ---- Desligamento de voluntário (RH — separado de disciplina/CEI) ----
    if (acao === "desligamento") {
      if (metodo === "POST") {
        const { membroId, equipeId, tipoMotivo, motivo, removidoDaEscala } = req.body || {};
        if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
        const mId = idValido(membroId);
        if (!mId) return erro(context, 400, "Informe um membroId válido.");
        const semEquipe = equipeId == null || equipeId === "";
        const eqId = semEquipe ? null : idValido(equipeId);
        if (!semEquipe && !eqId) return erro(context, 400, "equipeId inválido.");
        // v7.5 (achado da revisão): o registro de RH também respeita o escopo — o voluntário e a equipe precisam estar no alcance de quem registra.
        // Com removidoDaEscala o voluntário pode ser de outra congregação (serve numa equipe do escopo): quem decide é removerDaEscala, que só alcança as equipes do escopo e
        // responde igual para pessoa inexistente e para pessoa que não está ativa em equipe nenhuma do alcance de quem remove.
        // Pessoa inexistente e pessoa fora do escopo respondem IGUAL (404), e equipe inexistente e equipe fora do escopo também.
        if (removidoDaEscala !== true && !(await pessoaAlcancavel(pool, usuario, mId))) return erro(context, 404, "Voluntário não encontrado.");
        if (eqId && !(await equipeNoEscopo(pool, usuario, eqId))) return erro(context, 404, "Equipe não encontrada.");
        // Remover da escala só alcança as equipes que o escopo de quem remove cobre.
        const resultado = await hv.registrarDesligamento(pool, {
          membroId: mId, equipeId: eqId, tipoMotivo, motivo, removidoDaEscala: removidoDaEscala === true, registradoPorMembroId: usuario.membroId,
          podeCongregacao: (nome) => auth.estaNoEscopo(usuario, nome)
        });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    if (acao === "desligamentos" && metodo === "GET") {
      const membroId = idValido(req.query && req.query.membroId);
      if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
      if (!membroId) return erro(context, 400, "Informe membroId.");
      // Voluntário que não existe devolve a lista vazia, igual a quem existe mas não tem nada visível no escopo (nenhuma resposta diz quem tem cadastro).
      const alvo = await carregarPessoa(pool, membroId);
      // Cada registro vale pela congregação da equipe; o que não tem equipe vale pela congregação do voluntário (e a extensão dele, se o escopo for de extensão).
      const visiveis = (await hv.listarDesligamentosPorMembro(pool, membroId))
        .filter(l => (l.congregacaoNome ? auth.estaNoEscopo(usuario, l.congregacaoNome) : !!alvo && noEscopoDaPessoa(usuario, alvo.congregacaoNome, alvo.extensaoNome)))
        .map(({ congregacaoNome, ...resto }) => resto);
      context.res = { status: 200, body: { sucesso: true, desligamentos: visiveis } };
      return;
    }

    // ---- Autoatendimento (Meu Painel): minha própria esteira ----
    if (acao === "minha-habilitacao" && metodo === "GET") {
      const habilitacao = await hv.buscarHabilitacaoPorMembro(pool, usuario.membroId);
      context.res = { status: 200, body: { sucesso: true, habilitacao: comStatusCalculado(habilitacao) } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoHabilitacaoVoluntarios] erro:", e);
    erro(context, 500, "Erro interno ao processar habilitação de voluntários.");
  }
};
