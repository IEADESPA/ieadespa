"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label htmlFor="matricula" className="block text-sm font-medium text-slate-700">
          Matrícula
        </label>
        <input
          id="matricula"
          name="matricula"
          type="text"
          required
          inputMode="numeric"
          autoComplete="username"
          autoFocus
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>
      <div>
        <label htmlFor="senha" className="block text-sm font-medium text-slate-700">
          Senha <span className="font-normal text-slate-400">(só para quem tem função além de aluno)</span>
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      {state?.erro ? <p className="text-sm text-red-600">{state.erro}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-navy-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
