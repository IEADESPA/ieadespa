import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { rankingGeralAlunos } from "@/lib/pontuacaoAluno";
import { domingoAtual } from "@/lib/datas";

export default async function RankingTurmaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const semanal = periodo === "semana";
  const user = await requireUser();
  const alunoId = user.id;
  const ranking = await rankingGeralAlunos({ turmaId: user.alunoTurmaId }, undefined, semanal ? domingoAtual() : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Ranking da turma</h1>
        <p className="text-sm text-slate-500">Pontos por presença, bíblia, revista e atividades respondidas.</p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/meu-painel/ranking"
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            !semanal ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Geral
        </Link>
        <Link
          href="/meu-painel/ranking?periodo=semana"
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            semanal ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Esta semana
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Aluno</th>
              <th className="px-4 py-2">Presença</th>
              <th className="px-4 py-2">Atividades</th>
              <th className="px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.alunoId} className={`border-b border-slate-50 ${r.alunoId === alunoId ? "bg-gold-50" : ""}`}>
                <td className="px-4 py-2 text-slate-500">
                  {i === 0 ? "🏆" : `${i + 1}º`}
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {r.nome} {r.alunoId === alunoId && <span className="text-xs text-gold-700">(você)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{r.presencaPontos + r.bibliaPontos + r.revistaPontos}</td>
                <td className="px-4 py-2 text-slate-600">{r.atividadePontos}</td>
                <td className="px-4 py-2 font-semibold text-gold-700">{r.total}</td>
              </tr>
            ))}
            {ranking.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  {semanal ? "Ninguém pontuou nesta semana ainda." : "Ninguém pontuou ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
