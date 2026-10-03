import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

export default async function MinhasAtividadesPage() {
  const user = await requireUser();
  const alunoId = user.id;

  const atividades = await prisma.atividade.findMany({
    where: { turmaId: user.alunoTurmaId },
    orderBy: { createdAt: "desc" },
    include: {
      perguntas: { select: { id: true } },
      respostas: { where: { alunoId } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Minhas atividades</h1>
        <p className="text-sm text-slate-500">Quizzes da sua turma.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Prazo</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {atividades.map((a) => {
              const minhaResposta = a.respostas[0];
              const semPerguntas = a.perguntas.length === 0;
              return (
                <tr key={a.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{a.titulo}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {a.prazo ? new Date(a.prazo).toLocaleDateString("pt-BR") : "sem prazo"}
                  </td>
                  <td className="px-4 py-2">
                    {minhaResposta ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Concluída — {minhaResposta.pontosGanhos} pts
                      </span>
                    ) : a.status !== "ATIVO" ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Encerrada</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Pendente</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!minhaResposta && a.status === "ATIVO" && !semPerguntas && (
                      <Link
                        href={`/meu-painel/atividades/${a.id}`}
                        className="rounded-md bg-gold-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-600"
                      >
                        Responder
                      </Link>
                    )}
                    {minhaResposta && (
                      <Link href={`/meu-painel/atividades/${a.id}`} className="text-xs font-medium text-navy-600 hover:underline">
                        ver resultado
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {atividades.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma atividade para a sua turma ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
