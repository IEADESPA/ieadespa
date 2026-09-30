"use client";

import { useTransition } from "react";
import { removerLancamento } from "./actions";

export function RemoverLancamentoButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover este lançamento?")) startTransition(() => removerLancamento(id));
      }}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
    >
      remover
    </button>
  );
}
