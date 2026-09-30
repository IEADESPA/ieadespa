"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarTurma } from "./actions";

const CATEGORIAS: [string, string][] = [
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
  ["OUTRA", "Outra"],
];

export function NovaTurmaForm({ congregacoes }: { congregacoes: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(criarTurma, undefined);
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
        <label className="block text-xs font-medium text-slate-600">Congregação</label>
        <select
          name="congregacaoId"
          required
          defaultValue={congregacoes.length === 1 ? congregacoes[0].id : ""}
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
        <label className="block text-xs font-medium text-slate-600">Nome da turma</label>
        <input name="nome" required className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Categoria</label>
        <select name="categoria" required className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          {CATEGORIAS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Adicionar turma"}
      </button>
      {state?.erro && <p className="w-full text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
