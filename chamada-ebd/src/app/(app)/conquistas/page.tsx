import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { CriarConquistaForm } from "./criar-conquista-form";
import { EditarConquistaForm } from "./editar-conquista-form";
import { AlterarStatusConquistaButton } from "./alterar-status-conquista-button";

const TIPO_REGRA_LABELS: Record<string, string> = {
  PRIMEIRA_PRESENCA: "Primeira presença",
  SEQUENCIA_PRESENCA: "Sequência de presenças seguidas",
  FIDELIDADE_BIBLIA: "Nº de vezes que trouxe a Bíblia",
  FIDELIDADE_REVISTA: "Nº de vezes que trouxe a revista",
  PRIMEIRA_ATIVIDADE: "Nº de atividades concluídas",
  GABARITOS: "Nº de atividades com nota máxima",
  TRIMESTRE_PERFEITO: "1 trimestre com presença perfeita",
  TRIMESTRES_CONSECUTIVOS: "Nº de trimestres perfeitos seguidos",
  RESPOSTA_RAPIDA: "Respondeu atividade no mesmo dia",
  COMBO: "Só combinação de pré-requisitos",
};

export default async function ConquistasPage() {
  await requireFuncionalidade("conquistas.gerenciar");

  const conquistas = await prisma.conquista.findMany({
    orderBy: { ordem: "asc" },
    include: { requisitos: { include: { requisito: true } }, _count: { select: { desbloqueios: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Conquistas</h1>
        <p className="text-sm text-slate-500">
          Configure o catálogo de conquistas (badges) que os alunos desbloqueiam. Conquistas ocultas só aparecem para
          o aluno depois de desbloqueadas — a surpresa faz parte do incentivo. Uma conquista pode exigir outras como
          pré-requisito, criando uma cadeia de progressão.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Conquista</th>
              <th className="px-4 py-2">Regra</th>
              <th className="px-4 py-2">Pré-requisitos</th>
              <th className="px-4 py-2">Oculta</th>
              <th className="px-4 py-2">Desbloqueada por</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {conquistas.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 align-top">
                <td className="px-4 py-2.5">
                  <span className="mr-1.5">{c.icone}</span>
                  <span className="font-medium text-slate-800">{c.nome}</span>
                  <p className="text-xs text-slate-500">{c.descricao}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  {TIPO_REGRA_LABELS[c.tipoRegra] ?? c.tipoRegra}
                  {c.parametro != null && ` (${c.parametro})`}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  {c.requisitos.length === 0 ? "—" : c.requisitos.map((r) => r.requisito.nome).join(", ")}
                </td>
                <td className="px-4 py-2.5 text-xs">{c.oculta ? "Sim" : "Não"}</td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{c._count.desbloqueios} aluno(s)</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <EditarConquistaForm conquista={{ id: c.id, nome: c.nome, descricao: c.descricao, icone: c.icone, parametro: c.parametro, oculta: c.oculta }} />
                    <AlterarStatusConquistaButton id={c.id} status={c.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Nova conquista</h2>
        <div className="mt-3">
          <CriarConquistaForm conquistasExistentes={conquistas.map((c) => ({ id: c.id, nome: c.nome }))} />
        </div>
      </div>
    </div>
  );
}
