import type { ItemLista, RelatorioMensal, TipoDepartamento } from "./types";

/**
 * Retorna uma cópia de `valores` com os campos que são "computados" (soma de uma lista
 * nominal, ex.: mensalidades por nome, ou soma do detalhe semanal, ex.: EBD) substituídos
 * pelo valor calculado a partir de `listas`/`semanas`. Os demais campos passam intactos.
 */
export function valoresComputados(
  dep: TipoDepartamento,
  valores: Record<string, number>,
  listas: Record<string, ItemLista[]>,
  semanas: Record<string, number>[],
): Record<string, number> {
  const resultado = { ...valores };
  for (const lista of dep.listasDetalhadas ?? []) {
    resultado[lista.campoDestino] = (listas[lista.id] ?? []).reduce((soma, item) => soma + (item.valor || 0), 0);
  }
  for (const chave of dep.chavesDetalheSemanal ?? []) {
    resultado[chave] = semanas.reduce((soma, linha) => soma + (linha[chave] ?? 0), 0);
  }
  return resultado;
}

export function chavesComputadas(dep: TipoDepartamento): Set<string> {
  const chaves = new Set<string>();
  for (const lista of dep.listasDetalhadas ?? []) chaves.add(lista.campoDestino);
  for (const chave of dep.chavesDetalheSemanal ?? []) chaves.add(chave);
  return chaves;
}

export function novoIdItem(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function listasVazias(dep: TipoDepartamento): RelatorioMensal["listas"] {
  const listas: RelatorioMensal["listas"] = {};
  for (const lista of dep.listasDetalhadas ?? []) listas[lista.id] = [];
  return listas;
}

export function semanasVazias(dep: TipoDepartamento): Record<string, number>[] {
  if (!dep.chavesDetalheSemanal?.length) return [];
  return Array.from({ length: 5 }, () => Object.fromEntries(dep.chavesDetalheSemanal!.map((c) => [c, 0])));
}
