/**
 * Quebra um texto único em seções fixas, usando os títulos `##` que o
 * próprio texto já usa — sem precisar de campo por seção no Directus.
 * Se não houver nenhum `##`, cai de volta pra um bloco só, sem quebrar a
 * página. Usada em `/sobre/` e `/crencas/`.
 */
export function quebrarEmSecoes(markdown: string): { titulo: string; corpo: string }[] {
  const partes = markdown.split(/^##\s+(.+)$/m);
  if (partes.length < 3) return [{ titulo: "", corpo: markdown }];
  const secoes: { titulo: string; corpo: string }[] = [];
  for (let i = 1; i < partes.length; i += 2) {
    secoes.push({ titulo: partes[i].trim(), corpo: partes[i + 1]?.trim() ?? "" });
  }
  return secoes;
}
