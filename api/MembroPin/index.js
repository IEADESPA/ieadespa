// MembroPin (fecho da v7.5) — a própria pessoa cria ou troca o seu PIN de 4 dígitos.
// POST /api/membro/pin -> { pin, pinAtual? }   (exige sessão; vale para a matrícula da sessão, nunca para outra)
//
// Quem entrou agora por código de e-mail, ou com o PIN provisório que a Secretaria gerou, já provou quem é e escolhe o PIN novo sem informar o antigo
// ("esqueci o PIN" não trava ninguém). Nos demais casos, trocar um PIN que já existe exige o PIN atual (contado nas mesmas tentativas do login).
// O PIN fácil de adivinhar (1234, 0000, ano, data de nascimento, final da matrícula) é recusado. O PIN nunca vai para a auditoria nem para o log.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const pinMembro = require("../shared/pinMembro");
const { registrarAuditoria } = require("../shared/auditoria");

module.exports = async function (context, req) {
  // É a ÚNICA rota que aceita a sessão do PIN provisório (a pessoa entrou com ele justamente para escolher o dela).
  const usuario = auth.exigirLoginIgnorandoTermos(req, context, { permitirProvisorio: true });
  if (!usuario) return;
  const membroId = auth.idDeRota(usuario.membroId);
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (!membroId) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Sessão inválida." } };
    return;
  }
  if (!pinMembro.formatoPinValido(corpo.pin)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "O PIN tem 4 números, sem letras nem espaços." } };
    return;
  }

  const pool = await getPool();
  const membro = (await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT MembroId, DataNascimento FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`)).recordset[0];
  if (!membro) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Sessão inválida." } };
    return;
  }

  // O PIN atual vem ANTES de qualquer outra conferência: com uma sessão roubada, dizer "esse PIN é fraco" antes de conferir o atual deixaria sondar a data de nascimento.
  const atual = await pinMembro.lerPin(pool, membroId);
  if (atual && usuario.via !== "CODIGO" && usuario.pinProvisorio !== true) {
    if (!pinMembro.formatoPinValido(corpo.pinAtual)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o PIN atual (4 números). Se esqueceu, saia e entre pelo código enviado ao seu e-mail." } };
      return;
    }
    const reserva = await pinMembro.reservarTentativa(pool, membroId, "PIN");
    if (reserva.bloqueado || !pinMembro.verificarPin(corpo.pinAtual, membroId, atual.pinHash)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "O PIN atual não confere, ou há muitas tentativas. Se esqueceu, saia e entre pelo código enviado ao seu e-mail." } };
      return;
    }
  }

  const fraco = pinMembro.pinFraco(corpo.pin, { nascimento: membro.DataNascimento, matricula: membroId });
  if (fraco.fraco) {
    context.res = { status: 422, body: { sucesso: false, mensagem: pinMembro.mensagemPinFraco(fraco) } };
    return;
  }

  await pinMembro.gravarPin(pool, membroId, corpo.pin);
  // v7.6 — PIN novo derruba as OUTRAS sessões da pessoa (a atual continua), como a troca de senha.
  await auth.revogarSessoesDoMembro(pool, sql, membroId, { exceto: usuario.sid });
  const via = usuario.pinProvisorio === true ? "PROVISORIO" : usuario.via === "CODIGO" ? "CODIGO" : "PIN_ATUAL";
  await registrarAuditoria({ tabela: "MembroPins", registroId: membroId, acao: atual ? "PIN_ALTERADO" : "PIN_CRIADO", usuarioId: membroId, dadosDepois: { via } });

  // O mesmo token, com a marca de PIN provisório tirada e a MESMA validade (trocar o PIN não renova as 12 horas da sessão).
  const token = auth.reassinarMantendoValidade(auth.extrairToken(req), { pinProvisorio: false });
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: atual ? "✅ PIN alterado." : "✅ PIN criado. Da próxima vez, entre com a matrícula e o PIN.", token } };
};
