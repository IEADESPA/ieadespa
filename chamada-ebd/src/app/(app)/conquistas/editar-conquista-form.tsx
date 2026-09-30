"use client";

import { useActionState, useState } from "react";
import { atualizarConquista } from "./actions";

type Conquista = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  parametro: number | null;
  oculta: boolean;
};

export function EditarConquistaForm({ conquista }: { conquista: Conquista }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarConquista, undefined);

  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state && !state.erro) setAberto(false);
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-navy-600 hover:underline">
        Editar
      </button>
    );
  }

  return (
    <form action={formAction} className="w-64 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-left">
      <input type="hidden" name="id" value={conquista.id} />
      <div className="grid grid-cols-4 gap-1.5">
        <input name="icone" defaultValue={conquista.icone} required className="col-span-1 rounded border border-slate-300 px-2 py-1 text-xs" />
        <input name="nome" defaultValue={conquista.nome} required className="col-span-3 rounded border border-slate-300 px-2 py-1 text-xs" />
      </div>
      <textarea name="descricao" defaultValue={conquista.descricao} required rows={2} className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
      <div className="flex items-center gap-2">
        <input
          name="parametro"
          type="number"
          min={1}
          defaultValue={conquista.parametro ?? undefined}
          placeholder="número"
          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" name="oculta" defaultChecked={conquista.oculta} className="h-3.5 w-3.5 rounded border-slate-300" />
          Oculta
        </label>
      </div>
      {state?.erro && <p className="text-xs text-red-600">{state.erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
