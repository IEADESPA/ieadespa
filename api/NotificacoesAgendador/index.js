// NotificacoesAgendador (vB.2 — Motor de notificações)
// Rodada diária automática (10h UTC = 7h em Brasília) do avaliador de
// regras. Sem saída HTTP — só gera as notificações/e-mails que faltam
// (shared/notificacaoMotor.js já é idempotente por origem, então rodar
// isso todo dia nunca duplica aviso do mesmo fato gerador).
const { getPool } = require("../shared/db");
const { avaliarRegras } = require("../shared/notificacaoMotor");

module.exports = async function (context) {
  const pool = await getPool();
  const { criadas, emailsEnviados } = await avaliarRegras(pool);
  context.log(`[NOTIFICACOES] rodada agendada: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`);
};
