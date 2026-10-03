// AvaliarNotificacoes (vB.2 — Motor de notificações)
// Gatilho manual da mesma rodada que NotificacoesAgendador roda sozinha
// todo dia — só pra quem precisa forçar uma checagem sem esperar o
// horário agendado (teste, ou depois de corrigir dado que travava uma
// regra). Restrito a nível Global, mesmo critério de quem edita o catálogo.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { avaliarRegras } = require("../shared/notificacaoMotor");

module.exports = async function (context, req) {
  const usuario = auth.exigirNivelGlobal(req, context);
  if (!usuario) return;
  const pool = await getPool();
  const { criadas, emailsEnviados } = await avaliarRegras(pool);
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Rodada concluída: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`, criadas, emailsEnviados }
  };
};
