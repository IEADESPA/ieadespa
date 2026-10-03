"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarLancamento } from "./actions";

export function NovoLancamentoForm({ congregacoes }: { congregacoes: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarLancamento, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Novo lançamento</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Congregação</label>
          <select name="congregacaoId" required defaultValue={congregacoes.length === 1 ? congregacoes[0].id : ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
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
          <label className="block text-xs font-medium text-slate-600">Tipo</label>
          <select name="tipo" required defaultValue="SAIDA" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="ENTRADA">Entrada</option>
            <option value="SAIDA">Saída</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Categoria</label>
          <input name="categoria" required placeholder="Ex: Conta de luz" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Valor (R$)</label>
          <input type="number" step="0.01" min={0.01} name="valor" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Data</label>
          <input type="date" name="data" required defaultValue={hoje} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="sm:col-span-2 lg:col-span-6">
          <label className="block text-xs font-medium text-slate-600">Descrição (opcional)</label>
          <input name="descricao" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
          {pending ? "Salvando..." : "Adicionar lançamento"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
