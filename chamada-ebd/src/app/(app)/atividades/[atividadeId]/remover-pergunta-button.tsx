"use client";

import { useTransition } from "react";
import { removerPergunta } from "../actions";

export function RemoverPerguntaButton({ perguntaId, atividadeId }: { perguntaId: string; atividadeId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover esta pergunta?")) startTransition(() => removerPergunta(perguntaId, atividadeId));
      }}
      className="shrink-0 text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
    >
      remover
    </button>
  );
}
