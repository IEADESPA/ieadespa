// AbrirReuniao
// Motor único de sessão, reaproveitado por QUALQUER órgão (Assembleia, CLI,
// Diretoria, CEI, Conselho Fiscal — ver GetOrgaos). Prioridade em vez de trava
// global: a Assembleia Geral é exclusiva (órgão soberano do Regimento) — enquanto
// ela está aberta, nada mais abre, e ela não abre se já houver outra reunião em
// andamento. Os demais órgãos só travam contra si mesmos (não dá pra ter duas
// sessões abertas do mesmo órgão ao mesmo tempo, mas CLI e Conselho Fiscal, por
// exemplo, podem correr em paralelo).
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

  const orgaoResult = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT OrgaoId AS orgaoId, Sigla AS sigla, Nome AS nome FROM Orgaos WHERE OrgaoId = @id`);
  const orgao = orgaoResult.recordset[0];
  if (!orgao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
    return;
  }

  const assembleiaAberta = await pool.request().query(
    `SELECT TOP 1 1 AS x FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.Status = 'ABERTA' AND o.Sigla = 'ASSEMBLEIA_GERAL'`
  );
  if (assembleiaAberta.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "A Assembleia Geral está em andamento — nenhuma outra reunião pode ser aberta até ela encerrar." } };
    return;
  }

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    const qualquerAberta = await pool.request().query(`SELECT TOP 1 1 AS x FROM Sessoes WHERE Status = 'ABERTA'`);
    if (qualquerAberta.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe outra reunião em andamento — encerre-a antes de abrir a Assembleia Geral (ela é exclusiva)." } };
      return;
    }
  } else {
    const mesmoOrgaoAberto = await pool.request().input("orgaoId", sql.Int, orgaoId).query(
      `SELECT TOP 1 1 AS x FROM Sessoes WHERE Status = 'ABERTA' AND OrgaoId = @orgaoId`
    );
    if (mesmoOrgaoAberto.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Já existe uma reunião ABERTA do ${orgao.nome}. Encerre-a antes de abrir outra.` } };
      return;
    }
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
    dadosDepois: { descricao, orgaoId, orgaoSigla: orgao.sigla }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Reunião aberta!\nSenha: ${senhaAcesso}`, sessaoId }
  };
};
