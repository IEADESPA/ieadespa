import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { carregarPermissoes, temPermissao } from "@/lib/permissoes";
import type { ChaveFuncionalidade } from "@/lib/permissoes-catalogo";
import type { NivelPapel } from "@/generated/prisma/client";

const COOKIE_PAINEL = "painel-ativo";

export type PanelRole = {
  chave: string;
  atribuicaoId: string;
  papelId: string;
  role: string; // chave do papel — mantido com esse nome por compatibilidade com o restante do código
  nivel: NivelPapel;
  ordem: number;
  escopoAmplo: boolean;
  campoId: string | null;
  areaId: string | null;
  congregacaoId: string | null;
  label: string;
};

export type SessionUser = {
  id: string; // = Aluno.id — identidade única de qualquer pessoa no sistema
  name: string;
  matricula: string;
  // A turma/congregação em que a pessoa está matriculada como aluno (sempre
  // existe — todo mundo é aluno).
  alunoTurmaId: string;
  alunoCongregacaoId: string;
  // Painel administrativo ATIVO, achatado para os checks de escopo
  // (podeGerenciarX, filtroCongregacaoPorEscopo...). `role: null` = a pessoa
  // não tem (ou não está usando) nenhum papel administrativo agora.
  role: string | null;
  nivel: NivelPapel | null;
  ordem: number | null;
  // Só é relevante em papéis de nível CONGREGACAO: false = só enxerga o que
  // está diretamente vinculado a si (ex: Professor e suas turmas).
  escopoAmplo: boolean;
  campoId: string | null;
  areaId: string | null;
  congregacaoId: string | null;
  // Todas as atribuições administrativas que a pessoa possui, para o
  // seletor de painel na barra lateral.
  paineis: PanelRole[];
  painelAtivoChave: string | null;
  permissoes: Map<string, boolean>;
};

async function carregarPaineis(alunoId: string): Promise<PanelRole[]> {
  const atribuicoes = await prisma.atribuicao.findMany({
    where: { alunoId },
    include: {
      papel: true,
      campo: true,
      area: { include: { campo: true } },
      congregacao: { include: { area: { include: { campo: true } } } },
    },
  });

  return atribuicoes.map((a) => {
    let label = a.papel.nome;
    if (a.papel.nivel === "CAMPO" && a.campo) label += ` — ${a.campo.nome}`;
    if (a.papel.nivel === "AREA" && a.area) label += ` — ${a.area.nome} (${a.area.campo.nome})`;
    if (a.papel.nivel === "CONGREGACAO" && a.congregacao) label += ` — ${a.congregacao.nome}`;
    return {
      chave: `role:${a.id}`,
      atribuicaoId: a.id,
      papelId: a.papelId,
      role: a.papel.chave,
      nivel: a.papel.nivel,
      ordem: a.papel.ordem,
      escopoAmplo: a.papel.escopoAmplo,
      campoId: a.campoId,
      areaId: a.areaId,
      congregacaoId: a.congregacaoId,
      label,
    };
  });
}

/** Garante que há uma sessão válida e resolve o painel administrativo ativo (se houver). */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const aluno = await prisma.aluno.findUnique({ where: { id: session.user.id } });
  if (!aluno || aluno.status !== "ATIVO") redirect("/logout");

  const paineis = await carregarPaineis(aluno.id);

  const cookieStore = await cookies();
  const chaveSalva = cookieStore.get(COOKIE_PAINEL)?.value;
  const painelAtivo = paineis.find((p) => p.chave === chaveSalva) ?? paineis[0] ?? null;

  const permissoes = await carregarPermissoes(aluno.id, painelAtivo?.papelId ?? null);

  return {
    id: aluno.id,
    name: aluno.nome,
    matricula: aluno.matricula,
    alunoTurmaId: aluno.turmaId,
    alunoCongregacaoId: aluno.congregacaoId,
    role: painelAtivo?.role ?? null,
    nivel: painelAtivo?.nivel ?? null,
    ordem: painelAtivo?.ordem ?? null,
    escopoAmplo: painelAtivo?.escopoAmplo ?? false,
    campoId: painelAtivo?.campoId ?? null,
    areaId: painelAtivo?.areaId ?? null,
    congregacaoId: painelAtivo?.congregacaoId ?? null,
    paineis,
    painelAtivoChave: painelAtivo?.chave ?? null,
    permissoes,
  };
}

/** Garante que a pessoa tem PELO MENOS UM papel administrativo (qualquer um). */
export async function requireAnyRole(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === null) redirect("/meu-painel");
  return user;
}

/** Garante que o painel ativo é um dos papéis administrativos informados (por chave). */
export async function requireRole(...chaves: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === null || !chaves.includes(user.role)) {
    redirect(user.paineis.length > 0 ? "/dashboard?erro=acesso-negado" : "/meu-painel");
  }
  return user;
}

/** Garante que o painel ativo tem a funcionalidade liberada (matriz de permissões). */
export async function requireFuncionalidade(chave: ChaveFuncionalidade): Promise<SessionUser> {
  const user = await requireUser();
  if (!temPermissao(user.permissoes, chave)) {
    redirect("/dashboard?erro=sem-permissao");
  }
  return user;
}

/** Quem pode gerenciar cadastros de Campo (só papéis de nível GLOBAL). */
export function podeGerenciarCampos(user: SessionUser) {
  return user.nivel === "GLOBAL";
}

/** Quem pode gerenciar Áreas de um determinado campo. */
export function podeGerenciarAreas(user: SessionUser, campoId: string) {
  if (user.nivel === "GLOBAL") return true;
  if (user.nivel === "CAMPO") return user.campoId === campoId;
  return false;
}

/** Quem pode gerenciar Congregações de uma determinada área. */
export function podeGerenciarCongregacoes(user: SessionUser, areaId: string, campoId: string) {
  if (user.nivel === "GLOBAL") return true;
  if (user.nivel === "CAMPO") return user.campoId === campoId;
  if (user.nivel === "AREA") return user.areaId === areaId;
  return false;
}

/**
 * Quem pode gerenciar Turmas/Alunos/Chamadas/Financeiro/Revistas de uma
 * congregação de forma AMPLA (o cadastro inteiro, não só o que está
 * diretamente vinculado a si). Papéis de escopo estreito em nível
 * CONGREGACAO (ex: Professor) voltam `false` aqui de propósito — cada tela
 * que também aceita esse tipo de papel faz seu próprio fallback checando o
 * vínculo direto (ex: `TurmaProfessor`).
 */
export function podeGerenciarCongregacao(
  user: SessionUser,
  congregacaoId: string,
  areaId: string,
  campoId: string
) {
  if (user.nivel === "GLOBAL") return true;
  if (user.nivel === "CAMPO") return user.campoId === campoId;
  if (user.nivel === "AREA") return user.areaId === areaId;
  if (user.nivel === "CONGREGACAO") return user.escopoAmplo && user.congregacaoId === congregacaoId;
  return false;
}

/**
 * Filtro Prisma para restringir a consulta de congregações ao escopo do
 * painel ativo. Retorna `{}` (sem restrição) para nível GLOBAL.
 */
export function filtroCongregacaoPorEscopo(user: SessionUser) {
  switch (user.nivel) {
    case "GLOBAL":
      return {};
    case "CAMPO":
      return { area: { campoId: user.campoId ?? "__none__" } };
    case "AREA":
      return { areaId: user.areaId ?? "__none__" };
    case "CONGREGACAO":
      return { id: user.congregacaoId ?? "__none__" };
    default:
      return { id: "__none__" };
  }
}
