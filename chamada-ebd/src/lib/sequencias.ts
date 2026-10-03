import { prisma } from "@/lib/prisma";

export type Sequencias = {
  presenca: number;
  biblia: number;
  revista: number;
  combo: number;
};

// Quantas faltas SEGUIDAS o aluno pode ter sem perder a ofensiva (como o
// "congelar" do Duolingo) — na 3ª falta seguida a sequência volta a zero.
const TOLERANCIA_FALTAS = 2;

/**
 * Maior sequência ATUAL (não a histórica) de chamadas consecutivas em que a
 * condição foi cumprida, tolerando até `TOLERANCIA_FALTAS` faltas seguidas
 * antes de zerar — funciona como uma "ofensiva" no estilo Duolingo.
 */
function sequenciaAtual(condicoes: boolean[]): number {
  let atual = 0;
  let faltasSeguidas = 0;
  for (const cumpriu of condicoes) {
    if (cumpriu) {
      atual += 1;
      faltasSeguidas = 0;
    } else {
      faltasSeguidas += 1;
      if (faltasSeguidas > TOLERANCIA_FALTAS) {
        atual = 0;
        faltasSeguidas = 0;
      }
    }
  }
  return atual;
}

/**
 * As 4 ofensivas do aluno: presença, bíblia, revista e o combo dos três
 * juntos na mesma chamada. Calculadas sob demanda a partir do histórico de
 * presença, na ordem cronológica das chamadas.
 */
export async function calcularSequencias(alunoId: string): Promise<Sequencias> {
  const presencas = await prisma.presencaAluno.findMany({
    where: { alunoId },
    include: { chamada: { select: { data: true } } },
    orderBy: { chamada: { data: "asc" } },
  });

  return {
    presenca: sequenciaAtual(presencas.map((p) => p.presente)),
    biblia: sequenciaAtual(presencas.map((p) => p.presente && p.trouxeBiblia)),
    revista: sequenciaAtual(presencas.map((p) => p.presente && p.trouxeRevista)),
    combo: sequenciaAtual(presencas.map((p) => p.presente && p.trouxeBiblia && p.trouxeRevista)),
  };
}
