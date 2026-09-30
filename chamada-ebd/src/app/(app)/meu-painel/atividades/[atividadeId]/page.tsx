import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ResponderForm } from "./responder-form";

const TIPO_LABEL: Record<string, string> = {
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  VERDADEIRO_FALSO: "Verdadeiro/Falso",
  ORDENAR: "Ordenar",
  COMPLETAR: "Completar",
  CORRESPONDENCIA: "Correspondência",
};

function embaralhar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export default async function ResponderAtividadePage({
  params,
}: {
  params: Promise<{ atividadeId: string }>;
}) {
  const { atividadeId } = await params;
  const user = await requireUser();
  const alunoId = user.id;

  const atividade = await prisma.atividade.findUnique({
    where: { id: atividadeId },
    include: {
      perguntas: { orderBy: { ordem: "asc" }, include: { alternativas: { orderBy: { ordem: "asc" } } } },
      respostas: {
        where: { alunoId },
        include: { respostas: true },
      },
    },
  });
  if (!atividade || atividade.turmaId !== user.alunoTurmaId) redirect("/meu-painel/atividades");

  const minhaResposta = atividade.respostas[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{atividade.titulo}</h1>
        {atividade.descricao && <p className="text-sm text-slate-500">{atividade.descricao}</p>}
      </div>

      {minhaResposta ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-center">
            <p className="text-3xl font-semibold text-gold-700">{minhaResposta.pontosGanhos} pontos</p>
            <p className="text-sm text-gold-800">
              {minhaResposta.acertos} de {minhaResposta.totalPerguntas} corretas
            </p>
          </div>
          {atividade.perguntas.map((p, i) => {
            const minhasRespostas = minhaResposta.respostas.filter((r) => r.perguntaId === p.id);
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">
                  {i + 1}. {p.enunciado}{" "}
                  <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    {TIPO_LABEL[p.tipo]}
                  </span>
                </p>

                {p.tipo === "COMPLETAR" ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className={minhasRespostas[0]?.respostaTexto?.trim().toLowerCase() === p.respostaEsperada?.trim().toLowerCase() ? "text-green-700" : "text-red-700"}>
                      Sua resposta: {minhasRespostas[0]?.respostaTexto || "(em branco)"}
                    </p>
                    <p className="text-green-700">Resposta esperada: {p.respostaEsperada}</p>
                  </div>
                ) : p.tipo === "ORDENAR" ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                    {minhasRespostas
                      .sort((a, b) => (a.ordemSubmetida ?? 0) - (b.ordemSubmetida ?? 0))
                      .map((r) => {
                        const alt = p.alternativas.find((a) => a.id === r.alternativaId);
                        const certo = alt?.ordemCorreta === r.ordemSubmetida;
                        return (
                          <li key={r.id} className={certo ? "text-green-700" : "text-red-700"}>
                            {alt?.texto} {certo ? "✓" : `(deveria ser ${alt?.ordemCorreta}º)`}
                          </li>
                        );
                      })}
                  </ol>
                ) : p.tipo === "CORRESPONDENCIA" ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {p.alternativas.map((alt) => {
                      const minha = minhasRespostas.find((r) => r.alternativaId === alt.id);
                      const certo = minha?.respostaTexto?.trim().toLowerCase() === (alt.parTexto ?? "").trim().toLowerCase();
                      return (
                        <li key={alt.id} className={certo ? "text-green-700" : "text-red-700"}>
                          {alt.texto} ↔ {minha?.respostaTexto || "(em branco)"} {certo ? "✓" : `(correto: ${alt.parTexto})`}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {p.alternativas.map((alt) => {
                      const eraMinha = alt.id === minhasRespostas[0]?.alternativaId;
                      return (
                        <li
                          key={alt.id}
                          className={`rounded-md px-2.5 py-1 text-sm ${
                            alt.correta ? "bg-green-50 text-green-800" : eraMinha ? "bg-red-50 text-red-700" : "text-slate-600"
                          }`}
                        >
                          {alt.correta ? "✓ " : eraMinha ? "✗ " : ""}
                          {alt.texto}
                          {eraMinha && !alt.correta ? " (sua resposta)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : atividade.status !== "ATIVO" ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Esta atividade foi encerrada pelo professor.
        </p>
      ) : atividade.perguntas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          O professor ainda não adicionou perguntas a esta atividade.
        </p>
      ) : (
        <ResponderForm
          atividadeId={atividade.id}
          perguntas={atividade.perguntas.map((p) => ({
            ...p,
            alternativas: p.tipo === "ORDENAR" ? embaralhar(p.alternativas) : p.alternativas,
            opcoesDireita: p.tipo === "CORRESPONDENCIA" ? embaralhar(p.alternativas.map((a) => a.parTexto ?? "")) : undefined,
          }))}
        />
      )}
    </div>
  );
}
