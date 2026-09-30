import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { NovoCampoForm } from "./novo-campo-form";
import { AlterarStatusButton } from "./alterar-status-button";

export default async function CamposPage() {
  await requireFuncionalidade("campos.gerenciar");

  const campos = await prisma.campo.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { areas: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Campos</h1>
        <p className="text-sm text-slate-500">
          O campo é o nível mais alto da hierarquia, agrupando várias áreas.
        </p>
      </div>

      <NovoCampoForm />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Sigla</th>
              <th className="px-4 py-2">Áreas</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {campos.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">{c.nome}</td>
                <td className="px-4 py-2 text-slate-600">{c.sigla ?? "-"}</td>
                <td className="px-4 py-2 text-slate-600">{c._count.areas}</td>
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
                  <AlterarStatusButton campoId={c.id} status={c.status} />
                </td>
              </tr>
            ))}
            {campos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhum campo cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
