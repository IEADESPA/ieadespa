// MinhaFrequencia (Painel Pessoal)
// Perfil (nome, matrícula, função, congregação, status), resumo (contagens +
// % de presença) e histórico do próprio membro em todas as sessões.
// Autenticação real (ligar isso à matrícula logada) fica para quando o painel
// pessoal se integrar ao sistema de membros/credenciais existente — por ora,
// consulta por matrícula digitada, igual ao check-in da Portaria.
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;

  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const membroResult = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, m.Funcao AS funcao, m.CongregacaoId AS congregacaoId,
           c.Nome AS congregacao, m.Status AS status
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.MembroId = @mat`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  const historicoResult = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT s.SessaoId AS sessaoId, s.Descricao AS descricao, CONVERT(varchar(10), s.DataSessao, 120) AS dataSessao,
           p.Presente AS presente, p.FaltaJustificada AS faltaJustificada, p.MotivoJustificativa AS motivoJustificativa,
           p.JustificativaPendente AS justificativaPendente
    FROM Presencas p
    JOIN Sessoes s ON s.SessaoId = p.SessaoId
    WHERE p.MembroId = @mat
    ORDER BY s.DataSessao DESC`);
  const historico = historicoResult.recordset;

  const totalReunioes = historico.length;
  const totalPresencas = historico.filter(h => h.presente).length;
  const totalFaltas = historico.filter(h => !h.presente).length;
  const totalJustificadas = historico.filter(h => !h.presente && h.faltaJustificada).length;
  const resumo = {
    totalReunioes,
    totalPresencas,
    totalFaltas,
    totalJustificadas,
    percentualPresenca: totalReunioes > 0 ? Math.round((totalPresencas / totalReunioes) * 100) : null
  };

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, membro, resumo, historico }
  };
};
