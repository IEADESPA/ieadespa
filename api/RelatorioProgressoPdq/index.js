// RelatorioProgressoPdq (v4.8, segunda parte)
// Relatório de Progresso do PDQ pra apresentação na AGO (Art. 29) — e o
// mesmo dado que a Comissão de Acompanhamento de Projetos / PMO
// Eclesiástico (Art. 30) usa pra reportar trimestralmente à CLI. Tudo
// CALCULADO NA LEITURA a partir de PdqMetas/PdqProjetos — nenhum
// percentual de progresso é digitado à mão.
// GET /api/pdq-relatorio-progresso/{planoId}
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const planoId = context.bindingData.planoId;
  const usuario = auth.exigirAlgumaPermissao(req, context, ["cli", "financeiro", "assembleia"]);
  if (!usuario) return;
  if (!planoId) {
    context.res = { status: 400, body: { erro: "Informe o planoId na rota." } };
    return;
  }
  const pool = await getPool();

  const plano = await pool.request().input("id", sql.Int, planoId).query(`SELECT * FROM PdqPlanos WHERE PlanoId = @id`);
  if (plano.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Plano PDQ não encontrado." } };
    return;
  }

  const eixos = await pool.request().input("id", sql.Int, planoId).query(`SELECT EixoId AS eixoId, Nome AS nome FROM PdqEixos WHERE PlanoId = @id ORDER BY EixoId`);
  for (const eixo of eixos.recordset) {
    const metas = await pool.request().input("eixoId", sql.Int, eixo.eixoId).query(`
      SELECT MetaId AS metaId, Descricao AS descricao, Status AS status, JustificativaTecnica AS justificativaTecnica FROM PdqMetas WHERE EixoId = @eixoId
    `);
    eixo.totalMetas = metas.recordset.length;
    eixo.metasCumpridas = metas.recordset.filter(m => m.status === "CUMPRIDA").length;
    eixo.metasNaoCumpridas = metas.recordset.filter(m => m.status === "NAO_CUMPRIDA").length;
    eixo.metasEmAndamento = metas.recordset.filter(m => m.status === "EM_ANDAMENTO").length;
    eixo.percentualCumprimento = eixo.totalMetas > 0 ? Math.round((eixo.metasCumpridas / eixo.totalMetas) * 100) : 0;
    eixo.metas = metas.recordset;

    const projetos = await pool.request().input("eixoId", sql.Int, eixo.eixoId).query(`
      SELECT p.ProjetoId AS projetoId, p.Nome AS nome, p.OrcamentoPrevisto AS orcamentoPrevisto, p.Status AS status,
             CASE WHEN p.Status NOT IN ('CONCLUIDO', 'CANCELADO') AND p.CronogramaFim < CAST(SYSUTCDATETIME() AS DATE) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS atrasado
      FROM PdqProjetos p JOIN PdqMetas m ON m.MetaId = p.MetaId WHERE m.EixoId = @eixoId
    `);
    eixo.totalOrcadoProjetos = projetos.recordset.reduce((soma, p) => soma + Number(p.orcamentoPrevisto), 0);
    eixo.projetosAtrasados = projetos.recordset.filter(p => p.atrasado);
  }

  const totalMetas = eixos.recordset.reduce((soma, e) => soma + e.totalMetas, 0);
  const totalCumpridas = eixos.recordset.reduce((soma, e) => soma + e.metasCumpridas, 0);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      planoId: Number(planoId), titulo: plano.recordset[0].Titulo, anoInicio: plano.recordset[0].AnoInicio, anoFim: plano.recordset[0].AnoFim,
      status: plano.recordset[0].Status, totalMetas, totalCumpridas,
      percentualCumprimentoGeral: totalMetas > 0 ? Math.round((totalCumpridas / totalMetas) * 100) : 0,
      eixos: eixos.recordset
    }
  };
};
