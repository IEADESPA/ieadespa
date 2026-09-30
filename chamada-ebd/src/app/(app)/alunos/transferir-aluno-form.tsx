"use client";

import { useActionState, useState } from "react";
import { transferirAluno } from "./actions";

export function TransferirAlunoForm({
  alunoId,
  turmaAtualId,
  turmas,
}: {
  alunoId: string;
  turmaAtualId: string;
  turmas: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(transferirAluno, undefined);
  const outras = turmas.filter((t) => t.id !== turmaAtualId);

  const [ultimoState, setUltimoState] = useState(state);
  if (state !== ultimoState) {
    setUltimoState(state);
    if (state && !state.erro) setAberto(false);
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-navy-600 hover:underline">
        Transferir
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="alunoId" value={alunoId} />
      <select name="novaTurmaId" required defaultValue="" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
        <option value="" disabled>
          Nova turma...
        </option>
        {outras.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-navy-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Movendo..." : "Confirmar"}
      </button>
      {state?.erro && <p className="w-full text-right text-xs text-red-600">{state.erro}</p>}
    </form>
  );
}
