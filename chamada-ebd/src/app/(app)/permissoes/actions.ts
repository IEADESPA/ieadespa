"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { PAPEL_ADMIN } from "@/lib/papeis-sistema";
import { revalidatePath } from "next/cache";
import type { NivelPapel } from "@/generated/prisma/client";

// A própria tela de permissões é intencionalmente travada ao papel ADMIN
// "de verdade" (não passa pela matriz dinâmica) para nunca permitir que
// alguém se tranque fora do próprio sistema por engano.

export async function alternarPermissaoPapel(papelId: string, funcionalidadeId: string, permitidoAtual: boolean) {
  await requireRole(PAPEL_ADMIN);
  await prisma.permissaoPapel.upsert({
    where: { papelId_funcionalidadeId: { papelId, funcionalidadeId } },
    update: { permitido: !permitidoAtual },
    create: { papelId, funcionalidadeId, permitido: !permitidoAtual },
  });
  revalidatePath("/permissoes");
}

export async function definirExcecaoAluno(formData: FormData) {
  await requireRole(PAPEL_ADMIN);
  const alunoId = String(formData.get("alunoId") ?? "");
  const funcionalidadeId = String(formData.get("funcionalidadeId") ?? "");
  const permitido = formData.get("permitido") === "liberar";
  if (!alunoId || !funcionalidadeId) return;

  await prisma.permissaoExcecao.upsert({
    where: { alunoId_funcionalidadeId: { alunoId, funcionalidadeId } },
    update: { permitido },
    create: { alunoId, funcionalidadeId, permitido },
  });
  revalidatePath("/permissoes");
}

export async function removerExcecaoAluno(id: string) {
  await requireRole(PAPEL_ADMIN);
  await prisma.permissaoExcecao.delete({ where: { id } });
  revalidatePath("/permissoes");
}

const NIVEIS_VALIDOS: NivelPapel[] = ["GLOBAL", "CAMPO", "AREA", "CONGREGACAO"];

const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

function gerarChave(nome: string) {
  const base = nome
    .toUpperCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "PAPEL";
}

export async function criarPapel(_prev: { erro?: string } | undefined, formData: FormData) {
  await requireRole(PAPEL_ADMIN);

  const nome = String(formData.get("nome") ?? "").trim();
  const nivel = String(formData.get("nivel") ?? "") as NivelPapel;
  const ordem = Number(formData.get("ordem"));
  const escopoAmplo = formData.get("escopoAmplo") === "on";

  if (nome.length < 2) return { erro: "Informe um nome para o papel." };
  if (!NIVEIS_VALIDOS.includes(nivel)) return { erro: "Selecione um nível válido." };
  if (!Number.isInteger(ordem) || ordem < 0) {
    return { erro: "Informe uma ordem (0 = mais sênior, quanto maior, mais júnior)." };
  }

  const chaveBase = gerarChave(nome);
  let chave = chaveBase;
  let sufixo = 1;
  while (await prisma.papel.findUnique({ where: { chave } })) {
    sufixo += 1;
    chave = `${chaveBase}_${sufixo}`;
  }

  await prisma.papel.create({
    data: {
      chave,
      nome,
      nivel,
      ordem,
      // Fora do nível CONGREGACAO, o papel sempre gerencia o escopo inteiro.
      escopoAmplo: nivel === "CONGREGACAO" ? escopoAmplo : true,
    },
  });

  revalidatePath("/permissoes");
  revalidatePath("/usuarios");
  return {};
}

export async function alterarStatusPapel(papelId: string, status: "ATIVO" | "INATIVO") {
  await requireRole(PAPEL_ADMIN);
  const papel = await prisma.papel.findUnique({ where: { id: papelId } });
  if (!papel || papel.sistema) return;
  await prisma.papel.update({ where: { id: papelId }, data: { status } });
  revalidatePath("/permissoes");
  revalidatePath("/usuarios");
}
