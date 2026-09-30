"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function garantirAcessoTurma(turmaId: string) {
  const user = await requireFuncionalidade("atividades.gerenciar");
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
  return { erro: "Você não tem permissão para criar atividades nesta turma." } as const;
}

// Uma atividade só pode ser criada enquanto a congregação da turma tiver uma
// lição aberta — é essa lição que define automaticamente o prazo (dias
// corridos a partir do momento em que ela foi aberta), em vez de o professor
// escolher uma data solta sem relação com o conteúdo da semana.
const PRAZO_DIAS_APOS_LICAO = 3;

const criarSchema = z.object({
  turmaId: z.string().min(1, "Selecione a turma."),
  titulo: z.string().min(2, "Informe um título."),
  descricao: z.string().optional(),
  pontosBase: z.coerce.number().int().min(1).max(1000).default(10),
});

export async function criarAtividade(_prev: { erro?: string } | undefined, formData: FormData) {
  const parsed = criarSchema.safeParse({
    turmaId: formData.get("turmaId"),
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    pontosBase: formData.get("pontosBase") || 10,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const acesso = await garantirAcessoTurma(parsed.data.turmaId);
  if ("erro" in acesso) return { erro: acesso.erro };

  const licaoAberta = await prisma.licao.findFirst({
    where: { congregacaoId: acesso.turma.congregacaoId, status: "ABERTA" },
  });
  if (!licaoAberta) {
    return { erro: "Abra a lição desta congregação antes de criar atividades — é ela que define o prazo." };
  }

  const prazo = new Date(licaoAberta.abertaEm);
  prazo.setDate(prazo.getDate() + PRAZO_DIAS_APOS_LICAO);

  const atividade = await prisma.atividade.create({
    data: {
      turmaId: parsed.data.turmaId,
      criadoPorId: acesso.user.id,
      licaoId: licaoAberta.id,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao,
      prazo,
      pontosBase: parsed.data.pontosBase,
    },
  });

  revalidatePath("/atividades");
  redirect(`/atividades/${atividade.id}`);
}

export async function alterarStatusAtividade(atividadeId: string, status: "ATIVO" | "INATIVO") {
  const atividade = await prisma.atividade.findUnique({ where: { id: atividadeId } });
  if (!atividade) return;
  const acesso = await garantirAcessoTurma(atividade.turmaId);
  if ("erro" in acesso) return;

  await prisma.atividade.update({ where: { id: atividadeId }, data: { status } });
  revalidatePath("/atividades");
  revalidatePath(`/atividades/${atividadeId}`);
}

const TIPOS_PERGUNTA = ["MULTIPLA_ESCOLHA", "VERDADEIRO_FALSO", "ORDENAR", "COMPLETAR", "CORRESPONDENCIA"] as const;

const perguntaBaseSchema = z.object({
  atividadeId: z.string().min(1),
  tipo: z.enum(TIPOS_PERGUNTA),
  enunciado: z.string().min(2, "Escreva o enunciado da pergunta."),
});

export async function adicionarPergunta(_prev: { erro?: string } | undefined, formData: FormData) {
  const atividadeId = String(formData.get("atividadeId") ?? "");
  const atividade = await prisma.atividade.findUnique({ where: { id: atividadeId } });
  if (!atividade) return { erro: "Atividade não encontrada." };

  const acesso = await garantirAcessoTurma(atividade.turmaId);
  if ("erro" in acesso) return { erro: acesso.erro };

  const base = perguntaBaseSchema.safeParse({
    atividadeId,
    tipo: formData.get("tipo"),
    enunciado: formData.get("enunciado"),
  });
  if (!base.success) return { erro: base.error.issues[0].message };

  const totalPerguntas = await prisma.pergunta.count({ where: { atividadeId } });

  if (base.data.tipo === "MULTIPLA_ESCOLHA" || base.data.tipo === "VERDADEIRO_FALSO") {
    const alternativasBrutas = formData.getAll("alternativa").map((v) => String(v).trim());
    const corretaIndexBruto = Number(formData.get("corretaIndex") ?? -1);

    // Emparelha texto+correta pela posição ORIGINAL antes de descartar campos
    // em branco, para um campo vazio no meio da lista não desalinhar qual
    // alternativa era a marcada como correta.
    const pares = alternativasBrutas
      .map((texto, i) => ({ texto, correta: i === corretaIndexBruto }))
      .filter((p) => p.texto.length > 0);

    if (pares.length < 2) return { erro: "Informe ao menos 2 alternativas." };
    if (!pares.some((p) => p.correta)) {
      return { erro: "A alternativa marcada como correta precisa ter um texto preenchido." };
    }

    await prisma.pergunta.create({
      data: {
        atividadeId,
        tipo: base.data.tipo,
        enunciado: base.data.enunciado,
        ordem: totalPerguntas,
        alternativas: { create: pares.map((p, i) => ({ texto: p.texto, correta: p.correta, ordem: i })) },
      },
    });
  } else if (base.data.tipo === "ORDENAR") {
    const itens = formData.getAll("itemOrdenar").map((v) => String(v).trim()).filter(Boolean);
    if (itens.length < 2) return { erro: "Informe ao menos 2 itens para ordenar." };

    await prisma.pergunta.create({
      data: {
        atividadeId,
        tipo: "ORDENAR",
        enunciado: base.data.enunciado,
        ordem: totalPerguntas,
        alternativas: { create: itens.map((texto, i) => ({ texto, ordem: i, ordemCorreta: i + 1 })) },
      },
    });
  } else if (base.data.tipo === "COMPLETAR") {
    const respostaEsperada = String(formData.get("respostaEsperada") ?? "").trim();
    if (!respostaEsperada) return { erro: "Informe a resposta esperada." };

    await prisma.pergunta.create({
      data: { atividadeId, tipo: "COMPLETAR", enunciado: base.data.enunciado, ordem: totalPerguntas, respostaEsperada },
    });
  } else {
    const esquerda = formData.getAll("parEsquerda").map((v) => String(v).trim());
    const direita = formData.getAll("parDireita").map((v) => String(v).trim());
    const pares = esquerda
      .map((texto, i) => ({ texto, parTexto: direita[i] ?? "" }))
      .filter((p) => p.texto.length > 0 && p.parTexto.length > 0);

    if (pares.length < 2) return { erro: "Informe ao menos 2 pares completos (esquerda e direita)." };

    await prisma.pergunta.create({
      data: {
        atividadeId,
        tipo: "CORRESPONDENCIA",
        enunciado: base.data.enunciado,
        ordem: totalPerguntas,
        alternativas: { create: pares.map((p, i) => ({ texto: p.texto, parTexto: p.parTexto, ordem: i })) },
      },
    });
  }

  revalidatePath(`/atividades/${atividadeId}`);
  return {};
}

export async function removerPergunta(perguntaId: string, atividadeId: string) {
  const atividade = await prisma.atividade.findUnique({ where: { id: atividadeId } });
  if (!atividade) return;
  const acesso = await garantirAcessoTurma(atividade.turmaId);
  if ("erro" in acesso) return;

  await prisma.pergunta.delete({ where: { id: perguntaId } });
  revalidatePath(`/atividades/${atividadeId}`);
}
