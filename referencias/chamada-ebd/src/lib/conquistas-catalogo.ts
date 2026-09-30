import type { TipoRegraConquista } from "@/generated/prisma/client";

/**
 * Catálogo nativo, usado só para popular o banco no seed — depois disso o
 * catálogo real de conquistas vive na tabela `Conquista` e é editável pelo
 * Admin (nome, ícone, parâmetro, se é oculta, pré-requisitos). A REGRA
 * (`tipoRegra`) continua sendo um conjunto fixo que `avaliarConquistas` sabe
 * calcular — o admin ajusta parâmetros e combina regras, não escreve lógica
 * nova.
 */
export type DefinicaoConquistaSeed = {
  chave: string;
  nome: string;
  descricao: string;
  icone: string;
  tipoRegra: TipoRegraConquista;
  parametro?: number;
  oculta?: boolean;
  ordem: number;
  requer?: string[];
};

export const CATALOGO_CONQUISTAS: DefinicaoConquistaSeed[] = [
  { chave: "primeira-presenca", nome: "Primeira Presença", descricao: "Compareceu à EBD pela primeira vez.", icone: "🎉", tipoRegra: "PRIMEIRA_PRESENCA", ordem: 1 },
  { chave: "tres-seguidas", nome: "Sequência de Ouro", descricao: "Presente em 3 domingos seguidos.", icone: "🔥", tipoRegra: "SEQUENCIA_PRESENCA", parametro: 3, ordem: 2 },
  { chave: "cinco-seguidas", nome: "Fiel Constante", descricao: "Presente em 5 domingos seguidos.", icone: "⭐", tipoRegra: "SEQUENCIA_PRESENCA", parametro: 5, ordem: 3 },
  { chave: "biblia-fiel", nome: "Sempre com a Bíblia", descricao: "Trouxe a Bíblia em 5 chamadas.", icone: "📖", tipoRegra: "FIDELIDADE_BIBLIA", parametro: 5, ordem: 4 },
  { chave: "revista-fiel", nome: "Sempre com a Revista", descricao: "Trouxe a revista em 5 chamadas.", icone: "📘", tipoRegra: "FIDELIDADE_REVISTA", parametro: 5, ordem: 5 },
  { chave: "primeira-atividade", nome: "Primeira Atividade", descricao: "Concluiu a primeira atividade.", icone: "✍️", tipoRegra: "PRIMEIRA_ATIVIDADE", parametro: 1, ordem: 6 },
  { chave: "nota-maxima", nome: "Gabaritou!", descricao: "Acertou 100% de uma atividade.", icone: "🏆", tipoRegra: "GABARITOS", parametro: 1, ordem: 7 },
  { chave: "cinco-atividades", nome: "Estudioso", descricao: "Concluiu 5 atividades.", icone: "🎓", tipoRegra: "PRIMEIRA_ATIVIDADE", parametro: 5, ordem: 8 },
  { chave: "trimestre-perfeito", nome: "Trimestre Perfeito", descricao: "Presente em todas as chamadas de um trimestre inteiro.", icone: "📅", tipoRegra: "TRIMESTRE_PERFEITO", ordem: 9 },
  {
    chave: "presenca-anual",
    nome: "Presença na EBD",
    descricao: "4 trimestres perfeitos seguidos — um ano inteiro de fidelidade.",
    icone: "🏅",
    tipoRegra: "TRIMESTRES_CONSECUTIVOS",
    parametro: 4,
    requer: ["trimestre-perfeito"],
    ordem: 10,
  },
  {
    chave: "veterano-ebd",
    nome: "Veterano da EBD",
    descricao: "Chegou junto com fidelidade de presença, bíblia e revista.",
    icone: "🛡️",
    tipoRegra: "COMBO",
    oculta: true,
    requer: ["cinco-seguidas", "biblia-fiel", "revista-fiel"],
    ordem: 11,
  },
  {
    chave: "maratonista-quiz",
    nome: "Maratonista dos Quizzes",
    descricao: "Gabaritou 3 atividades diferentes.",
    icone: "🚀",
    tipoRegra: "GABARITOS",
    parametro: 3,
    oculta: true,
    requer: ["nota-maxima"],
    ordem: 12,
  },
  {
    chave: "madrugador",
    nome: "Não Perde Tempo",
    descricao: "Respondeu uma atividade no mesmo dia em que ela foi criada.",
    icone: "⚡",
    tipoRegra: "RESPOSTA_RAPIDA",
    oculta: true,
    ordem: 13,
  },
];
