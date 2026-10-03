"use client";

import { useActionState } from "react";
import { criarAtividade } from "./actions";

export function NovaAtividadeForm({ turmas }: { turmas: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarAtividade, undefined);

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div>
        <label className="block text-xs font-medium text-slate-600">Turma</label>
        <select name="turmaId" required defaultValue={turmas.length === 1 ? turmas[0].id : ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
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
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-slate-600">Título</label>
        <input name="titulo" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" placeholder="Ex: Quiz — Lição 5" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Pontos por acerto total</label>
        <input type="number" name="pontosBase" min={1} max={1000} defaultValue={10} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <label className="block text-xs font-medium text-slate-600">Descrição (opcional)</label>
        <textarea name="descricao" rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <p className="mb-2 text-[11px] text-slate-400">
          A atividade fica ligada à lição aberta da congregação — o prazo é automático: 3 dias a partir de quando a
          lição foi aberta. Se não houver lição aberta, abra uma em /licoes antes de criar.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar atividade e adicionar perguntas"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
