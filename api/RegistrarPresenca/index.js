// RegistrarPresenca (Portaria / Check-in)
// 1. Precisa existir uma Sessão com Status = 'ABERTA'
// 2. A senha digitada tem que bater com a SenhaAcesso da sessão aberta
// 3. A matrícula precisa existir
// 4. A matrícula precisa estar no universo do órgão da sessão aberta
//    (shared/universo.js — ATIVO para a maioria dos órgãos, capacidade ativa
//    calculada pelo Estatuto para a Assembleia Geral, composição mista
//    Ordenação+Assentos para a CLI)
// 5. Não pode registrar presença duplicada na mesma sessão
const { getPool, sql } = require("../shared/db");
const { universoDoOrgao } = require("../shared/universo");

module.exports = async function (context, req) {
  const { matricula, senha } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha da reunião." } };
    return;
  }

  const pool = await getPool();
  const sessaoResult = await pool.request().query(
    `SELECT TOP 1 SessaoId AS sessaoId, OrgaoId AS orgaoId, SenhaAcesso AS senhaAcesso FROM Sessoes WHERE Status = 'ABERTA' ORDER BY SessaoId DESC`
  );
  const sessaoAberta = sessaoResult.recordset[0];
  if (!sessaoAberta) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma reunião aberta no momento." } };
    return;
  }
  if (String(senha).trim() !== String(sessaoAberta.senhaAcesso).trim()) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha da reunião incorreta." } };
    return;
  }

  const membroResult = await pool.request().input("mat", sql.Int, matricula)
    .query(`SELECT MembroId AS membroId, Nome AS nome FROM MembroReferencia WHERE MembroId = @mat`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada no sistema." } };
    return;
  }

  const orgaoResult = await pool.request().input("id", sql.Int, sessaoAberta.orgaoId)
    .query(`SELECT OrgaoId AS orgaoId, Sigla AS sigla FROM Orgaos WHERE OrgaoId = @id`);
  const orgao = orgaoResult.recordset[0] || null;
  const universo = await universoDoOrgao(pool, orgao);
  if (!universo.some(m => String(m.membroId) === String(membro.membroId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você não está na lista de participantes desta convocação." } };
    return;
  }

  const jaRegistrado = await pool.request().input("sessaoId", sql.Int, sessaoAberta.sessaoId).input("mat", sql.Int, matricula)
    .query(`SELECT 1 AS x FROM Presencas WHERE SessaoId = @sessaoId AND MembroId = @mat`);
  if (jaRegistrado.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Presença JÁ REGISTRADA para hoje!" } };
    return;
  }

  await pool.request().input("sessaoId", sql.Int, sessaoAberta.sessaoId).input("mat", sql.Int, matricula)
    .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@sessaoId, @mat, 1)`);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Presença confirmada: " + membro.nome }
  };
};
