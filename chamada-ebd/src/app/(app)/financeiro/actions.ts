"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  congregacaoId: z.string().min(1, "Selecione a congregação."),
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  categoria: z.string().min(2, "Informe a categoria."),
  valor: z.coerce.number().positive("Informe um valor maior que zero."),
  data: z.string().min(1, "Informe a data."),
  descricao: z.string().optional(),
});

export async function criarLancamento(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("financeiro.gerenciar");
  const parsed = schema.safeParse({
    congregacaoId: formData.get("congregacaoId"),
    tipo: formData.get("tipo"),
    categoria: formData.get("categoria"),
    valor: formData.get("valor"),
    data: formData.get("data"),
    descricao: formData.get("descricao") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const congregacao = await prisma.congregacao.findUnique({
    where: { id: parsed.data.congregacaoId },
    include: { area: true },
  });
  if (!congregacao) return { erro: "Congregação não encontrada." };
  if (!podeGerenciarCongregacao(user, congregacao.id, congregacao.areaId, congregacao.area.campoId)) {
    return { erro: "Você não tem permissão para lançar no financeiro desta congregação." };
  }

  await prisma.lancamentoFinanceiro.create({
    data: {
      congregacaoId: parsed.data.congregacaoId,
      tipo: parsed.data.tipo,
      categoria: parsed.data.categoria,
      valor: parsed.data.valor,
      data: new Date(`${parsed.data.data}T12:00:00`),
      descricao: parsed.data.descricao,
      criadoPorId: user.id,
    },
  });

  revalidatePath("/financeiro");
  return {};
}

export async function removerLancamento(id: string) {
  const user = await requireFuncionalidade("financeiro.gerenciar");
  const lancamento = await prisma.lancamentoFinanceiro.findUnique({
    where: { id },
    include: { congregacao: { include: { area: true } } },
  });
  if (!lancamento) return;
  if (!podeGerenciarCongregacao(user, lancamento.congregacaoId, lancamento.congregacao.areaId, lancamento.congregacao.area.campoId)) {
    return;
  }

  await prisma.lancamentoFinanceiro.delete({ where: { id } });
  revalidatePath("/financeiro");
}
