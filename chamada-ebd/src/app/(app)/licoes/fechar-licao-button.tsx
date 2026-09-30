"use client";

import { useTransition } from "react";
import { fecharLicao } from "./actions";

export function FecharLicaoButton({ licaoId }: { licaoId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Fechar esta lição?")) startTransition(() => fecharLicao(licaoId));
      }}
      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
    >
      Fechar
    </button>
  );
}
