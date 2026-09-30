import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-semibold tracking-wide text-white">
            Chamada <span className="text-gold-400">EBD</span>
          </p>
          <p className="mt-1 text-sm text-white/50">Escola Bíblica Dominical</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white p-8 shadow-xl">
          <h1 className="text-lg font-semibold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-500">Use seu e-mail e senha cadastrados.</p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
