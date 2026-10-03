import { prisma } from "@/lib/prisma";
import type { TipoRegraConquista } from "@/generated/prisma/client";

function trimestreDe(data: Date) {
  return Math.ceil((data.getMonth() + 1) / 3);
}

/**
 * Maior sequência de trimestres CONSECUTIVOS (na ordem em que a turma teve
 * chamadas) em que o aluno esteve presente em 100% das chamadas — exige
 * pelo menos 3 chamadas no trimestre para ele contar (evita destravar com
 * 1 presença isolada num trimestre que mal começou).
 */
function maiorSequenciaTrimestresPerfeitos(presencas: { presente: boolean; chamada: { data: Date } }[]) {
  const grupos = new Map<string, { presente: boolean }[]>();
  for (const p of presencas) {
    const chave = `${p.chamada.data.getFullYear()}-${trimestreDe(p.chamada.data)}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push({ presente: p.presente });
  }

  const gruposOrdenados = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  let maior = 0;
  let atual = 0;
  for (const [, itens] of gruposOrdenados) {
    const perfeito = itens.length >= 3 && itens.every((i) => i.presente);
    atual = perfeito ? atual + 1 : 0;
    maior = Math.max(maior, atual);
  }
  return maior;
}

type Estatisticas = {
  presentes: number;
  maiorSequenciaPresenca: number;
  fidelidadeBiblia: number;
  fidelidadeRevista: number;
  totalAtividades: number;
  gabaritos: number;
  respondeuNoMesmoDia: boolean;
  maiorSequenciaTrimestres: number;
};

/** Calcula, para uma regra + parâmetro, se o aluno é elegível agora. */
function avaliarRegra(tipoRegra: TipoRegraConquista, parametro: number | null, stats: Estatisticas): boolean {
  switch (tipoRegra) {
    case "PRIMEIRA_PRESENCA":
      return stats.presentes >= 1;
    case "SEQUENCIA_PRESENCA":
      return stats.maiorSequenciaPresenca >= (parametro ?? 1);
    case "FIDELIDADE_BIBLIA":
      return stats.fidelidadeBiblia >= (parametro ?? 5);
    case "FIDELIDADE_REVISTA":
      return stats.fidelidadeRevista >= (parametro ?? 5);
    case "PRIMEIRA_ATIVIDADE":
      return stats.totalAtividades >= (parametro ?? 1);
    case "GABARITOS":
      return stats.gabaritos >= (parametro ?? 1);
    case "TRIMESTRE_PERFEITO":
      return stats.maiorSequenciaTrimestres >= 1;
    case "TRIMESTRES_CONSECUTIVOS":
      return stats.maiorSequenciaTrimestres >= (parametro ?? 4);
    case "RESPOSTA_RAPIDA":
      return stats.respondeuNoMesmoDia;
    case "COMBO":
      // Sem regra própria — só conta a combinação dos pré-requisitos,
      // resolvida depois em avaliarConquistas.
      return true;
    default:
      return false;
  }
}

/**
 * Avalia as regras contra o histórico atual do aluno e grava no banco as
 * conquistas que ainda não estavam registradas. Roda sob demanda (ao abrir
 * o painel do aluno) em vez de em background — o volume de dados por aluno
 * é pequeno o suficiente para isso ser barato. O catálogo (nome, ícone,
 * parâmetro, oculta, pré-requisitos) vem do banco, então o Admin pode
 * reconfigurar tudo isso pela tela de conquistas sem precisar de deploy.
 */
export async function avaliarConquistas(alunoId: string) {
  const [presencas, respostas, atividades, jaDesbloqueadas, catalogo] = await Promise.all([
    prisma.presencaAluno.findMany({
      where: { alunoId },
      include: { chamada: true },
      orderBy: { chamada: { data: "asc" } },
    }),
    prisma.respostaAtividade.findMany({ where: { alunoId } }),
    prisma.atividade.findMany({ where: { respostas: { some: { alunoId } } }, select: { id: true, createdAt: true } }),
    prisma.conquistaAluno.findMany({ where: { alunoId } }),
    prisma.conquista.findMany({ where: { status: "ATIVO" }, include: { requisitos: true }, orderBy: { ordem: "asc" } }),
  ]);

  const jaTem = new Set(jaDesbloqueadas.map((c) => c.conquistaId));

  const presentes = presencas.filter((p) => p.presente);

  let maiorSequenciaPresenca = 0;
  let atual = 0;
  for (const p of presencas) {
    atual = p.presente ? atual + 1 : 0;
    maiorSequenciaPresenca = Math.max(maiorSequenciaPresenca, atual);
  }

  const gabaritos = respostas.filter((r) => r.totalPerguntas > 0 && r.acertos === r.totalPerguntas);
  const atividadePorId = new Map(atividades.map((a) => [a.id, a]));
  const respondeuNoMesmoDia = respostas.some((r) => {
    const atividade = atividadePorId.get(r.atividadeId);
    if (!atividade) return false;
    return r.concluidaEm.toDateString() === atividade.createdAt.toDateString();
  });

  const stats: Estatisticas = {
    presentes: presentes.length,
    maiorSequenciaPresenca,
    fidelidadeBiblia: presencas.filter((p) => p.trouxeBiblia).length,
    fidelidadeRevista: presencas.filter((p) => p.trouxeRevista).length,
    totalAtividades: respostas.length,
    gabaritos: gabaritos.length,
    respondeuNoMesmoDia,
    maiorSequenciaTrimestres: maiorSequenciaTrimestresPerfeitos(presencas),
  };

  const elegiveis = new Set<string>();
  for (const c of catalogo) {
    if (avaliarRegra(c.tipoRegra, c.parametro, stats)) elegiveis.add(c.id);
  }

  // Uma conquista com pré-requisitos só é concedida se todos eles já
  // estiverem desbloqueados (ou sendo desbloqueados agora, na mesma leva).
  const desbloquearAgora = new Set<string>();
  for (const c of catalogo) {
    if (!elegiveis.has(c.id)) continue;
    const requisitosOk = c.requisitos.every((r) => jaTem.has(r.requisitoId) || elegiveis.has(r.requisitoId));
    if (requisitosOk) desbloquearAgora.add(c.id);
  }

  const novas = [...desbloquearAgora].filter((id) => !jaTem.has(id));
  if (novas.length > 0) {
    await prisma.conquistaAluno.createMany({
      data: novas.map((conquistaId) => ({ alunoId, conquistaId })),
    });
  }

  const todosIds = new Set([...jaTem, ...desbloquearAgora]);
  const desbloqueadaEmPorId = new Map(jaDesbloqueadas.map((c) => [c.conquistaId, c.desbloqueadaEm]));

  return catalogo
    .filter((c) => !c.oculta || todosIds.has(c.id))
    .map((c) => ({
      chave: c.chave,
      nome: c.nome,
      descricao: c.descricao,
      icone: c.icone,
      oculta: c.oculta,
      desbloqueada: todosIds.has(c.id),
      desbloqueadaEm: desbloqueadaEmPorId.get(c.id) ?? (novas.includes(c.id) ? new Date() : undefined),
    }));
}
