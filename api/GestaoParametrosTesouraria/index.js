// GestaoParametrosTesouraria (v4.1)
// Aluguel/lote variam por congregação e o percentual de retenção local pode
// um dia mudar por decisão da Assembleia (hoje 40%, Art. 118) — por isso são
// parâmetros editáveis por congregação, nunca hardcoded no cálculo.
// GET /api/tesouraria-parametros/{congregacaoId}
// PUT /api/tesouraria-parametros/{congregacaoId} -> { valorAluguelMensal?, valorLoteMensal?, percentualRetencaoLocal? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const congregacaoId = context.bindingData.congregacaoId;
  if (!congregacaoId) {
    context.res = { status: 400, body: { erro: "Informe o congregacaoId na rota." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, congregacaoId).query(`
    SELECT Nome, ValorAluguelMensal, ValorLoteMensal, PercentualRetencaoLocal FROM Congregacoes WHERE CongregacaoId = @id
  `);
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
    return;
  }
  const congregacao = atual.recordset[0];
  if (!auth.estaNoEscopo(usuario, congregacao.Nome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  if (req.method === "GET") {
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        congregacaoId: Number(congregacaoId), congregacaoNome: congregacao.Nome,
        valorAluguelMensal: congregacao.ValorAluguelMensal, valorLoteMensal: congregacao.ValorLoteMensal,
        percentualRetencaoLocal: congregacao.PercentualRetencaoLocal
      }
    };
    return;
  }

  if (req.method === "PUT") {
    const { valorAluguelMensal, valorLoteMensal, percentualRetencaoLocal } = req.body || {};
    const percentual = percentualRetencaoLocal != null ? percentualRetencaoLocal : congregacao.PercentualRetencaoLocal;
    if (percentual < 0 || percentual > 100) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "percentualRetencaoLocal deve estar entre 0 e 100." } };
      return;
    }
    await pool.request()
      .input("id", sql.Int, congregacaoId)
      .input("valorAluguelMensal", sql.Decimal(10, 2), valorAluguelMensal != null ? valorAluguelMensal : congregacao.ValorAluguelMensal)
      .input("valorLoteMensal", sql.Decimal(10, 2), valorLoteMensal != null ? valorLoteMensal : congregacao.ValorLoteMensal)
      .input("percentualRetencaoLocal", sql.Decimal(5, 2), percentual)
      .query(`UPDATE Congregacoes SET ValorAluguelMensal = @valorAluguelMensal, ValorLoteMensal = @valorLoteMensal,
                PercentualRetencaoLocal = @percentualRetencaoLocal WHERE CongregacaoId = @id`);

    await registrarAuditoria({
      tabela: "Congregacoes", registroId: Number(congregacaoId), acao: "Atualizou parâmetros financeiros", usuarioId: usuario.membroId,
      dadosAntes: congregacao, dadosDepois: { valorAluguelMensal, valorLoteMensal, percentualRetencaoLocal: percentual }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parâmetros atualizados." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
