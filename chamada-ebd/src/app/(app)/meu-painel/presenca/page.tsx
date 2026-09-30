import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

export default async function MinhaPresencaPage() {
  const user = await requireUser();
  const alunoId = user.id;

  const presencas = await prisma.presencaAluno.findMany({
    where: { alunoId },
    include: { chamada: true },
    orderBy: { chamada: { data: "desc" } },
  });

  const total = presencas.length;
  const presentes = presencas.filter((p) => p.presente).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Minha presença</h1>
        <p className="text-sm text-slate-500">
          {presentes} de {total} domingos — {total > 0 ? Math.round((presentes / total) * 100) : 0}% de frequência.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Presença</th>
              <th className="px-4 py-2">Bíblia</th>
              <th className="px-4 py-2">Revista</th>
            </tr>
          </thead>
          <tbody>
            {presencas.map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-700">{new Date(p.chamada.data).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2">
                  {p.presente ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Presente</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Faltou</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{p.trouxeBiblia ? "✓" : "-"}</td>
                <td className="px-4 py-2 text-slate-600">{p.trouxeRevista ? "✓" : "-"}</td>
              </tr>
            ))}
            {presencas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma chamada registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
