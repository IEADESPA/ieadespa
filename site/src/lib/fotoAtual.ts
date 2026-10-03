/**
 * Fase 24.11 — "foto mais atual vence": em vez de a foto do Street View
 * sempre prevalecer (ela pode ficar anos sem atualizar — o carro do Google
 * não passa de novo com frequência nenhuma garantida, principalmente em
 * zona rural/congregação pequena), compara a data da foto do Street View
 * com a data de uma foto enviada manualmente (upload no Directus) e usa
 * sempre a mais recente das duas. Pensado pra já servir tanto a Sede quanto
 * qualquer congregação no futuro — é só chamar com os dados de cada uma.
 */
export interface FontesFoto {
  streetView: { url: string; data: string | null } | null;
  manual: { url: string; data: string | null } | null;
}

export interface FotoAtual {
  url: string;
  fonte: "manual" | "streetview";
}

/** Compara "AAAA-MM-DD" ou "AAAA-MM" — funciona por comparação de string
 * porque os dois formatos são zero-padded e ordenáveis lexicograficamente. */
function maisRecente(a: string | null, b: string | null): "a" | "b" {
  if (!a) return "b";
  if (!b) return "a";
  return a >= b ? "a" : "b";
}

export function resolverFotoAtual({ streetView, manual }: FontesFoto): FotoAtual | null {
  const svValida = streetView && streetView.url ? streetView : null;
  const manualValida = manual && manual.url ? manual : null;

  if (!svValida && !manualValida) return null;
  if (!manualValida) return { url: svValida!.url, fonte: "streetview" };
  if (!svValida) return { url: manualValida.url, fonte: "manual" };

  // Duas fotos reais — sem data cadastrada em nenhuma das duas, não dá pra
  // comparar de verdade; prefere a manual (foi a igreja que escolheu subir).
  if (!svValida.data && !manualValida.data) return { url: manualValida.url, fonte: "manual" };

  return maisRecente(manualValida.data, svValida.data) === "a"
    ? { url: manualValida.url, fonte: "manual" }
    : { url: svValida.url, fonte: "streetview" };
}
