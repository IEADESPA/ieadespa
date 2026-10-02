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

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeGerenciarCongregacao(pool, usuario, congregacaoId) {
  if (!usuario.permissoes || !usuario.permissoes.includes("habilitacao_voluntarios")) return false;
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

// Identificador vindo de fora: só número inteiro positivo (texto de dígitos ou número). Booleano, array, objeto, decimal e vazio não valem.
function idValido(v) {
  const ok = (typeof v === "number" || (typeof v === "string" && /^d+$/.test(v.trim()))) && Number(v) >= 1 && Number(v) <= 2147483647 && Number.isInteger(Number(v));
  return ok ? Number(v) : null;
}
const temPermissao = (usuario) => !!(usuario.permissoes && usuario.permissoes.includes("habilitacao_voluntarios"));

// Congregação do membro (para o escopo de quem consulta ou registra algo sobre ele).
async function congregacaoDoMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT m.MembroId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}

function comStatusCalculado(hab) {
  if (!hab) return null;
  return { ...hab, statusCalculado: hv.calcularStatusHabilitacao(hab), proximaEtapa: hv.proximaEtapaPendente(hab), etapasConcluidas: hv.etapasConcluidas(hab) };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

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
        const congregacaoId = Number(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        const nome = await nomeCongregacao(pool, congregacaoId);
        if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, equipes: await hv.listarEquipesComFlag(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { equipeId, contatoComMenores } = req.body || {};
        if (!equipeId || typeof contatoComMenores !== "boolean") return erro(context, 400, "Informe equipeId e contatoComMenores (true/false).");
        if (!temPermissao(usuario)) return erro(context, 403, "Você não tem permissão para isso.");
        const eqId = idValido(equipeId);
        if (!eqId) return erro(context, 400, "equipeId inválido.");
        const eq = (await pool.request().input("id", sql.Int, eqId).query(`SELECT c.Nome AS CongregacaoNome FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId WHERE e.EquipeId = @id`)).recordset[0];
        if (!eq) return erro(context, 404, "Equipe não encontrada.");
        if (!auth.estaNoEscopo(usuario, eq.CongregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        await hv.atualizarContatoComMenores(pool, eqId, contatoComMenores);
        context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Marcação atualizada." } };
        return;
      }
    }

    // ---- Esteiras da congregação ----
    // v7.5 (achado da revisão): a lista, o detalhe e a elegibilidade só olhavam o escopo — qualquer pessoa logada com escopo na congregação (ou
    // qualquer login, no caso da elegibilidade) via o estado da habilitação dos voluntários. Passam a exigir a permissão, como o resto da esteira.
    if ((acao === "lista" || acao === "detalhe" || acao === "elegibilidade-menores") && metodo === "GET"
        && !(usuario.permissoes && usuario.permissoes.includes("habilitacao_voluntarios"))) {
      return erro(context, 403, "Você não tem permissão para isso.");
    }
    if (acao === "lista" && metodo === "GET") {
      const congregacaoId = Number(req.query && req.query.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      const nome = await nomeCongregacao(pool, congregacaoId);
      if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, habilitacoes: await hv.listarHabilitacoesPorCongregacao(pool, congregacaoId) } };
      return;
    }

    // ---- Iniciar (ou reaproveitar) esteira ----
    if (acao === "iniciar" && metodo === "POST") {
      const { membroId, congregacaoId } = req.body || {};
      if (!membroId || !congregacaoId) return erro(context, 400, "Informe membroId e congregacaoId.");
      if (!(await podeGerenciarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const habilitacao = await hv.buscarOuCriarHabilitacao(pool, { membroId, congregacaoId, criadoPorMembroId: usuario.membroId });
      context.res = { status: 201, body: { sucesso: true, habilitacao: comStatusCalculado(habilitacao) } };
      return;
    }

    // ---- Detalhe por voluntário ----
    if (acao === "detalhe" && metodo === "GET") {
      const membroId = Number(req.query && req.query.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      const habilitacao = await hv.buscarHabilitacaoPorMembro(pool, membroId);
      if (!habilitacao) return erro(context, 404, "Este voluntário ainda não tem esteira de habilitação aberta.");
      const nome = await nomeCongregacao(pool, habilitacao.congregacaoId);
      if (!nome || !auth.estaNoEscopo(usuario, nome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, habilitacao: comStatusCalculado(habilitacao) } };
      return;
    }

    // ---- Concluir etapa (sequencial — shared/habilitacaoVoluntarios.js::podeConcluirEtapa) ----
    if (acao === "concluir-etapa" && metodo === "POST") {
      const { habilitacaoId, etapa, observacao, entrevistadorId } = req.body || {};
      if (!habilitacaoId || !etapa) return erro(context, 400, "Informe habilitacaoId e etapa.");
      const habilitacao = await hv.buscarHabilitacaoPorId(pool, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      if (!(await podeGerenciarCongregacao(pool, usuario, habilitacao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await hv.concluirEtapa(pool, { habilitacaoId, etapa, observacao, entrevistadorId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Marcar inapto ----
    if (acao === "marcar-inapto" && metodo === "POST") {
      const { habilitacaoId, motivo } = req.body || {};
      if (!habilitacaoId) return erro(context, 400, "Informe habilitacaoId.");
      const habilitacao = await hv.buscarHabilitacaoPorId(pool, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      if (!(await podeGerenciarCongregacao(pool, usuario, habilitacao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await hv.marcarInapto(pool, { habilitacaoId, motivo, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Reabilitar ----
    if (acao === "reabilitar" && metodo === "POST") {
      const { habilitacaoId } = req.body || {};
      if (!habilitacaoId) return erro(context, 400, "Informe habilitacaoId.");
      const habilitacao = await hv.buscarHabilitacaoPorId(pool, habilitacaoId);
      if (!habilitacao) return erro(context, 404, "Esteira não encontrada.");
      if (!(await podeGerenciarCongregacao(pool, usuario, habilitacao.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await hv.reabilitar(pool, { habilitacaoId, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Elegibilidade a ministério com menores (hook de leitura pra v7.7) ----
    if (acao === "elegibilidade-menores" && metodo === "GET") {
      const membroId = Number(req.query && req.query.membroId);
      const equipeId = req.query && req.query.equipeId ? Number(req.query.equipeId) : null;
      if (!membroId) return erro(context, 400, "Informe membroId.");
      const alvo = await congregacaoDoMembro(pool, membroId);
      if (!alvo) return erro(context, 404, "Membro não encontrado.");
      if (!auth.estaNoEscopo(usuario, alvo.CongregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      const dados = await hv.buscarDadosElegibilidade(pool, { membroId, equipeId });
      if (!dados) return erro(context, 404, "Membro não encontrado.");
      const resultado = hv.podeServirComMenores(dados);
      context.res = { status: 200, body: { sucesso: true, ...dados, ...resultado } };
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
        const alvo = await congregacaoDoMembro(pool, mId);
        if (!alvo) return erro(context, 404, "Voluntário não encontrado.");
        if (removidoDaEscala !== true && !auth.estaNoEscopo(usuario, alvo.CongregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        if (eqId) {
          const eq = (await pool.request().input("id", sql.Int, eqId).query(`SELECT c.Nome AS CongregacaoNome FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId WHERE e.EquipeId = @id`)).recordset[0];
          if (!eq) return erro(context, 404, "Equipe não encontrada.");
          if (!auth.estaNoEscopo(usuario, eq.CongregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
        }
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
      const alvo = await congregacaoDoMembro(pool, membroId);
      if (!alvo) return erro(context, 404, "Voluntário não encontrado.");
      // Cada registro vale pela congregação da equipe; o que não tem equipe vale pela congregação do voluntário.
      const visiveis = (await hv.listarDesligamentosPorMembro(pool, membroId))
        .filter(l => auth.estaNoEscopo(usuario, l.congregacaoNome || alvo.CongregacaoNome))
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
