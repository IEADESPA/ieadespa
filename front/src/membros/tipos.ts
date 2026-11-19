// As formas das respostas do servidor que as telas de Membros usam (o contrato das rotas que já existem; nenhum campo inventado).

export type Situacao = "EM_COMUNHAO" | "CONGREGADO" | "SEM_COMUNHAO" | (string & {});
export type StatusFicha = "ATIVO" | "DESLIGADO" | "FALECIDO" | (string & {});

/** uma pessoa da lista em páginas (GET /api/pessoas?pagina=) */
export interface PessoaLista {
  readonly membroId: number;
  readonly nome: string;
  readonly funcao: string | null;
  readonly cargoMinisterial?: string | null;
  readonly congregacaoId: number | null;
  readonly congregacao: string | null;
  readonly areaNome?: string | null;
  readonly status: StatusFicha | null;
  readonly situacaoMembro: Situacao | null;
  readonly departamentoId: number | null;
  readonly dataNascimento: string | null;
  readonly dataAdmissao: string | null;
  readonly dataBatismo?: string | null;
  readonly telefone: string | null;
  readonly email: string | null;
  readonly estadoCivil: string | null;
  readonly escolaridade?: string | null;
  readonly sexo: string | null;
  readonly cpfMascarado: string | null;
  readonly extensao: string | null;
  readonly fotoUrl: string | null;
  readonly motivoSaida: string | null;
  readonly dataSaida: string | null;
  readonly nomeMae?: string | null;
  readonly nomePai?: string | null;
  readonly cargoDesde?: string | null;
  readonly capacidade?: { readonly capacidadeAtiva?: boolean; readonly emPeriodoIntegracao?: boolean; readonly categoria?: string } | null;
  readonly menorDeIdade?: boolean;
}
export interface PaginaPessoas {
  readonly itens: readonly PessoaLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface GrupoPainel {
  readonly nome: string;
  readonly total: number;
  readonly es: number;
  readonly aguas: number;
  readonly cpf: number;
  readonly comunhao: number;
  readonly completo: number;
}
export type Recorte = "es" | "aguas" | "cpf" | "comunhao" | "completo";
export type Agrupamento = "departamento" | "congregacao" | "sexo" | "faixa";
export interface ResumoPainel {
  readonly total: number;
  readonly emComunhao: number;
  readonly congregados: number;
  readonly semComunhao: number;
  readonly semCpf: number;
  readonly semNascimento: number;
  readonly semContato: number;
  readonly semDepartamento: number;
  readonly completos: number;
  readonly batizadosEspirito: number;
  readonly batizadosAguas: number;
  readonly novosNoMes: number;
  readonly mesAtual: string;
  readonly novosPorForma: readonly { readonly forma: string; readonly n: number }[];
  readonly grupos: Readonly<Record<Agrupamento, readonly GrupoPainel[]>>;
  readonly congregacoes: readonly { readonly congregacaoId: number; readonly nome: string; readonly total: number }[];
  readonly movimento: readonly { readonly mes: string; readonly entradas: number; readonly saidas: number }[];
}

/** um acontecimento da linha do tempo (GET /api/pessoas/{id}/linha-do-tempo) */
export interface EventoVida {
  readonly data: string | null;
  readonly aproximada?: boolean;
  readonly tipo: string;
  readonly categoria: string;
  readonly titulo: string;
  readonly detalhe: string | null;
  readonly origem?: string;
}
export interface VidaEspiritual {
  readonly conversao?: { readonly data: string | null; readonly aproximada?: boolean; readonly detalhe?: string | null } | null;
  readonly batismoAguas?: { readonly data: string | null; readonly local?: string | null; readonly oficiantes?: string | null; readonly emOutraIgreja?: string | null } | null;
  readonly batismoEspiritoSanto?: { readonly data: string | null; readonly aproximada?: boolean; readonly detalhe?: string | null } | null;
  readonly procedencia?: { readonly formaAdmissao?: string | null; readonly dataAdmissao?: string | null; readonly igrejaAnterior?: string | null; readonly origem?: string | null } | null;
}
export interface LinhaDoTempo {
  readonly membroId: number;
  readonly nome: string;
  readonly vidaEspiritual: VidaEspiritual | null;
  readonly eventos: readonly EventoVida[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

/** um campo da ficha para a edição campo a campo (GET /api/pessoas/{id}/ficha/campos) */
export interface CampoFicha {
  readonly chave: string;
  readonly rotulo: string;
  readonly grupo: string;
  readonly tipo: "texto" | "data" | "lista" | "cpf" | "filiacao" | "telefone" | "email" | "endereco" | "departamento" | (string & {});
  readonly opcoes: readonly string[] | null;
  readonly valor: string | null;
  readonly pode: boolean;
  readonly motivo: string | null;
}
export interface CamposFicha {
  readonly membroId: number;
  readonly papel: string;
  readonly emProcessoDeCargo: boolean;
  readonly campos: readonly CampoFicha[];
}
export interface Mudanca { readonly campo: string; readonly rotulo: string; readonly antes: string | null; readonly depois: string | null }
export interface Alteracao {
  readonly id: number;
  readonly quando: string;
  readonly acao: string;
  readonly quem: { readonly matricula: number | null; readonly nome: string | null } | null;
  readonly mudancas: readonly Mudanca[];
}
export interface PaginaAlteracoes { readonly itens: readonly Alteracao[]; readonly total: number }

export interface Departamento { readonly departamentoId: number; readonly nome: string; readonly ativo?: boolean; readonly idadeMinima?: number | null; readonly idadeMaxima?: number | null }
export interface Congregacao { readonly congregacaoId: number; readonly nome: string; readonly ativa?: boolean; readonly areaNome?: string | null; readonly areaId?: number | null }

export type SituacaoTransferencia = "PENDENTE" | "CONCLUIDA" | "RECUSADA" | "CANCELADA" | (string & {});
export interface Transferencia {
  readonly transferenciaId: number;
  readonly membroId: number;
  readonly pessoaNome: string;
  readonly origemId: number;
  readonly origemNome: string;
  readonly origemAreaNome: string | null;
  readonly destinoId: number;
  readonly destinoNome: string;
  readonly destinoAreaNome: string | null;
  readonly regra: string;
  readonly pedidoComo: string;
  readonly pedidoPorNome: string | null;
  readonly pedidoEm: string;
  readonly motivo: string | null;
  readonly situacao: SituacaoTransferencia;
  readonly decididoEm: string | null;
  readonly motivoRecusa: string | null;
  readonly diasParado: number | null;
  readonly podeDecidir: boolean;
  readonly podeCancelar: boolean;
}
export interface PaginaTransferencias { readonly itens: readonly Transferencia[]; readonly total: number }

export interface Pendencia { readonly codigo: string; readonly rotulo: string; readonly quem: string }
export type OrigemPreCadastro = "SITE" | "LIDER" | "EBD" | "SECRETARIA" | "PROPRIA" | (string & {});
export interface PreCadastro {
  readonly preCadastroId: number;
  readonly origem: OrigemPreCadastro;
  readonly congregacaoId?: number | null;
  readonly congregacao?: string | null;
  readonly nome: string;
  readonly cpfMascarado?: string | null;
  readonly email?: string | null;
  readonly telefone?: string | null;
  readonly dataNascimento?: string | null;
  readonly sexo?: string | null;
  readonly situacao: string;
  readonly pendencias?: readonly Pendencia[];
  readonly matricula?: number | null;
  readonly repetido?: { readonly matricula: number; readonly nome: string; readonly congregacao: string | null } | null;
  readonly criadoEm: string;
  readonly decididoEm?: string | null;
  readonly versao?: string;
  readonly podeResolver?: boolean;
}
export interface PaginaPreCadastros { readonly itens: readonly PreCadastro[]; readonly total: number }

export interface CampoSugestao {
  readonly campoId: number;
  readonly nomeCampo: string;
  readonly rotulo: string;
  readonly valorAnterior: string | null;
  readonly valorProposto: string | null;
  readonly status: string;
  readonly podeAplicar: boolean;
  readonly podeRecusar: boolean;
  readonly motivoNaoAplica?: string | null;
  readonly motivo?: string | null;
}
export interface Sugestao {
  readonly solicitacaoId: number;
  readonly membroId: number;
  readonly nome: string;
  readonly congregacao: string | null;
  readonly dataSolicitacao: string;
  readonly status: string;
  readonly podeAplicar: boolean;
  readonly campos: readonly CampoSugestao[];
}

/** o endereço em linhas (a gravação do campo "endereco" pede as partes) */
export interface Endereco { logradouro: string; numero: string; complemento: string; bairroTexto: string; cidade: string; uf: string; cep: string }
