"use client";

import { useActionState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { emitirCertificado } from "./actions";

export function EmitirCertificadoForm({ alunos }: { alunos: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(emitirCertificado, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state && !state.erro && state.certificadoId) {
      formRef.current?.reset();
      router.push(`/certificados/${state.certificadoId}`);
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Aluno</label>
          <select name="alunoId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
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
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Título</label>
          <input
            name="titulo"
            required
            placeholder="Ex: Conclusão do 2º Trimestre de 2026"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-4">
          <label className="block text-xs font-medium text-slate-600">Descrição (opcional)</label>
          <input name="descricao" placeholder="Texto adicional exibido no certificado" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Emitindo..." : "Emitir certificado"}
        </button>
        {state?.erro && <p className="mt-2 text-sm text-red-600">{state.erro}</p>}
      </div>
    </form>
  );
}
