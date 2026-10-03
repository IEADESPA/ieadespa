"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { trocarPainel } from "@/app/painel-actions";
import type { PanelRole } from "@/lib/rbac";

export function PainelSwitcher({
  paineis,
  painelAtivoChave,
}: {
  paineis: PanelRole[];
  painelAtivoChave: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const ativo = paineis.find((p) => p.chave === painelAtivoChave) ?? paineis[0];

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  if (paineis.length === 0) return null;

  if (paineis.length === 1) {
    return <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">{ativo?.label}</div>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={pending}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-medium text-white hover:bg-white/15 disabled:opacity-60"
      >
        <span className="truncate">{ativo?.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Trocar painel
          </p>
          {paineis.map((p) => (
            <button
              key={p.chave}
              type="button"
              disabled={pending}
              onClick={() => {
                setAberto(false);
                startTransition(() => trocarPainel(p.chave));
              }}
              className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                p.chave === painelAtivoChave ? "bg-amber-50 font-medium text-slate-900" : "text-slate-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
