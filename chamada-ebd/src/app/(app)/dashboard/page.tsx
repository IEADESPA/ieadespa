import Link from "next/link";
import { requireAnyRole, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";

function domingoAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - diaSemana);
  domingo.setHours(12, 0, 0, 0);
  return domingo;
}

export default async function DashboardPage() {
  const user = await requireAnyRole();
  const filtroCongregacao = filtroCongregacaoPorEscopo(user);
  const dataDeHoje = domingoAtual();

  const [totalCongregacoes, totalTurmas, totalAlunos, ultimasChamadas, congregacoesDoEscopo] = await Promise.all([
    prisma.congregacao.count({ where: filtroCongregacao }),
    prisma.turma.count({ where: { congregacao: filtroCongregacao } }),
    prisma.aluno.count({ where: { congregacao: filtroCongregacao, status: "ATIVO" } }),
    prisma.chamada.findMany({
      where: { turma: { congregacao: filtroCongregacao } },
      orderBy: { data: "desc" },
      take: 5,
      include: { turma: { include: { congregacao: true } }, presencas: true },
    }),
    prisma.congregacao.findMany({
      where: filtroCongregacao,
      select: {
        id: true,
        licoes: { where: { status: "ABERTA" }, select: { id: true } },
        turmas: {
          where: { status: "ATIVO" },
          select: { id: true, chamadas: { where: { data: dataDeHoje }, select: { id: true } } },
        },
      },
    }),
  ]);

  const congregacoesSemLicao = congregacoesDoEscopo.filter((c) => c.licoes.length === 0).length;
  const turmasSemChamadaHoje = congregacoesDoEscopo
    .filter((c) => c.licoes.length > 0)
    .flatMap((c) => c.turmas)
    .filter((t) => t.chamadas.length === 0).length;

  const podeVerRevistas = temPermissao(user.permissoes, "pedidos_revista.consolidar");
  const pagamentosPendentes = podeVerRevistas
    ? await prisma.pagamentoRevista.count({
        where: { status: "PENDENTE_APROVACAO", pedido: { congregacao: filtroCongregacao } },
      })
    : 0;

  const pendencias = [
    congregacoesSemLicao > 0 && {
      texto: `${congregacoesSemLicao} congregação(ões) sem lição aberta — chamada bloqueada`,
      href: "/licoes",
      chave: "licoes.gerenciar" as const,
    },
    turmasSemChamadaHoje > 0 && {
      texto: `${turmasSemChamadaHoje} turma(s) sem chamada lançada hoje`,
      href: "/chamada",
      chave: "chamada.lancar" as const,
    },
    pagamentosPendentes > 0 && {
      texto: `${pagamentosPendentes} pagamento(s) de revista aguardando aprovação`,
      href: "/revistas",
      chave: "pedidos_revista.consolidar" as const,
    },
  ].filter((p): p is { texto: string; href: string; chave: "licoes.gerenciar" | "chamada.lancar" | "pedidos_revista.consolidar" } => !!p)
    .filter((p) => temPermissao(user.permissoes, p.chave));

  const cards = [
    { label: "Congregações", value: totalCongregacoes },
    { label: "Turmas", value: totalTurmas },
    { label: "Alunos ativos", value: totalAlunos },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">Visão geral do seu escopo de acesso.</p>
      </div>

      {pendencias.length > 0 && (
        <div className="rounded-xl border border-gold-300 bg-gold-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-gold-900">Pendências</h2>
          <ul className="space-y-1.5">
            {pendencias.map((p) => (
              <li key={p.texto}>
                <Link href={p.href} className="text-sm text-gold-800 underline hover:text-gold-900">
                  {p.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Últimas chamadas lançadas</h2>
        </div>
        {ultimasChamadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nenhuma chamada lançada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Turma</th>
                <th className="px-4 py-2">Congregação</th>
                <th className="px-4 py-2">Presentes</th>
              </tr>
            </thead>
            <tbody>
              {ultimasChamadas.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-4 py-2">{new Date(c.data).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2">{c.turma.nome}</td>
                  <td className="px-4 py-2">{c.turma.congregacao.nome}</td>
                  <td className="px-4 py-2">
                    {c.presencas.filter((p) => p.presente).length}/{c.presencas.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
