// Os rótulos em português dos códigos que o servidor devolve (situação, estado civil, escolaridade, forma de entrada, origem do cadastro).
import type { TomChip } from "../comum/tipos";
import type { PessoaLista } from "./tipos";

export const SITUACOES: readonly { valor: string; rotulo: string }[] = [
  { valor: "EM_COMUNHAO", rotulo: "Em comunhão" }, { valor: "CONGREGADO", rotulo: "Congregado" }, { valor: "SEM_COMUNHAO", rotulo: "Sem comunhão" },
  { valor: "SAIDAS", rotulo: "Saíram do rol" }
];
const SIT: Readonly<Record<string, { rotulo: string; tom: TomChip }>> = {
  EM_COMUNHAO: { rotulo: "Em comunhão", tom: "ok" }, CONGREGADO: { rotulo: "Congregado", tom: "pendente" }, SEM_COMUNHAO: { rotulo: "Sem comunhão", tom: "atrasado" }
};
const SAIU: Readonly<Record<string, string>> = { DESLIGADO: "Desligado", FALECIDO: "Falecido" };

/** a etiqueta da situação de uma pessoa (quem saiu do rol aparece como saiu, nunca com o motivo) */
export function situacaoDe(p: Pick<PessoaLista, "status" | "situacaoMembro">): { rotulo: string; tom: TomChip } {
  const st = String(p.status ?? "");
  if (Object.prototype.hasOwnProperty.call(SAIU, st)) return { rotulo: SAIU[st] ?? st, tom: "neutro" };
  const s = String(p.situacaoMembro ?? "");
  return Object.prototype.hasOwnProperty.call(SIT, s) ? SIT[s]! : { rotulo: "Sem situação", tom: "neutro" };
}

export const ESTADO_CIVIL: Readonly<Record<string, [string, string]>> = {
  SOLTEIRO: ["Solteiro", "Solteira"], CASADO: ["Casado", "Casada"], VIUVO: ["Viúvo", "Viúva"], DIVORCIADO: ["Divorciado", "Divorciada"], UNIAO_ESTAVEL: ["União estável", "União estável"]
};
export function estadoCivil(cod: string | null | undefined, sexo: string | null | undefined): string {
  const e = cod ? ESTADO_CIVIL[cod] : undefined;
  return e ? (sexo === "F" ? e[1] : e[0]) : "";
}
export const ESCOLARIDADE: Readonly<Record<string, string>> = {
  FUNDAMENTAL_INCOMPLETO: "Fundamental incompleto", FUNDAMENTAL_COMPLETO: "Fundamental completo", MEDIO_INCOMPLETO: "Médio incompleto",
  MEDIO_COMPLETO: "Médio completo", SUPERIOR_INCOMPLETO: "Superior incompleto", SUPERIOR_COMPLETO: "Superior completo", POS_GRADUACAO: "Pós-graduação",
  SEM_ESCOLARIDADE: "Sem escolaridade", NAO_ALFABETIZADO: "Não alfabetizado"
};
export const FORMA_ADMISSAO: Readonly<Record<string, string>> = {
  BATISMO: "Batismo", CARTA_MUDANCA: "Carta de mudança", RECONCILIACAO: "Reconciliação", ACLAMACAO: "Aclamação", TRANSFERENCIA: "Transferência"
};
export const SEXO: Readonly<Record<string, string>> = { M: "Masculino", F: "Feminino" };

/** o texto de um valor de campo para mostrar (código -> português) */
export function textoDoValor(chave: string, valor: string | null, sexo: string | null = null, deps: readonly { departamentoId: number; nome: string }[] = []): string {
  if (valor === null || valor === "") return "";
  if (chave === "estadoCivil") return estadoCivil(valor, sexo) || valor;
  if (chave === "escolaridade") return ESCOLARIDADE[valor] ?? valor;
  if (chave === "formaAdmissao") return FORMA_ADMISSAO[valor] ?? valor;
  if (chave === "sexo") return SEXO[valor] ?? valor;
  if (chave === "departamentoId") return deps.find((d) => String(d.departamentoId) === String(valor))?.nome ?? valor;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return valor;
}

/** de onde veio o pré-cadastro (o ícone e o texto do desenho da esteira) */
export const ORIGEM: Readonly<Record<string, { icone: string; texto: string }>> = {
  SITE: { icone: "globo", texto: "link do site" }, LIDER: { icone: "pessoas", texto: "líder ou professor da EBD" }, EBD: { icone: "livro", texto: "professor da EBD" },
  PROPRIA: { icone: "pessoa", texto: "a própria pessoa" }, MEMBRO: { icone: "pessoa", texto: "a própria pessoa" }, SECRETARIA: { icone: "igreja", texto: "a secretaria" }
};
export function origemDe(o: string | null | undefined): { icone: string; texto: string } {
  return (o && ORIGEM[o]) || { icone: "doc", texto: "cadastro" };
}
