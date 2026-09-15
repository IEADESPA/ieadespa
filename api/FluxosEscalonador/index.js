// FluxosEscalonador (vB.3 — Motor de workflow genérico)
// Rodada diária (10h30 UTC = 7h30 em Brasília — 30min depois do
// NotificacoesAgendador de propósito, pra não competir pelo mesmo pool de
// conexão no exato mesmo minuto). Escalona SLA estourado e avisa o novo
// responsável pela central de notificações (vB.2) — sem saída HTTP.
const { getPool } = require("../shared/db");
const { escalonarSLAsVencidos } = require("../shared/workflow");

module.exports = async function (context) {
  const pool = await getPool();
  const escalonadas = await escalonarSLAsVencidos(pool);
  context.log(`[FLUXOS] rodada de escalonamento: ${escalonadas} instância(s) escalonada(s) por SLA estourado.`);
};
