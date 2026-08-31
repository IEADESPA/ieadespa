// MinhaFrequencia (Painel Pessoal)
// Perfil (nome, matrícula, função, congregação, status), resumo (contagens +
// % de presença) e histórico do próprio membro em todas as sessões.
// Autenticação real (ligar isso à matrícula logada) fica para quando o painel
// pessoal se integrar ao sistema de membros/credenciais existente — por ora,
// consulta por matrícula digitada, igual ao check-in da Portaria.

const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;

  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const membro = await pool.request().input("mat", sql.Int, matricula)
  //   .query(`SELECT * FROM MembroReferencia WHERE MembroId = @mat`);
  // if (membro.recordset.length === 0) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
  //   return;
  // }
  // const historico = await pool.request().input("mat", sql.Int, matricula).query(`
  //   SELECT s.SessaoId, s.Descricao, s.DataSessao, p.Presente, p.FaltaJustificada, p.MotivoJustificativa
  //   FROM Presencas p JOIN Sessoes s ON s.SessaoId = p.SessaoId
  //   WHERE p.MembroId = @mat
  //   ORDER BY s.DataSessao DESC
  // `);
  // context.res = { status: 200, body: { sucesso: true, membro: membro.recordset[0], historico: historico.recordset } };
  // return;

  const membro = mockDb.getMembro(matricula);
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const congregacao = mockDb.getCongregacao(membro.congregacaoId);

  const historico = mockDb
    .listarFrequenciaPorMembro(matricula)
    .sort((a, b) => String(b.dataSessao).localeCompare(String(a.dataSessao)));

  const resumo = mockDb.resumoFrequenciaPorMembro(matricula);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      membro: Object.assign({}, membro, { congregacao: congregacao ? congregacao.nome : null }),
      resumo,
      historico
    }
  };
};
