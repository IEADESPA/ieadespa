"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  matricula: z.string().trim().min(1, "Informe a matrícula."),
  nome: z.string().min(2, "Informe o nome do aluno."),
  turmaId: z.string().min(1, "Selecione a turma."),
  telefone: z.string().optional(),
  dataNascimento: z.string().optional(),
  membroIgreja: z.coerce.boolean().optional(),
  batizado: z.coerce.boolean().optional(),
});

async function turmaComEscopo(turmaId: string) {
  return prisma.turma.findUnique({
    where: { id: turmaId },
    include: { congregacao: { include: { area: true } } },
  });
}

async function garantirAcessoTurma(
  user: Awaited<ReturnType<typeof requireFuncionalidade>>,
  turmaId: string,
  congregacaoId: string,
  areaId: string,
  campoId: string
) {
  if (podeGerenciarCongregacao(user, congregacaoId, areaId, campoId)) return true;
  if (user.role !== "PROFESSOR") return false;
  const leciona = await prisma.turmaProfessor.findUnique({
    where: { turmaId_alunoId: { turmaId, alunoId: user.id } },
  });
  return !!leciona;
}

export async function criarAluno(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("alunos.gerenciar");
  const parsed = schema.safeParse({
    matricula: formData.get("matricula"),
    nome: formData.get("nome"),
    turmaId: formData.get("turmaId"),
    telefone: formData.get("telefone") || undefined,
    dataNascimento: formData.get("dataNascimento") || undefined,
    membroIgreja: formData.get("membroIgreja") === "on",
    batizado: formData.get("batizado") === "on",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const turma = await turmaComEscopo(parsed.data.turmaId);
  if (!turma) return { erro: "Turma não encontrada." };
  if (!(await garantirAcessoTurma(user, turma.id, turma.congregacaoId, turma.congregacao.areaId, turma.congregacao.area.campoId))) {
    return { erro: "Você não tem permissão para cadastrar alunos nesta turma." };
  }

  const matriculaExistente = await prisma.aluno.findUnique({ where: { matricula: parsed.data.matricula } });
  if (matriculaExistente) return { erro: "Já existe um aluno cadastrado com essa matrícula." };

  await prisma.aluno.create({
    data: {
      matricula: parsed.data.matricula,
      nome: parsed.data.nome,
      turmaId: turma.id,
      congregacaoId: turma.congregacaoId,
      telefone: parsed.data.telefone,
      dataNascimento: parsed.data.dataNascimento ? new Date(parsed.data.dataNascimento) : undefined,
      membroIgreja: parsed.data.membroIgreja ?? false,
      batizado: parsed.data.batizado ?? false,
    },
  });
  revalidatePath("/alunos");
  return {};
}

const schemaTransferir = z.object({
  alunoId: z.string().min(1),
  novaTurmaId: z.string().min(1, "Selecione a turma de destino."),
});

export async function transferirAluno(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("alunos.gerenciar");
  const parsed = schemaTransferir.safeParse({
    alunoId: formData.get("alunoId"),
    novaTurmaId: formData.get("novaTurmaId"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const aluno = await prisma.aluno.findUnique({
    where: { id: parsed.data.alunoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!aluno) return { erro: "Aluno não encontrado." };

  const novaTurma = await turmaComEscopo(parsed.data.novaTurmaId);
  if (!novaTurma) return { erro: "Turma de destino não encontrada." };
  if (aluno.turmaId === novaTurma.id) return { erro: "O aluno já está nessa turma." };

  const [acessoOrigem, acessoDestino] = await Promise.all([
    garantirAcessoTurma(user, aluno.turmaId, aluno.congregacaoId, aluno.congregacao.areaId, aluno.congregacao.area.campoId),
    garantirAcessoTurma(user, novaTurma.id, novaTurma.congregacaoId, novaTurma.congregacao.areaId, novaTurma.congregacao.area.campoId),
  ]);
  if (!acessoOrigem || !acessoDestino) {
    return { erro: "Você precisa ter acesso tanto à turma atual quanto à turma de destino do aluno para transferi-lo." };
  }

  await prisma.aluno.update({
    where: { id: aluno.id },
    data: { turmaId: novaTurma.id, congregacaoId: novaTurma.congregacaoId },
  });

  revalidatePath("/alunos");
  return {};
}

export async function alterarStatusAluno(alunoId: string, status: "ATIVO" | "INATIVO") {
  const user = await requireFuncionalidade("alunos.gerenciar");
  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!aluno) return;
  if (
    !(await garantirAcessoTurma(
      user,
      aluno.turmaId,
      aluno.congregacaoId,
      aluno.congregacao.areaId,
      aluno.congregacao.area.campoId
    ))
  ) {
    return;
  }

  await prisma.aluno.update({ where: { id: alunoId }, data: { status } });
  revalidatePath("/alunos");
}
