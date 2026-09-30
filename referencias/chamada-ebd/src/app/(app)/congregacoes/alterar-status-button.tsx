"use client";

import { useTransition } from "react";
import { alterarStatusCongregacao } from "./actions";

export function AlterarStatusCongregacaoButton({
  congregacaoId,
  areaId,
  campoId,
  status,
}: {
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
        startTransition(() => alterarStatusCongregacao(congregacaoId, areaId, campoId, novoStatus))
      }
      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Ativar"}
    </button>
  );
}
