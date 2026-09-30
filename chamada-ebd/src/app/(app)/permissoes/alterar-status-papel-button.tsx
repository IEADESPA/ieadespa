"use client";

import { useTransition } from "react";
import { alterarStatusPapel } from "./actions";

export function AlterarStatusPapelButton({ papelId, status }: { papelId: string; status: "ATIVO" | "INATIVO" }) {
  const [pending, startTransition] = useTransition();
  const proximo = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alterarStatusPapel(papelId, proximo))}
      className="text-xs font-medium text-navy-600 hover:underline disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Reativar"}
    </button>
  );
}
