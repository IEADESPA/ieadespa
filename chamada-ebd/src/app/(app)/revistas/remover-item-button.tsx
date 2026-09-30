"use client";

import { useTransition } from "react";
import { removerItemPedido } from "./actions";

export function RemoverItemButton({ itemId, pedidoId }: { itemId: string; pedidoId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => removerItemPedido(itemId, pedidoId))}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
    >
      remover
    </button>
  );
}
