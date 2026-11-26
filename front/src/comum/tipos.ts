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

/** a situação de uma congregação no seletor (o ponto colorido e o texto): em dia, precisa de atenção ou atrasada */
export type TomSituacao = "ok" | "pend" | "atraso";
/** uma congregação do seletor "Trocar de congregação" (r20-seletor): quem chama manda a lista que a pessoa alcança, já do servidor */
export interface CongregacaoDoSeletor {
  readonly id: number;
  readonly nome: string;
  readonly area: string | null;
  readonly situacao?: { readonly texto: string; readonly tom: TomSituacao };
}
