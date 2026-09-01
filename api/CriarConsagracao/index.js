// CriarConsagracao
// Um líder (Dirigente/Pastor de Área) protocola um processo. Entra sempre
// com status inicial PROTOCOLADO. Exige a permissão "consagracoes".
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const { membroId, cargoAtual, assunto, proponenteMembroId } = req.body || {};

  if (!membroId || !assunto || !proponenteMembroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, assunto, proponenteMembroId." } };
    return;
  }

  const pool = await getPool();
  const membroResult = await pool.request().input("id", sql.Int, membroId).query(`SELECT Funcao FROM MembroReferencia WHERE MembroId = @id`);
  if (membroResult.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("cargoAtual", sql.NVarChar(100), cargoAtual || membroResult.recordset[0].Funcao || null)
    .input("assunto", sql.NVarChar(100), assunto)
    .input("proponenteMembroId", sql.Int, proponenteMembroId)
    .query(`
      INSERT INTO Consagracoes (MembroId, CargoAtual, Assunto, ProponenteMembroId, Status)
      OUTPUT INSERTED.ConsagracaoId
      VALUES (@membroId, @cargoAtual, @assunto, @proponenteMembroId, 'PROTOCOLADO')
    `);
  const consagracaoId = result.recordset[0].ConsagracaoId;

  const consagracaoResult = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).query(`
    SELECT c.ConsagracaoId AS consagracaoId, c.MembroId AS membroId, m.Nome AS nome,
           c.CargoAtual AS cargoAtual, c.Assunto AS assunto, p.Nome AS proponente,
           c.Status AS status, CONVERT(varchar(10), c.DataProtocolo, 120) AS dataProtocolo
    FROM Consagracoes c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN MembroReferencia p ON p.MembroId = c.ProponenteMembroId
    WHERE c.ConsagracaoId = @id`);
  const consagracao = consagracaoResult.recordset[0];

  await registrarAuditoria({
    tabela: "Consagracoes",
    registroId: Number(membroId),
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
