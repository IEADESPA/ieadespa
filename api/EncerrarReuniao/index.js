// EncerrarReuniao
// Ao encerrar:
// 1. Marca a sessão como ENCERRADA
// 2. Para todo membro do universo do órgão (shared/universo.js) que NÃO
//    bateu ponto, gera uma falta (Presente = 0)
// 3. A justificativa dessa falta é lançada depois, pela Secretaria, via
//    JustificarFalta.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { universoDoOrgao } = require("../shared/universo");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const usuarioId = usuario.membroId;

  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o sessaoId na rota." } };
    return;
  }

  const pool = await getPool();
  const sessaoResult = await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT SessaoId AS sessaoId, OrgaoId AS orgaoId, Status AS status FROM Sessoes WHERE SessaoId = @id`);
  const sessao = sessaoResult.recordset[0];
  if (!sessao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }
  if (sessao.status !== "ABERTA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta reunião já está encerrada." } };
    return;
  }

  await pool.request().input("id", sql.Int, sessaoId).query(`UPDATE Sessoes SET Status = 'ENCERRADA' WHERE SessaoId = @id`);

  const orgaoResult = await pool.request().input("id", sql.Int, sessao.orgaoId)
    .query(`SELECT OrgaoId AS orgaoId, Sigla AS sigla FROM Orgaos WHERE OrgaoId = @id`);
  const orgao = orgaoResult.recordset[0] || null;

  const presencasResult = await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT MembroId AS membroId, Presente AS presente, FaltaJustificada AS faltaJustificada FROM Presencas WHERE SessaoId = @id`);
  const idsComPresenca = new Set(presencasResult.recordset.map(p => p.membroId));

  const universo = await universoDoOrgao(pool, orgao);
  let totalFaltas = 0;
  for (const membro of universo) {
    if (idsComPresenca.has(membro.membroId)) continue;
    await pool.request().input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, membro.membroId)
      .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente, FaltaJustificada) VALUES (@sessaoId, @mat, 0, 0)`);
    totalFaltas++;
  }

  const totalPresentes = presencasResult.recordset.filter(p => p.presente).length;
  const totalJustificadas = presencasResult.recordset.filter(p => !p.presente && p.faltaJustificada).length;

  await registrarAuditoria({ tabela: "Sessoes", registroId: Number(sessaoId), acao: "Encerrou reunião", usuarioId });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      mensagem: `✅ Reunião Encerrada!\nPresentes: ${totalPresentes}\nFaltas geradas: ${totalFaltas}\nJustificadas consumidas: ${totalJustificadas}`
    }
  };
};
