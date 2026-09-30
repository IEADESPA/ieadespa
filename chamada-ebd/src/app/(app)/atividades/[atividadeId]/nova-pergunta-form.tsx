"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { adicionarPergunta } from "../actions";

type Tipo = "MULTIPLA_ESCOLHA" | "VERDADEIRO_FALSO" | "ORDENAR" | "COMPLETAR" | "CORRESPONDENCIA";

const TIPOS: [Tipo, string, string][] = [
  ["MULTIPLA_ESCOLHA", "Múltipla escolha", "várias alternativas, uma correta"],
  ["VERDADEIRO_FALSO", "Verdadeiro ou Falso", "duas opções fixas"],
  ["ORDENAR", "Ordenar", "aluno organiza os itens na ordem certa"],
  ["COMPLETAR", "Completar", "aluno digita a resposta"],
  ["CORRESPONDENCIA", "Correspondência", "aluno liga cada item da esquerda ao par certo da direita"],
];

export function NovaPerguntaForm({ atividadeId }: { atividadeId: string }) {
  const [state, formAction, pending] = useActionState(adicionarPergunta, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<Tipo>("MULTIPLA_ESCOLHA");
  const [numAlternativas, setNumAlternativas] = useState(4);
  const [numItensOrdenar, setNumItensOrdenar] = useState(3);
  const [numPares, setNumPares] = useState(3);

  useEffect(() => {
    if (state && !state.erro) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="atividadeId" value={atividadeId} />
      <h3 className="text-sm font-semibold text-slate-900">Nova pergunta</h3>

      <div>
        <label className="block text-xs font-medium text-slate-600">Tipo de pergunta</label>
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as Tipo);
            setNumAlternativas(4);
            setNumItensOrdenar(3);
            setNumPares(3);
          }}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-72"
        >
          {TIPOS.map(([v, l, d]) => (
            <option key={v} value={v}>
              {l} — {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600">Enunciado</label>
        <textarea name="enunciado" required rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>

      {(tipo === "MULTIPLA_ESCOLHA" || tipo === "VERDADEIRO_FALSO") && (
        <div key={tipo} className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">Alternativas (marque a correta)</label>
          {tipo === "VERDADEIRO_FALSO" ? (
            <>
              <div className="flex items-center gap-2">
                <input type="radio" name="corretaIndex" value={0} defaultChecked className="shrink-0" />
                <input name="alternativa" required readOnly defaultValue="Verdadeiro" className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="radio" name="corretaIndex" value={1} className="shrink-0" />
                <input name="alternativa" required readOnly defaultValue="Falso" className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" />
              </div>
            </>
          ) : (
            <>
              {Array.from({ length: numAlternativas }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="corretaIndex" value={i} defaultChecked={i === 0} className="shrink-0" />
                  <input name="alternativa" required={i < 2} placeholder={`Alternativa ${i + 1}`} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
                </div>
              ))}
              {numAlternativas < 6 && (
                <button type="button" onClick={() => setNumAlternativas((n) => n + 1)} className="text-xs font-medium text-navy-600 hover:underline">
                  + adicionar alternativa
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tipo === "ORDENAR" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            Itens, digitados NA ORDEM CORRETA (o aluno vai vê-los embaralhados e precisará reordenar)
          </label>
          {Array.from({ length: numItensOrdenar }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}º</span>
              <input name="itemOrdenar" required placeholder={`Item ${i + 1}`} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
          ))}
          {numItensOrdenar < 6 && (
            <button type="button" onClick={() => setNumItensOrdenar((n) => n + 1)} className="text-xs font-medium text-navy-600 hover:underline">
              + adicionar item
            </button>
          )}
        </div>
      )}

      {tipo === "CORRESPONDENCIA" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            Pares (esquerda ↔ direita) — o aluno vai ver a coluna da direita embaralhada
          </label>
          {Array.from({ length: numPares }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name="parEsquerda" required placeholder={`Item ${i + 1} (esquerda)`} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
              <span className="shrink-0 text-xs text-slate-400">↔</span>
              <input name="parDireita" required placeholder={`Par correto ${i + 1} (direita)`} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
          ))}
          {numPares < 8 && (
            <button type="button" onClick={() => setNumPares((n) => n + 1)} className="text-xs font-medium text-navy-600 hover:underline">
              + adicionar par
            </button>
          )}
        </div>
      )}

      {tipo === "COMPLETAR" && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Resposta esperada</label>
          <input name="respostaEsperada" required placeholder="Ex: Belém" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <p className="mt-0.5 text-[11px] text-slate-400">A correção ignora maiúsculas/minúsculas e espaços nas pontas.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Adicionar pergunta"}
      </button>
      {state?.erro && <p className="text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
