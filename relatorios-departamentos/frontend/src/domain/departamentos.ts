import type { CampoFormulario, ListaDetalhadaConfig, TipoDepartamento } from "./types";

const eventos: CampoFormulario[] = [
  { chave: "eventos_local", rotulo: "Local", grupo: "eventos", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
  { chave: "eventos_area", rotulo: "Área", grupo: "eventos", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
  { chave: "eventos_geral", rotulo: "Geral", grupo: "eventos", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
];

const integracao: CampoFormulario[] = [
  { chave: "integracao_conversao", rotulo: "Conversão", grupo: "integracao", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
  { chave: "integracao_reconciliacao", rotulo: "Reconciliação", grupo: "integracao", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
  { chave: "integracao_outra_igreja", rotulo: "De Outra Igreja", grupo: "integracao", tipo: "numero", comportamento: "fluxo", padraoDoSistema: true },
];

const financeiroPadrao: CampoFormulario[] = [
  { chave: "fin_mensalidades", rotulo: "Mensalidades", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
  { chave: "fin_ofertas", rotulo: "Ofertas", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
  { chave: "fin_campanhas", rotulo: "Campanhas", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
  { chave: "fin_outros", rotulo: "Outros", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
];

const listaMensalidadeNominal: ListaDetalhadaConfig = {
  id: "contribuintes_mensalidade",
  titulo: "Contribuintes com Mensalidade",
  campoDestino: "fin_mensalidades",
  rotuloColunaNome: "Nome do contribuinte",
  rotuloColunaValor: "Valor (R$)",
  unidade: "moeda",
};

export const DEPARTAMENTOS_SEED: TipoDepartamento[] = [
  {
    id: "ucadespa",
    numero: "01",
    sigla: "UCADESPA",
    nome: "União de Crianças",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#d98c3f",
    campos: [
      { chave: "congregados", rotulo: "Congregados", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "visitantes", rotulo: "Visitantes", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "criancas_evangelizadas", rotulo: "Crianças Evangelizadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "oracoes_normais", rotulo: "Orações Normais", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "extras", rotulo: "Extras", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "percentual",
      percentualGeral: 30,
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: false,
      descricao: "30% do valor total sobe para o fundo geral; o restante fica na congregação.",
    },
  },
  {
    id: "umadespa",
    numero: "02",
    sigla: "UMADESPA",
    nome: "União de Mocidade",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#3f7fd9",
    campos: [
      { chave: "membros_comunhao", rotulo: "Membros em Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "membros_sem_comunhao", rotulo: "Membros sem Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "congregados", rotulo: "Congregados", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "jovens_evangelizados", rotulo: "Jovens Evangelizados", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "oracoes_normais", rotulo: "Orações Normais", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "extras", rotulo: "Extras", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "integral_local",
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: false,
      descricao: "100% do valor arrecadado fica na congregação local.",
    },
  },
  {
    id: "usadespa",
    numero: "03",
    sigla: "USADESPA",
    nome: "União de Senhoras",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#a24fb0",
    campos: [
      { chave: "membros_comunhao", rotulo: "Membros em Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "membros_sem_comunhao", rotulo: "Membros sem Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "congregados", rotulo: "Congregados", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "matriculadas", rotulo: "Matriculadas", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "nao_matriculada", rotulo: "Não Matriculada", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "tarde_de_louvor", rotulo: "Tarde de Louvor", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "oracoes_normais", rotulo: "Orações Normais", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "extras", rotulo: "Extras", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "mensalidade_fixa",
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: false,
      descricao: "Mensalidade fixa por contribuinte; o valor de mensalidades sobe integralmente para o geral.",
    },
  },
  {
    id: "uhadespa",
    numero: "04",
    sigla: "UHADESPA",
    nome: "União de Homens",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#2f7a5a",
    campos: [
      { chave: "membros_comunhao", rotulo: "Membros em Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "membros_sem_comunhao", rotulo: "Membros sem Comunhão", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "congregados", rotulo: "Congregados", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "matriculados", rotulo: "Matriculados", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "nao_matriculado", rotulo: "Não Matriculado", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "tarde_de_louvor", rotulo: "Tarde de Louvor", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "oracoes_normais", rotulo: "Orações Normais", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "extras", rotulo: "Extras", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "variavel_manual",
      modoEntrada: "liquido_manual",
      suporteSecretariaGeralHabilitado: true,
      descricao: "Rateio decidido caso a caso — quem preenche informa diretamente quanto fica local e quanto sobe para o geral.",
    },
  },
  {
    id: "semiadespa",
    numero: "05",
    sigla: "SEMIADESPA",
    nome: "Missões (Evangelismo)",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#c23a5e",
    campos: [
      { chave: "biblias_distribuidas", rotulo: "Bíblias Distribuídas", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "folhetos_distribuidos", rotulo: "Folhetos Distribuídos", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "outras_literaturas", rotulo: "Outras Literaturas", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "discipulado_1", rotulo: "Pessoas no Discipulado I", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "discipulado_2", rotulo: "Pessoas no Discipulado II", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "pessoas_evangelizadas", rotulo: "Nº de Pessoas Evangelizadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "numero_evangelismos", rotulo: "Nº de Evangelismos", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "cultos_evangelisticos", rotulo: "Cultos Evangelísticos", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "percentual",
      percentualGeral: 50,
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: true,
      descricao: "50% do valor total sobe para o fundo geral de missões. Contribui, de forma facultativa, com suporte para a Secretaria Geral.",
    },
  },
  {
    id: "acao_da_fe",
    numero: "06",
    sigla: "AÇÃO DA FÉ",
    nome: "Ação Social (Cestas Básicas)",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#5a8f3f",
    campos: [
      { chave: "cestas", rotulo: "Cestas", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "peso_cesta_kg", rotulo: "Peso da Cesta (kg)", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "saida_alimentos_kg", rotulo: "Saída de Alimentos (kg)", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "entrada_alimentos_kg", rotulo: "Entrada de Alimentos (kg)", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "familias_assistidas", rotulo: "Famílias Assistidas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: [
      { chave: "fin_contribuicoes", rotulo: "Contribuições", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
      { chave: "fin_ofertas", rotulo: "Ofertas", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
      { chave: "fin_campanhas", rotulo: "Campanha", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
      { chave: "fin_outros", rotulo: "Outros", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
    ],
    listasDetalhadas: [
      {
        id: "itens_doacao",
        titulo: "Itens de Alimentos e Higiene Arrecadados",
        campoDestino: "entrada_alimentos_kg",
        rotuloColunaNome: "Item",
        rotuloColunaValor: "Quantidade (kg)",
        unidade: "numero",
        sugestoesDeNome: [
          "Arroz", "Feijão", "Óleo", "Açúcar", "Sal", "Café", "Macarrão", "Extrato de Tomate",
          "Sardinha", "Flocão", "Farinha", "Biscoito", "Papel Higiênico", "Sabão em Pó",
          "Creme Dental", "Sabonete", "Barra de Sabão", "Bucha de Alumínio",
        ],
      },
    ],
    rateio: {
      tipo: "integral_geral",
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: false,
      descricao: "100% do valor arrecadado sobe para o fundo geral do departamento.",
    },
  },
  {
    id: "ebd",
    numero: "07",
    sigla: "EBD",
    nome: "Escola Bíblica Dominical",
    rotuloPapelLocal: "Superintendente Local",
    corDestaque: "#2f6fa0",
    campos: [
      { chave: "alunos_matriculados", rotulo: "Alunos Matriculados", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "alunos_presentes", rotulo: "Alunos Presentes", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "alunos_ausentes", rotulo: "Alunos Ausentes", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "visitantes", rotulo: "Visitantes", grupo: "contagem", tipo: "numero", comportamento: "fluxo" },
      { chave: "biblias", rotulo: "Bíblias", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "revistas", rotulo: "Revistas", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "ebds_realizadas", rotulo: "EBD's Realizadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "alunos_visitados", rotulo: "Alunos Visitados", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "acao_social", rotulo: "Ação Social", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "acao_pro_ebd", rotulo: "Ação Pró EBD", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "acao_pro_igreja", rotulo: "Ação Pró Igreja", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: [
      { chave: "fin_ofertas", rotulo: "Ofertas", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" },
    ],
    // particularidade confirmada: a EBD detalha domingo a domingo (1º ao 5º) dentro do mês
    chavesDetalheSemanal: [
      "ebds_realizadas", "alunos_visitados", "acao_social", "acao_pro_ebd", "acao_pro_igreja",
      "alunos_presentes", "alunos_ausentes", "visitantes", "fin_ofertas",
    ],
    rateio: {
      tipo: "integral_local",
      modoEntrada: "bruto_calculado",
      suporteSecretariaGeralHabilitado: false,
      descricao: "100% da oferta fica na congregação local.",
    },
  },
  {
    id: "familia",
    numero: "08",
    sigla: "FAMÍLIA",
    nome: "Ministério de Família",
    rotuloPapelLocal: "Líder Local",
    corDestaque: "#8a6d3b",
    campos: [
      { chave: "familias_crentes", rotulo: "Famílias Crentes", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "familias_membros_nao_crentes", rotulo: "Famílias com Membros Não Crentes", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "familias_unico_membro", rotulo: "Famílias com Único Membro", grupo: "contagem", tipo: "numero", comportamento: "estado", somaTotalLocal: true },
      { chave: "menores_pais_nao_crentes", rotulo: "Menores de 18 com Pais Não Crentes", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "casais_conjuge_nao_crente", rotulo: "Casais com Cônjuge Não Crente", grupo: "contagem", tipo: "numero", comportamento: "estado" },
      { chave: "casas_visitadas", rotulo: "Casas Visitadas", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "familias_que_mudaram", rotulo: "Famílias que Mudaram", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "familias_assistidas", rotulo: "Famílias/Casais Assistidos", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      { chave: "familias_integradas", rotulo: "Famílias/Casais Integrados", grupo: "acoes", tipo: "numero", comportamento: "fluxo" },
      ...eventos,
      ...integracao,
    ],
    camposFinanceiros: financeiroPadrao,
    listasDetalhadas: [listaMensalidadeNominal],
    rateio: {
      tipo: "percentual",
      percentualGeral: 40,
      modoEntrada: "liquido_manual",
      suporteSecretariaGeralHabilitado: false,
      descricao: "40% do valor total é destinado ao geral. Para simplificar o preenchimento, quem lança o relatório informa diretamente o valor já líquido (o resultado dos 40%), sem detalhar o bruto.",
    },
  },
];

/** Quando o rateio é "variável/manual", o formulário precisa de dois campos extras
 *  para quem preenche declarar diretamente a divisão local/geral daquele mês. */
export function chavesRateioManual(dep: TipoDepartamento): { local: string; geral: string } | null {
  if (dep.rateio.tipo !== "variavel_manual") return null;
  return { local: "rateio_manual_local", geral: "rateio_manual_geral" };
}

export function getDepartamento(departamentos: TipoDepartamento[], id: string): TipoDepartamento {
  const dep = departamentos.find((d) => d.id === id);
  if (!dep) throw new Error(`Tipo de departamento desconhecido: ${id}`);
  return dep;
}

let proximoNumeroCache = 0;
export function gerarIdDepartamento(sigla: string): string {
  return (
    sigla
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `departamento_${++proximoNumeroCache}`
  );
}

export function gerarChaveCampo(rotulo: string): string {
  return rotulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
