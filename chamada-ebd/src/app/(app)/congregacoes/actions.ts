"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacoes } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(2, "Informe o nome da congregação."),
  areaId: z.string().min(1, "Selecione a área."),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  endereco: z.string().optional(),
  pastorResponsavel: z.string().optional(),
});

export async function criarCongregacao(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("congregacoes.gerenciar");
  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    areaId: formData.get("areaId"),
    cidade: formData.get("cidade") || undefined,
    estado: formData.get("estado") || undefined,
    endereco: formData.get("endereco") || undefined,
    pastorResponsavel: formData.get("pastorResponsavel") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const area = await prisma.area.findUnique({ where: { id: parsed.data.areaId } });
  if (!area) return { erro: "Área não encontrada." };
  if (!podeGerenciarCongregacoes(user, area.id, area.campoId)) {
    return { erro: "Você não tem permissão para gerenciar congregações desta área." };
  }

  await prisma.congregacao.create({ data: parsed.data });
  revalidatePath("/congregacoes");
  return {};
}

export async function alterarStatusCongregacao(
  congregacaoId: string,
  areaId: string,
  campoId: string,
  status: "ATIVO" | "INATIVO"
) {
  const user = await requireFuncionalidade("congregacoes.gerenciar");
  if (!podeGerenciarCongregacoes(user, areaId, campoId)) return;
  await prisma.congregacao.update({ where: { id: congregacaoId }, data: { status } });
  revalidatePath("/congregacoes");
}
