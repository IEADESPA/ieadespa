import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { NovoAlunoForm } from "./novo-aluno-form";
import { AlterarStatusAlunoButton } from "./alterar-status-button";
import { TransferirAlunoForm } from "./transferir-aluno-form";

const OPCOES_POR_PAGINA = [25, 50, 100, 200] as const;
const PADRAO_POR_PAGINA = 50;

function paraQuery(sp: Record<string, string | undefined>, sobrescreve: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...sobrescreve })) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return `?${params.toString()}`;
}

export default async function AlunosPage({
  searchParams,
}: {
  searchParams: Promise<{ areaId?: string; congregacaoId?: string; turmaId?: string; q?: string; pagina?: string; porPagina?: string }>;
}) {
  const user = await requireFuncionalidade("alunos.gerenciar");
  const sp = await searchParams;

  const turmasWhere =
    user.role === "PROFESSOR"
      ? { professores: { some: { alunoId: user.id } } }
      : { congregacao: filtroCongregacaoPorEscopo(user) };

  const turmasDoEscopo = await prisma.turma.findMany({
    where: turmasWhere,
    orderBy: { nome: "asc" },
    include: { congregacao: { include: { area: true } } },
  });

  // Listas de opção pros filtros, derivadas do próprio escopo — só aparece
  // o que a pessoa realmente enxerga.
  const areasMap = new Map<string, string>();
  const congregacoesMap = new Map<string, { nome: string; areaId: string }>();
  for (const t of turmasDoEscopo) {
    areasMap.set(t.congregacao.area.id, t.congregacao.area.nome);
    congregacoesMap.set(t.congregacao.id, { nome: t.congregacao.nome, areaId: t.congregacao.areaId });
  }
  const areasOpcoes = [...areasMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const congregacoesOpcoes = [...congregacoesMap.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));

  let turmaIdsFiltrados = turmasDoEscopo.map((t) => t.id);
  if (sp.turmaId) {
    turmaIdsFiltrados = turmasDoEscopo.filter((t) => t.id === sp.turmaId).map((t) => t.id);
  } else if (sp.congregacaoId) {
    turmaIdsFiltrados = turmasDoEscopo.filter((t) => t.congregacaoId === sp.congregacaoId).map((t) => t.id);
  } else if (sp.areaId) {
    turmaIdsFiltrados = turmasDoEscopo.filter((t) => t.congregacao.areaId === sp.areaId).map((t) => t.id);
  }

  const q = sp.q?.trim();
  const whereAlunos = {
    turmaId: { in: turmaIdsFiltrados },
    ...(q ? { OR: [{ nome: { contains: q } }, { matricula: { contains: q } }] } : {}),
  };

  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const porPagina = OPCOES_POR_PAGINA.includes(Number(sp.porPagina) as (typeof OPCOES_POR_PAGINA)[number])
    ? Number(sp.porPagina)
    : PADRAO_POR_PAGINA;

  const [totalAlunos, alunos] = await Promise.all([
    prisma.aluno.count({ where: whereAlunos }),
    prisma.aluno.findMany({
      where: whereAlunos,
      orderBy: { nome: "asc" },
      include: { turma: { include: { congregacao: true } } },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(totalAlunos / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);

  const turmasParaFormularios = turmasDoEscopo.map((t) => ({ id: t.id, nome: `${t.nome} — ${t.congregacao.nome}` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Alunos</h1>
        <p className="text-sm text-slate-500">
          {totalAlunos} aluno(s) no seu escopo{q ? ` — buscando "${q}"` : ""}.
        </p>
      </div>

      <NovoAlunoForm turmas={turmasParaFormularios} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Buscar (nome ou matrícula)</label>
          <input
            type="text"
            name="q"
            defaultValue={sp.q}
            placeholder="Ex: Maria ou 123456"
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        {areasOpcoes.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Área</label>
            <select name="areaId" defaultValue={sp.areaId ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">Todas</option>
              {areasOpcoes.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        )}
        {congregacoesOpcoes.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Congregação</label>
            <select name="congregacaoId" defaultValue={sp.congregacaoId ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">Todas</option>
              {congregacoesOpcoes.map(([id, c]) => (
                <option key={id} value={id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        {turmasDoEscopo.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Turma</label>
            <select name="turmaId" defaultValue={sp.turmaId ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">Todas</option>
              {[...congregacoesMap.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome)).map(([congId, cong]) => (
                <optgroup key={congId} label={cong.nome}>
                  {turmasDoEscopo
                    .filter((t) => t.congregacaoId === congId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600">Por página</label>
          <select name="porPagina" defaultValue={String(porPagina)} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            {OPCOES_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700">
          Filtrar
        </button>
        {(sp.q || sp.areaId || sp.congregacaoId || sp.turmaId) && (
          <Link href="/alunos" className="text-xs font-medium text-slate-500 hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Matrícula</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Turma</th>
              <th className="px-4 py-2">Telefone</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {alunos.map((a) => (
              <tr key={a.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{a.matricula}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{a.nome}</td>
                <td className="px-4 py-2 text-slate-600">
                  {a.turma.nome} <span className="text-slate-400">— {a.turma.congregacao.nome}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{a.telefone ?? "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <TransferirAlunoForm alunoId={a.id} turmaAtualId={a.turmaId} turmas={turmasParaFormularios} />
                    <AlterarStatusAlunoButton alunoId={a.id} status={a.status} />
                  </div>
                </td>
              </tr>
            ))}
            {alunos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhum aluno encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            {paginaAtual > 1 && (
              <Link
                href={paraQuery(sp, { pagina: paginaAtual - 1 })}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                ← Anterior
              </Link>
            )}
            {paginaAtual < totalPaginas && (
              <Link
                href={paraQuery(sp, { pagina: paginaAtual + 1 })}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
