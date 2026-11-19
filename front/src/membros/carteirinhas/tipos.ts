// Os tipos das carteirinhas (FASE 10, passo 8): o desenho do modelo (o JSON que o editor monta e o servidor confere em api/shared/carteirinha.js),
// os modelos, a lista para imprimir, os cartões que vão para a impressora e a carteirinha digital.

export type Publico = "MEMBRO" | "CONGREGADO" | "OBREIRO" | "OUTRO";
export type Lado = "frente" | "verso";
export type CampoFisica = "NOME" | "NASCIMENTO" | "MATRICULA" | "MAE" | "PAI" | "TIPO";
export type TipoCamada = "CAMPO" | "TEXTO" | "FOTO" | "QR" | "LOGO" | "ASSINATURA" | "FORMA";
export type Alinhamento = "esq" | "centro" | "dir";
export type Material = "PAPEL" | "PVC";

export interface Camada {
  id: string;
  tipo: TipoCamada;
  x: number;
  y: number;
  larg: number;
  alt: number;
  visivel: boolean;
  travada: boolean;
  campo?: CampoFisica;
  rotulo?: string;
  texto?: string;
  fonte?: string;
  tamanho?: number;
  cor?: string;
  negrito?: boolean;
  italico?: boolean;
  alinhamento?: Alinhamento;
  fundo?: string | null;
  opacidade?: number;
  raio?: number;
  borda?: string | null;
}
export interface Fundo { cor1: string; degrade: boolean; cor2: string | null; angulo: number; arte: boolean; brilho?: boolean }
export interface LadoDesenho { fundo: Fundo; camadas: Camada[] }
export interface Desenho { tamanho: "CARTAO"; largura: number; altura: number; lados: Record<Lado, LadoDesenho> }

export interface Modelo {
  readonly modeloId: number;
  readonly nome: string;
  readonly publico: Publico;
  readonly ativo: boolean;
  readonly desenho: Desenho | null;
  readonly arteFrente: string | null;
  readonly arteVerso: string | null;
  readonly versao: string | null;
  readonly usadoPor: number;
}

/** o que o cartão mostra de uma pessoa (só o que não muda) */
export interface DadosCartao {
  readonly nome: string;
  readonly nascimento: string | null;
  readonly matricula: number | null;
  readonly mae: string | null;
  readonly pai: string | null;
  readonly tipoRotulo: string;
  readonly foto: string | null;
  readonly qrSvg: string | null;
}
export interface CartaoImpresso extends DadosCartao { readonly membroId: number; readonly modeloId: number; readonly tipo: Publico }
export interface RespostaImpressao {
  readonly cartoes: readonly CartaoImpresso[];
  readonly recusadas: readonly { readonly membroId: number; readonly nome?: string; readonly mensagem: string }[];
  readonly modelos: readonly Modelo[];
  readonly material: Material;
  readonly mensagem: string;
}

export type MotivoFila = "NOVA" | "MUDOU" | "SEGUNDA_VIA";
export interface ItemFila {
  readonly membroId: number;
  readonly nome: string;
  readonly tipo: Publico;
  readonly motivo: MotivoFila;
  readonly detalhe: string;
  readonly bloqueada: boolean;
  readonly soGeral: boolean;
}
export interface LinhaResumo {
  readonly congregacaoId: number;
  readonly congregacao: string;
  readonly area: string | null;
  readonly prontas: number;
  readonly bloqueadas: number;
  readonly repetidas: number;
  readonly numeros: number;
}
export interface Resumo {
  readonly congregacoes: readonly LinhaResumo[];
  readonly prontas: number;
  readonly bloqueadas: number;
  readonly repetidas: number;
  readonly numeros: number;
  readonly geral: boolean;
}

export type Situacao = "EM_COMUNHAO" | "CONGREGADO" | "DISCIPLINA" | "SAIU";
export interface CarteirinhaDigital {
  readonly nome: string;
  readonly matricula: number;
  readonly tipo: Publico;
  readonly tipoRotulo: string;
  readonly cargo: string | null;
  readonly funcao: string | null;
  readonly congregacao: string | null;
  readonly area: string | null;
  readonly membroDesde: string | null;
  readonly situacao: Situacao;
  readonly exerceCargo: boolean | null;
  readonly foto: string | null;
  readonly qrSvg: string;
  readonly url: string;
}
export interface CarteirinhaDaFicha {
  readonly membroId: number;
  readonly nome: string;
  readonly tipo: Publico;
  readonly tipoRotulo: string;
  readonly impressoes: readonly { readonly em: string; readonly material: Material; readonly motivo: string; readonly tipo: Publico; readonly modelo: string }[];
  readonly pedido: { readonly motivo: string; readonly em: string } | null;
  readonly podeImprimir: boolean;
  readonly porQueNao: string | null;
  readonly precisaDeNova: boolean;
  readonly congregacaoId: number | null;
  readonly podePedirSegundaVia: boolean;
}

export const ROTULO_PUBLICO: Readonly<Record<Publico, string>> = { MEMBRO: "Membro", CONGREGADO: "Congregado", OBREIRO: "Obreiro", OUTRO: "Outro" };

/** a pessoa de exemplo dos modelos (o mesmo nome do desenho aprovado) */
export const EXEMPLO: DadosCartao = {
  nome: "Ana Beatriz Moreira", nascimento: "1990-03-14", matricula: 700412, mae: "Lúcia Moreira", pai: "Paulo Moreira", tipoRotulo: "Membro", foto: null, qrSvg: null
};
