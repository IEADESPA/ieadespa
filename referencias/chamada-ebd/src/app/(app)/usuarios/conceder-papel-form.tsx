"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { concederPapel } from "./actions";
import type { NivelPapel } from "@/generated/prisma/client";

type Papel = { id: string; nome: string; nivel: NivelPapel };
type Aluno = { id: string; label: string; temSenha: boolean };

export function ConcederPapelForm({
  papeisConcediveis,
  alunos,
  campos,
  areas,
}: {
  papeisConcediveis: Papel[];
  alunos: Aluno[];
  campos: { id: string; nome: string }[];
  areas: { id: string; nome: string }[];
}) {
  const [state, formAction, pending] = useActionState(concederPapel, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [papelSelecionadoId, setPapelSelecionadoId] = useState(papeisConcediveis[0]?.id ?? "");
  const [alunoSelecionadoId, setAlunoSelecionadoId] = useState("");

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  const papelSelecionado = papeisConcediveis.find((p) => p.id === papelSelecionadoId);
  const precisaCampo = papelSelecionado?.nivel === "CAMPO";
  const precisaArea = papelSelecionado?.nivel === "AREA";
  const alunoSelecionado = alunos.find((a) => a.id === alunoSelecionadoId);
  const precisaSenha = alunoSelecionado && !alunoSelecionado.temSenha;

  if (papeisConcediveis.length === 0) return null;

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs text-slate-500">
        Todo mundo no sistema já é aluno — aqui você só concede um papel a mais em cima da matrícula que a pessoa já
        tem. A congregação do papel (quando aplicável) é sempre a mesma em que ela já está matriculada.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Aluno (busque por nome ou matrícula)</label>
          <select
            name="alunoId"
            required
            value={alunoSelecionadoId}
            onChange={(e) => setAlunoSelecionadoId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {alunos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Papel</label>
          <select
            name="papelId"
            required
            value={papelSelecionadoId}
            onChange={(e) => setPapelSelecionadoId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {papeisConcediveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        {precisaCampo && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Campo</label>
            <select name="campoId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="" disabled>
                Selecione...
              </option>
              {campos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {precisaArea && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Área</label>
            <select name="areaId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="" disabled>
                Selecione...
              </option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {precisaSenha && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Senha (primeiro papel dessa pessoa)</label>
            <input
              type="password"
              name="senha"
              minLength={6}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Conceder papel"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
