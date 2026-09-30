"use client";

import { useRouter } from "next/navigation";

export function FiltrosRelatorio({
  numSemanas,
  congregacaoId,
  congregacoes,
}: {
  numSemanas: number;
  congregacaoId: string;
  congregacoes: { id: string; nome: string }[];
}) {
  const router = useRouter();

  function irPara(semanas: string, congregacao: string) {
    const params = new URLSearchParams();
    params.set("semanas", semanas);
    if (congregacao) params.set("congregacaoId", congregacao);
    router.push(`/relatorios?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {congregacoes.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-slate-600">Congregação:</label>
          <select
            defaultValue={congregacaoId}
            onChange={(e) => irPara(String(numSemanas), e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">Todas</option>
            {congregacoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-slate-600">Período:</label>
        <select
          defaultValue={String(numSemanas)}
          onChange={(e) => irPara(e.target.value, congregacaoId)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          <option value="1">Última semana</option>
          <option value="4">Últimas 4 semanas</option>
          <option value="12">Últimas 12 semanas</option>
          <option value="52">Último ano</option>
        </select>
      </div>
    </div>
  );
}
