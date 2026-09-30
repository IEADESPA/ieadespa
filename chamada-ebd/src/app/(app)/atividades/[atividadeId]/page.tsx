import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { NovaPerguntaForm } from "./nova-pergunta-form";
import { RemoverPerguntaButton } from "./remover-pergunta-button";
import { AlterarStatusAtividadeButton } from "./alterar-status-button";

const TIPO_LABEL: Record<string, string> = {
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  VERDADEIRO_FALSO: "Verdadeiro/Falso",
  ORDENAR: "Ordenar",
  COMPLETAR: "Completar",
  CORRESPONDENCIA: "Correspondência",
};

export default async function AtividadeDetalhePage({
  params,
}: {
  params: Promise<{ atividadeId: string }>;
}) {
  const { atividadeId } = await params;
  const user = await requireFuncionalidade("atividades.gerenciar");

  const atividade = await prisma.atividade.findUnique({
    where: { id: atividadeId },
    include: {
      turma: { include: { congregacao: { include: { area: true } } } },
      perguntas: { orderBy: { ordem: "asc" }, include: { alternativas: { orderBy: { ordem: "asc" } } } },
      respostas: { include: { aluno: true }, orderBy: { pontosGanhos: "desc" } },
    },
  });
  if (!atividade) redirect("/atividades");

  const acessoDireto = podeGerenciarCongregacao(
    user,
    atividade.turma.congregacaoId,
    atividade.turma.congregacao.areaId,
    atividade.turma.congregacao.area.campoId
  );
  if (!acessoDireto) {
    const leciona =
      user.role === "PROFESSOR" &&
      (await prisma.turmaProfessor.findUnique({
        where: { turmaId_alunoId: { turmaId: atividade.turmaId, alunoId: user.id } },
      }));
    if (!leciona) redirect("/atividades");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{atividade.titulo}</h1>
          <p className="text-sm text-slate-500">
            {atividade.turma.nome} — {atividade.turma.congregacao.nome}
            {atividade.prazo && <> · prazo {new Date(atividade.prazo).toLocaleDateString("pt-BR")}</>} ·{" "}
            {atividade.pontosBase} pontos por acerto total
          </p>
          {atividade.descricao && <p className="mt-1 text-sm text-slate-600">{atividade.descricao}</p>}
        </div>
        <AlterarStatusAtividadeButton atividadeId={atividade.id} status={atividade.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Perguntas ({atividade.perguntas.length})</h2>
          {atividade.perguntas.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">
                  {i + 1}. {p.enunciado}{" "}
                  <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    {TIPO_LABEL[p.tipo]}
                  </span>
                </p>
                <RemoverPerguntaButton perguntaId={p.id} atividadeId={atividade.id} />
              </div>

              {p.tipo === "COMPLETAR" ? (
                <p className="mt-2 rounded-md bg-green-50 px-2.5 py-1 text-sm text-green-800">
                  Resposta esperada: <strong>{p.respostaEsperada}</strong>
                </p>
              ) : p.tipo === "ORDENAR" ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {[...p.alternativas]
                    .sort((a, b) => (a.ordemCorreta ?? 0) - (b.ordemCorreta ?? 0))
                    .map((alt) => (
                      <li key={alt.id} className="rounded-md px-1 py-0.5 text-sm text-slate-700">
                        {alt.texto}
                      </li>
                    ))}
                </ol>
              ) : p.tipo === "CORRESPONDENCIA" ? (
                <ul className="mt-2 space-y-1">
                  {p.alternativas.map((alt) => (
                    <li key={alt.id} className="rounded-md bg-green-50 px-2.5 py-1 text-sm text-green-800">
                      {alt.texto} <span className="text-green-500">↔</span> {alt.parTexto}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-2 space-y-1">
                  {p.alternativas.map((alt) => (
                    <li
                      key={alt.id}
                      className={`rounded-md px-2.5 py-1 text-sm ${
                        alt.correta ? "bg-green-50 text-green-800" : "text-slate-600"
                      }`}
                    >
                      {alt.correta ? "✓ " : ""}
                      {alt.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {atividade.perguntas.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Nenhuma pergunta ainda — adicione a primeira ao lado.
            </p>
          )}

          <NovaPerguntaForm atividadeId={atividade.id} />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Resultados ({atividade.respostas.length})</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Aluno</th>
                  <th className="px-4 py-2">Acertos</th>
                  <th className="px-4 py-2">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {atividade.respostas.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-500">{i + 1}º</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{r.aluno.nome}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {r.acertos}/{r.totalPerguntas}
                    </td>
                    <td className="px-4 py-2 font-semibold text-gold-700">{r.pontosGanhos}</td>
                  </tr>
                ))}
                {atividade.respostas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      Ninguém respondeu ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
