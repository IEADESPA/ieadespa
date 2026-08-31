// RegistrarPresenca (Portaria / Check-in)
// Fiel ao registrarPresenca() do sistema atual:
// 1. Precisa existir uma Sessão com Status = 'ABERTA'
// 2. A senha digitada tem que bater com a SenhaAcesso da sessão aberta
// 3. A matrícula precisa existir
// 4. A matrícula precisa estar no universo do órgão da sessão aberta
//    (mockDb.universoDoOrgao — ATIVO para a maioria dos órgãos, capacidade ativa calculada
//    pelo Estatuto para a Assembleia Geral, composição mista Ordenação+Assentos para a CLI)
// 5. Não pode registrar presença duplicada na mesma sessão

const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const { matricula, senha } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha da reunião." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  //
  // const sessao = await pool.request()
  //   .query(`SELECT TOP 1 * FROM Sessoes WHERE Status = 'ABERTA' ORDER BY SessaoId DESC`);
  // if (sessao.recordset.length === 0) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma reunião aberta no momento." } };
  //   return;
  // }
  // const sessaoAtual = sessao.recordset[0];
  // if (String(senha).trim() !== String(sessaoAtual.SenhaAcesso).trim()) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Senha da reunião incorreta." } };
  //   return;
  // }
  //
  // const membro = await pool.request().input("mat", sql.Int, matricula)
  //   .query(`SELECT * FROM MembroReferencia WHERE MembroId = @mat`);
  // if (membro.recordset.length === 0) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada no sistema." } };
  //   return;
  // }
  // if (membro.recordset[0].Status !== "ATIVO") {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula inativa ou em licença." } };
  //   return;
  // }
  //
  // const jaRegistrado = await pool.request()
  //   .input("sessaoId", sql.Int, sessaoAtual.SessaoId).input("mat", sql.Int, matricula)
  //   .query(`SELECT 1 FROM Presencas WHERE SessaoId = @sessaoId AND MembroId = @mat`);
  // if (jaRegistrado.recordset.length > 0) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Presença JÁ REGISTRADA para hoje!" } };
  //   return;
  // }
  //
  // await pool.request().input("sessaoId", sql.Int, sessaoAtual.SessaoId).input("mat", sql.Int, matricula)
  //   .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@sessaoId, @mat, 1)`);
  //
  // context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Presença confirmada: " + membro.recordset[0].Nome } };
  // return;

  // ---- Modo mock (para testar localmente sem banco) ----
  const sessaoAberta = mockDb.getSessaoAberta();
  if (!sessaoAberta) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma reunião aberta no momento." } };
    return;
  }
  if (String(senha).trim() !== String(sessaoAberta.senhaAcesso).trim()) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha da reunião incorreta." } };
    return;
  }
  const membro = mockDb.getMembro(matricula);
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada no sistema." } };
    return;
  }
  const orgaoDaSessao = mockDb.getOrgao(sessaoAberta.orgaoId);
  const universo = mockDb.universoDoOrgao(orgaoDaSessao);
  if (!universo.some(m => String(m.membroId) === String(membro.membroId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você não está na lista de participantes desta convocação." } };
    return;
  }
  if (mockDb.jaRegistrouPresenca(sessaoAberta.sessaoId, membro.membroId)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Presença JÁ REGISTRADA para hoje!" } };
    return;
  }

  mockDb.registrarPresenca(sessaoAberta.sessaoId, membro.membroId);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Presença confirmada: " + membro.nome }
  };
};
