// GestaoAssistenciaSocial (v5.9 — Assistência Social / Ação da Fé)
//
// Módulo com o dado mais sensível do sistema (situação socioeconômica de
// família assistida) — TODA rota exige a permissão própria
// "assistencia_social" (nunca concedida automaticamente a papel nenhum,
// migração 100) + escopo de congregação, mesmo padrão de defesa em
// profundidade do resto do sistema. Ver shared/assistenciaSocial.js pra
// toda a lógica de decisão (pura, testada em isolamento).
//
// GET  /api/assistencia-social/familias?congregacaoId=        -> famílias cadastradas na congregação
// POST /api/assistencia-social/familias  body:{congregacaoId, responsavelNome, responsavelCpf?, responsavelContato?, endereco?, membroId?}
// GET  /api/assistencia-social/familia?familiaId=              -> família + cadastros + histórico/recorrência
// POST /api/assistencia-social/cadastro  body:{familiaId, qtdPessoasNucleo, rendaFamiliarMensal?, situacaoMoradia?, observacoes?, baseLegal?, consentimentoObtidoEm}
// POST /api/assistencia-social/cadastro/encerrar  body:{cadastroId, motivo}
// GET  /api/assistencia-social/cadastros?familiaId=
// GET  /api/assistencia-social/profissionais                   -> lista Assistentes Sociais credenciados
// POST /api/assistencia-social/profissionais  body:{membroId, numeroCredencial}      -> restrito a nível Global (Diretoria)
// POST /api/assistencia-social/profissionais/descredenciar body:{profissionalId, motivo} -> restrito a nível Global
// POST /api/assistencia-social/parecer   body:{cadastroId, profissionalMembroId, resultado, parecer}
// GET  /api/assistencia-social/pareceres?cadastroId=
// POST /api/assistencia-social/entrega   body:{familiaId, tipoBeneficio, descricao?, valor?, dataEntrega, despesaTesourariaDepartamentoId?}
// GET  /api/assistencia-social/historico?familiaId=             -> entregas + recorrência calculada
// GET  /api/assistencia-social/prestacao-contas?mes=&ano=       -> separado do caixa comum (v5.4/Ação da Fé), insumo pra v9.6
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const as = require("../shared/assistenciaSocial");

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

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "assistencia_social");
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Famílias ----
    if (acao === "familias") {
      if (metodo === "GET") {
        const congregacaoId = Number(req.query && req.query.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        context.res = { status: 200, body: { sucesso: true, familias: await as.listarFamilias(pool, congregacaoId) } };
        return;
      }
      if (metodo === "POST") {
        const { congregacaoId, responsavelNome, responsavelCpf, responsavelContato, endereco, membroId } = req.body || {};
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
        const resultado = await as.criarFamilia(pool, { congregacaoId, responsavelNome, responsavelCpf, responsavelContato, endereco, membroId, criadoPorMembroId: usuario.membroId });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    if (acao === "familia" && metodo === "GET") {
      const familiaId = Number(req.query && req.query.familiaId);
      if (!familiaId) return erro(context, 400, "Informe familiaId.");
      const familia = await as.buscarFamilia(pool, familiaId);
      if (!familia) return erro(context, 404, "Família não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const cadastros = await as.listarCadastrosPorFamilia(pool, familiaId);
      const historico = await as.historicoComRecorrencia(pool, familiaId);
      context.res = { status: 200, body: { sucesso: true, familia, cadastros, ...historico } };
      return;
    }

    // ---- Cadastro socioeconômico (Art. 46) ----
    if (acao === "cadastro" && metodo === "POST") {
      const { familiaId, qtdPessoasNucleo, rendaFamiliarMensal, situacaoMoradia, observacoes, baseLegal, consentimentoObtidoEm } = req.body || {};
      if (!familiaId) return erro(context, 400, "Informe familiaId.");
      const familia = await as.buscarFamilia(pool, familiaId);
      if (!familia) return erro(context, 404, "Família não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await as.criarCadastroSocioeconomico(pool, {
        familiaId, qtdPessoasNucleo, rendaFamiliarMensal, situacaoMoradia, observacoes, baseLegal,
        consentimentoObtidoEm, registradoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "cadastro/encerrar" && metodo === "POST") {
      const { cadastroId, motivo } = req.body || {};
      if (!cadastroId) return erro(context, 400, "Informe cadastroId.");
      const cadastro = await as.buscarCadastro(pool, cadastroId);
      if (!cadastro) return erro(context, 404, "Cadastro não encontrado.");
      const familia = await as.buscarFamilia(pool, cadastro.familiaId);
      if (!familia || !(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await as.encerrarCadastro(pool, { cadastroId, motivo, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (acao === "cadastros" && metodo === "GET") {
      const familiaId = Number(req.query && req.query.familiaId);
      if (!familiaId) return erro(context, 400, "Informe familiaId.");
      const familia = await as.buscarFamilia(pool, familiaId);
      if (!familia || !(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, cadastros: await as.listarCadastrosPorFamilia(pool, familiaId) } };
      return;
    }

    // ---- Credenciamento do Assistente Social (Art. 52, VII) — restrito à Diretoria ----
    if (acao === "profissionais") {
      if (metodo === "GET") {
        context.res = { status: 200, body: { sucesso: true, profissionais: await as.listarProfissionais(pool) } };
        return;
      }
      if (metodo === "POST") {
        if (usuario.nivel !== "GLOBAL") return erro(context, 403, "Credenciar Assistente Social é matéria da Diretoria — restrito a nível Global.");
        const { membroId, numeroCredencial } = req.body || {};
        const resultado = await as.credenciarProfissional(pool, { membroId, numeroCredencial, credenciadoPorMembroId: usuario.membroId });
        context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
        return;
      }
    }

    if (acao === "profissionais/descredenciar" && metodo === "POST") {
      if (usuario.nivel !== "GLOBAL") return erro(context, 403, "Descredenciar é matéria da Diretoria — restrito a nível Global.");
      const { profissionalId, motivo } = req.body || {};
      if (!profissionalId) return erro(context, 400, "Informe profissionalId.");
      const resultado = await as.descredenciarProfissional(pool, { profissionalId, motivo, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Parecer técnico (Art. 52, VII) ----
    if (acao === "parecer" && metodo === "POST") {
      const { cadastroId, profissionalMembroId, resultado: resultadoParecer, parecer } = req.body || {};
      if (!cadastroId || !profissionalMembroId) return erro(context, 400, "Informe cadastroId e profissionalMembroId.");
      const cadastro = await as.buscarCadastro(pool, cadastroId);
      if (!cadastro) return erro(context, 404, "Cadastro não encontrado.");
      const familia = await as.buscarFamilia(pool, cadastro.familiaId);
      if (!familia || !(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await as.registrarParecer(pool, {
        cadastroId, profissionalMembroId, resultado: resultadoParecer, parecer, registradoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "pareceres" && metodo === "GET") {
      const cadastroId = Number(req.query && req.query.cadastroId);
      if (!cadastroId) return erro(context, 400, "Informe cadastroId.");
      const cadastro = await as.buscarCadastro(pool, cadastroId);
      if (!cadastro) return erro(context, 404, "Cadastro não encontrado.");
      const familia = await as.buscarFamilia(pool, cadastro.familiaId);
      if (!familia || !(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, pareceres: await as.listarPareceresPorCadastro(pool, cadastroId) } };
      return;
    }

    // ---- Entregas/benefícios + recorrência ----
    if (acao === "entrega" && metodo === "POST") {
      const { familiaId, tipoBeneficio, descricao, valor, dataEntrega, despesaTesourariaDepartamentoId } = req.body || {};
      if (!familiaId) return erro(context, 400, "Informe familiaId.");
      const familia = await as.buscarFamilia(pool, familiaId);
      if (!familia) return erro(context, 404, "Família não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      const resultado = await as.registrarEntrega(pool, {
        familiaId, tipoBeneficio, descricao, valor, dataEntrega, despesaTesourariaDepartamentoId, registradoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "historico" && metodo === "GET") {
      const familiaId = Number(req.query && req.query.familiaId);
      if (!familiaId) return erro(context, 400, "Informe familiaId.");
      const familia = await as.buscarFamilia(pool, familiaId);
      if (!familia || !(await podeAcessarCongregacao(pool, usuario, familia.congregacaoId))) return erro(context, 403, "Fora do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, ...(await as.historicoComRecorrencia(pool, familiaId)) } };
      return;
    }

    // ---- Prestação de contas — separada do caixa comum (v5.4/Ação da Fé), insumo pra v9.6 ----
    if (acao === "prestacao-contas" && metodo === "GET") {
      const mes = Number(req.query && req.query.mes);
      const ano = Number(req.query && req.query.ano);
      if (!mes || !ano) return erro(context, 400, "Informe mes e ano.");
      const relatorio = await as.relatorioPrestacaoContas(pool, { mesReferencia: mes, anoReferencia: ano });
      context.res = { status: 200, body: { sucesso: true, ...relatorio } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoAssistenciaSocial] erro:", e);
    erro(context, 500, "Erro interno ao processar assistência social.");
  }
};
