"use client";

import { useTransition } from "react";
import { alterarStatusAtividade } from "../actions";

export function AlterarStatusAtividadeButton({
  atividadeId,
  status,
}: {
  atividadeId: string;
  status: "ATIVO" | "INATIVO";
}) {
  const [pending, startTransition] = useTransition();
  const novoStatus = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alterarStatusAtividade(atividadeId, novoStatus))}
      className={`h-fit rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        status === "ATIVO"
          ? "border-slate-300 text-slate-600 hover:bg-slate-50"
          : "border-green-300 text-green-700 hover:bg-green-50"
      }`}
    >
      {status === "ATIVO" ? "Encerrar atividade" : "Reabrir atividade"}
    </button>
  );
}
