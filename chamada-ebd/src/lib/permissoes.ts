import { prisma } from "@/lib/prisma";
import type { ChaveFuncionalidade } from "@/lib/permissoes-catalogo";

/**
 * Carrega toda a matriz papel→funcionalidade e as exceções de um aluno numa
 * única consulta, para os checks de permissão de uma requisição não
 * precisarem ficar batendo no banco um a um.
 */
export async function carregarPermissoes(alunoId: string, papelIdAtivo: string | null) {
  const [porPapel, excecoes] = await Promise.all([
    papelIdAtivo === null
      ? Promise.resolve([])
      : prisma.permissaoPapel.findMany({
          where: { papelId: papelIdAtivo },
          include: { funcionalidade: true },
        }),
    prisma.permissaoExcecao.findMany({
      where: { alunoId },
      include: { funcionalidade: true },
    }),
  ]);

  const mapa = new Map<string, boolean>();
  for (const p of porPapel) mapa.set(p.funcionalidade.chave, p.permitido);
  // Exceções por aluno sempre têm a última palavra.
  for (const e of excecoes) mapa.set(e.funcionalidade.chave, e.permitido);

  return mapa;
}

export function temPermissao(mapa: Map<string, boolean>, chave: ChaveFuncionalidade): boolean {
  return mapa.get(chave) ?? false;
}
