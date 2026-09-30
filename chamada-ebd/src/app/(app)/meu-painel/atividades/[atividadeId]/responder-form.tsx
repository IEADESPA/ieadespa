"use client";

import { useActionState } from "react";
import { responderAtividade } from "./actions";

type Pergunta = {
  id: string;
  enunciado: string;
  tipo: string;
  alternativas: { id: string; texto: string }[];
  opcoesDireita?: string[];
};

const TIPO_LABEL: Record<string, string> = {
  MULTIPLA_ESCOLHA: "Múltipla escolha",
  VERDADEIRO_FALSO: "Verdadeiro/Falso",
  ORDENAR: "Ordenar",
  COMPLETAR: "Completar",
  CORRESPONDENCIA: "Correspondência",
};

export function ResponderForm({ atividadeId, perguntas }: { atividadeId: string; perguntas: Pergunta[] }) {
  const [state, formAction, pending] = useActionState(responderAtividade, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="atividadeId" value={atividadeId} />

      {perguntas.map((p, i) => (
        <fieldset key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-medium text-slate-900">
            {i + 1}. {p.enunciado}{" "}
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
              {TIPO_LABEL[p.tipo]}
            </span>
          </legend>

          {p.tipo === "COMPLETAR" ? (
            <input
              name={`texto_${p.id}`}
              required
              placeholder="Digite sua resposta"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          ) : p.tipo === "ORDENAR" ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Escolha a posição de cada item na ordem correta.</p>
              {p.alternativas.map((alt) => (
                <div key={alt.id} className="flex items-center gap-2">
                  <select name={`ordem_${p.id}_${alt.id}`} required defaultValue="" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="" disabled>
                      #
                    </option>
                    {p.alternativas.map((_, idx) => (
                      <option key={idx} value={idx + 1}>
                        {idx + 1}º
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-700">{alt.texto}</span>
                </div>
              ))}
            </div>
          ) : p.tipo === "CORRESPONDENCIA" ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Escolha, para cada item da esquerda, o par certo da direita.</p>
              {p.alternativas.map((alt) => (
                <div key={alt.id} className="flex items-center gap-2">
                  <span className="w-1/2 text-sm text-slate-700">{alt.texto}</span>
                  <span className="shrink-0 text-xs text-slate-400">↔</span>
                  <select name={`par_${p.id}_${alt.id}`} required defaultValue="" className="w-1/2 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {(p.opcoesDireita ?? []).map((opcao, idx) => (
                      <option key={idx} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {p.alternativas.map((alt) => (
                <label key={alt.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="radio" name={`pergunta_${p.id}`} value={alt.id} required className="shrink-0" />
                  {alt.texto}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviar respostas"}
      </button>
      {state?.erro && <p className="text-center text-sm text-red-600">{state.erro}</p>}
    </form>
  );
}
