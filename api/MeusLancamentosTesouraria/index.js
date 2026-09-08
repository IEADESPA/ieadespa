// MeusLancamentosTesouraria (v4.1.1 — autoatendimento "Meu Painel"; v4.3
// expõe origem/statusConfirmacao/motivoRejeicaoConfirmacao para os
// autolançamentos que a própria pessoa registrou via AutolancamentoTesouraria)
// Transparência pedida diretamente: a pessoa que contribui deve conseguir
// ver, no próprio painel, o histórico do que registrou como dizimista —
// mesmo padrão de auto-atendimento por matrícula de MeusDadosLGPD/MinhaFoto
// (rota pública, sem exigir permissão "financeiro" — é só o dado da própria
// pessoa). Não devolve nada se a matrícula nunca foi cadastrada como
// dizimista em lugar nenhum (silencioso, sem vazar se a matrícula existe).
// GET /api/meus-lancamentos-tesouraria/{matricula}
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT l.TermoNumero AS termoNumero, c.Nome AS congregacaoNome, l.Tipo AS tipo, l.Valor AS valor,
           l.FormaPagamento AS formaPagamento, l.MesReferencia AS mesReferencia, l.Status AS status,
           l.Origem AS origem, l.StatusConfirmacao AS statusConfirmacao, l.MotivoRejeicaoConfirmacao AS motivoRejeicaoConfirmacao,
           CONVERT(varchar(10), l.CriadoEm, 120) AS dataLancamento
    FROM LancamentosTesouraria l
    JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId
    JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    WHERE d.MembroId = @mat
    ORDER BY l.MesReferencia DESC, ISNULL(l.TermoNumero, 999999999) DESC
  `);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
