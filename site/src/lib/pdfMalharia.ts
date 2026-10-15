/**
 * PDF que vai para a malharia (15/10/2026, pedido do responsável): só o RESULTADO FINAL — o tamanho e quanto encomendar. Nada de "pedido pelo sistema", "estoque extra",
 * custo ou acerto de lote: isso é conta interna da igreja e não interessa a quem fabrica. Esta parte é regra pura (sem tela), para poder ser testada sozinha.
 */

export interface LinhaConsolidada {
  tamanho: string | null;
  modelo: string | null;
  /** o que a igreja vai de fato encomendar: pedidos do sistema + estoque extra (o extra pode ser negativo) */
  total: number;
}

export interface LinhaMalharia {
  /** "M", ou "M - Baby look" quando a campanha tem mais de um modelo */
  rotulo: string;
  quantidade: number;
}

const SEM_VALOR = new Set(["", "—", "-", "–"]);
const limpo = (v: string | null | undefined): string => String(v ?? "").trim();
const vazio = (v: string | null | undefined): boolean => SEM_VALOR.has(limpo(v));

/**
 * Duas colunas: tamanho e quantidade. Só entra linha com quantidade MAIOR que zero (a malharia não precisa saber do que não vai encomendar). Se há mais de um modelo, o modelo
 * vai junto do tamanho (sem ele a malharia não saberia o que fazer); com um modelo só, ele não aparece. A ordem é a da campanha (P, M, G…), depois o modelo; o que não está na
 * lista de tamanhos da campanha vem no fim, em ordem alfabética.
 */
export function montarLinhasMalharia(
  linhas: LinhaConsolidada[],
  ordemTamanhos: string[] = [],
): { linhas: LinhaMalharia[]; totalPecas: number } {
  const validas = linhas.filter((l) => Number(l.total) > 0);
  const modelos = new Set(validas.map((l) => limpo(l.modelo)).filter((m) => !vazio(m)));
  const comModelo = modelos.size > 1;
  const posicao = (t: string | null): number => {
    const i = ordemTamanhos.indexOf(limpo(t));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordenadas = [...validas].sort(
    (a, b) =>
      posicao(a.tamanho) - posicao(b.tamanho) ||
      limpo(a.tamanho).localeCompare(limpo(b.tamanho), "pt-BR", { numeric: true }) ||
      limpo(a.modelo).localeCompare(limpo(b.modelo), "pt-BR"),
  );
  // o mesmo tamanho+modelo em duas linhas (não deveria acontecer) soma, para não aparecer repetido
  const mapa = new Map<string, LinhaMalharia>();
  for (const l of ordenadas) {
    const tamanho = vazio(l.tamanho) ? "Sem tamanho" : limpo(l.tamanho);
    const rotulo = comModelo && !vazio(l.modelo) ? `${tamanho} - ${limpo(l.modelo)}` : tamanho;
    const atual = mapa.get(rotulo);
    if (atual) atual.quantidade += Number(l.total);
    else mapa.set(rotulo, { rotulo, quantidade: Number(l.total) });
  }
  const resultado = [...mapa.values()];
  return { linhas: resultado, totalPecas: resultado.reduce((s, l) => s + l.quantidade, 0) };
}
