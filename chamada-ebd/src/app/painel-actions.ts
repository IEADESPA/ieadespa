"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COOKIE_PAINEL = "painel-ativo";

/**
 * Troca o painel administrativo ativo do aluno logado. Sempre revalida a
 * posse da atribuição contra o banco antes de gravar o cookie — o valor
 * enviado pelo cliente nunca é confiado por si só.
 */
export async function trocarPainel(chave: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [tipo, id] = chave.split(":");
  if (tipo !== "role") return;

  const valido = await prisma.atribuicao.findFirst({ where: { id, alunoId: session.user.id } });
  if (!valido) return;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PAINEL, chave, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}
