"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarCampo } from "./actions";

export function NovoCampoForm() {
  const [state, formAction, pending] = useActionState(criarCampo, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600">Nome do campo</label>
        <input
          name="nome"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="Ex: Campo Sede"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Sigla</label>
        <input
          name="sigla"
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="Ex: SEDE"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Adicionar campo"}
      </button>
      {state?.erro && <p className="w-full text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
