// NotificacoesAgendador (vB.2 — Motor de notificações)
// Rodada diária (10h UTC = 7h em Brasília) do avaliador de regras.
// Achado real da Trava B-A: Azure Static Web Apps (modelo gerenciado) não
// aceita timerTrigger nas Functions internas — bloqueava o deploy inteiro.
// Virou httpTrigger acionado por um workflow agendado do GitHub Actions
// (.github/workflows/rotinas-diarias.yml), protegido por segredo
// (shared/cronAuth.js) em vez de sessão de usuário — rotina automática não
// tem "usuário logado". avaliarRegras já é idempotente por origem, então
// rodar isso todo dia nunca duplica aviso do mesmo fato gerador.
const { getPool } = require("../shared/db");
const { avaliarRegras } = require("../shared/notificacaoMotor");
const { exigirSegredoRotina } = require("../shared/cronAuth");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  const { criadas, emailsEnviados } = await avaliarRegras(pool);
  context.log(`[NOTIFICACOES] rodada agendada: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`);
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, criadas, emailsEnviados },
  };
};
