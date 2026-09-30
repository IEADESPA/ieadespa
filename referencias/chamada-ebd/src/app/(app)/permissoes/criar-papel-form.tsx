"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { criarPapel } from "./actions";
import { NIVEL_LABELS } from "@/lib/papeis-sistema";
import type { NivelPapel } from "@/generated/prisma/client";

const NIVEIS: NivelPapel[] = ["GLOBAL", "CAMPO", "AREA", "CONGREGACAO"];

export function CriarPapelForm() {
  const [state, formAction, pending] = useActionState(criarPapel, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [nivel, setNivel] = useState<NivelPapel>("CONGREGACAO");

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs text-slate-500">
        Crie um papel novo além dos 7 padrão. Ele já funciona em todo o sistema sem precisar mexer em código — defina
        em qual nível da hierarquia ele atua e o quão sênior ele é, depois libere as funcionalidades dele abaixo, na
        matriz.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Nome do papel</label>
          <input
            name="nome"
            required
            minLength={2}
            placeholder="Ex: Vice-Superintendente"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Nível</label>
          <select
            name="nivel"
            required
            value={nivel}
            onChange={(e) => setNivel(e.target.value as NivelPapel)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {NIVEL_LABELS[n]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Ordem (0 = mais sênior)</label>
          <input
            name="ordem"
            type="number"
            min={0}
            required
            defaultValue={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-slate-400">
            Só concede papéis com ordem maior que a própria — use o mesmo número de um papel parecido pra ficar no
            mesmo escalão.
          </p>
        </div>
        {nivel === "CONGREGACAO" && (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" name="escopoAmplo" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Gerencia a congregação inteira (desmarque para um papel restrito só ao que a pessoa está vinculada, como
              o Professor)
            </label>
          </div>
        )}
      </div>
      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar papel"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
