/**
 * Limite de pedidos do lote (16/10/2026), a parte do PAINEL. A regra que vale de verdade (e a trava que impede de passar do número) está em `api/src/lib/limiteLote.js`; aqui só se
 * lê a mesma configuração e se faz a mesma conta para MOSTRAR o uso ao gestor e conferir, antes de uma ação manual (desfazer exclusão, trocar pedido de lote), se ela cabe.
 * `scripts/testes/limite-unidade.cjs` roda as duas versões lado a lado com os mesmos casos, para não divergirem.
 */
export interface Limites {
  total: number | null;
  porTamanho: Record<string, number>;
}

export interface Uso {
  total: number;
  porTamanho: Record<string, number>;
}

export interface PedidoDoLimite {
  total: number;
  porTamanho: Record<string, number>;
}

export type Veredito =
  | { ok: true }
  | { ok: false; motivo: "esgotado" | "quantidade" | "tamanho_esgotado" | "tamanho_quantidade"; restam: number; tamanho?: string; mensagem: string };

function inteiroNaoNegativo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Os campos `limite_total` e `limites_tamanho` da campanha (vazios = sem limite). */
export function limitesDoGrupo(grupo: { limite_total?: unknown; limites_tamanho?: unknown } | null | undefined): Limites {
  const g = grupo ?? {};
  const total = inteiroNaoNegativo(g.limite_total);
  let bruto: unknown = g.limites_tamanho;
  if (typeof bruto === "string") {
    try { bruto = JSON.parse(bruto); } catch { bruto = null; }
  }
  const porTamanho: Record<string, number> = {};
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    for (const [tamanho, valor] of Object.entries(bruto as Record<string, unknown>)) {
      const n = inteiroNaoNegativo(valor);
      if (n !== null && String(tamanho).trim()) porTamanho[String(tamanho).trim()] = n;
    }
  }
  return { total, porTamanho };
}

export const temLimite = (l: Limites) => l.total !== null || Object.keys(l.porTamanho).length > 0;

/** A soma por tamanho que o Directus devolve (`aggregate[sum]=quantidade&groupBy[]=tamanho`; a soma vem como texto). */
export function usoDoAgregado(linhas: unknown): Uso {
  const uso: Uso = { total: 0, porTamanho: {} };
  for (const linha of Array.isArray(linhas) ? (linhas as { tamanho?: string | null; sum?: { quantidade?: unknown } }[]) : []) {
    const n = Number(linha?.sum?.quantidade) || 0;
    const chave = linha?.tamanho ? String(linha.tamanho) : "";
    uso.porTamanho[chave] = (uso.porTamanho[chave] || 0) + n;
    uso.total += n;
  }
  return uso;
}

const pecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;

/** Mesma conta da API: `uso` = o que o lote já tem; `pedido` = o que se quer acrescentar. */
export function avaliar(limites: Limites, uso: Uso, pedido: PedidoDoLimite): Veredito {
  if (limites.total !== null) {
    const restam = Math.max(0, limites.total - uso.total);
    if (pedido.total > restam) {
      return restam === 0
        ? { ok: false, motivo: "esgotado", restam, mensagem: `o lote já está no limite de ${pecas(limites.total)}` }
        : { ok: false, motivo: "quantidade", restam, mensagem: `só restam ${pecas(restam)} no limite do lote (${limites.total})` };
    }
  }
  for (const [tamanho, q] of Object.entries(pedido.porTamanho)) {
    const limite = limites.porTamanho[tamanho];
    if (limite === undefined) continue;
    const restam = Math.max(0, limite - (uso.porTamanho[tamanho] || 0));
    if (q > restam) {
      return restam === 0
        ? { ok: false, motivo: "tamanho_esgotado", tamanho, restam, mensagem: `o tamanho ${tamanho} já está no limite de ${pecas(limite)}` }
        : { ok: false, motivo: "tamanho_quantidade", tamanho, restam, mensagem: `do tamanho ${tamanho} só restam ${pecas(restam)} no limite do lote (${limite})` };
    }
  }
  return { ok: true };
}

/** Soma os itens de uma lista (pedidos restaurados, por exemplo) no formato do limite. */
export function pedidoDosItens(itens: { tamanho?: string | null; quantidade?: unknown }[]): PedidoDoLimite {
  const r: PedidoDoLimite = { total: 0, porTamanho: {} };
  for (const i of itens) {
    const q = Number(i.quantidade) || 0;
    const chave = i.tamanho ? String(i.tamanho) : "";
    r.total += q;
    r.porTamanho[chave] = (r.porTamanho[chave] || 0) + q;
  }
  return r;
}

/** A linha que o gestor lê na aba Dados: quanto do limite os lotes abertos (normalmente um só) já usaram. */
export function resumoDoUso(limites: Limites, uso: Uso, lotesAbertos: number[]): string {
  if (!temLimite(limites)) return "";
  const lote = lotesAbertos.length === 0
    ? "Nenhum lote aberto agora (o próximo pedido abre um lote novo, do zero)"
    : lotesAbertos.length === 1
      ? `Lote ${lotesAbertos[0]} (aberto)`
      : `Lotes ${lotesAbertos.slice(0, -1).join(", ")} e ${lotesAbertos[lotesAbertos.length - 1]} (abertos)`;
  const partes: string[] = [];
  if (limites.total !== null) {
    const restam = limites.total - uso.total;
    partes.push(restam >= 0 ? `${uso.total} de ${limites.total} peças pedidas (restam ${restam})` : `⚠ ${uso.total} peças pedidas, ${-restam} a mais que o limite de ${limites.total}`);
  } else {
    partes.push(`${uso.total} peças pedidas`);
  }
  for (const [tamanho, limite] of Object.entries(limites.porTamanho)) {
    const usado = uso.porTamanho[tamanho] || 0;
    partes.push(usado > limite ? `⚠ ${tamanho}: ${usado} de ${limite}` : `${tamanho}: ${usado} de ${limite}`);
  }
  return `${lote}: ${partes.join(" · ")}.`;
}
