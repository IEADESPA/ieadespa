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

// ---- incremento 2 (23/11/2026): as folhas de um bloco e o livro de entrada e saída (r17-blocos-folhas e r17-blocos-livro, opção 1) ----

/** o destino de uma folha (shared/finBlocos.js, destinoDaTela); a folha sem destino é "livre" e não vem na lista */
export type DestinoFolha = "lancada" | "cancelada" | "arrancada" | "extraviada";
/** o que aconteceu numa exceção (a folha lançada vem do lançamento, nunca daqui) */
export type ExcecaoFolha = Exclude<DestinoFolha, "lancada">;

export interface FolhaComDestino {
  readonly folha: number;
  readonly destino: DestinoFolha;
  /** a observação da exceção (null na lançada) */
  readonly observacao: string | null;
}

/** o bloco das folhas e do rastreio (sem a chegada da gráfica, que esta parte não usa) */
export interface BlocoDasFolhas {
  readonly id: number;
  readonly numero: number;
  readonly primeiraFolha: number;
  readonly ultimaFolha: number;
  readonly congregacao: { readonly id: number; readonly nome: string } | null;
  readonly situacao: SituacaoBloco;
  readonly entregueEm: string | null;
  readonly devolvidoEm: string | null;
  readonly usadas: number;
  readonly livres: number;
}

/** uma opção do seletor "Bloco 1.401 · Vila Nova ▾" */
export interface OpcaoBloco {
  readonly id: number;
  readonly numero: number;
  readonly congregacao: string;
  readonly situacao: SituacaoBloco;
}

export interface PaginaFolhas {
  /** null = nenhum bloco saiu para as congregações do alcance */
  readonly bloco: BlocoDasFolhas | null;
  readonly folhas: readonly FolhaComDestino[];
  readonly opcoes: readonly OpcaoBloco[];
  readonly escopo: EscopoTela;
}

/** quantas folhas do bloco têm cada destino (shared/finBlocos.js, contagemDasFolhas) */
export interface ContagemFolhas {
  readonly lancadas: number;
  readonly canceladas: number;
  readonly arrancadas: number;
  readonly extraviadas: number;
  readonly livres: number;
}

/** um registro do livro do lote da gráfica: o cadastro e a chegada (só a Geral vê) */
export interface RegistroLote {
  readonly id: number; readonly tipo: "cadastro" | "chegada"; readonly data: string; readonly registradoPor: string;
  /** quantos blocos: no cadastro, os do lote; na chegada, os que chegaram */
  readonly quantidade: number | null;
  readonly lote: { readonly serie: number; readonly primeiraFolha: number; readonly ultimaFolha: number; readonly blocos: number };
}
/** um registro do livro de um bloco: a saída (entregue a alguém de uma congregação) e a entrada (devolvido à Tesouraria Geral) */
export interface RegistroBloco {
  readonly id: number; readonly tipo: "saida" | "entrada"; readonly data: string; readonly registradoPor: string;
  readonly bloco: number; readonly congregacao: string; readonly pessoa: string; readonly levadoPelaArea: boolean;
  /** só na entrada: como o bloco voltou */
  readonly contagem: ContagemFolhas | null;
}
export type RegistroLivro = RegistroLote | RegistroBloco;

/** os blocos "agora" da área e da congregação (shared/finBlocos.js, blocosAgora) */
export interface BlocosAgora { readonly emUso: number; readonly esperando: number; readonly aDevolver: number }

export interface PaginaLivro {
  readonly registros: readonly RegistroLivro[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  /** null na Geral */
  readonly agora: BlocosAgora | null;
  readonly escopo: EscopoTela;
}

/** quem pode devolver o bloco: quem o levou (membroId null = o nome escrito na saída) e a liderança da congregação */
export interface PessoaDevolve { readonly membroId: number | null; readonly nome: string; readonly papel: string }

export interface Rastreio {
  readonly bloco: BlocoDasFolhas;
  readonly contagem: ContagemFolhas;
  readonly pessoas: readonly PessoaDevolve[];
}
