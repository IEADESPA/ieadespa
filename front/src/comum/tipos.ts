// Tipos das peças comuns.
export type TomChip = "ok" | "pendente" | "atrasado" | "info" | "neutro" | "ouro";
export interface ItemTempo {
  readonly data: string | null;
  readonly aproximada?: boolean;
  readonly tipo: string;
  readonly categoria: string;
  readonly titulo: string;
  readonly detalhe: string | null;
}
