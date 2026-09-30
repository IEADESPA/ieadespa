import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { NovaAtividadeForm } from "./nova-atividade-form";

export default async function AtividadesPage() {
  const user = await requireFuncionalidade("atividades.gerenciar");

  const turmasWhere =
    user.role === "PROFESSOR"
      ? { professores: { some: { alunoId: user.id } } }
      : { congregacao: filtroCongregacaoPorEscopo(user) };

  const turmas = await prisma.turma.findMany({
    where: turmasWhere,
    orderBy: { nome: "asc" },
    include: { congregacao: true },
  });

  const atividades = await prisma.atividade.findMany({
    where: { turmaId: { in: turmas.map((t) => t.id) } },
    orderBy: { createdAt: "desc" },
    include: {
      turma: { include: { congregacao: true } },
      _count: { select: { perguntas: true, respostas: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Atividades</h1>
        <p className="text-sm text-slate-500">
          Crie quizzes para a turma responder pelo próprio painel. Cada acerto rende pontos que alimentam o ranking
          e as conquistas do aluno.
        </p>
      </div>

      <NovaAtividadeForm turmas={turmas.map((t) => ({ id: t.id, nome: `${t.nome} — ${t.congregacao.nome}` }))} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Turma</th>
              <th className="px-4 py-2">Prazo</th>
              <th className="px-4 py-2">Perguntas</th>
              <th className="px-4 py-2">Respostas</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {atividades.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/atividades/${a.id}`} className="font-medium text-navy-700 hover:underline">
                    {a.titulo}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{a.turma.nome}</td>
                <td className="px-4 py-2 text-slate-600">
                  {a.prazo ? new Date(a.prazo).toLocaleDateString("pt-BR") : "sem prazo"}
                </td>
                <td className="px-4 py-2 text-slate-600">{a._count.perguntas}</td>
                <td className="px-4 py-2 text-slate-600">{a._count.respostas}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
            {atividades.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma atividade criada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
