"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { adicionarItemPedido } from "./actions";

export function AdicionarItemForm({
  congregacoes,
  revistas,
  turmasPorCongregacao,
}: {
  congregacoes: { id: string; nome: string }[];
  revistas: { id: string; label: string }[];
  turmasPorCongregacao: Record<string, { id: string; nome: string }[]>;
}) {
  const [state, formAction, pending] = useActionState(adicionarItemPedido, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const anoAtual = new Date().getFullYear();
  const [congregacaoId, setCongregacaoId] = useState(congregacoes.length === 1 ? congregacoes[0].id : "");
  const turmas = turmasPorCongregacao[congregacaoId] ?? [];

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Fazer pedido de revista</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Congregação</label>
          <select
            name="congregacaoId"
            required
            value={congregacaoId}
            onChange={(e) => setCongregacaoId(e.target.value)}
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
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Revista</label>
          <select name="revistaId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="" disabled>
              Selecione...
            </option>
            {revistas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Turma (opcional)</label>
          <select name="turmaId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Pedido geral (sem turma específica)</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Quantidade</label>
          <input type="number" name="quantidade" required min={1} defaultValue={1} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
      </div>

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gold-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-gold-700 disabled:opacity-60"
        >
          {pending ? "Adicionando..." : "Adicionar item ao pedido"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
