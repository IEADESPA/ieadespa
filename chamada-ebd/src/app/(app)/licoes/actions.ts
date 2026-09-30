"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  congregacaoId: z.string().min(1),
  trimestre: z.coerce.number().int().min(1).max(4),
  ano: z.coerce.number().int().min(2020).max(2100),
  numero: z.coerce.number().int().min(1).max(13),
  titulo: z.string().min(2, "Informe o título da lição."),
});

export async function abrirLicao(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("licoes.gerenciar");
  const parsed = schema.safeParse({
    congregacaoId: formData.get("congregacaoId"),
    trimestre: formData.get("trimestre"),
    ano: formData.get("ano"),
    numero: formData.get("numero"),
    titulo: formData.get("titulo"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const congregacao = await prisma.congregacao.findUnique({
    where: { id: parsed.data.congregacaoId },
    include: { area: true },
  });
  if (!congregacao) return { erro: "Congregação não encontrada." };
  if (!podeGerenciarCongregacao(user, congregacao.id, congregacao.areaId, congregacao.area.campoId)) {
    return { erro: "Você não tem permissão para abrir lições nesta congregação." };
  }

  const existente = await prisma.licao.findUnique({
    where: {
      congregacaoId_trimestre_ano_numero: {
        congregacaoId: parsed.data.congregacaoId,
        trimestre: parsed.data.trimestre,
        ano: parsed.data.ano,
        numero: parsed.data.numero,
      },
    },
  });
  if (existente) return { erro: "Essa lição (trimestre/ano/número) já existe para esta congregação." };

  await prisma.$transaction([
    prisma.licao.updateMany({
      where: { congregacaoId: parsed.data.congregacaoId, status: "ABERTA" },
      data: { status: "FECHADA", fechadaEm: new Date() },
    }),
    prisma.licao.create({
      data: {
        congregacaoId: parsed.data.congregacaoId,
        trimestre: parsed.data.trimestre,
        ano: parsed.data.ano,
        numero: parsed.data.numero,
        titulo: parsed.data.titulo,
        status: "ABERTA",
        abertaPorId: user.id,
      },
    }),
  ]);

  revalidatePath("/licoes");
  return {};
}

export async function fecharLicao(licaoId: string) {
  const user = await requireFuncionalidade("licoes.gerenciar");
  const licao = await prisma.licao.findUnique({
    where: { id: licaoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!licao) return;
  if (!podeGerenciarCongregacao(user, licao.congregacaoId, licao.congregacao.areaId, licao.congregacao.area.campoId)) return;

  await prisma.licao.update({ where: { id: licaoId }, data: { status: "FECHADA", fechadaEm: new Date() } });
  revalidatePath("/licoes");
}
