"use client";

import { useRouter } from "next/navigation";

export function PeriodoSelect({ numSemanas, congregacaoId }: { numSemanas: number; congregacaoId: string }) {
  const router = useRouter();

  function irPara(semanas: string, congregacao: string) {
    const params = new URLSearchParams();
    params.set("semanas", semanas);
    if (congregacao) params.set("congregacaoId", congregacao);
    router.push(`/financeiro?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-slate-600">Período:</label>
      <select
        defaultValue={String(numSemanas)}
        onChange={(e) => irPara(e.target.value, congregacaoId)}
        className="rounded-md border border-slate-300 px-2 py-1"
      >
        <option value="4">Últimas 4 semanas</option>
        <option value="12">Últimas 12 semanas</option>
        <option value="52">Último ano</option>
      </select>
    </div>
  );
}
