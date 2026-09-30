"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const campoSchema = z.object({
  nome: z.string().min(2, "Informe o nome do campo."),
  sigla: z.string().optional(),
});

export async function criarCampo(_prev: { erro?: string } | undefined, formData: FormData) {
  await requireFuncionalidade("campos.gerenciar");
  const parsed = campoSchema.safeParse({
    nome: formData.get("nome"),
    sigla: formData.get("sigla") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  await prisma.campo.create({
    data: {
      nome: parsed.data.nome,
      sigla: parsed.data.sigla,
      scoreConfig: { create: {} },
    },
  });
  revalidatePath("/campos");
  return {};
}

export async function alterarStatusCampo(campoId: string, status: "ATIVO" | "INATIVO") {
  await requireFuncionalidade("campos.gerenciar");
  await prisma.campo.update({ where: { id: campoId }, data: { status } });
  revalidatePath("/campos");
}
