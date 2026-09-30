"use client";

import { useTransition } from "react";
import { alterarStatusArea } from "./actions";

export function AlterarStatusAreaButton({
  areaId,
  campoId,
  status,
}: {
  areaId: string;
  campoId: string;
  status: "ATIVO" | "INATIVO";
}) {
  const [pending, startTransition] = useTransition();
  const novoStatus = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => alterarStatusArea(areaId, campoId, novoStatus))}
      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Ativar"}
    </button>
  );
}
