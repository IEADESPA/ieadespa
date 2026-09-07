// ListarFechamentosTesouraria (v4.1)
// Visão consolidada — embrião da Tesouraria Geral: um Tesoureiro Local vê só
// a própria congregação; um de Área/Região/Distrito vê o consolidado do seu
// território (todas as congregações dentro do escopo, com drill-down); um
// Tesoureiro Geral vê todas. Mesmo filtro estaNoEscopo já usado em
// ListarFrequencia/GestaoPessoas — nada de código duplicado por nível.
// GET /api/tesouraria-fechamentos?mesReferencia=
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const { mesReferencia } = req.query || {};
  const pool = await getPool();
  const request = pool.request();
  let where = "1=1";
  if (mesReferencia) { request.input("mesReferencia", sql.Char(7), mesReferencia); where += " AND f.MesReferencia = @mesReferencia"; }

  const result = await request.query(`
    SELECT f.FechamentoId AS fechamentoId, f.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           f.MesReferencia AS mesReferencia, f.TotalRecebido AS totalRecebido, f.ValorAluguel AS valorAluguel,
           f.ValorLote AS valorLote, f.TotalFinal AS totalFinal, f.PercentualRetencaoLocal AS percentualRetencaoLocal,
           f.ValorRetidoLocal AS valorRetidoLocal, f.ValorRepasseGeral AS valorRepasseGeral, f.Status AS status,
           CONVERT(varchar(33), f.DataRepasse, 126) AS dataRepasse
    FROM FechamentosTesouraria f
    JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    WHERE ${where}
    ORDER BY f.MesReferencia DESC, c.Nome
  `);
  const fechamentos = result.recordset.filter(f => auth.estaNoEscopo(usuario, f.congregacaoNome));

  const consolidado = fechamentos.reduce((acc, f) => ({
    totalRecebido: acc.totalRecebido + f.totalRecebido,
    valorRetidoLocal: acc.valorRetidoLocal + f.valorRetidoLocal,
    valorRepasseGeral: acc.valorRepasseGeral + f.valorRepasseGeral
  }), { totalRecebido: 0, valorRetidoLocal: 0, valorRepasseGeral: 0 });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { fechamentos, consolidado } };
};
