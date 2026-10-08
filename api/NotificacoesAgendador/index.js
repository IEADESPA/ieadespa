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
const { anonimizarIpsVencidos } = require("../shared/voluntariadoDb");
const setoresTecnicosDb = require("../shared/setoresTecnicosDb");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  const { criadas, emailsEnviados } = await avaliarRegras(pool);
  context.log(`[NOTIFICACOES] rodada agendada: ${criadas} notificação(ões) nova(s), ${emailsEnviados} e-mail(s) enviado(s).`);
  // v7.5 — retenção LGPD do voluntariado: o IP do aceite digital é anonimizado 5 anos depois do último serviço. Fail-soft: uma falha aqui não derruba a rodada de avisos.
  let retencaoVoluntariado = null;
  try {
    retencaoVoluntariado = await anonimizarIpsVencidos(pool);
    context.log(`[VOLUNTARIADO] retenção LGPD: ${retencaoVoluntariado.anonimizados} IP(s) de aceite anonimizado(s) (prazo ${retencaoVoluntariado.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[VOLUNTARIADO] falha na retenção LGPD:", e.message);
  }
  // v7.6 — o mesmo para o Termo de Adesão dos Setores Técnicos: o IP do aceite digital é anonimizado 5 anos depois que o vínculo termina. Fail-soft também.
  let retencaoSetores = null;
  try {
    retencaoSetores = await setoresTecnicosDb.anonimizarIpsVencidos(pool);
    context.log(`[SETORES] retenção LGPD: ${retencaoSetores.anonimizados} IP(s) de aceite anonimizado(s) (prazo ${retencaoSetores.retencaoDias} dias).`);
  } catch (e) {
    context.log.error("[SETORES] falha na retenção LGPD:", e.message);
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, criadas, emailsEnviados, retencaoVoluntariado, retencaoSetores },
  };
};
