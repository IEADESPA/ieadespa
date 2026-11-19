// A PONTE entre a casca (o JavaScript de hoje, app/modulos/casca.js) e as telas Svelte. A casca monta este objeto e o entrega ao
// módulo quando a pessoa entra nele (abrirModuloSvelte). Nada aqui lê variável global solta: tudo o que a tela usa da casca passa por aqui.

/** Quem está vendo: a sessão aberta na casca (o servidor confere tudo de novo; isto só escolhe o que mostrar). */
export interface Sessao {
  readonly matricula: string;
  readonly nome: string;
  readonly permissoes: readonly string[];
  /** a sessão é da Secretaria Geral (nível geral) */
  readonly geral: boolean;
  /** "GLOBAL", "AREA", "CONGREGACAO"... ou null para o membro */
  readonly nivel: string | null;
  /** a congregação da pessoa logada, quando a casca já sabe */
  readonly congregacao: string | null;
}

/** Uma parte do caminho do topo: o rótulo e, se clicável, o que abrir. */
export interface ParteTrilha {
  readonly rotulo: string;
  readonly ir?: () => void;
}

export type TipoAviso = "sucesso" | "erro" | "info";

export interface Ponte {
  readonly apiBase: string;
  /** o fetch autenticado da casca (fetchProtegido): põe o token, trata 401/403/428 e a falta de rede */
  pedir(url: string, opcoes?: RequestInit): Promise<Response>;
  sessao(): Sessao;
  /** os desenhos dos ícones de traço da casca (ICONES_CASCA): as MESMAS formas, de uma fonte só */
  readonly icones: Readonly<Record<string, string>>;
  avisar(texto: string, tipo?: TipoAviso): void;
  /** o caminho na barra do topo ("Membros › Pessoas › Ana"), o título do topo no celular e o ← das telas internas */
  trilha(partes: readonly ParteTrilha[], tituloCelular: string, voltar: (() => void) | null): void;
  /** recolhe (true) ou abre (false) o menu da esquerda; null devolve a escolha que a pessoa deixou guardada */
  menuRecolhido(recolher: boolean | null): void;
  /** volta ao menu principal (sai do módulo) */
  sairDoModulo(): void;
  /** abre uma parte do Meu Painel da casca (ex.: "minhavida", "credencial") */
  irMeuPainel(sub: string): void;
  /** abre o módulo Membros já numa tela (usado pela Minha vida e pela busca do alto) */
  abrirMembros(rota: string): void;
  /** no celular, fecha a gaveta do menu (☰) depois de escolher uma função */
  fecharGavetaCelular(): void;
  /** o texto de "quem está vendo" no cabeçalho do módulo, no menu da esquerda */
  escopoDoModulo(texto: string): void;
}

let atual: Ponte | null = null;
export function guardarPonte(p: Ponte): void { atual = p; }
export function ponte(): Ponte {
  if (!atual) throw new Error("A ponte da casca não foi entregue ao módulo.");
  return atual;
}
