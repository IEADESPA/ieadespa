"use client";

import { useTransition } from "react";
import { alterarStatusAluno } from "./actions";

export function AlterarStatusAlunoButton({
  alunoId,
  status,
}: {
  alunoId: string;
  status: "ATIVO" | "INATIVO";
}) {
  const [pending, startTransition] = useTransition();
  const novoStatus = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => alterarStatusAluno(alunoId, novoStatus))}
      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Ativar"}
    </button>
  );
}
