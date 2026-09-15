// cronAuth (Trava B-A) — gatilho de rotina diária via HTTP.
// Azure Static Web Apps (modelo gerenciado, decisão da vC.5) só aceita
// httpTrigger nas Functions internas — timerTrigger quebra o build
// ("invalid trigger of type 'timerTrigger'"), como a Trava B-A encontrou ao
// tentar publicar NotificacoesAgendador/FluxosEscalonador pela primeira vez.
// Em vez de sessão de usuário (exigirNivelGlobal — não existe "usuário
// logado" numa rotina automática), a rotina só roda com o segredo certo no
// cabeçalho, chamada por um workflow do GitHub Actions no horário agendado
// (mesmo padrão de site-event-notifications.yml).
function exigirSegredoRotina(req, context) {
  const esperado = process.env.CRON_SECRET;
  const recebido = req.headers?.["x-cron-secret"];
  if (!esperado || !recebido || recebido !== esperado) {
    context.res = { status: 401, body: { erro: "Não autorizado." } };
    return false;
  }
  return true;
}

module.exports = { exigirSegredoRotina };
