// RejeitarJustificativa
// Secretaria recusa um pedido de justificativa que o obreiro enviou — a falta
// continua como falta (não justificada), só some o pedido pendente.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const afmDb = require("../shared/afmDb");
const { ehGeral } = require("../shared/escopoRotas");
// v8.1 (revisão independente): o que tem efeito nas 3 faltas da CLI (abrir e encerrar a reunião, justificar, corrigir presença) é do nível GERAL nas permissões de reuniões
// — antes um Dirigente (que tem "reunioes" na congregação) podia abrir e encerrar 3 reuniões da CLI em minutos e excluir todo mundo.
const geralEmReunioes = (usuario) => ehGeral(auth.visaoDaPermissao(usuario, ["reunioes", "assembleia", "cli"]));
const SO_GERAL_CLI = { sucesso: false, mensagem: "A reunião da CLI conta falta para as 3 faltas do Estatuto (Art. 27): só a Secretaria Geral abre, encerra, justifica e corrige presença nela." };

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  // v8.1 (e2e-48): identificador malformado ou fora do Int dava 500 no banco; agora é 400.
  const sessaoId = auth.idDeRota(context.bindingData.sessaoId);
  const membroId = auth.idDeRota((req.body || {}).membroId);

  if (!sessaoId || !membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sessaoId (rota) e membroId (body)." } };
    return;
  }

  const pool = await getPool();
  const alvo = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT c.Nome AS Congregacao FROM MembroReferencia m
            LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  if (!auth.estaNoEscopo(usuario, alvo.recordset[0] ? alvo.recordset[0].Congregacao : null)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Este obreiro está fora do seu escopo de acesso." } };
    return;
  }

  const sessaoCLI = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.ContaFaltasCLI AS conta FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId AND o.Sigla = 'CLI' WHERE s.SessaoId = @id`)).recordset[0];
  if (sessaoCLI && !geralEmReunioes(usuario)) { context.res = { status: 403, body: SO_GERAL_CLI }; return; }

  const upd = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("membroId", sql.Int, membroId)
    .query(`UPDATE Presencas SET JustificativaPendente = NULL, PendenteCodigo = NULL WHERE SessaoId = @sessaoId AND MembroId = @membroId`);
  if (upd.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não há registro de frequência para esse membro nesta reunião." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Presencas",
    registroId: Number(membroId),
    acao: "Rejeitou solicitação de justificativa",
    usuarioId: usuario.membroId,
    dadosDepois: { sessaoId: Number(sessaoId) }
  });

  // v8.1: com o pedido pendente a exclusão/desmatrícula não nascia; recusado, a apuração é refeita
  let apuracao = "";
  if (sessaoCLI && sessaoCLI.conta) apuracao = afmDb.resumoDaApuracao(await afmDb.apurarSemFalhar(pool, { membroIds: [Number(membroId)] }, context.log.error));
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Solicitação rejeitada.${apuracao}` } };
};
