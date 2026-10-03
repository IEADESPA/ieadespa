import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { NovoLancamentoForm } from "./novo-lancamento-form";
import { RemoverLancamentoButton } from "./remover-lancamento-button";
import { PeriodoSelect } from "./periodo-select";

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ semanas?: string; congregacaoId?: string }>;
}) {
  const user = await requireFuncionalidade("financeiro.gerenciar");
  const { semanas, congregacaoId } = await searchParams;
  const numSemanas = Number(semanas ?? 4) || 4;
  const desde = new Date();
  desde.setDate(desde.getDate() - numSemanas * 7);

  const filtroCongregacao = congregacaoId ? { id: congregacaoId } : filtroCongregacaoPorEscopo(user);

  const [congregacoesDoEscopo, chamadas, lancamentos] = await Promise.all([
    prisma.congregacao.findMany({ where: filtroCongregacaoPorEscopo(user), orderBy: { nome: "asc" } }),
    prisma.chamada.findMany({
      where: { data: { gte: desde }, turma: { congregacao: filtroCongregacao } },
      select: { oferta: true, turma: { select: { congregacao: { select: { nome: true } } } } },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: { data: { gte: desde }, congregacao: filtroCongregacao },
      orderBy: { data: "desc" },
      include: { congregacao: true, criadoPor: { select: { nome: true } } },
    }),
  ]);

  const totalOfertas = Math.round(chamadas.reduce((s, c) => s + c.oferta, 0) * 100) / 100;
  const totalEntradas = Math.round(lancamentos.filter((l) => l.tipo === "ENTRADA").reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const totalSaidas = Math.round(lancamentos.filter((l) => l.tipo === "SAIDA").reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const saldo = Math.round((totalOfertas + totalEntradas - totalSaidas) * 100) / 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500">Ofertas coletadas na chamada + lançamentos manuais de entrada e saída.</p>
        </div>
        <PeriodoSelect numSemanas={numSemanas} congregacaoId={congregacaoId ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ofertas (chamada)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">R$ {totalOfertas.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outras entradas</p>
          <p className="mt-1 text-2xl font-semibold text-green-700">R$ {totalEntradas.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saídas</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">R$ {totalSaidas.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo do período</p>
          <p className="mt-1 text-2xl font-semibold text-gold-700">R$ {saldo.toFixed(2)}</p>
        </div>
      </div>

      <NovoLancamentoForm congregacoes={congregacoesDoEscopo.map((c) => ({ id: c.id, nome: c.nome }))} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Lançamentos manuais</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Congregação</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-600">{new Date(l.data).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2 text-slate-600">{l.congregacao.nome}</td>
                <td className="px-4 py-2 text-slate-700">
                  {l.categoria}
                  {l.descricao && <span className="text-slate-400"> — {l.descricao}</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${l.tipo === "ENTRADA" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {l.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                  </span>
                </td>
                <td className={`px-4 py-2 font-semibold ${l.tipo === "ENTRADA" ? "text-green-700" : "text-red-600"}`}>
                  R$ {l.valor.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <RemoverLancamentoButton id={l.id} />
                </td>
              </tr>
            ))}
            {lancamentos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhum lançamento manual no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
