import { prisma } from "@/lib/prisma";
import { SCORE_CONFIG_PADRAO } from "@/lib/score";
import type { Prisma, ScoreConfig } from "@/generated/prisma/client";

type Config = Omit<ScoreConfig, "id" | "campoId">;

/**
 * Pontuação unificada de um aluno: presença + bíblia + revista (por
 * chamada) somadas aos pontos ganhos em atividades — a mesma régua serve
 * tanto para o placar pessoal do aluno quanto para o ranking geral nos
 * relatórios.
 */
export function calcularPontuacaoAluno(
  presencas: { presente: boolean; trouxeBiblia: boolean; trouxeRevista: boolean }[],
  respostas: { pontosGanhos: number }[],
  config: Config = SCORE_CONFIG_PADRAO
) {
  const presencaPontos = presencas.filter((p) => p.presente).length * config.pesoPresenca * 10;
  const bibliaPontos = presencas.filter((p) => p.trouxeBiblia).length * config.pesoBiblia * 5;
  const revistaPontos = presencas.filter((p) => p.trouxeRevista).length * config.pesoRevista * 5;
  const atividadePontos = respostas.reduce((s, r) => s + r.pontosGanhos, 0) * config.pesoAtividade;

  const total = presencaPontos + bibliaPontos + revistaPontos + atividadePontos;
  return {
    presencaPontos: Math.round(presencaPontos),
    bibliaPontos: Math.round(bibliaPontos),
    revistaPontos: Math.round(revistaPontos),
    atividadePontos: Math.round(atividadePontos),
    total: Math.round(total),
  };
}

/**
 * Ranking geral (presença + atividades) dos alunos que casam um filtro Prisma
 * qualquer. Passe `desde` para restringir a uma janela recente (ex: ranking
 * da semana) — considera só chamadas/atividades concluídas a partir dali.
 */
export async function rankingGeralAlunos(where: Prisma.AlunoWhereInput, config?: Config, desde?: Date) {
  const alunos = await prisma.aluno.findMany({
    where: { ...where, status: "ATIVO" },
    include: {
      turma: { select: { nome: true } },
      congregacao: { select: { nome: true } },
      presencas: {
        where: desde ? { chamada: { data: { gte: desde } } } : undefined,
        select: { presente: true, trouxeBiblia: true, trouxeRevista: true },
      },
      respostas: {
        where: desde ? { concluidaEm: { gte: desde } } : undefined,
        select: { pontosGanhos: true },
      },
    },
  });

  return alunos
    .map((a) => ({
      alunoId: a.id,
      nome: a.nome,
      turmaNome: a.turma.nome,
      congregacaoNome: a.congregacao.nome,
      ...calcularPontuacaoAluno(a.presencas, a.respostas, config),
    }))
    .sort((a, b) => b.total - a.total);
}
