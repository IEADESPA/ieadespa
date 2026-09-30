"use client";

import { Fragment, useMemo, useState } from "react";
import { AlterarStatusTurmaButton } from "./alterar-status-button";

const CATEGORIA_LABEL: Record<string, string> = {
  BERCARIO: "Berçário",
  JARDIM_INFANCIA: "Jardim de Infância",
  PRIMARIOS: "Primários",
  JUNIORES: "Juniores",
  PRE_ADOLESCENTES: "Pré-adolescentes",
  ADOLESCENTES: "Adolescentes",
  JOVENS: "Jovens",
  ADULTOS: "Adultos",
  NOVOS_CONVERTIDOS: "Novos Convertidos",
  MELHOR_IDADE: "Melhor Idade",
  OUTRA: "Outra",
};

export type TurmaLinha = {
  id: string;
  nome: string;
  categoria: string;
  status: "ATIVO" | "INATIVO";
  totalAlunos: number;
  congregacaoId: string;
  congregacaoNome: string;
  areaId: string;
  areaNome: string;
  campoId: string;
};

export function TurmasTabela({ turmas, podeGerenciar }: { turmas: TurmaLinha[]; podeGerenciar: boolean }) {
  const [busca, setBusca] = useState("");
  const mostrarAgrupador = new Set(turmas.map((t) => t.congregacaoId)).size > 1;

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = termo
      ? turmas.filter(
          (t) =>
            t.nome.toLowerCase().includes(termo) ||
            t.congregacaoNome.toLowerCase().includes(termo) ||
            t.areaNome.toLowerCase().includes(termo)
        )
      : turmas;

    if (!mostrarAgrupador) return [{ chave: "unica", titulo: "", turmas: filtradas }];

    const mapa = new Map<string, { chave: string; titulo: string; turmas: TurmaLinha[] }>();
    for (const t of filtradas) {
      const chave = t.congregacaoId;
      if (!mapa.has(chave)) mapa.set(chave, { chave, titulo: `${t.congregacaoNome} — ${t.areaNome}`, turmas: [] });
      mapa.get(chave)!.turmas.push(t);
    }
    return [...mapa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo));
  }, [turmas, busca, mostrarAgrupador]);

  const totalVisivel = grupos.reduce((s, g) => s + g.turmas.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <input
          type="search"
          placeholder={`Buscar entre ${turmas.length} turma(s)...`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none"
        />
        {busca && <p className="shrink-0 text-xs text-slate-400">{totalVisivel} resultado(s)</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Categoria</th>
              {!mostrarAgrupador && <th className="px-4 py-2">Congregação</th>}
              <th className="px-4 py-2">Alunos</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.chave}>
                {mostrarAgrupador && g.turmas.length > 0 && (
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {g.titulo}
                    </td>
                  </tr>
                )}
                {g.turmas.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">{t.nome}</td>
                    <td className="px-4 py-2 text-slate-600">{CATEGORIA_LABEL[t.categoria]}</td>
                    {!mostrarAgrupador && <td className="px-4 py-2 text-slate-600">{t.congregacaoNome}</td>}
                    <td className="px-4 py-2 text-slate-600">{t.totalAlunos}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          t.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {podeGerenciar && (
                        <AlterarStatusTurmaButton
                          turmaId={t.id}
                          congregacaoId={t.congregacaoId}
                          areaId={t.areaId}
                          campoId={t.campoId}
                          status={t.status}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {totalVisivel === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {turmas.length === 0 ? "Nenhuma turma cadastrada ainda." : "Nenhuma turma encontrada para essa busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
