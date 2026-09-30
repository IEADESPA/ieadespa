"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarConquista } from "./actions";

const TIPOS_REGRA: [string, string][] = [
  ["PRIMEIRA_PRESENCA", "Primeira presença"],
  ["SEQUENCIA_PRESENCA", "Sequência de presenças seguidas (usa o número abaixo)"],
  ["FIDELIDADE_BIBLIA", "Nº de vezes que trouxe a Bíblia (usa o número abaixo)"],
  ["FIDELIDADE_REVISTA", "Nº de vezes que trouxe a revista (usa o número abaixo)"],
  ["PRIMEIRA_ATIVIDADE", "Nº de atividades concluídas (usa o número abaixo)"],
  ["GABARITOS", "Nº de atividades com nota máxima (usa o número abaixo)"],
  ["TRIMESTRE_PERFEITO", "1 trimestre inteiro com presença perfeita"],
  ["TRIMESTRES_CONSECUTIVOS", "Nº de trimestres perfeitos seguidos (usa o número abaixo)"],
  ["RESPOSTA_RAPIDA", "Respondeu uma atividade no mesmo dia em que foi criada"],
  ["COMBO", "Só combinação dos pré-requisitos (sem regra própria)"],
];

export function CriarConquistaForm({ conquistasExistentes }: { conquistasExistentes: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarConquista, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Nome</label>
          <input name="nome" required minLength={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Ícone (emoji)</label>
          <input name="icone" required placeholder="🎯" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Descrição</label>
          <input name="descricao" required minLength={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Regra de desbloqueio</label>
          <select name="tipoRegra" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="" disabled>
              Selecione...
            </option>
            {TIPOS_REGRA.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Número (quando a regra usa)</label>
          <input name="parametro" type="number" min={1} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" name="oculta" className="h-4 w-4 rounded border-slate-300" />
            Oculta até ser desbloqueada
          </label>
        </div>
      </div>

      {conquistasExistentes.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Pré-requisitos (opcional)</label>
          <div className="mt-1 flex flex-wrap gap-3 rounded-md border border-slate-200 p-2">
            {conquistasExistentes.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" name="requer" value={c.id} className="h-3.5 w-3.5 rounded border-slate-300" />
                {c.nome}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar conquista"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
