"use client";

import { useActionState, useRef, useEffect } from "react";
import { registrarPagamento } from "./actions";

export function PagamentoForm({ pedidoId, saldo }: { pedidoId: string; saldo: number }) {
  const [state, formAction, pending] = useActionState(registrarPagamento, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  if (saldo <= 0) return null;

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <div>
        <label className="block text-[11px] font-medium text-slate-500">Registrar pagamento (R$)</label>
        <input
          type="number"
          step="0.01"
          min={0.01}
          max={saldo}
          name="valor"
          required
          defaultValue={saldo.toFixed(2)}
          className="mt-0.5 w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
      <input
        name="observacao"
        placeholder="observação (opcional)"
        className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Registrar"}
      </button>
      {state?.erro && <p className="w-full text-xs text-red-600">{state.erro}</p>}
    </form>
  );
}
