"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { avaliarConquistas } from "@/lib/conquistas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type RespostaParaCriar = {
  perguntaId: string;
  alternativaId?: string;
  ordemSubmetida?: number;
  respostaTexto?: string;
};

export async function responderAtividade(_prev: { erro?: string } | undefined, formData: FormData) {
  const atividadeId = String(formData.get("atividadeId") ?? "");
  const user = await requireUser();
  const alunoId = user.id;

  const atividade = await prisma.atividade.findUnique({
    where: { id: atividadeId },
    include: { perguntas: { include: { alternativas: true } } },
  });
  if (!atividade || atividade.turmaId !== user.alunoTurmaId || atividade.status !== "ATIVO") {
    return { erro: "Esta atividade não está mais disponível." };
  }
  if (atividade.perguntas.length === 0) return { erro: "Esta atividade ainda não tem perguntas." };

  const jaRespondeu = await prisma.respostaAtividade.findUnique({
    where: { atividadeId_alunoId: { atividadeId, alunoId } },
  });
  if (jaRespondeu) return { erro: "Você já respondeu esta atividade." };

  let acertos = 0;
  const respostas: RespostaParaCriar[] = [];

  for (const p of atividade.perguntas) {
    if (p.tipo === "COMPLETAR") {
      const texto = String(formData.get(`texto_${p.id}`) ?? "").trim();
      if (!texto) return { erro: "Responda todas as perguntas antes de enviar." };
      if (texto.toLowerCase() === (p.respostaEsperada ?? "").trim().toLowerCase()) acertos += 1;
      respostas.push({ perguntaId: p.id, respostaTexto: texto });
    } else if (p.tipo === "ORDENAR") {
      let todasCorretas = p.alternativas.length > 0;
      let respondeuAlgo = false;
      for (const alt of p.alternativas) {
        const valor = formData.get(`ordem_${p.id}_${alt.id}`);
        if (!valor) continue;
        respondeuAlgo = true;
        const ordemSubmetida = Number(valor);
        if (ordemSubmetida !== alt.ordemCorreta) todasCorretas = false;
        respostas.push({ perguntaId: p.id, alternativaId: alt.id, ordemSubmetida });
      }
      if (!respondeuAlgo) return { erro: "Responda todas as perguntas antes de enviar." };
      if (todasCorretas) acertos += 1;
    } else if (p.tipo === "CORRESPONDENCIA") {
      let todasCorretas = p.alternativas.length > 0;
      let respondeuAlgo = false;
      for (const alt of p.alternativas) {
        const valor = formData.get(`par_${p.id}_${alt.id}`);
        if (!valor) continue;
        respondeuAlgo = true;
        const respostaTexto = String(valor).trim();
        if (respostaTexto.toLowerCase() !== (alt.parTexto ?? "").trim().toLowerCase()) todasCorretas = false;
        respostas.push({ perguntaId: p.id, alternativaId: alt.id, respostaTexto });
      }
      if (!respondeuAlgo) return { erro: "Responda todas as perguntas antes de enviar." };
      if (todasCorretas) acertos += 1;
    } else {
      const alternativaId = String(formData.get(`pergunta_${p.id}`) ?? "");
      if (!alternativaId) return { erro: "Responda todas as perguntas antes de enviar." };
      const alternativa = p.alternativas.find((a) => a.id === alternativaId);
      if (alternativa?.correta) acertos += 1;
      respostas.push({ perguntaId: p.id, alternativaId });
    }
  }

  const totalPerguntas = atividade.perguntas.length;
  const pontosGanhos = Math.round((atividade.pontosBase * acertos) / totalPerguntas);

  await prisma.respostaAtividade.create({
    data: {
      atividadeId,
      alunoId,
      acertos,
      totalPerguntas,
      pontosGanhos,
      respostas: { create: respostas },
    },
  });

  await avaliarConquistas(alunoId);

  revalidatePath("/meu-painel");
  revalidatePath("/meu-painel/atividades");
  redirect(`/meu-painel/atividades/${atividadeId}`);
}
