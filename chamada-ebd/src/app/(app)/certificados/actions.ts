"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno."),
  titulo: z.string().min(2, "Informe o título do certificado."),
  descricao: z.string().optional(),
});

async function podeEmitirPara(
  user: Awaited<ReturnType<typeof requireFuncionalidade>>,
  aluno: { turmaId: string; congregacaoId: string; congregacao: { areaId: string; area: { campoId: string } } }
) {
  if (podeGerenciarCongregacao(user, aluno.congregacaoId, aluno.congregacao.areaId, aluno.congregacao.area.campoId)) {
    return true;
  }
  if (user.role !== "PROFESSOR") return false;
  const leciona = await prisma.turmaProfessor.findUnique({
    where: { turmaId_alunoId: { turmaId: aluno.turmaId, alunoId: user.id } },
  });
  return !!leciona;
}

export async function emitirCertificado(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("certificados.emitir");

  const parsed = schema.safeParse({
    alunoId: formData.get("alunoId"),
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const aluno = await prisma.aluno.findUnique({
    where: { id: parsed.data.alunoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!aluno) return { erro: "Aluno não encontrado." };
  if (!(await podeEmitirPara(user, aluno))) {
    return { erro: "Você não tem permissão para emitir certificado para este aluno." };
  }

  const certificado = await prisma.certificadoEmitido.create({
    data: {
      alunoId: aluno.id,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao,
      emitidoPorId: user.id,
    },
  });

  revalidatePath("/certificados");
  return { certificadoId: certificado.id };
}

export async function removerCertificado(id: string) {
  const user = await requireFuncionalidade("certificados.emitir");
  const certificado = await prisma.certificadoEmitido.findUnique({
    where: { id },
    include: { aluno: { include: { congregacao: { include: { area: true } } } } },
  });
  if (!certificado) return;
  if (!(await podeEmitirPara(user, certificado.aluno))) return;

  await prisma.certificadoEmitido.delete({ where: { id } });
  revalidatePath("/certificados");
}
