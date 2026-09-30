import type { NivelPapel } from "@/generated/prisma/client";

/**
 * Chaves dos papéis que o sistema cria sozinho no seed (`sistema: true` no
 * banco) e que algumas telas precisam referenciar diretamente (ex: a tela de
 * Permissões é sempre liberada para ADMIN, nunca passa pela matriz
 * dinâmica — senão um erro na matriz poderia trancar todo mundo de fora).
 * Qualquer papel NOVO criado pelo Admin não aparece aqui — ele funciona só
 * por causa do `nivel`/`ordem`/`escopoAmplo`, sem precisar tocar em código.
 */
export const PAPEL_ADMIN = "ADMIN";
export const PAPEL_COORDENADOR_CAMPO = "COORDENADOR_CAMPO";
export const PAPEL_COORDENADOR_AREA = "COORDENADOR_AREA";
export const PAPEL_SUPERINTENDENTE = "SUPERINTENDENTE";
export const PAPEL_SECRETARIO = "SECRETARIO";
export const PAPEL_PROFESSOR = "PROFESSOR";
export const PAPEL_TESOUREIRO = "TESOUREIRO";

export type DefinicaoPapelSistema = {
  chave: string;
  nome: string;
  nivel: NivelPapel;
  ordem: number;
  escopoAmplo: boolean;
};

/** Papéis nativos, criados uma vez no seed. Base para o que o Admin pode customizar depois. */
export const PAPEIS_SISTEMA: DefinicaoPapelSistema[] = [
  { chave: PAPEL_ADMIN, nome: "Administrador Geral", nivel: "GLOBAL", ordem: 0, escopoAmplo: true },
  { chave: PAPEL_COORDENADOR_CAMPO, nome: "Coordenador de Campo", nivel: "CAMPO", ordem: 1, escopoAmplo: true },
  { chave: PAPEL_COORDENADOR_AREA, nome: "Coordenador de Área", nivel: "AREA", ordem: 2, escopoAmplo: true },
  { chave: PAPEL_SUPERINTENDENTE, nome: "Superintendente", nivel: "CONGREGACAO", ordem: 3, escopoAmplo: true },
  { chave: PAPEL_SECRETARIO, nome: "Secretário(a)", nivel: "CONGREGACAO", ordem: 4, escopoAmplo: true },
  { chave: PAPEL_PROFESSOR, nome: "Professor(a)", nivel: "CONGREGACAO", ordem: 4, escopoAmplo: false },
  { chave: PAPEL_TESOUREIRO, nome: "Tesoureiro(a)", nivel: "CONGREGACAO", ordem: 4, escopoAmplo: true },
];

export const NIVEL_LABELS: Record<NivelPapel, string> = {
  GLOBAL: "Global (sistema inteiro)",
  CAMPO: "Campo",
  AREA: "Área",
  CONGREGACAO: "Congregação",
};
