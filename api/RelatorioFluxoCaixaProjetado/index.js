// RelatorioFluxoCaixaProjetado (v4.8, primeira parte)
// Estimativa do saldo futuro de um Centro de Custo (Local de uma
// congregação, ou Geral consolidado) — calculada a partir do histórico
// recente de entradas/saídas + o que já está empenhado (Saídas aprovadas,
// ainda não pagas). Sempre CALCULADO NA LEITURA a cada chamada — não
// existe "revisão periódica" porque toda vez que a tela é aberta já é
// uma reprojeção do zero com os dados mais recentes (o mesmo espírito do
// "orçamento contínuo/rolling forecast" pedido pela pesquisa de mercado,
// sem precisar de um mecanismo separado).
// GET /api/fluxo-caixa-projetado?centroCusto=LOCAL&congregacaoId=1&meses=6
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const { centroCusto, congregacaoId, meses } = req.query || {};
  if (!["LOCAL", "GERAL"].includes(centroCusto)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe centroCusto=LOCAL ou GERAL." } };
    return;
  }
  if (centroCusto === "LOCAL" && !congregacaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId pro Centro de Custo Local." } };
    return;
  }
  const pool = await getPool();
  if (centroCusto === "LOCAL") {
    const congNome = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (congNome.recordset.length === 0 || !auth.estaNoEscopo(usuario, congNome.recordset[0].Nome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
  } else if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "O fluxo de caixa projetado do Centro de Custo Geral é restrito a papéis de nível Global." } };
    return;
  }

  const quantidadeMeses = Math.min(Math.max(parseInt(meses, 10) || 6, 1), 12);
  const projecao = await tesouraria.projetarFluxoCaixa(pool, sql, centroCusto, congregacaoId ? Number(congregacaoId) : null, quantidadeMeses);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: projecao };
};
