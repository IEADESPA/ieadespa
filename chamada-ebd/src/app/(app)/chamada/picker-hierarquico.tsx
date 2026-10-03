"use client";

import { useState } from "react";
import { TurmaCard, type TurmaChamadaInfo } from "./turma-card";

export type GrupoArea = {
  areaId: string;
  areaLabel: string; // "Área 1 (Campo Metropolitano)" quando há mais de um campo em jogo
  congregacoes: {
    congregacaoId: string;
    congregacaoNome: string;
    turmas: TurmaChamadaInfo[];
  }[];
};

/**
 * Picker de turmas agrupado por Área → Congregação, com busca — usado
 * quando o escopo abrange mais de uma congregação (Coordenador de Área/
 * Campo, Admin). Sem isso a tela vira uma lista achatada de dezenas de
 * turmas e perde qualquer organização.
 */
export function PickerHierarquico({ grupos }: { grupos: GrupoArea[] }) {
  const [busca, setBusca] = useState("");

  const totalTurmas = grupos.reduce(
    (soma, g) => soma + g.congregacoes.reduce((s, c) => s + c.turmas.length, 0),
    0
  );

  const termo = busca.trim().toLowerCase();
  const grupoBatePorBusca = (turmas: TurmaChamadaInfo[], congregacaoNome: string) => {
    if (!termo) return true;
    if (congregacaoNome.toLowerCase().includes(termo)) return true;
    return turmas.some((t) => t.nome.toLowerCase().includes(termo));
  };

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder={`Buscar turma ou congregação entre ${totalTurmas}...`}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
      />

      <div className="space-y-3">
        {grupos.map((area) => {
          const congregacoesVisiveis = area.congregacoes.filter((c) => grupoBatePorBusca(c.turmas, c.congregacaoNome));
          if (congregacoesVisiveis.length === 0) return null;
          const totalArea = area.congregacoes.reduce((s, c) => s + c.turmas.length, 0);

          return (
            <details key={area.areaId} className="group rounded-xl border border-slate-200 bg-white" open={!!termo || grupos.length <= 2}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 select-none">
                <span className="text-sm font-semibold text-navy-800">{area.areaLabel}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {totalArea} turma(s)
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="transition-transform group-open:rotate-180">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>

              <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                {congregacoesVisiveis.map((c) => (
                  <div key={c.congregacaoId}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {c.congregacaoNome}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {c.turmas
                        .filter((t) => !termo || t.nome.toLowerCase().includes(termo) || c.congregacaoNome.toLowerCase().includes(termo))
                        .map((t) => (
                          <TurmaCard key={t.id} t={t} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
