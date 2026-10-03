/** Meia-noite do domingo da semana atual — início da "semana" pra rankings/prazos. */
export function domingoAtual(): Date {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - diaSemana);
  domingo.setHours(0, 0, 0, 0);
  return domingo;
}
