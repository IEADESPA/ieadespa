// FluxosEscalonador (vB.3 — Motor de workflow genérico)
// Rodada diária (10h30 UTC = 7h30 em Brasília — 30min depois do
// NotificacoesAgendador de propósito, pra não competir pelo mesmo pool de
// conexão no exato mesmo minuto). Escalona SLA estourado e avisa o novo
// responsável pela central de notificações (vB.2).
// Achado real da Trava B-A: Azure Static Web Apps (modelo gerenciado) não
// aceita timerTrigger nas Functions internas — bloqueava o deploy inteiro.
// Virou httpTrigger acionado por um workflow agendado do GitHub Actions
// (.github/workflows/rotinas-diarias.yml), mesma solução do
// NotificacoesAgendador (shared/cronAuth.js).
const { getPool } = require("../shared/db");
const { escalonarSLAsVencidos } = require("../shared/workflow");
const { exigirSegredoRotina } = require("../shared/cronAuth");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  const escalonadas = await escalonarSLAsVencidos(pool);
  context.log(`[FLUXOS] rodada de escalonamento: ${escalonadas} instância(s) escalonada(s) por SLA estourado.`);
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, escalonadas },
  };
};
