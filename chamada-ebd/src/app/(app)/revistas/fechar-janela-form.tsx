"use client";

import { useState, useTransition } from "react";
import { fecharJanelaPedidos, reabrirJanelaPedidos } from "./actions";

export function FecharJanelaForm({ periodos }: { periodos: { trimestre: number; ano: number }[] }) {
  const [pending, startTransition] = useTransition();
  const [selecionado, setSelecionado] = useState(periodos[0] ? `${periodos[0].trimestre}-${periodos[0].ano}` : "");

  if (periodos.length === 0) return null;

  const [trimestre, ano] = selecionado.split("-").map(Number);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Trimestre/ano</label>
        <select
          value={selecionado}
          onChange={(e) => setSelecionado(e.target.value)}
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {periodos.map((p) => (
            <option key={`${p.trimestre}-${p.ano}`} value={`${p.trimestre}-${p.ano}`}>
              {p.trimestre}º/{p.ano}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Fechar a janela de pedidos do ${trimestre}º/${ano}? Ninguém mais poderá adicionar itens.`)) {
            startTransition(() => fecharJanelaPedidos(trimestre, ano));
          }
        }}
        className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        Fechar janela deste período
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => reabrirJanelaPedidos(trimestre, ano))}
        className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        Reabrir
      </button>
    </div>
  );
}
