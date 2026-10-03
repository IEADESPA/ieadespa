"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CATEGORIAS = [
  "BERCARIO",
  "JARDIM_INFANCIA",
  "PRIMARIOS",
  "JUNIORES",
  "PRE_ADOLESCENTES",
  "ADOLESCENTES",
  "JOVENS",
  "ADULTOS",
  "NOVOS_CONVERTIDOS",
  "MELHOR_IDADE",
  "OUTRA",
] as const;

const schema = z.object({
  nome: z.string().min(2, "Informe o nome da turma."),
  congregacaoId: z.string().min(1, "Selecione a congregação."),
  categoria: z.enum(CATEGORIAS),
});

export async function criarTurma(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("turmas.gerenciar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    congregacaoId: formData.get("congregacaoId"),
    categoria: formData.get("categoria"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const congregacao = await prisma.congregacao.findUnique({
    where: { id: parsed.data.congregacaoId },
    include: { area: true },
  });
  if (!congregacao) return { erro: "Congregação não encontrada." };
  if (!podeGerenciarCongregacao(user, congregacao.id, congregacao.areaId, congregacao.area.campoId)) {
    return { erro: "Você não tem permissão para gerenciar turmas desta congregação." };
  }

  await prisma.turma.create({ data: parsed.data });
  revalidatePath("/turmas");
  return {};
}

export async function alterarStatusTurma(
  turmaId: string,
  congregacaoId: string,
  areaId: string,
  campoId: string,
  status: "ATIVO" | "INATIVO"
) {
  const user = await requireFuncionalidade("turmas.gerenciar");
  if (!podeGerenciarCongregacao(user, congregacaoId, areaId, campoId)) return;
  await prisma.turma.update({ where: { id: turmaId }, data: { status } });
  revalidatePath("/turmas");
}
