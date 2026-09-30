import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { avaliarConquistas } from "@/lib/conquistas";
import { rankingGeralAlunos } from "@/lib/pontuacaoAluno";
import { calcularSequencias } from "@/lib/sequencias";
import { domingoAtual } from "@/lib/datas";

const OFENSIVAS = [
  { chave: "presenca" as const, icone: "🔥", nome: "Presença" },
  { chave: "biblia" as const, icone: "📖", nome: "Bíblia" },
  { chave: "revista" as const, icone: "📘", nome: "Revista" },
  { chave: "combo" as const, icone: "💎", nome: "Combo" },
];

export default async function MeuPainelPage() {
  const user = await requireUser();
  const alunoId = user.id;

  const [aluno, presencas, atividadesPendentes, conquistas, ranking, rankingSemanal, sequencias, certificados] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId }, include: { turma: { include: { congregacao: true } } } }),
    prisma.presencaAluno.findMany({ where: { alunoId }, include: { chamada: true } }),
    prisma.atividade.findMany({
      where: { turmaId: user.alunoTurmaId, status: "ATIVO", respostas: { none: { alunoId } } },
      orderBy: { prazo: "asc" },
    }),
    avaliarConquistas(alunoId),
    rankingGeralAlunos({ turmaId: user.alunoTurmaId }),
    rankingGeralAlunos({ turmaId: user.alunoTurmaId }, undefined, domingoAtual()),
    calcularSequencias(alunoId),
    prisma.certificadoEmitido.findMany({ where: { alunoId }, orderBy: { emitidoEm: "desc" } }),
  ]);

  if (!aluno) return null;

  const totalChamadas = presencas.length;
  const totalPresencas = presencas.filter((p) => p.presente).length;
  const taxaPresenca = totalChamadas > 0 ? Math.round((totalPresencas / totalChamadas) * 100) : 0;
  const minhaPosicao = ranking.findIndex((r) => r.alunoId === alunoId) + 1;
  const meusPontos = ranking.find((r) => r.alunoId === alunoId)?.total ?? 0;
  const conquistasDesbloqueadas = conquistas.filter((c) => c.desbloqueada);
  const notaDezDaSemana = rankingSemanal.find((r) => r.total > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Olá, {user.name.split(" ")[0]}!</h1>
        <p className="text-sm text-slate-500">
          {aluno.turma.nome} — {aluno.turma.congregacao.nome}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Minhas ofensivas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OFENSIVAS.map((o) => {
            const semanas = sequencias[o.chave];
            return (
              <div key={o.chave} className={`rounded-xl border p-3 text-center ${semanas > 0 ? "border-gold-300 bg-gold-50" : "border-slate-200 bg-slate-50"}`}>
                <p className="text-2xl">{o.icone}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{semanas}</p>
                <p className="text-xs text-slate-500">{o.nome}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Semanas seguidas mantendo cada hábito — pode faltar até 2 chamadas seguidas sem perder a ofensiva.
        </p>
      </div>

      {notaDezDaSemana && notaDezDaSemana.alunoId !== alunoId && (
        <div className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-900">
          🏆 <strong>{notaDezDaSemana.nome}</strong> é o aluno nota dez da semana na turma — {notaDezDaSemana.total} pontos.{" "}
          <Link href="/meu-painel/ranking?periodo=semana" className="underline hover:text-gold-950">
            ver ranking da semana
          </Link>
        </div>
      )}
      {notaDezDaSemana && notaDezDaSemana.alunoId === alunoId && (
        <div className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-900">
          🏆 Você é o aluno nota dez da semana na turma — continue assim!
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Presença</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{taxaPresenca}%</p>
          <p className="text-xs text-slate-400">
            {totalPresencas}/{totalChamadas} chamadas
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pontos</p>
          <p className="mt-1 text-2xl font-semibold text-gold-600">{meusPontos}</p>
          <p className="text-xs text-slate-400">presença + atividades</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ranking da turma</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{minhaPosicao > 0 ? `${minhaPosicao}º` : "-"}</p>
          <p className="text-xs text-slate-400">de {ranking.length} aluno(s)</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Conquistas</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {conquistasDesbloqueadas.length}/{conquistas.length}
          </p>
          <Link href="#conquistas" className="text-xs text-navy-600 hover:underline">
            ver todas
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Atividades pendentes</h2>
          <Link href="/meu-painel/atividades" className="text-xs font-medium text-navy-600 hover:underline">
            ver todas
          </Link>
        </div>
        {atividadesPendentes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nenhuma atividade pendente — tudo em dia! 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {atividadesPendentes.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{a.titulo}</p>
                  {a.prazo && (
                    <p className="text-xs text-slate-400">prazo {new Date(a.prazo).toLocaleDateString("pt-BR")}</p>
                  )}
                </div>
                <Link
                  href={`/meu-painel/atividades/${a.id}`}
                  className="rounded-md bg-gold-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-600"
                >
                  Responder
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {certificados.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Meus certificados</h2>
          <ul className="divide-y divide-slate-50">
            {certificados.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.titulo}</p>
                  <p className="text-xs text-slate-400">{c.emitidoEm.toLocaleDateString("pt-BR")}</p>
                </div>
                <Link href={`/certificados/${c.id}`} className="text-xs font-medium text-navy-600 hover:underline">
                  Ver / imprimir
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="conquistas" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Minhas conquistas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {conquistas.map((c) => (
            <div
              key={c.chave}
              className={`rounded-xl border p-3 text-center ${
                c.desbloqueada ? "border-gold-300 bg-gold-50" : "border-slate-200 bg-slate-50 opacity-50"
              }`}
              title={c.descricao}
            >
              <p className="text-2xl">{c.icone}</p>
              <p className="mt-1 text-xs font-medium text-slate-800">{c.nome}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
