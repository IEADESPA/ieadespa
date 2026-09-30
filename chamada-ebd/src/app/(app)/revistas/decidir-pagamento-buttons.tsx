"use client";

import { useTransition } from "react";
import { decidirPagamento } from "./actions";

export function DecidirPagamentoButtons({ pagamentoId }: { pagamentoId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => decidirPagamento(pagamentoId, "APROVADO"))}
        className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        Aprovar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Rejeitar este pagamento?")) startTransition(() => decidirPagamento(pagamentoId, "REJEITADO"));
        }}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        Rejeitar
      </button>
    </div>
  );
}
