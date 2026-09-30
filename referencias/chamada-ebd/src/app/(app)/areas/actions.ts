"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarAreas } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(2, "Informe o nome da área."),
  campoId: z.string().min(1, "Selecione o campo."),
});

export async function criarArea(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("areas.gerenciar");
  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    campoId: formData.get("campoId"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  if (!podeGerenciarAreas(user, parsed.data.campoId)) {
    return { erro: "Você não tem permissão para gerenciar áreas deste campo." };
  }

  await prisma.area.create({ data: parsed.data });
  revalidatePath("/areas");
  return {};
}

export async function alterarStatusArea(areaId: string, campoId: string, status: "ATIVO" | "INATIVO") {
  const user = await requireFuncionalidade("areas.gerenciar");
  if (!podeGerenciarAreas(user, campoId)) return;
  await prisma.area.update({ where: { id: areaId }, data: { status } });
  revalidatePath("/areas");
}
