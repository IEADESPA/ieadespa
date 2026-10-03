// shared/dataBrasilia.js (Trava 6-B)
// "Hoje" no calendário de Brasília (UTC-3; sem horário de verão desde 2019).
// As Functions rodam em UTC: com `new Date().getDate()`, das 21h à meia-noite
// o servidor já está no dia seguinte — certificado que vale "até hoje"
// aparecia vencido 3 horas antes, menor de idade fazia aniversário à noite
// da véspera, a carência do fechamento trimestral andava um dia. Toda regra
// de data da FASE 6 passa a perguntar o dia aqui.
const DESLOCAMENTO_BRASILIA_MS = 3 * 3600 * 1000;

function hojeBrasilia(agora = new Date()) {
  return new Date(agora.getTime() - DESLOCAMENTO_BRASILIA_MS).toISOString().slice(0, 10);
}

module.exports = { hojeBrasilia };
