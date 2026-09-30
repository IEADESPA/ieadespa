"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  turmaId: z.string().min(1),
  data: z.string().min(1, "Informe a data da chamada."),
  visitantes: z.coerce.number().int().min(0).default(0),
  oferta: z.coerce.number().min(0).default(0),
  inicioPontual: z.coerce.boolean().default(false),
  observacoes: z.string().optional(),
});

async function garantirAcesso(turmaId: string) {
  const user = await requireFuncionalidade("chamada.lancar");
  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!turma) return { erro: "Turma não encontrada." } as const;

  const acessoDireto = podeGerenciarCongregacao(
    user,
    turma.congregacaoId,
    turma.congregacao.areaId,
    turma.congregacao.area.campoId
  );
  if (acessoDireto) return { user, turma } as const;

  if (user.role === "PROFESSOR") {
    const leciona = await prisma.turmaProfessor.findUnique({
      where: { turmaId_alunoId: { turmaId, alunoId: user.id } },
    });
    if (leciona) return { user, turma } as const;
  }

  return { erro: "Você não tem permissão para lançar chamada nesta turma." } as const;
}

export async function lancarChamada(_prev: { erro?: string; ok?: boolean } | undefined, formData: FormData) {
  const turmaId = String(formData.get("turmaId") ?? "");
  const acesso = await garantirAcesso(turmaId);
  if ("erro" in acesso) return { erro: acesso.erro };
  const { user } = acesso;

  const parsed = schema.safeParse({
    turmaId,
    data: formData.get("data"),
    visitantes: formData.get("visitantes") || 0,
    oferta: formData.get("oferta") || 0,
    inicioPontual: formData.get("inicioPontual") === "on",
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const licaoAberta = await prisma.licao.findFirst({
    where: { congregacaoId: acesso.turma.congregacaoId, status: "ABERTA" },
  });
  if (!licaoAberta) {
    return {
      erro:
        "Nenhuma lição aberta para esta congregação — peça ao superintendente ou secretário para abrir a lição em /licoes antes de lançar a chamada.",
    };
  }

  const alunos = await prisma.aluno.findMany({
    where: { turmaId, status: "ATIVO" },
    select: { id: true },
  });

  let comBiblia = 0;
  let comRevista = 0;
  const presencas = alunos.map(({ id: alunoId }) => {
    const presente = formData.get(`presente_${alunoId}`) === "on";
    const trouxeBiblia = formData.get(`biblia_${alunoId}`) === "on";
    const trouxeRevista = formData.get(`revista_${alunoId}`) === "on";
    if (trouxeBiblia) comBiblia += 1;
    if (trouxeRevista) comRevista += 1;
    return { alunoId, presente, trouxeBiblia, trouxeRevista };
  });

  const dataChamada = new Date(`${parsed.data.data}T12:00:00`);

  await prisma.$transaction(async (tx) => {
    const chamada = await tx.chamada.upsert({
      where: { turmaId_data: { turmaId, data: dataChamada } },
      update: {
        visitantes: parsed.data.visitantes,
        oferta: parsed.data.oferta,
        inicioPontual: parsed.data.inicioPontual,
        observacoes: parsed.data.observacoes,
        biblias: comBiblia,
        revistas: comRevista,
        lancadoPorId: user.id,
        licaoId: licaoAberta.id,
      },
      create: {
        turmaId,
        data: dataChamada,
        visitantes: parsed.data.visitantes,
        oferta: parsed.data.oferta,
        inicioPontual: parsed.data.inicioPontual,
        observacoes: parsed.data.observacoes,
        biblias: comBiblia,
        revistas: comRevista,
        lancadoPorId: user.id,
        licaoId: licaoAberta.id,
      },
    });

    await tx.presencaAluno.deleteMany({ where: { chamadaId: chamada.id } });
    if (presencas.length > 0) {
      await tx.presencaAluno.createMany({
        data: presencas.map((p) => ({ ...p, chamadaId: chamada.id })),
      });
    }
  });

  revalidatePath(`/chamada/${turmaId}`);
  revalidatePath("/relatorios");
  revalidatePath("/dashboard");
  return { ok: true };
}
