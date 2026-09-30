import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { NovaRevistaForm } from "./nova-revista-form";
import { AlterarStatusRevistaButton } from "./alterar-status-revista-button";
import { AdicionarItemForm } from "./adicionar-item-form";
import { RemoverItemButton } from "./remover-item-button";
import { PagamentoForm } from "./pagamento-form";
import { DecidirPagamentoButtons } from "./decidir-pagamento-buttons";
import { FecharJanelaForm } from "./fechar-janela-form";

const STATUS_LABEL: Record<string, string> = { PENDENTE: "Pendente", PARCIAL: "Pago parcialmente", PAGO: "Pago", CANCELADO: "Cancelado" };
const STATUS_COR: Record<string, string> = {
  PENDENTE: "bg-red-100 text-red-700",
  PARCIAL: "bg-amber-100 text-amber-700",
  PAGO: "bg-green-100 text-green-700",
  CANCELADO: "bg-slate-100 text-slate-500",
};

export default async function RevistasPage() {
  const user = await requireFuncionalidade("pedidos_revista.gerenciar");
  const podeGerenciarCatalogo = temPermissao(user.permissoes, "revistas.gerenciar");
  const podeConsolidar = temPermissao(user.permissoes, "pedidos_revista.consolidar");

  const [revistas, congregacoes, turmas, pedidos] = await Promise.all([
    prisma.revista.findMany({ orderBy: [{ ano: "desc" }, { trimestre: "desc" }, { titulo: "asc" }] }),
    prisma.congregacao.findMany({ where: filtroCongregacaoPorEscopo(user), orderBy: { nome: "asc" } }),
    prisma.turma.findMany({ where: { congregacao: filtroCongregacaoPorEscopo(user) }, orderBy: { nome: "asc" } }),
    prisma.pedidoRevista.findMany({
      where: { congregacao: filtroCongregacaoPorEscopo(user) },
      orderBy: [{ ano: "desc" }, { trimestre: "desc" }, { createdAt: "desc" }],
      include: {
        congregacao: true,
        itens: { include: { revista: true, turma: true } },
        pagamentos: { include: { registradoPor: { select: { nome: true } } } },
      },
    }),
  ]);

  const turmasPorCongregacao: Record<string, { id: string; nome: string }[]> = {};
  for (const t of turmas) (turmasPorCongregacao[t.congregacaoId] ??= []).push({ id: t.id, nome: t.nome });

  const revistasAtivas = revistas.filter((r) => r.status === "ATIVO");

  const periodosDistintos = [...new Map(pedidos.map((p) => [`${p.trimestre}-${p.ano}`, { trimestre: p.trimestre, ano: p.ano }])).values()];

  const consolidadoPorRevista = podeConsolidar
    ? Object.values(
        pedidos
          .flatMap((p) => p.itens.map((it) => ({ ...it, trimestre: p.trimestre, ano: p.ano })))
          .reduce<Record<string, { titulo: string; trimestre: number; ano: number; quantidade: number; valor: number }>>((acc, it) => {
            const chave = `${it.revista.titulo}-${it.trimestre}-${it.ano}`;
            acc[chave] ??= { titulo: it.revista.titulo, trimestre: it.trimestre, ano: it.ano, quantidade: 0, valor: 0 };
            acc[chave].quantidade += it.quantidade;
            acc[chave].valor += it.quantidade * it.precoUnitario;
            return acc;
          }, {})
      ).sort((a, b) => b.ano - a.ano || b.trimestre - a.trimestre || a.titulo.localeCompare(b.titulo))
    : [];

  const pagamentosPendentes = podeConsolidar
    ? pedidos.flatMap((p) => p.pagamentos.filter((pg) => pg.status === "PENDENTE_APROVACAO").map((pg) => ({ ...pg, pedido: p })))
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Revistas</h1>
        <p className="text-sm text-slate-500">
          Catálogo com os três preços (fornecedor, congregação e aluno), pedidos por congregação, consolidado para a
          casa publicadora e controle de pagamentos.
        </p>
      </div>

      {podeGerenciarCatalogo && (
        <div className="space-y-3">
          <NovaRevistaForm />
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">Título</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Fornecedor</th>
                  <th className="px-4 py-2">Congregação</th>
                  <th className="px-4 py-2">Aluno</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {revistas.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">{r.titulo}</td>
                    <td className="px-4 py-2 text-slate-600">{r.trimestre}º/{r.ano}</td>
                    <td className="px-4 py-2 text-slate-600">R$ {r.precoFornecedor.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-600">R$ {r.precoCongregacao.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-600">R$ {r.precoAluno.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <AlterarStatusRevistaButton revistaId={r.id} status={r.status} />
                    </td>
                  </tr>
                ))}
                {revistas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      Nenhuma revista cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {podeConsolidar && pagamentosPendentes.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
          <div className="border-b border-amber-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Pagamentos aguardando aprovação</h2>
            <p className="text-xs text-slate-500">
              Pré-anotados pelo superintendente/secretário — só contam para o pedido depois de aprovados aqui.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pagamentosPendentes.map((pg) => (
                <tr key={pg.id} className="border-b border-amber-100">
                  <td className="px-4 py-2 text-slate-700">{pg.pedido.congregacao.nome}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {pg.pedido.trimestre}º/{pg.pedido.ano}
                  </td>
                  <td className="px-4 py-2 font-semibold text-slate-900">R$ {pg.valor.toFixed(2)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    anotado por {pg.registradoPor.nome} em {new Date(pg.data).toLocaleDateString("pt-BR")}
                    {pg.observacao && <span> — {pg.observacao}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DecidirPagamentoButtons pagamentoId={pg.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeConsolidar && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Consolidado para a casa publicadora</h2>
          <FecharJanelaForm periodos={periodosDistintos} />
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">Revista</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Quantidade total</th>
                  <th className="px-4 py-2">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {consolidadoPorRevista.map((c) => (
                  <tr key={`${c.titulo}-${c.trimestre}-${c.ano}`} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">{c.titulo}</td>
                    <td className="px-4 py-2 text-slate-600">{c.trimestre}º/{c.ano}</td>
                    <td className="px-4 py-2 font-semibold text-navy-700">{c.quantidade} un.</td>
                    <td className="px-4 py-2 text-slate-600">R$ {c.valor.toFixed(2)}</td>
                  </tr>
                ))}
                {consolidadoPorRevista.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      Nenhum item pedido ainda neste escopo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <AdicionarItemForm
          congregacoes={congregacoes.map((c) => ({ id: c.id, nome: c.nome }))}
          revistas={revistasAtivas.map((r) => ({ id: r.id, label: `${r.titulo} (${r.trimestre}º/${r.ano})` }))}
          turmasPorCongregacao={turmasPorCongregacao}
        />

        <h2 className="text-sm font-semibold text-slate-900">Pedidos por congregação</h2>
        <div className="space-y-3">
          {pedidos.map((p) => {
            const valorTotal = p.itens.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0);
            const aprovados = p.pagamentos.filter((pg) => pg.status === "APROVADO");
            const pendentes = p.pagamentos.filter((pg) => pg.status === "PENDENTE_APROVACAO");
            const valorAprovado = aprovados.reduce((s, pg) => s + pg.valor, 0);
            const valorPendente = pendentes.reduce((s, pg) => s + pg.valor, 0);
            const saldo = Math.max(0, Math.round((valorTotal - valorAprovado) * 100) / 100);

            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy-800">{p.congregacao.nome}</p>
                    <p className="text-xs text-slate-500">
                      {p.trimestre}º trimestre/{p.ano} {p.fechado && <span className="text-slate-400">· janela fechada</span>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </div>

                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {p.itens.map((it) => (
                      <tr key={it.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-1.5 text-slate-700">
                          {it.revista.titulo} {it.turma && <span className="text-slate-400">— {it.turma.nome}</span>}
                        </td>
                        <td className="py-1.5 text-right text-slate-500">{it.quantidade}x R$ {it.precoUnitario.toFixed(2)}</td>
                        <td className="py-1.5 text-right font-medium text-slate-700">R$ {(it.quantidade * it.precoUnitario).toFixed(2)}</td>
                        <td className="w-16 py-1.5 text-right">{!p.fechado && <RemoverItemButton itemId={it.id} pedidoId={p.id} />}</td>
                      </tr>
                    ))}
                    {p.itens.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-1.5 text-slate-400">
                          Nenhum item ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                  <span className="text-slate-500">
                    Total <strong className="text-slate-800">R$ {valorTotal.toFixed(2)}</strong> · Aprovado{" "}
                    <strong className="text-green-700">R$ {valorAprovado.toFixed(2)}</strong>
                    {valorPendente > 0 && (
                      <>
                        {" "}
                        · Aguardando aprovação <strong className="text-amber-700">R$ {valorPendente.toFixed(2)}</strong>
                      </>
                    )}{" "}
                    · Saldo <strong className="text-red-600">R$ {saldo.toFixed(2)}</strong>
                  </span>
                </div>
                {!p.fechado && <PagamentoForm pedidoId={p.id} saldo={saldo} />}
              </div>
            );
          })}
          {pedidos.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Nenhum pedido de revista ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
