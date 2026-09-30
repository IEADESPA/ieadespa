import { prisma } from "@/lib/prisma";
export { NIVEL_LABELS } from "@/lib/papeis-sistema";

/**
 * Regra genérica de concessão de papéis: alguém só concede um papel com
 * `ordem` MAIOR que a do papel com que está agindo (mais júnior) — exceto
 * quem já está no topo (`ordem === 0`), que pode conceder qualquer papel,
 * inclusive outro do mesmo nível (útil para ter mais de um Admin geral).
 * Vale para qualquer papel, inclusive os criados depois pelo Admin — não
 * precisa mexer em código pra um papel novo respeitar a hierarquia.
 */
export function podeConcederPapel(ordemConcedente: number, ordemAlvo: number) {
  return ordemAlvo > ordemConcedente || ordemConcedente === 0;
}

export async function listarPapeisAtivos() {
  return prisma.papel.findMany({ where: { status: "ATIVO" }, orderBy: { ordem: "asc" } });
}

/** Papéis que o painel ativo do usuário está autorizado a conceder a outra pessoa. */
export async function papeisQueEuPossoConceder(ordemAtiva: number | null) {
  if (ordemAtiva === null) return [];
  const papeis = await listarPapeisAtivos();
  return papeis.filter((p) => podeConcederPapel(ordemAtiva, p.ordem));
}
