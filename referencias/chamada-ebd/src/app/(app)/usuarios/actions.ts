"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { podeConcederPapel } from "@/lib/papeis";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno."),
  papelId: z.string().min(1, "Selecione o papel."),
  campoId: z.string().optional(),
  areaId: z.string().optional(),
  senha: z.string().optional(),
});

export async function concederPapel(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("usuarios.gerenciar");

  const parsed = schema.safeParse({
    alunoId: formData.get("alunoId"),
    papelId: formData.get("papelId"),
    campoId: formData.get("campoId") || undefined,
    areaId: formData.get("areaId") || undefined,
    senha: formData.get("senha") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const papelAlvo = await prisma.papel.findUnique({ where: { id: parsed.data.papelId } });
  if (!papelAlvo || papelAlvo.status !== "ATIVO") return { erro: "Papel inválido." };

  if (user.ordem === null || !podeConcederPapel(user.ordem, papelAlvo.ordem)) {
    return { erro: "Você não tem permissão para conceder este papel." };
  }

  const aluno = await prisma.aluno.findUnique({
    where: { id: parsed.data.alunoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!aluno) return { erro: "Aluno não encontrado." };

  // O escopo de papéis de nível CONGREGACAO é sempre a própria congregação
  // onde o aluno já está matriculado — não existe escolha aqui, exatamente
  // para não precisar recadastrar ninguém em outro lugar.
  let campoId: string | undefined;
  let areaId: string | undefined;
  let congregacaoId: string | undefined;

  if (papelAlvo.nivel === "CAMPO") {
    campoId = parsed.data.campoId ?? aluno.congregacao.area.campoId;
    if (!campoId) return { erro: "Selecione o campo." };
  } else if (papelAlvo.nivel === "AREA") {
    areaId = parsed.data.areaId ?? aluno.congregacao.areaId;
    if (!areaId) return { erro: "Selecione a área." };
  } else if (papelAlvo.nivel === "CONGREGACAO") {
    congregacaoId = aluno.congregacaoId;
  }

  // Fora do nível GLOBAL, checa se quem concede realmente enxerga esse aluno
  // dentro do próprio escopo (evita um coordenador de área promover alguém
  // de uma área que não é a dele, por exemplo).
  if (user.nivel !== "GLOBAL") {
    const dentroDoEscopo =
      (user.nivel === "CAMPO" && user.campoId === aluno.congregacao.area.campoId) ||
      (user.nivel === "AREA" && user.areaId === aluno.congregacao.areaId) ||
      (user.nivel === "CONGREGACAO" && user.congregacaoId === aluno.congregacaoId);
    if (!dentroDoEscopo) return { erro: "Esse aluno está fora do seu escopo de gestão." };
  }

  const jaTemAtribuicao = await prisma.atribuicao.findFirst({
    where: {
      alunoId: aluno.id,
      papelId: papelAlvo.id,
      campoId: campoId ?? null,
      areaId: areaId ?? null,
      congregacaoId: congregacaoId ?? null,
    },
  });
  if (jaTemAtribuicao) return { erro: "Esse aluno já tem esse papel nesse escopo." };

  if (!aluno.senhaHash) {
    if (!parsed.data.senha || parsed.data.senha.length < 6) {
      return { erro: "Defina uma senha de ao menos 6 caracteres — é a primeira função acima de aluno para essa pessoa." };
    }
    const senhaHash = await bcrypt.hash(parsed.data.senha, 10);
    await prisma.aluno.update({ where: { id: aluno.id }, data: { senhaHash } });
  }

  await prisma.atribuicao.create({
    data: { alunoId: aluno.id, papelId: papelAlvo.id, campoId, areaId, congregacaoId },
  });

  revalidatePath("/usuarios");
  return {};
}

export async function removerAtribuicao(atribuicaoId: string) {
  const user = await requireFuncionalidade("usuarios.gerenciar");
  const atribuicao = await prisma.atribuicao.findUnique({ where: { id: atribuicaoId }, include: { papel: true } });
  if (!atribuicao) return;
  if (user.ordem === null || !podeConcederPapel(user.ordem, atribuicao.papel.ordem)) return;

  await prisma.atribuicao.delete({ where: { id: atribuicaoId } });
  revalidatePath("/usuarios");
}

export async function alterarStatusAlunoAcesso(alunoId: string, status: "ATIVO" | "INATIVO") {
  await requireFuncionalidade("usuarios.gerenciar");
  await prisma.aluno.update({ where: { id: alunoId }, data: { status } });
  revalidatePath("/usuarios");
}

export async function vincularProfessorTurma(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("usuarios.gerenciar");
  const alunoId = String(formData.get("alunoId") ?? "");
  const turmaId = String(formData.get("turmaId") ?? "");
  if (!alunoId || !turmaId) return { erro: "Selecione o professor e a turma." };

  const [atribuicaoEstreita, turma] = await Promise.all([
    prisma.atribuicao.findFirst({ where: { alunoId, papel: { escopoAmplo: false } } }),
    prisma.turma.findUnique({ where: { id: turmaId }, include: { congregacao: { include: { area: true } } } }),
  ]);
  if (!atribuicaoEstreita) return { erro: "Este aluno não tem uma atribuição de Professor(a) (ou outro papel restrito à turma)." };
  if (!turma) return { erro: "Turma inválida." };

  const podeVincular =
    user.nivel === "GLOBAL" ||
    (user.nivel === "CAMPO" && user.campoId === turma.congregacao.area.campoId) ||
    (user.nivel === "AREA" && user.areaId === turma.congregacao.areaId) ||
    (user.nivel === "CONGREGACAO" && user.escopoAmplo && user.congregacaoId === turma.congregacaoId);
  if (!podeVincular) return { erro: "Você não tem permissão para vincular professores nesta turma." };

  await prisma.turmaProfessor.upsert({
    where: { turmaId_alunoId: { turmaId, alunoId } },
    update: {},
    create: { turmaId, alunoId },
  });

  revalidatePath("/usuarios");
  return {};
}
