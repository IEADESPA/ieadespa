// Os tipos do módulo Financeiro (as respostas de /api/financeiro/...). O servidor confere tudo; estes tipos só dizem o que a tela lê.

/** a situação que a tela mostra (shared/finBlocos.js, situacaoDoBloco): "na-geral" só a Tesouraria Geral vê */
export type SituacaoBloco = "na-geral" | "esperando" | "em-uso" | "fechado";
/** as pílulas do alto da lista */
export type FiltroBlocos = "todos" | "em-uso" | "esperando" | "fechado";

export interface Bloco {
  readonly id: number;
  /** o número do bloco: sai da primeira folha (70.051 → 1.401), ninguém digita */
  readonly numero: number;
  readonly primeiraFolha: number;
  readonly ultimaFolha: number;
  /** null = o bloco ainda está na Tesouraria Geral */
  readonly congregacao: { readonly id: number; readonly nome: string } | null;
  readonly situacao: SituacaoBloco;
  readonly usadas: number;
  readonly livres: number;
  readonly chegouEm: string | null;
  readonly entregueEm: string | null;
  readonly devolvidoEm: string | null;
}

export interface LoteGrafica {
  readonly id: number;
  readonly serie: number;
  readonly primeiraFolha: number;
  readonly ultimaFolha: number;
  readonly folhasPorBloco: number;
  readonly blocos: number;
  readonly folhas: number;
  readonly folhasChegaram: number;
  readonly blocosChegaram: number;
  readonly folhasFaltam: number;
}

/** o quadro da direita: o lote da gráfica (Geral e área) ou "Seus blocos" (a congregação) */
export type ResumoBlocos =
  | { readonly tipo: "lote"; readonly lote: LoteGrafica | null }
  | { readonly tipo: "seus"; readonly emUsoOuEsperando: number; readonly folhasLivres: number };

/** quem está vendo: o nível e o alcance (o título da página e o cabeçalho do módulo) */
export interface EscopoTela {
  readonly geral: boolean;
  readonly congregacoes: number;
  /** o nome da área, quando todas as congregações do alcance são de uma área só */
  readonly area: string | null;
  /** o nome da congregação, quando o alcance é uma congregação só */
  readonly congregacao: string | null;
}

export interface PaginaBlocos {
  readonly blocos: readonly Bloco[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly resumo: ResumoBlocos;
  readonly escopo: EscopoTela;
}
