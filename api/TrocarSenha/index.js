// TrocarSenha
// Self-service: quem entrou com a SENHA de acesso administrativo (tem Lideranca) troca a própria senha.
// POST /api/auth/senha   body: { senhaAtual, novaSenha }
//
// fecho da v7.5 — antes, "a sessão (token) já é a prova de identidade" e a senha atual não era pedida. Com a entrada por PIN e por código de e-mail isso passou a ser
// perigoso: a sessão de PIN/código, mesmo de quem tem cargo na liderança, trocaria a senha e viraria administrador no login seguinte. Agora (1) só vale a sessão aberta
// com a senha administrativa (auth.exigirSessaoDeLideranca) e (2) a senha ATUAL é conferida, contando nas mesmas tentativas do login: um token roubado não vira posse
// permanente da conta.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const pinMembro = require("../shared/pinMembro");

module.exports = async function (context, req) {
  const usuario = auth.exigirSessaoDeLideranca(req, context);
  if (!usuario) return;

  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const { senhaAtual, novaSenha } = corpo;
  if (typeof senhaAtual !== "string" || !senhaAtual) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a senha atual." } };
    return;
  }
  if (typeof novaSenha !== "string" || !novaSenha.trim() || novaSenha.length > 200) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a nova senha (até 200 caracteres)." } };
    return;
  }

  const pool = await getPool();
  const membroId = auth.idDeRota(usuario.membroId);
  const linhas = membroId ? (await pool.request().input("id", sql.Int, membroId).query(`SELECT SenhaHash FROM Lideranca WHERE MembroId = @id`)).recordset : [];
  if (linhas.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Não encontrei seu acesso à Secretaria." } };
    return;
  }
  const reserva = await pinMembro.reservarTentativa(pool, membroId, "SENHA", pinMembro.LIMITE_FALHAS_SENHA);
  if (reserva.bloqueado || !linhas.some((l) => l.SenhaHash && auth.verificarSenha(senhaAtual, l.SenhaHash))) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "A senha atual não confere, ou há muitas tentativas seguidas." } };
    return;
  }
  await pinMembro.limparTentativas(pool, membroId, "SENHA");

  const senhaHash = auth.hashSenha(novaSenha);
  await pool.request().input("id", sql.Int, membroId).input("senhaHash", sql.NVarChar(200), senhaHash)
    .query(`UPDATE Lideranca SET SenhaHash = @senhaHash WHERE MembroId = @id`);

  // Nunca grava a senha (nem hash) no AuditLog — só o fato de que ela mudou.
  await registrarAuditoria({ tabela: "Lideranca", registroId: membroId, acao: "Trocou a própria senha", usuarioId: membroId });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Senha alterada." } };
};
