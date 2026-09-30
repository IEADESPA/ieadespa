"use client";

import { useActionState, useRef, useEffect } from "react";
import { abrirLicao } from "./actions";

export function NovaLicaoForm({ congregacoes }: { congregacoes: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(abrirLicao, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const anoAtual = new Date().getFullYear();

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="lg:col-span-2">
        <label className="block text-xs font-medium text-slate-600">Congregação</label>
        <select
          name="congregacaoId"
          required
          defaultValue={congregacoes.length === 1 ? congregacoes[0].id : ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="" disabled>
            Selecione...
          </option>
          {congregacoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Trimestre</label>
        <select name="trimestre" required defaultValue={Math.ceil((new Date().getMonth() + 1) / 3)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          {[1, 2, 3, 4].map((t) => (
            <option key={t} value={t}>
              {t}º
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Ano</label>
        <input type="number" name="ano" required defaultValue={anoAtual} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Número</label>
        <input type="number" name="numero" required min={1} max={13} defaultValue={1} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Título</label>
        <input name="titulo" required placeholder="Ex: A graça de Deus" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>

      <div className="sm:col-span-2 lg:col-span-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Abrindo..." : "Abrir lição"}
        </button>
        <span className="ml-2 text-xs text-slate-400">Fecha automaticamente a lição aberta anterior dessa congregação.</span>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
