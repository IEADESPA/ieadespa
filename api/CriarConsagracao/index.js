// CriarConsagracao
// Um líder (Dirigente/Pastor de Área) protocola um processo. Entra sempre
// com status inicial PROTOCOLADO. Exige a permissão "consagracoes".
//
// Auditoria de escopo (02/10/2026):
//  - só protocola para membro DENTRO do escopo de quem chama; fora do escopo responde igual a "matrícula não encontrada";
//  - o proponente é quem está protocolando: só o nível GERAL (a Secretaria) protocola em nome de outra pessoa — antes qualquer matrícula servia de "proponente" e dava
//    para forjar quem propôs o processo.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const trilhas = require("../shared/trilhas");
const { ehGeral, pessoaAlcancavel, carregarPessoa } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;

  const { membroId: membroInformado, cargoAtual, assunto, proponenteMembroId } = req.body || {};

  if (!membroInformado || !assunto || !proponenteMembroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, assunto, proponenteMembroId." } };
    return;
  }
  if (typeof assunto !== "string") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Assunto inválido." } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroInformado);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }
  const membroId = pessoa.membroId;

  // Proponente: o próprio usuário; só o geral indica outra pessoa (e ela precisa existir).
  let proponenteId = auth.idDeRota(proponenteMembroId);
  if (!ehGeral(usuario)) {
    if (proponenteId !== Number(usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "O proponente é quem protocola o processo. Só a administração geral protocola em nome de outra pessoa." } };
      return;
    }
  } else if (!proponenteId || !(await carregarPessoa(pool, proponenteId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Proponente não encontrado." } };
    return;
  }

  const membroResult = await pool.request().input("id", sql.Int, membroId).query(`SELECT Funcao FROM MembroReferencia WHERE MembroId = @id`);
  if (membroResult.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
    return;
  }

  // v6.9 — formação exigida para este tipo de consagração (TrilhaRequisitos,
  // contexto CONSAGRACAO, alvo = o "Assunto"). Sem requisito configurado,
  // nada muda; com requisito BLOQUEIA, o processo nem é protocolado.
  const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: assunto, membroId });
  if (formacao.bloqueado) {
    context.res = { status: 200, body: { sucesso: false, mensagem: formacao.mensagemBloqueio, formacao } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("cargoAtual", sql.NVarChar(100), cargoAtual || membroResult.recordset[0].Funcao || null)
    .input("assunto", sql.NVarChar(100), assunto)
    .input("proponenteMembroId", sql.Int, proponenteId)
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
    dadosDepois: { assunto, cargoAtual, proponenteMembroId: proponenteId }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Processo protocolado e enviado para a Secretaria.", consagracao, alertasFormacao: formacao.alertas }
  };
};
