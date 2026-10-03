"use client";

import { useTransition } from "react";
import { alterarStatusConquista } from "./actions";

export function AlterarStatusConquistaButton({ id, status }: { id: string; status: "ATIVO" | "INATIVO" }) {
  const [pending, startTransition] = useTransition();
  const proximo = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alterarStatusConquista(id, proximo))}
      className="text-xs font-medium text-navy-600 hover:underline disabled:opacity-60"
    >
      {status === "ATIVO" ? "Desativar" : "Reativar"}
    </button>
  );
}
