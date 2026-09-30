import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { NovaCongregacaoForm } from "./nova-congregacao-form";
import { AlterarStatusCongregacaoButton } from "./alterar-status-button";

export default async function CongregacoesPage() {
  const user = await requireFuncionalidade("congregacoes.gerenciar");

  const areasWhere =
    user.role === "ADMIN"
      ? {}
      : user.role === "COORDENADOR_CAMPO"
        ? { campoId: user.campoId ?? "__none__" }
        : { id: user.areaId ?? "__none__" };

  const areas = await prisma.area.findMany({
    where: areasWhere,
    orderBy: { nome: "asc" },
    include: { campo: true },
  });

  const congregacoes = await prisma.congregacao.findMany({
    where: filtroCongregacaoPorEscopo(user),
    orderBy: { nome: "asc" },
    include: { area: { include: { campo: true } }, _count: { select: { turmas: true, alunos: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Congregações</h1>
        <p className="text-sm text-slate-500">
          Cada congregação pertence a uma área e possui suas próprias turmas de EBD.
        </p>
      </div>

      <NovaCongregacaoForm
        areas={areas.map((a) => ({ id: a.id, nome: `${a.nome} (${a.campo.nome})` }))}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Área</th>
              <th className="px-4 py-2">Turmas</th>
              <th className="px-4 py-2">Alunos</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {congregacoes.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{c.nome}</td>
                <td className="px-4 py-2 text-slate-600">
                  {c.area.nome} <span className="text-slate-400">/ {c.area.campo.nome}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{c._count.turmas}</td>
                <td className="px-4 py-2 text-slate-600">{c._count.alunos}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <AlterarStatusCongregacaoButton
                    congregacaoId={c.id}
                    areaId={c.areaId}
                    campoId={c.area.campoId}
                    status={c.status}
                  />
                </td>
              </tr>
            ))}
            {congregacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma congregação cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
