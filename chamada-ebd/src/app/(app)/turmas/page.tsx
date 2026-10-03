import { prisma } from "@/lib/prisma";
import { requireAnyRole, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { NovaTurmaForm } from "./nova-turma-form";
import { TurmasTabela } from "./turmas-tabela";

export default async function TurmasPage() {
  const user = await requireAnyRole();

  const congregacoes = await prisma.congregacao.findMany({
    where: filtroCongregacaoPorEscopo(user),
    orderBy: { nome: "asc" },
  });

  const turmas = await prisma.turma.findMany({
    where: { congregacao: filtroCongregacaoPorEscopo(user) },
    orderBy: { nome: "asc" },
    include: { congregacao: { include: { area: true } }, _count: { select: { alunos: true } } },
  });

  const podeCriar = temPermissao(user.permissoes, "turmas.gerenciar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Turmas</h1>
        <p className="text-sm text-slate-500">Turmas de EBD por congregação.</p>
      </div>

      {podeCriar && (
        <NovaTurmaForm congregacoes={congregacoes.map((c) => ({ id: c.id, nome: c.nome }))} />
      )}

      <TurmasTabela
        podeGerenciar={podeCriar}
        turmas={turmas.map((t) => ({
          id: t.id,
          nome: t.nome,
          categoria: t.categoria,
          status: t.status,
          totalAlunos: t._count.alunos,
          congregacaoId: t.congregacaoId,
          congregacaoNome: t.congregacao.nome,
          areaId: t.congregacao.areaId,
          areaNome: t.congregacao.area.nome,
          campoId: t.congregacao.area.campoId,
        }))}
      />
    </div>
  );
}
