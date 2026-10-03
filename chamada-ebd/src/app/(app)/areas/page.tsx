import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { NovaAreaForm } from "./nova-area-form";
import { AlterarStatusAreaButton } from "./alterar-status-button";

export default async function AreasPage() {
  const user = await requireFuncionalidade("areas.gerenciar");

  const campos = await prisma.campo.findMany({
    where: user.role === "ADMIN" ? {} : { id: user.campoId ?? "__none__" },
    orderBy: { nome: "asc" },
  });

  const areas = await prisma.area.findMany({
    where: user.role === "ADMIN" ? {} : { campoId: user.campoId ?? "__none__" },
    orderBy: { nome: "asc" },
    include: { campo: true, _count: { select: { congregacoes: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Áreas</h1>
        <p className="text-sm text-slate-500">
          Uma área agrupa várias congregações dentro de um campo.
        </p>
      </div>

      <NovaAreaForm campos={campos.map((c) => ({ id: c.id, nome: c.nome }))} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Campo</th>
              <th className="px-4 py-2">Congregações</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{a.nome}</td>
                <td className="px-4 py-2 text-slate-600">{a.campo.nome}</td>
                <td className="px-4 py-2 text-slate-600">{a._count.congregacoes}</td>
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
                  <AlterarStatusAreaButton areaId={a.id} campoId={a.campoId} status={a.status} />
                </td>
              </tr>
            ))}
            {areas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma área cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
