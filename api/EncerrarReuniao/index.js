// EncerrarReuniao
// Adaptado de encerrarReuniaoApp(). Ao encerrar:
// 1. Marca a sessão como ENCERRADA
// 2. Para todo membro ATIVO que NÃO bateu ponto, gera uma falta (Presente = 0)
// 3. A justificativa dessa falta é lançada depois, pela Secretaria, via
//    JustificarFalta — não existe (ainda) fila de crédito aprovado previamente
//    (ver "Próximos módulos sugeridos" no README).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const usuarioId = usuario.membroId;

  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o sessaoId na rota." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  //
  // await pool.request().input("id", sql.Int, sessaoId)
  //   .query(`UPDATE Sessoes SET Status = 'ENCERRADA' WHERE SessaoId = @id`);
  //
  // const jaBateram = await pool.request().input("id", sql.Int, sessaoId)
  //   .query(`SELECT MembroId FROM Presencas WHERE SessaoId = @id`);
  // const idsPresentes = jaBateram.recordset.map(r => r.MembroId);
  //
  // const ativos = await pool.request()
  //   .query(`SELECT MembroId FROM MembroReferencia WHERE Status = 'ATIVO'`);
  //
  // let totalPresentes = idsPresentes.length, totalFaltas = 0;
  //
  // for (const membro of ativos.recordset) {
  //   if (idsPresentes.includes(membro.MembroId)) continue;
  //   await pool.request().input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, membro.MembroId)
  //     .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente, FaltaJustificada) VALUES (@sessaoId, @mat, 0, 0)`);
  //   totalFaltas++;
  // }

  // ---- Modo mock ----
  const sessao = mockDb.getSessao(sessaoId);
  if (!sessao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }
  if (sessao.status !== "ABERTA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta reunião já está encerrada." } };
    return;
  }

  const { totalPresentes, totalFaltas, totalJustificadas } = mockDb.encerrarSessao(sessaoId);

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
