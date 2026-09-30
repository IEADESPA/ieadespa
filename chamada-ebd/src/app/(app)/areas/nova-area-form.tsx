"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarArea } from "./actions";

export function NovaAreaForm({ campos }: { campos: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarArea, undefined);
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
        <label className="block text-xs font-medium text-slate-600">Campo</label>
        <select
          name="campoId"
          required
          defaultValue={campos.length === 1 ? campos[0].id : ""}
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="" disabled>
            Selecione...
          </option>
          {campos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Nome da área</label>
        <input
          name="nome"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="Ex: Área 1"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Adicionar área"}
      </button>
      {state?.erro && <p className="w-full text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
