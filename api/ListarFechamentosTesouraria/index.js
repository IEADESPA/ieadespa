// ListarFechamentosTesouraria (v4.1, enriquecido v4.1.3 — Centro de Custo)
// Visão consolidada — embrião da Tesouraria Geral: um Tesoureiro Local vê só
// a própria congregação; um de Área/Região/Distrito vê o consolidado do seu
// território (todas as congregações dentro do escopo, com drill-down); um
// Tesoureiro Geral vê todas. Mesmo filtro estaNoEscopo já usado em
// ListarFrequencia/GestaoPessoas — nada de código duplicado por nível.
// v4.1.3 — hoje existe uma ÚNICA conta bancária pra toda a denominação
// (confirmado com o usuário): "Status='FECHADO'" é dinheiro ainda dentro
// do caixa único mas AINDA NÃO liberado pra Congregação gastar (pendente
// de conferência da Geral); "Status='REPASSADO'" é o saldo já liberado.
// centroCustoGeral soma o que é da Geral (sempre "dela", não precisa de
// liberação); porCongregacao soma liberado vs. pendente por congregação —
// isso é o "Centro de Custo Local" de cada uma.
// GET /api/tesouraria-fechamentos?mesReferencia=
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
// v9.3 — repasseDistrito: o Distrito ativo que recebe o repasse do fechamento (Regimento Art. 126-N, I), ou null quando vai para a Sede
const { NOME_DO_DISTRITO_DO_REPASSE } = require("../shared/distritos");

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
           f.FormaRepasse AS formaRepasse, CONVERT(varchar(33), f.DataRepasse, 126) AS dataRepasse,
           ${NOME_DO_DISTRITO_DO_REPASSE("f", "c")} AS repasseDistrito
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

  // Centro de Custo Geral: os 60% de cada fechamento já são "da Geral" —
  // liberado (fechamentos já conferidos/REPASSADO) vs. ainda em fechamentos
  // recém-fechados que a Geral ainda não olhou (mesma conferência única,
  // não tem uma etapa própria só pros 60% — quando a Geral libera o
  // fechamento, libera os dois lados de uma vez).
  // v9.3 — o repasse das congregações de um Distrito ativo é do Distrito (Regimento Art. 126-N, I), não do Centro de Custo Geral: sai da soma da Geral e aparece por
  // Distrito em repasseDistritos.
  const centroCustoGeral = fechamentos.filter(f => !f.repasseDistrito).reduce((acc, f) => {
    const alvo = f.status === "REPASSADO" ? "liberado" : "pendente";
    acc[alvo] += f.valorRepasseGeral;
    return acc;
  }, { liberado: 0, pendente: 0 });
  const porDistrito = new Map();
  fechamentos.filter(f => f.repasseDistrito).forEach(f => {
    if (!porDistrito.has(f.repasseDistrito)) porDistrito.set(f.repasseDistrito, { distrito: f.repasseDistrito, total: 0 });
    porDistrito.get(f.repasseDistrito).total += f.valorRepasseGeral;
  });
  const repasseDistritos = Array.from(porDistrito.values()).sort((a, b) => a.distrito.localeCompare(b.distrito));

  // Centro de Custo Local: quanto cada congregação já pode gastar (saldo
  // liberado) vs. quanto ainda está esperando a Geral conferir.
  const porCongregacaoMap = new Map();
  fechamentos.forEach(f => {
    if (!porCongregacaoMap.has(f.congregacaoId)) {
      porCongregacaoMap.set(f.congregacaoId, { congregacaoId: f.congregacaoId, congregacaoNome: f.congregacaoNome, saldoLiberado: 0, saldoPendente: 0 });
    }
    const linha = porCongregacaoMap.get(f.congregacaoId);
    if (f.status === "REPASSADO") linha.saldoLiberado += f.valorRetidoLocal;
    else linha.saldoPendente += f.valorRetidoLocal;
  });
  const porCongregacao = Array.from(porCongregacaoMap.values()).sort((a, b) => a.congregacaoNome.localeCompare(b.congregacaoNome));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { fechamentos, consolidado, centroCustoGeral, repasseDistritos, porCongregacao } };
};
