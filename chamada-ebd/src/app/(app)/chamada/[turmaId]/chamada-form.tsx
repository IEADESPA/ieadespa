"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { lancarChamada } from "./actions";

type Aluno = {
  id: string;
  nome: string;
  presente: boolean;
  trouxeBiblia: boolean;
  trouxeRevista: boolean;
};

const CORES_AVATAR = [
  "bg-navy-700", "bg-gold-600", "bg-navy-500", "bg-gold-500", "bg-navy-800", "bg-gold-700",
];

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return (partes[0]?.[0] ?? "").concat(partes.length > 1 ? partes[partes.length - 1][0] : "").toUpperCase();
}

function corAvatar(nome: string) {
  const soma = [...nome].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

export function ChamadaForm({
  turmaId,
  dataSelecionada,
  alunos,
  chamada,
}: {
  turmaId: string;
  dataSelecionada: string;
  alunos: Aluno[];
  chamada: { visitantes: number; oferta: number; inicioPontual: boolean; observacoes: string } | null;
}) {
  const [state, formAction, pending] = useActionState(lancarChamada, undefined);
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [presentesCount, setPresentesCount] = useState(() => alunos.filter((a) => a.presente).length);

  // Mantém TODOS os alunos sempre montados no DOM (só escondidos via CSS) —
  // se removêssemos do array ao filtrar, um checkbox não-controlado perderia
  // o estado marcado pelo usuário ao ser desmontado e remontado depois.
  const idsVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return null;
    return new Set(alunos.filter((a) => a.nome.toLowerCase().includes(termo)).map((a) => a.id));
  }, [alunos, busca]);
  const totalVisivel = idsVisiveis ? idsVisiveis.size : alunos.length;

  const total = alunos.length;
  const percentual = total > 0 ? Math.round((presentesCount / total) * 100) : 0;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="turmaId" value={turmaId} />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Data (domingo)</label>
          <input
            type="date"
            name="data"
            defaultValue={dataSelecionada}
            onChange={(e) => router.push(`?data=${e.target.value}`)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Visitantes</label>
          <input
            type="number"
            min={0}
            name="visitantes"
            defaultValue={chamada?.visitantes ?? 0}
            className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Oferta (R$)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            name="oferta"
            defaultValue={chamada?.oferta ?? 0}
            className="mt-1 w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="inicioPontual" defaultChecked={chamada?.inicioPontual ?? false} className="h-4 w-4 rounded border-slate-300 text-gold-600 focus:ring-gold-500" />
          Início pontual
        </label>
        <div className="w-full">
          <label className="block text-xs font-medium text-slate-600">Observações</label>
          <textarea
            name="observacoes"
            defaultValue={chamada?.observacoes ?? ""}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Buscar aluno..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none sm:w-64"
        />
        <p className="shrink-0 text-xs text-slate-400">
          {totalVisivel} de {total} aluno(s)
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Aluno</span>
          <span className="w-20 text-center">Presente</span>
          <span className="w-16 text-center">Bíblia</span>
          <span className="w-16 text-center">Revista</span>
        </div>
        <ul className="divide-y divide-slate-50">
          {alunos.map((a) => (
            <li
              key={a.id}
              className={`grid grid-cols-[1fr,auto,auto,auto] items-center gap-3 px-4 py-2.5 ${
                idsVisiveis && !idsVisiveis.has(a.id) ? "hidden" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${corAvatar(a.nome)}`}
                >
                  {iniciais(a.nome)}
                </span>
                <span className="truncate text-sm font-medium text-slate-900">{a.nome}</span>
              </div>

              <span className="flex w-20 justify-center">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    name={`presente_${a.id}`}
                    defaultChecked={a.presente}
                    onChange={(e) => setPresentesCount((n) => n + (e.target.checked ? 1 : -1))}
                    className="peer sr-only"
                  />
                  <span className="h-7 w-14 rounded-full bg-slate-200 transition-colors peer-checked:bg-green-500" />
                  <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-7" />
                </label>
              </span>

              <span className="flex w-16 justify-center">
                <label className="cursor-pointer">
                  <input type="checkbox" name={`biblia_${a.id}`} defaultChecked={a.trouxeBiblia} className="peer sr-only" />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-base grayscale peer-checked:grayscale-0 peer-checked:bg-navy-50">
                    📖
                  </span>
                </label>
              </span>

              <span className="flex w-16 justify-center">
                <label className="cursor-pointer">
                  <input type="checkbox" name={`revista_${a.id}`} defaultChecked={a.trouxeRevista} className="peer sr-only" />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-base grayscale peer-checked:grayscale-0 peer-checked:bg-gold-50">
                    📘
                  </span>
                </label>
              </span>
            </li>
          ))}
          {totalVisivel === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              {total === 0 ? "Nenhum aluno ativo nesta turma." : "Nenhum aluno encontrado para essa busca."}
            </li>
          )}
        </ul>
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200 sm:w-48">
              <div className="h-full bg-gold-500 transition-all" style={{ width: `${percentual}%` }} />
            </div>
            <p className="text-sm font-medium text-slate-700">
              {presentesCount}/{total} presentes ({percentual}%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state?.ok && <p className="text-sm text-green-600">Chamada salva ✓</p>}
            {state?.erro && <p className="text-sm text-red-600">{state.erro}</p>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-navy-800 px-5 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {pending ? "Salvando..." : "Salvar chamada"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
