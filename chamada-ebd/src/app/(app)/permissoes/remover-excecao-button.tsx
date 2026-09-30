"use client";

import { useTransition } from "react";
import { removerExcecaoAluno } from "./actions";

export function RemoverExcecaoButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => removerExcecaoAluno(id))}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
    >
      remover
    </button>
  );
}
