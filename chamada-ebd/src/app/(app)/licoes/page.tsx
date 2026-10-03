import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { NovaLicaoForm } from "./nova-licao-form";
import { FecharLicaoButton } from "./fechar-licao-button";

export default async function LicoesPage() {
  const user = await requireFuncionalidade("licoes.gerenciar");

  const congregacoes = await prisma.congregacao.findMany({
    where: filtroCongregacaoPorEscopo(user),
    orderBy: { nome: "asc" },
    include: {
      licoes: {
        orderBy: { abertaEm: "desc" },
        take: 3,
        include: { abertaPor: { select: { nome: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Lições</h1>
        <p className="text-sm text-slate-500">
          Abra a lição do trimestre para a congregação — as atividades e a chamada podem se referir a ela.
        </p>
      </div>

      <NovaLicaoForm congregacoes={congregacoes.map((c) => ({ id: c.id, nome: c.nome }))} />

      <div className="space-y-3">
        {congregacoes.map((c) => {
          const aberta = c.licoes.find((l) => l.status === "ABERTA");
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-navy-800">{c.nome}</p>
                {aberta ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Lição aberta</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Nenhuma aberta</span>
                )}
              </div>

              {aberta ? (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-gold-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Lição {aberta.numero} — {aberta.titulo}
                    </p>
                    <p className="text-xs text-slate-500">
                      {aberta.trimestre}º trimestre/{aberta.ano} · aberta por {aberta.abertaPor.nome} em{" "}
                      {new Date(aberta.abertaEm).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <FecharLicaoButton licaoId={aberta.id} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Use o formulário acima para abrir a próxima lição.</p>
              )}

              {c.licoes.filter((l) => l.status === "FECHADA").length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-400">Histórico recente</summary>
                  <ul className="mt-1 space-y-1">
                    {c.licoes
                      .filter((l) => l.status === "FECHADA")
                      .map((l) => (
                        <li key={l.id} className="text-xs text-slate-500">
                          Lição {l.numero} — {l.titulo} ({l.trimestre}º/{l.ano})
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        {congregacoes.length === 0 && <p className="text-sm text-slate-500">Nenhuma congregação no seu escopo.</p>}
      </div>
    </div>
  );
}
