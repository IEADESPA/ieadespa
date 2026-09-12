// RelatorioDossieFiscal (v4.20 — Dossiê de defesa fiscal exportável)
// Pacote único pra responder fiscalização sem garimpar papel: demonstrações
// (v4.9) + balancetes (fechamentos) + comprovantes + atas de aprovação de
// contas (pareceres do Conselho Fiscal, v4.12). Tudo calculado na leitura.
// GET /api/dossie-fiscal/{ano?}
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const demonstracoes = require("../shared/demonstracoes");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Dossiê fiscal é matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const ano = parseInt(context.bindingData.ano, 10) || new Date().getFullYear();
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano, 11, 31);

  const balanco = await demonstracoes.calcularBalancoPatrimonial(pool, sql, fim);
  const drp = await demonstracoes.calcularDRP(pool, sql, inicio, fim);
  const mutacoes = await demonstracoes.calcularMutacoesPL(pool, sql, inicio, fim);
  const fluxo = await demonstracoes.calcularFluxoCaixa(pool, sql, inicio, fim);

  const balancetes = await pool.request().input("inicio", sql.Date, inicio.toISOString().slice(0, 10)).input("fim", sql.Date, fim.toISOString().slice(0, 10)).query(`
    SELECT f.FechamentoId AS fechamentoId, c.Nome AS congregacao, f.MesReferencia AS mesReferencia,
           f.TotalRecebido AS totalRecebido, f.ValorRetidoLocal AS valorRetidoLocal, f.ValorRepasseGeral AS valorRepasseGeral, f.Status AS status
    FROM FechamentosTesouraria f JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    WHERE f.MesReferencia BETWEEN LEFT(@inicio, 7) AND LEFT(@fim, 7) ORDER BY f.MesReferencia DESC
  `);

  const comprovantes = await pool.request().input("inicio", sql.DateTime2, inicio).input("fim", sql.DateTime2, fim).query(`
    SELECT s.SaidaId AS id, 'SAIDA' AS tipo, s.Descricao AS descricao, s.Valor AS valor, s.ComprovantePagamentoUrl AS comprovante
    FROM SaidasTesouraria s WHERE s.Status = 'PAGA' AND s.ComprovantePagamentoUrl IS NOT NULL AND s.PagoEm BETWEEN @inicio AND @fim
    UNION ALL
    SELECT l.LancamentoId AS id, 'ENTRADA' AS tipo, CONCAT('Termo ', l.TermoNumero) AS descricao, l.Valor AS valor, l.ComprovanteUrl AS comprovante
    FROM LancamentosTesouraria l WHERE l.Status = 'ATIVO' AND l.StatusConfirmacao = 'CONFIRMADO' AND l.ComprovanteUrl IS NOT NULL AND l.CriadoEm BETWEEN @inicio AND @fim
  `);

  const atas = await pool.request().input("inicio", sql.Char(7), `${ano}-01`).input("fim", sql.Char(7), `${ano}-12`).query(`
    SELECT ParecerId AS parecerId, MesReferencia AS mesReferencia, Decisao AS decisao, Justificativa AS justificativa
    FROM PareceresConselhoFiscal WHERE MesReferencia BETWEEN @inicio AND @fim ORDER BY MesReferencia DESC
  `);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      anoReferencia: ano,
      demonstracoes: { balanco, drp, mutacoes, fluxo },
      balancetes: balancetes.recordset,
      comprovantes: comprovantes.recordset,
      atasAprovacaoContas: atas.recordset
    }
  };
};
