/**
 * Regra única de "ainda está aberto?" para camisetas e inscrições (06/10/2026).
 *
 * - `ativo` manda acima de tudo: desativou, fechou — mesmo com prazo no futuro.
 * - `ate` é o último DIA (inclusive) em que se aceita, no horário de Brasília
 *   (UTC-3, sem horário de verão). "2026-10-14" aceita até 14/10 23:59:59.
 *   Antes, a página fazia `new Date("2026-10-14") < Date.now()`, que vale
 *   14/10 00:00 UTC = 13/10 21:00 em Brasília: fechava um dia antes do que o
 *   prazo dizia.
 */
function fimDoDiaBrasilia(valor) {
  if (!valor) return null;
  const texto = String(valor);
  const soDia = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  const fim = new Date(soDia ? `${texto}T23:59:59-03:00` : texto);
  return Number.isNaN(fim.getTime()) ? null : fim;
}

function formatarDia(valor) {
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * @param {{ativo: boolean, ate: string|null, rotulo: "pedidos"|"inscrições", agora?: number}} p
 * @returns {{aberto: boolean, motivo: null|"inativo"|"prazo", mensagem: string|null, ate: string|null}}
 */
function avaliarJanela({ ativo, ate, rotulo, agora = Date.now() }) {
  if (!ativo) {
    return { aberto: false, motivo: "inativo", mensagem: rotulo === "inscrições" ? "As inscrições estão encerradas." : "Esta campanha está encerrada e não aceita mais pedidos.", ate: ate || null };
  }
  const fim = fimDoDiaBrasilia(ate);
  if (fim && agora > fim.getTime()) {
    const dia = formatarDia(ate);
    return {
      aberto: false,
      motivo: "prazo",
      mensagem: rotulo === "inscrições" ? `O prazo de inscrição encerrou em ${dia}.` : `O prazo de pedidos desta campanha encerrou em ${dia}.`,
      ate: ate || null,
    };
  }
  return { aberto: true, motivo: null, mensagem: null, ate: ate || null };
}

module.exports = { avaliarJanela, fimDoDiaBrasilia, formatarDia };
