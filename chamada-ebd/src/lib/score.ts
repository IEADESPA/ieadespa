import type { Chamada, PresencaAluno, ScoreConfig } from "@/generated/prisma/client";

export const SCORE_CONFIG_PADRAO: Omit<ScoreConfig, "id" | "campoId"> = {
  pesoPresenca: 1,
  pesoPontual: 1,
  pesoBiblia: 1,
  pesoRevista: 1,
  pesoVisitante: 2,
  pesoOferta: 0,
  pesoAtividade: 1,
};

type ChamadaComPresencas = Chamada & { presencas: PresencaAluno[] };

/**
 * Calcula o placar (score) de uma chamada com base nos pesos configurados
 * para o campo. Inspirado no método de pontuação usado por escolas
 * dominicais (presença, pontualidade, uso de bíblia/revista e visitantes).
 */
export function calcularScoreChamada(
  chamada: ChamadaComPresencas,
  config: Omit<ScoreConfig, "id" | "campoId"> = SCORE_CONFIG_PADRAO
) {
  const matriculados = chamada.presencas.length;
  const presentes = chamada.presencas.filter((p) => p.presente).length;
  const comBiblia = chamada.presencas.filter((p) => p.trouxeBiblia).length;
  const comRevista = chamada.presencas.filter((p) => p.trouxeRevista).length;

  const taxaPresenca = matriculados > 0 ? presentes / matriculados : 0;
  const taxaBiblia = matriculados > 0 ? comBiblia / matriculados : 0;
  const taxaRevista = matriculados > 0 ? comRevista / matriculados : 0;

  const pontos =
    taxaPresenca * 100 * config.pesoPresenca +
    (chamada.inicioPontual ? 100 : 0) * config.pesoPontual +
    taxaBiblia * 100 * config.pesoBiblia +
    taxaRevista * 100 * config.pesoRevista +
    chamada.visitantes * 10 * config.pesoVisitante +
    chamada.oferta * config.pesoOferta;

  return {
    matriculados,
    presentes,
    comBiblia,
    comRevista,
    taxaPresenca,
    pontos: Math.round(pontos * 100) / 100,
  };
}
