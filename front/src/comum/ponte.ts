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

export type TipoAviso = "sucesso" | "erro";

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
  /** true recolhe o menu da esquerda (o trilho); null devolve a escolha que a pessoa deixou guardada */
  menuRecolhido(recolher: true | null): void;
  /** volta ao menu principal (sai do módulo) */
  sairDoModulo(): void;
  /** abre uma parte do Meu Painel da casca */
  irMeuPainel(sub: ParteMeuPainel): void;
  /** abre o módulo Membros já numa tela (a rota é conferida na chegada: membros.ts, lerRota) */
  abrirMembros(rota: unknown): void;
  /** no celular, fecha a gaveta do menu (☰) depois de escolher uma função */
  fecharGavetaCelular(): void;
  /** o texto de "quem está vendo" no cabeçalho do módulo, no menu da esquerda */
  escopoDoModulo(texto: string): void;
}

/** as partes do Meu Painel que as telas Svelte abrem */
export type ParteMeuPainel = "perfil" | "minhavida" | "credencial" | "minhaformacao";

let atual: Ponte | null = null;
const METODOS: readonly (keyof Ponte)[] = ["pedir", "sessao", "avisar", "trilha", "menuRecolhido", "sairDoModulo", "irMeuPainel", "abrirMembros", "fecharGavetaCelular", "escopoDoModulo"];
/** a casca é JavaScript (o TypeScript não a vê): a ponte é conferida quando chega, e uma ponte incompleta falha AQUI, com o nome do que falta */
export function guardarPonte(p: unknown): asserts p is Ponte {
  const o = p as Record<string, unknown> | null;
  const faltam = !o || typeof o !== "object" ? ["a ponte inteira"]
    : [...METODOS.filter((m) => typeof o[m] !== "function"), ...(typeof o.apiBase !== "string" ? ["apiBase"] : []), ...(!o.icones || typeof o.icones !== "object" ? ["icones"] : [])];
  if (faltam.length) throw new Error(`A ponte da casca veio incompleta: ${faltam.join(", ")}.`);
  atual = p as Ponte;
}
export function ponte(): Ponte {
  if (!atual) throw new Error("A ponte da casca não foi entregue ao módulo.");
  return atual;
}
