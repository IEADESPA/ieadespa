export type GrupoCampo = "contagem" | "acoes" | "eventos" | "integracao" | "financeiro";
export type ComportamentoCampo = "estado" | "fluxo";
export type TipoDado = "numero" | "moeda";

export interface CampoFormulario {
  chave: string;
  rotulo: string;
  grupo: GrupoCampo;
  tipo: TipoDado;
  comportamento: ComportamentoCampo;
  /** soma para o "Total do Local" do bloco de contagem */
  somaTotalLocal?: boolean;
  /** true para eventos/integração — campos padronizados do sistema, não editáveis na tela de Configurações */
  padraoDoSistema?: boolean;
}

export type TipoRateio =
  | "integral_geral"
  | "integral_local"
  | "mensalidade_fixa"
  | "percentual"
  | "variavel_manual";

export type ModoEntradaRateio = "bruto_calculado" | "liquido_manual";

export interface PerfilRateio {
  tipo: TipoRateio;
  percentualGeral?: number;
  modoEntrada: ModoEntradaRateio;
  suporteSecretariaGeralHabilitado: boolean;
  descricao: string;
}

/** Uma lista nominal dentro do relatório (ex.: contribuintes de mensalidade, itens de doação),
 *  cuja soma alimenta automaticamente um campo do bloco de contagem/financeiro. */
export interface ListaDetalhadaConfig {
  id: string;
  titulo: string;
  campoDestino: string;
  rotuloColunaNome: string;
  rotuloColunaValor: string;
  unidade: "moeda" | "numero";
  sugestoesDeNome?: string[];
}

export interface ItemLista {
  id: string;
  nome: string;
  valor: number;
}

export interface TipoDepartamento {
  id: string;
  numero: string;
  sigla: string;
  nome: string;
  rotuloPapelLocal: string;
  corDestaque: string;
  campos: CampoFormulario[];
  camposFinanceiros: CampoFormulario[];
  rateio: PerfilRateio;
  listasDetalhadas?: ListaDetalhadaConfig[];
  /** chaves de campos "fluxo" que, neste departamento, são detalhados domingo a domingo
   *  (hoje só se aplica à EBD) — o valor mensal vira a soma automática das semanas. */
  chavesDetalheSemanal?: string[];
}

export interface Area {
  id: string;
  nome: string;
}

export interface Congregacao {
  id: string;
  nome: string;
  areaId: string;
}

export type PerfilNome =
  | "lider_local"
  | "dirigente_congregacao"
  | "lider_area"
  | "pastor_area"
  | "lider_geral"
  | "secretario_geral"
  | "presidente";

export interface Vinculo {
  perfil: PerfilNome;
  /** aplicável a lider_local, lider_area, lider_geral */
  tipoDepartamentoId?: string;
  /** aplicável a lider_local, dirigente_congregacao */
  congregacaoId?: string;
  /** aplicável a lider_area, pastor_area */
  areaId?: string;
}

export interface Usuario {
  id: string;
  nome: string;
  matricula: string;
  senha: string;
  vinculos: Vinculo[];
}

export type StatusRelatorio =
  | "rascunho"
  | "enviado"
  | "aprovado_area"
  | "aprovado_geral";

export interface EventoHistorico {
  ts: number;
  usuarioNome: string;
  papel: PerfilNome;
  acao: string;
  detalhe?: string;
}

export interface RelatorioMensal {
  id: string;
  tipoDepartamentoId: string;
  congregacaoId: string;
  mesReferencia: number;
  anoReferencia: number;
  status: StatusRelatorio;
  atrasado: boolean;
  valores: Record<string, number>;
  /** listas nominais (mensalidades, itens de doação etc.), por id de ListaDetalhadaConfig */
  listas: Record<string, ItemLista[]>;
  /** detalhe semanal (1º ao 5º domingo), quando o departamento usa (ex.: EBD) */
  semanas: Record<string, number>[];
  comentarioArea?: string;
  historico: EventoHistorico[];
  dataEnvio?: number;
}
