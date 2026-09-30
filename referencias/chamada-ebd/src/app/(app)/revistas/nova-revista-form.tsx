"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarRevista } from "./actions";

const CATEGORIAS: [string, string][] = [
  ["", "Todas / genérica"],
  ["BERCARIO", "Berçário"],
  ["JARDIM_INFANCIA", "Jardim de Infância"],
  ["PRIMARIOS", "Primários"],
  ["JUNIORES", "Juniores"],
  ["PRE_ADOLESCENTES", "Pré-adolescentes"],
  ["ADOLESCENTES", "Adolescentes"],
  ["JOVENS", "Jovens"],
  ["ADULTOS", "Adultos"],
  ["NOVOS_CONVERTIDOS", "Novos Convertidos"],
  ["MELHOR_IDADE", "Melhor Idade"],
];

export function NovaRevistaForm() {
  const [state, formAction, pending] = useActionState(criarRevista, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const anoAtual = new Date().getFullYear();

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Novo item no catálogo</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Título</label>
          <input name="titulo" required placeholder="Ex: Lições Bíblicas — Adultos" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Categoria (turma)</label>
          <select name="categoria" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            {CATEGORIAS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Preço fornecedor (R$)</label>
          <input type="number" step="0.01" min={0} name="precoFornecedor" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <p className="mt-0.5 text-[11px] text-slate-400">o que a casa publicadora cobra</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Preço congregação (R$)</label>
          <input type="number" step="0.01" min={0} name="precoCongregacao" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <p className="mt-0.5 text-[11px] text-slate-400">repassado ao superintendente</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Preço aluno (R$)</label>
          <input type="number" step="0.01" min={0} name="precoAluno" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <p className="mt-0.5 text-[11px] text-slate-400">a congregação pode igualar ao preço-congregação se não quiser lucro</p>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Adicionar ao catálogo"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
