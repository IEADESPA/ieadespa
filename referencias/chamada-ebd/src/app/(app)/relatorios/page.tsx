import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { calcularScoreChamada, SCORE_CONFIG_PADRAO } from "@/lib/score";
import { rankingGeralAlunos } from "@/lib/pontuacaoAluno";
import { FiltrosRelatorio } from "./filtros";
import { ComparativoChart } from "./comparativo-chart";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ semanas?: string; congregacaoId?: string }>;
}) {
  const user = await requireFuncionalidade("relatorios.ver");
  const { semanas, congregacaoId } = await searchParams;
  const numSemanas = Number(semanas ?? 4) || 4;

  const desde = new Date();
  desde.setDate(desde.getDate() - numSemanas * 7);

  const congregacoesDoEscopo = await prisma.congregacao.findMany({
    where: filtroCongregacaoPorEscopo(user),
    orderBy: { nome: "asc" },
  });

  const filtroCongregacao = congregacaoId ? { id: congregacaoId } : filtroCongregacaoPorEscopo(user);

  const turmasWhere =
    user.role === "PROFESSOR"
      ? { professores: { some: { alunoId: user.id } } }
      : { congregacao: filtroCongregacao };

  const turmas = await prisma.turma.findMany({
    where: turmasWhere,
    include: {
      congregacao: true,
      chamadas: { where: { data: { gte: desde } }, include: { presencas: true } },
    },
  });

  const config = user.campoId
    ? (await prisma.scoreConfig.findUnique({ where: { campoId: user.campoId } })) ?? SCORE_CONFIG_PADRAO
    : SCORE_CONFIG_PADRAO;

  const rankingTurmas = turmas
    .map((t) => {
      const scores = t.chamadas.map((c) => calcularScoreChamada(c, config));
      const totalPontos = scores.reduce((acc, s) => acc + s.pontos, 0);
      const matriculados = t.chamadas.length > 0 ? scores[scores.length - 1].matriculados : 0;
      const mediaPresenca = scores.length > 0 ? scores.reduce((acc, s) => acc + s.taxaPresenca, 0) / scores.length : 0;

      return {
        turmaId: t.id,
        nome: t.nome,
        congregacaoId: t.congregacaoId,
        congregacao: t.congregacao.nome,
        chamadasLancadas: t.chamadas.length,
        matriculados,
        mediaPresenca,
        totalPontos: Math.round(totalPontos * 100) / 100,
      };
    })
    .sort((a, b) => b.totalPontos - a.totalPontos);

  const comparativoCongregacoes = Object.values(
    rankingTurmas.reduce<Record<string, { nome: string; pontos: number }>>((acc, t) => {
      acc[t.congregacaoId] ??= { nome: t.congregacao, pontos: 0 };
      acc[t.congregacaoId].pontos += t.totalPontos;
      return acc;
    }, {})
  )
    .sort((a, b) => b.pontos - a.pontos)
    .map((c) => ({ ...c, pontos: Math.round(c.pontos * 100) / 100 }));

  const rankingAlunos = await rankingGeralAlunos({ congregacao: filtroCongregacao });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Relatórios e ranking</h1>
          <p className="text-sm text-slate-500">
            Últimas {numSemanas} semana(s) — presença, pontualidade, bíblia/revista e visitantes.
          </p>
        </div>
        <FiltrosRelatorio
          numSemanas={numSemanas}
          congregacaoId={congregacaoId ?? ""}
          congregacoes={congregacoesDoEscopo.map((c) => ({ id: c.id, nome: c.nome }))}
        />
      </div>

      {comparativoCongregacoes.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Comparativo entre congregações</h2>
          </div>
          <ComparativoChart dados={comparativoCongregacoes.slice(0, 12)} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Ranking de turmas</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Turma</th>
              <th className="px-4 py-2">Congregação</th>
              <th className="px-4 py-2">Chamadas</th>
              <th className="px-4 py-2">Matriculados</th>
              <th className="px-4 py-2">Presença média</th>
              <th className="px-4 py-2">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {rankingTurmas.map((r, i) => (
              <tr key={r.turmaId} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}º</td>
                <td className="px-4 py-2 font-medium text-slate-900">{r.nome}</td>
                <td className="px-4 py-2 text-slate-600">{r.congregacao}</td>
                <td className="px-4 py-2 text-slate-600">{r.chamadasLancadas}</td>
                <td className="px-4 py-2 text-slate-600">{r.matriculados}</td>
                <td className="px-4 py-2 text-slate-600">{Math.round(r.mediaPresenca * 100)}%</td>
                <td className="px-4 py-2 font-semibold text-slate-900">{r.totalPontos}</td>
              </tr>
            ))}
            {rankingTurmas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma chamada lançada no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Ranking geral de alunos</h2>
          <p className="text-xs text-slate-500">Presença + bíblia/revista + atividades, desde o início do histórico.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Aluno</th>
              <th className="px-4 py-2">Turma</th>
              <th className="px-4 py-2">Congregação</th>
              <th className="px-4 py-2">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {rankingAlunos.slice(0, 20).map((r, i) => (
              <tr key={r.alunoId} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}º</td>
                <td className="px-4 py-2 font-medium text-slate-900">{r.nome}</td>
                <td className="px-4 py-2 text-slate-600">{r.turmaNome}</td>
                <td className="px-4 py-2 text-slate-600">{r.congregacaoNome}</td>
                <td className="px-4 py-2 font-semibold text-gold-700">{r.total}</td>
              </tr>
            ))}
            {rankingAlunos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhum aluno pontuou ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
