"use client";

import { useActionState, useRef, useEffect } from "react";
import { vincularProfessorTurma } from "./actions";

export function VincularProfessorForm({
  professores,
  turmas,
}: {
  professores: { id: string; nome: string }[];
  turmas: { id: string; nome: string }[];
}) {
  const [state, formAction, pending] = useActionState(vincularProfessorTurma, undefined);
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
        <label className="block text-xs font-medium text-slate-600">Professor</label>
        <select name="alunoId" required defaultValue="" className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="" disabled>
            Selecione...
          </option>
          {professores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Turma</label>
        <select name="turmaId" required defaultValue="" className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="" disabled>
            Selecione...
          </option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Vinculando..." : "Vincular"}
      </button>
      {state?.erro && <p className="w-full text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
