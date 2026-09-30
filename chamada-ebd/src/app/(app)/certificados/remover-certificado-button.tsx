"use client";

import { useTransition } from "react";
import { removerCertificado } from "./actions";

export function RemoverCertificadoButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover este certificado?")) startTransition(() => removerCertificado(id));
      }}
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
    >
      Remover
    </button>
  );
}
