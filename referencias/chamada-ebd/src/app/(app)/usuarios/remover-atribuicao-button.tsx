"use client";

import { useTransition } from "react";
import { removerAtribuicao } from "./actions";

export function RemoverAtribuicaoButton({ atribuicaoId }: { atribuicaoId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Remover este papel"
      onClick={() => {
        if (confirm("Remover este papel deste usuário?")) {
          startTransition(() => removerAtribuicao(atribuicaoId));
        }
      }}
      className="text-navy-400 hover:text-red-600 disabled:opacity-60"
    >
      ×
    </button>
  );
}
