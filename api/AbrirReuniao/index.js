// AbrirReuniao
// Só pode existir UMA sessão ABERTA por vez, em qualquer órgão (mesma regra
// do sistema atual, para não confundir a Portaria).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const { orgaoId, descricao, senhaAcesso } = req.body || {};
  const usuarioId = usuario.membroId;

  if (!orgaoId || !descricao || !senhaAcesso) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: orgaoId, descricao, senhaAcesso." } };
    return;
  }

  const pool = await getPool();
  const aberta = await pool.request().query(`SELECT TOP 1 1 AS x FROM Sessoes WHERE Status = 'ABERTA'`);
  if (aberta.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe uma reunião ABERTA no momento. Encerre-a antes de abrir outra." } };
    return;
  }

  const result = await pool.request()
    .input("orgaoId", sql.Int, orgaoId)
    .input("descricao", sql.NVarChar(200), descricao)
    .input("senha", sql.NVarChar(50), senhaAcesso)
    .query(`
      INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, SenhaAcesso)
      OUTPUT INSERTED.SessaoId
      VALUES (@orgaoId, @descricao, CAST(SYSUTCDATETIME() AS DATE), 'ABERTA', @senha)
    `);
  const sessaoId = result.recordset[0].SessaoId;

  await registrarAuditoria({
    tabela: "Sessoes",
    registroId: sessaoId,
    acao: "Abriu reunião",
    usuarioId,
    dadosDepois: { descricao, orgaoId }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Reunião aberta!\nSenha: ${senhaAcesso}`, sessaoId }
  };
};
