"use client";

import { useTransition } from "react";
import { alterarStatusTurma } from "./actions";

export function AlterarStatusTurmaButton({
  turmaId,
  congregacaoId,
  areaId,
  campoId,
  status,
}: {
  turmaId: string;
  congregacaoId: string;
  areaId: string;
  campoId: string;
  status: "ATIVO" | "INATIVO";
}) {
  const [pending, startTransition] = useTransition();
  const novoStatus = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => alterarStatusTurma(turmaId, congregacaoId, areaId, campoId, novoStatus))
      }
      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Ativar"}
    </button>
  );
}
