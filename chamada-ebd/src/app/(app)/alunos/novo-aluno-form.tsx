"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarAluno } from "./actions";

export function NovoAlunoForm({ turmas }: { turmas: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarAluno, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600">Turma</label>
        <select
          name="turmaId"
          required
          defaultValue={turmas.length === 1 ? turmas[0].id : ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
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
      <div>
        <label className="block text-xs font-medium text-slate-600">Matrícula</label>
        <input
          name="matricula"
          required
          placeholder="do sistema de membros"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Nome do aluno</label>
        <input name="nome" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Telefone</label>
        <input name="telefone" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Data de nascimento</label>
        <input type="date" name="dataNascimento" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>

      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="membroIgreja" className="rounded border-slate-300" />
          Membro da igreja
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="batizado" className="rounded border-slate-300" />
          Batizado
        </label>
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Adicionar aluno"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
