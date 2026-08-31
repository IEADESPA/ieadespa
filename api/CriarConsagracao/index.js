// CriarConsagracao
// Adaptado de enviarPropostaConsagracaoApp(). Um líder (Dirigente/Pastor de Área)
// protocola um processo. Entra sempre com status inicial PROTOCOLADO. Exige a
// permissão "consagracoes".
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const { membroId, cargoAtual, assunto, proponenteMembroId } = req.body || {};

  if (!membroId || !assunto || !proponenteMembroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, assunto, proponenteMembroId." } };
    return;
  }
  if (!mockDb.getMembro(membroId)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // await pool.request()
  //   .input("membroId", sql.Int, membroId)
  //   .input("cargoAtual", sql.NVarChar, cargoAtual || null)
  //   .input("assunto", sql.NVarChar, assunto)
  //   .input("proponenteMembroId", sql.Int, proponenteMembroId)
  //   .query(`
  //     INSERT INTO Consagracoes (MembroId, CargoAtual, Assunto, ProponenteMembroId, Status)
  //     VALUES (@membroId, @cargoAtual, @assunto, @proponenteMembroId, 'PROTOCOLADO')
  //   `);

  const consagracao = mockDb.criarConsagracao({ membroId, cargoAtual, assunto, proponenteMembroId });

  await registrarAuditoria({
    tabela: "Consagracoes",
    registroId: membroId,
    acao: "Protocolou processo",
    usuarioId: usuario.membroId,
    dadosDepois: { assunto, cargoAtual }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo protocolado e enviado para a Secretaria.", consagracao }
  };
};
