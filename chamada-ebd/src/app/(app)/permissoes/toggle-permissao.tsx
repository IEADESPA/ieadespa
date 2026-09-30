"use client";

import { useTransition } from "react";
import { alternarPermissaoPapel } from "./actions";

export function TogglePermissao({
  papelId,
  funcionalidadeId,
  permitido,
}: {
  papelId: string;
  funcionalidadeId: string;
  permitido: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alternarPermissaoPapel(papelId, funcionalidadeId, permitido))}
      aria-pressed={permitido}
      className={`h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        permitido ? "bg-gold-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
          permitido ? "translate-x-[22px]" : ""
        }`}
      />
    </button>
  );
}
