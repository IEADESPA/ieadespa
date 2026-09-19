// GestaoEbdFinanceiro (v6.7 — EBD: Financeiro — ofertas + lançamentos
// manuais por congregação)
//
// Continua a FASE 6 (aberta em GestaoEbdTurmas, v6.1). Ver
// shared/ebdFinanceiro.js pra toda a lógica de decisão (pura, testada em
// isolamento) — oferta ancorada em EbdLicoes (v6.2), lançamento manual
// solto por Congregação+Data, consolidado mensal calculado na leitura.
//
// Permissão — CONSERVADORA por ser dado financeiro (diferente de v6.2/v6.6,
// que liberam o professor da turma): TODA ação aqui exige "ebd_gestao"
// dentro do escopo territorial da Congregação. Dinheiro de oferta é
// decisão de nível Congregação (Superintendente Local), não de turma —
// mesmo espírito conservador da v5.9 (Assistência Social) com dado
// sensível: quando o dado pede mais cuidado, o sistema erra pro lado de
// restringir mais, não menos.
//
// GET    /api/ebd-financeiro/oferta?licaoId=                         -> oferta já registrada da lição (ou null)
// POST   /api/ebd-financeiro/oferta   body:{licaoId, valor}          -> registra ou ajusta a oferta da lição
// GET    /api/ebd-financeiro/lancamentos?congregacaoId=&mes=&ano=    -> lançamentos manuais do mês
// POST   /api/ebd-financeiro/lancamentos body:{congregacaoId, data, tipo, descricao, valor}
// DELETE /api/ebd-financeiro/lancamentos?id=                         -> exclui um lançamento manual (correção)
// GET    /api/ebd-financeiro/consolidado?congregacaoId=&mes=&ano=    -> ofertas + lançamentos + total do mês
//
// Este módulo NUNCA escreve em TesourariasDepartamento (v5.4) — o
// consolidado mensal só alimenta o campo `ofertas` do relatório
// departamental (v5.2) no momento em que o rascunho nasce (ver
// GestaoRelatoriosDepartamentais::POST, hook em
// shared/ebdFinanceiro.js::buscarValorPrePreenchimentoOfertas); quem
// concilia com o Centro de Custo geral da FASE 4 continua sendo,
// exclusivamente, a v5.4, pelo mesmo caminho que os outros 7 departamentos.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const financeiro = require("../shared/ebdFinanceiro");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temEbdGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("ebd_gestao"));
}

async function nomeCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] ? r.recordset[0].Nome : null;
}

async function podeAcessarCongregacao(pool, usuario, congregacaoId) {
  if (!temEbdGestao(usuario)) return false;
  const nome = await nomeCongregacao(pool, congregacaoId);
  return !!nome && auth.estaNoEscopo(usuario, nome);
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    // ---- Oferta (ancorada em EbdLicoes, v6.2) ----
    if (acao === "oferta" && metodo === "GET") {
      const licaoId = Number(req.query && req.query.licaoId);
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await financeiro.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.CongregacaoId))) return erro(context, 403, "Registrar/consultar oferta exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, oferta: await financeiro.buscarOfertaPorLicao(pool, licaoId) } };
      return;
    }

    if (acao === "oferta" && metodo === "POST") {
      const { licaoId, valor } = req.body || {};
      if (!licaoId) return erro(context, 400, "Informe licaoId.");
      const licao = await financeiro.buscarLicaoPorId(pool, licaoId);
      if (!licao) return erro(context, 404, "Lição não encontrada.");
      if (!(await podeAcessarCongregacao(pool, usuario, licao.CongregacaoId))) return erro(context, 403, "Registrar oferta exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      const resultado = await financeiro.registrarOuAtualizarOferta(pool, { licaoId, valor, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Lançamentos manuais ----
    if (acao === "lancamentos" && metodo === "GET") {
      const congregacaoId = Number(req.query && req.query.congregacaoId);
      const mes = Number(req.query && req.query.mes);
      const ano = Number(req.query && req.query.ano);
      if (!congregacaoId || !mes || !ano) return erro(context, 400, "Informe congregacaoId, mes e ano.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Ver lançamentos exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, lancamentos: await financeiro.listarLancamentosPorCongregacaoMes(pool, { congregacaoId, mes, ano }) } };
      return;
    }

    if (acao === "lancamentos" && metodo === "POST") {
      const { congregacaoId, data, tipo, descricao, valor } = req.body || {};
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Registrar lançamento exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      const resultado = await financeiro.criarLancamento(pool, { congregacaoId, data, tipo, descricao, valor, registradoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (acao === "lancamentos" && metodo === "DELETE") {
      const lancamentoId = Number(context.bindingData.id || (req.query && req.query.id));
      if (!lancamentoId) return erro(context, 400, "Informe o id do lançamento.");
      const lancamento = await financeiro.buscarLancamentoPorId(pool, lancamentoId);
      if (!lancamento) return erro(context, 404, "Lançamento não encontrado.");
      if (!(await podeAcessarCongregacao(pool, usuario, lancamento.congregacaoId))) return erro(context, 403, "Excluir lançamento exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      const resultado = await financeiro.excluirLancamento(pool, { lancamentoId, excluidoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    // ---- Consolidado do mês (o que vira sugestão do campo `ofertas` no relatório departamental) ----
    if (acao === "consolidado" && metodo === "GET") {
      const congregacaoId = Number(req.query && req.query.congregacaoId);
      const mes = Number(req.query && req.query.mes);
      const ano = Number(req.query && req.query.ano);
      if (!congregacaoId || !mes || !ano) return erro(context, 400, "Informe congregacaoId, mes e ano.");
      if (!(await podeAcessarCongregacao(pool, usuario, congregacaoId))) return erro(context, 403, "Ver o consolidado exige a permissão ebd_gestao dentro do seu escopo de atuação.");
      context.res = { status: 200, body: { sucesso: true, ...(await financeiro.buscarConsolidadoMensal(pool, { congregacaoId, mes, ano })) } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoEbdFinanceiro] erro:", e);
    erro(context, 500, "Erro interno ao processar o financeiro da EBD.");
  }
};
