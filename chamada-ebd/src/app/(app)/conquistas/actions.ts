"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TipoRegraConquista } from "@/generated/prisma/client";

const TIPOS_REGRA: TipoRegraConquista[] = [
  "PRIMEIRA_PRESENCA",
  "SEQUENCIA_PRESENCA",
  "FIDELIDADE_BIBLIA",
  "FIDELIDADE_REVISTA",
  "PRIMEIRA_ATIVIDADE",
  "GABARITOS",
  "TRIMESTRE_PERFEITO",
  "TRIMESTRES_CONSECUTIVOS",
  "RESPOSTA_RAPIDA",
  "COMBO",
];

const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

function gerarChave(nome: string) {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "conquista";
}

const schemaCriar = z.object({
  nome: z.string().min(2, "Informe um nome."),
  descricao: z.string().min(2, "Informe uma descrição."),
  icone: z.string().min(1, "Informe um ícone (emoji)."),
  tipoRegra: z.enum(TIPOS_REGRA as [TipoRegraConquista, ...TipoRegraConquista[]]),
  parametro: z.coerce.number().int().positive().optional(),
  oculta: z.coerce.boolean().optional(),
});

export async function criarConquista(_prev: { erro?: string } | undefined, formData: FormData) {
  await requireFuncionalidade("conquistas.gerenciar");

  const parsed = schemaCriar.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
    icone: formData.get("icone"),
    tipoRegra: formData.get("tipoRegra"),
    parametro: formData.get("parametro") || undefined,
    oculta: formData.get("oculta") === "on",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const requer = formData.getAll("requer").map(String).filter(Boolean);

  const chaveBase = gerarChave(parsed.data.nome);
  let chave = chaveBase;
  let sufixo = 1;
  while (await prisma.conquista.findUnique({ where: { chave } })) {
    sufixo += 1;
    chave = `${chaveBase}-${sufixo}`;
  }

  const maiorOrdem = await prisma.conquista.aggregate({ _max: { ordem: true } });

  const conquista = await prisma.conquista.create({
    data: {
      chave,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao,
      icone: parsed.data.icone,
      tipoRegra: parsed.data.tipoRegra,
      parametro: parsed.data.parametro ?? null,
      oculta: !!parsed.data.oculta,
      ordem: (maiorOrdem._max.ordem ?? 0) + 1,
    },
  });

  if (requer.length > 0) {
    await prisma.conquistaRequisito.createMany({
      data: requer.map((requisitoId) => ({ conquistaId: conquista.id, requisitoId })),
    });
  }

  revalidatePath("/conquistas");
  return {};
}

const schemaAtualizar = z.object({
  id: z.string().min(1),
  nome: z.string().min(2, "Informe um nome."),
  descricao: z.string().min(2, "Informe uma descrição."),
  icone: z.string().min(1, "Informe um ícone (emoji)."),
  parametro: z.coerce.number().int().positive().optional(),
  oculta: z.coerce.boolean().optional(),
});

export async function atualizarConquista(_prev: { erro?: string } | undefined, formData: FormData) {
  await requireFuncionalidade("conquistas.gerenciar");

  const parsed = schemaAtualizar.safeParse({
    id: formData.get("id"),
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
    icone: formData.get("icone"),
    parametro: formData.get("parametro") || undefined,
    oculta: formData.get("oculta") === "on",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  await prisma.conquista.update({
    where: { id: parsed.data.id },
    data: {
      nome: parsed.data.nome,
      descricao: parsed.data.descricao,
      icone: parsed.data.icone,
      parametro: parsed.data.parametro ?? null,
      oculta: !!parsed.data.oculta,
    },
  });

  revalidatePath("/conquistas");
  return {};
}

export async function alterarStatusConquista(id: string, status: "ATIVO" | "INATIVO") {
  await requireFuncionalidade("conquistas.gerenciar");
  await prisma.conquista.update({ where: { id }, data: { status } });
  revalidatePath("/conquistas");
}
