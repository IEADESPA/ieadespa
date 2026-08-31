// AbrirReuniao
// Adaptado de abrirNovaReuniaoApp(). Só pode existir UMA sessão ABERTA por vez
// (mesma regra do sistema atual, para não confundir a Portaria).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const { orgaoId, descricao, senhaAcesso } = req.body || {};
  const usuarioId = usuario.membroId;

  if (!orgaoId || !descricao || !senhaAcesso) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: orgaoId, descricao, senhaAcesso." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const aberta = await pool.request().input("orgaoId", sql.Int, orgaoId)
  //   .query(`SELECT 1 FROM Sessoes WHERE OrgaoId = @orgaoId AND Status = 'ABERTA'`);
  // if (aberta.recordset.length > 0) {
  //   context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe reunião ABERTA para este órgão." } };
  //   return;
  // }
  // const result = await pool.request()
  //   .input("orgaoId", sql.Int, orgaoId).input("descricao", sql.NVarChar, descricao).input("senha", sql.NVarChar, senhaAcesso)
  //   .query(`
  //     INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, SenhaAcesso)
  //     OUTPUT INSERTED.SessaoId
  //     VALUES (@orgaoId, @descricao, CAST(SYSUTCDATETIME() AS DATE), 'ABERTA', @senha)
  //   `);
  // const sessaoId = result.recordset[0].SessaoId;

  // ---- Modo mock ----
  if (mockDb.getSessaoAberta()) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe uma reunião ABERTA no momento. Encerre-a antes de abrir outra." } };
    return;
  }

  const sessao = mockDb.criarSessao({ orgaoId, descricao, senhaAcesso });

  await registrarAuditoria({
    tabela: "Sessoes",
    registroId: sessao.sessaoId,
    acao: "Abriu reunião",
    usuarioId,
    dadosDepois: { descricao, orgaoId }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Reunião aberta!\nSenha: ${senhaAcesso}`, sessaoId: sessao.sessaoId }
  };
};
