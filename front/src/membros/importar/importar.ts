// A IMPORTAÇÃO DOS MEMBROS DO SISTEMA PAGO (a tela r27 aprovada em 22/11/2026; só a Secretaria Geral; uma vez só): os tipos do que a rota
// /api/importacao-membros devolve, as chamadas e os textos da tela (o "por quê" de cada matrícula a acertar, as datas no horário de Brasília).
import { pedir, qs, type Resultado } from "../../comum/api";
import { ponte } from "../../comum/ponte";
import { numero } from "../../comum/formato";

/** um campo da ficha no select do mapa das colunas; `padrao` = uma das 11 colunas de sempre do sistema pago (a outra é "a mais") */
export interface CampoColuna { readonly campo: string; readonly rotulo: string; readonly padrao: boolean }
/** uma coluna do cabeçalho do arquivo e o campo ligado a ela (null = "não usar") */
export interface ColunaArquivo { readonly indice: number; readonly coluna: string; readonly campo: string | null }

/** uma caixa dos números da tela */
export interface Quadro { readonly n: number; readonly rotulo: string; readonly sub: string }
export interface Quadros { readonly comMatricula: number; readonly acertar: number; readonly repetidas: number }
export interface ResumoImportacao {
  readonly total: number;
  readonly vazias: number;
  readonly totalColunas: number;
  readonly novas: number;
  readonly quadros: Quadros;
  readonly congregacoesReconhecidas: number;
  readonly jaExistem: number;
  readonly primeiraMatriculaNova: number;
  readonly problemas: number;
  readonly numeroNovo: number;
  readonly possivelRepetida: number;
  /** as linhas que ficam de fora por falta de congregação (G3, decisão dele de 24/11/2026: sem congregação não há importação) */
  readonly semCongregacao: number;
  readonly separador: string;
  readonly colunas: { readonly lista: readonly ColunaArquivo[]; readonly escolhidas: boolean };
  readonly avisosGerais: readonly { readonly codigo: string; readonly texto: string }[];
  readonly resultado?: { readonly importadas: number; readonly fora: number; readonly numeroNovo: number; readonly possivelRepetida: number; readonly semCongregacao: number };
  /** o dia em que a rotina apagou a lista dos que ficaram de fora (a guarda dos dados) */
  readonly foraApagadaEm?: string | null;
  /** o prazo (em dias) que valeu no dia em que a rotina apagou a lista */
  readonly foraDias?: number | null;
  /** a prévia da importação só das linhas que faltaram (G2): quantas faltaram, quantas foram achadas no arquivo e as que não foram (as 20 primeiras) */
  readonly resto?: ResumoResto | null;
}
/** uma linha de uma lista sem dado pessoal: o número da linha do arquivo e o nome */
export interface LinhaENome { readonly linha: number; readonly nome: string }
export interface ResumoResto {
  readonly de: number;
  readonly faltaram: number;
  readonly achadas: number;
  readonly naoAchadas: number;
  readonly ambiguas: number;
  readonly foraDaLista: number;
  /** os números das linhas que faltaram e não foram achadas (sem o nome) */
  readonly linhasNaoAchadas: readonly number[];
}
/** o resto no estado (G2, decisão dele de 24/11/2026): as linhas que faltaram na importação concluída (quantas e as 10 primeiras), se a importação só delas
 *  pode ser feita (uma vez), se está aberta (prévia ou em andamento) e o que ela fez */
export interface EstadoResto {
  readonly de: number;
  readonly faltaram: number;
  readonly linhas: readonly LinhaENome[];
  readonly possivel: boolean;
  readonly aberto: boolean;
  readonly feito: {
    readonly importacaoId: number;
    readonly concluidaEm: string | null;
    readonly importadas: number;
    readonly fora: number;
    /** as que faltaram e não vieram no arquivo do resto (marcadas na lista da importação de antes) */
    readonly naoAchadas?: number;
  } | null;
}
/** os prazos da guarda dos dados (respostas dele de 23/11/2026): a prévia não confirmada e a lista dos de fora, em dias */
export interface Guarda { readonly diasPrevia: number; readonly diasFora: number }
/** o prazo da importação parada (G2, decisão dele de 24/11/2026): os dias contados do último lote, o dia em que vence e quantos dias faltam */
export interface Prazo { readonly dias: number; readonly venceEm: string; readonly faltam: number }
/** a parada sem ninguém importado que a rotina descartou no fim do prazo (G2): qual foi, quando e com que prazo */
export interface DescartadaPeloPrazo {
  readonly importacaoId: number;
  readonly nomeArquivo: string | null;
  readonly confirmadaEm: string | null;
  readonly descartadaEm: string | null;
  readonly dias: number;
}
/** a planilha lida no aparelho (o texto só fica na memória da tela) */
export interface ArquivoLido { readonly nome: string; readonly texto: string }
/** o mapa das colunas na tela: a lista do servidor, as colunas a mais (amarelas, fixas desde a leitura) e o campo escolhido para cada uma */
export interface MapaDaTela { readonly lista: readonly ColunaArquivo[]; readonly extras: readonly boolean[]; escolha: (string | null)[] }
export interface Previa { readonly importacaoId: number; readonly resumo: ResumoImportacao }
export type SituacaoImportacao = "PREVIA" | "IMPORTANDO" | "CONCLUIDA";
export interface Importacao {
  readonly importacaoId: number;
  readonly situacao: SituacaoImportacao;
  /** G2: a importação só das linhas que faltaram diz de qual importação ela é o resto */
  readonly restoDe?: number | null;
  readonly nomeArquivo: string | null;
  readonly criadaEm: string | null;
  readonly confirmadaEm: string | null;
  readonly concluidaEm: string | null;
  readonly resumo: ResumoImportacao | null;
}
export interface AreaRetrato { readonly area: string | null; readonly semCongregacao: boolean; readonly congregacoes: number; readonly fichas: number; readonly completas: number }
export interface Retrato {
  readonly confirmadaPor: string | null;
  readonly matriculasNovas: { readonly total: number; readonly de: number | null; readonly ate: number | null };
  readonly quadros: Quadros;
  readonly porArea: readonly AreaRetrato[];
}
export interface EstadoImportacao {
  readonly feita: boolean;
  readonly emAndamento: boolean;
  readonly importacao: Importacao | null;
  readonly restantes: number | null;
  /** em andamento: quantas já entraram (a parada sem ninguém tem outra saída) e o prazo para continuar */
  readonly importadas?: number | null;
  readonly prazo?: Prazo | null;
  /** a última importação, se a rotina a descartou no fim do prazo (parou sem ninguém importado) */
  readonly descartadaPeloPrazo?: DescartadaPeloPrazo | null;
  /** feita: as linhas que faltaram e a importação só delas (G2) */
  readonly resto?: EstadoResto | null;
  readonly retrato: Retrato | null;
  readonly campos: readonly CampoColuna[];
  readonly guarda?: Guarda | null;
}
export interface DetalheLinha {
  readonly motivoNumero: string | null;
  readonly dono: { readonly linha: number; readonly nome: string; readonly sexo?: string | null } | null;
  readonly repetidaDe: { readonly linha: number | null; readonly matricula: number | null; readonly nome: string } | null;
  readonly recebe: number | null;
  readonly prevista: boolean;
}
export interface ItemLista {
  readonly linha: number;
  readonly matricula: string;
  readonly nome: string;
  readonly acao: "NOVA" | "PROBLEMA";
  readonly matriculaFinal: number | null;
  readonly motivos: readonly string[];
  readonly detalhe: DetalheLinha;
}
export interface PaginaLista { readonly total: number; readonly pagina: number; readonly porPagina: number; readonly itens: readonly ItemLista[] }
export type FiltroLista = "acertar" | "repetidas" | "problemas";

/** a prévia de antes de 23/11 não tinha os números da tela: vale como se não houvesse prévia (a Geral escolhe o arquivo de novo) */
export function resumoDaTela(r: ResumoImportacao | null | undefined): r is ResumoImportacao {
  return !!r && !!r.quadros && !!r.colunas && Array.isArray(r.colunas.lista);
}

const BASE = "/importacao-membros";
export const lerEstado = (): Promise<Resultado<EstadoImportacao>> => pedir<EstadoImportacao>(BASE);
/** a prévia; `resto: true` = a importação só das linhas que faltaram (G2) */
export const fazerPrevia = (corpo: { nomeArquivo: string; texto: string; colunas?: (string | null)[]; resto?: true }): Promise<Resultado<{ importacaoId: number; resumo: ResumoImportacao }>> =>
  pedir(BASE + "/previa", { metodo: "POST", corpo });
export const lerLista = (importacaoId: number, filtro: FiltroLista, pagina = 1): Promise<Resultado<PaginaLista>> =>
  pedir<PaginaLista>(BASE + "/lista" + qs({ importacaoId, filtro, pagina }));
export const confirmar = (importacaoId: number): Promise<Resultado<{ importacaoId: number; restantes: number }>> =>
  pedir(BASE + "/confirmar", { metodo: "POST", corpo: { importacaoId } });
/** um lote; `deixarDeFora` = a Secretaria Geral confirmou deixar de fora as linhas que o sistema não conseguiu gravar (A6: o servidor decide quais) */
export const importarLote = (importacaoId: number, deixarDeFora = false): Promise<Resultado<{ importadas: number; restantes: number; concluida: boolean }>> =>
  pedir(BASE + "/lote", { metodo: "POST", corpo: deixarDeFora ? { importacaoId, deixarDeFora: true } : { importacaoId } });
/** a importação parou com 5 linhas seguidas que o sistema não conseguiu gravar: o servidor diz que dá para deixá-las de fora (e quais, só para mostrar) */
export function podeDeixarDeFora(corpo: unknown): boolean {
  return !!corpo && typeof corpo === "object" && (corpo as { podeDeixarDeFora?: unknown }).podeDeixarDeFora === true;
}
/** uma linha que o sistema não conseguiu gravar (a linha do arquivo e o nome), só para a tela mostrar quais ficariam de fora */
export interface LinhaRecusada { readonly linha: number; readonly nome: string }
/** as linhas que ficariam de fora, como o servidor mandou no 409 (menor 10 da revisão de 24/11/2026: a Geral confirma vendo quais); no máximo 5 */
export function linhasRecusadas(corpo: unknown): LinhaRecusada[] {
  const lista = corpo && typeof corpo === "object" ? (corpo as { recusadas?: unknown }).recusadas : null;
  if (!Array.isArray(lista)) return [];
  const boas: LinhaRecusada[] = [];
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const { linha, nome } = x as { linha?: unknown; nome?: unknown };
    if (typeof linha !== "number" || !Number.isInteger(linha) || linha < 1) continue;
    if (nome !== undefined && typeof nome !== "string") continue;
    boas.push({ linha, nome: nome ?? "" });
  }
  return boas.slice(0, 5);
}
/** a pergunta antes de deixar de fora: quantas, para onde vão e quando parar */
export function perguntaDeixarDeFora(n: number): string {
  const quais = n === 1 ? "a linha da lista" : n > 1 ? `as ${numero(n)} linhas da lista` : "as linhas que o sistema não conseguiu gravar";
  return `Deixar de fora ${quais}? Elas vão para a lista dos que ficaram de fora (o nome e o motivo), `
    + "para a secretaria cadastrar à mão. Se as linhas seguintes também não entrarem, pare e avise o suporte.";
}
/** o "Descartar": a prévia sai na hora, com os dados pessoais das linhas (antes dos dias da guarda) */
export const descartar = (importacaoId: number): Promise<Resultado<{ sucesso: boolean }>> =>
  pedir(BASE + "/descartar", { metodo: "POST", corpo: { importacaoId } });
/** G2: descarta a importação confirmada que parou sem ninguém importado (a rota pede a confirmação recente, como a de confirmar) */
export const descartarParada = (importacaoId: number): Promise<Resultado<{ sucesso: boolean }>> =>
  pedir(BASE + "/descartar-parada", { metodo: "POST", corpo: { importacaoId } });

/** baixa a lista do que acontece com cada linha (sem CPF nem contato) pelo fetch autenticado da casca: um link solto iria sem a sessão */
export async function baixarLista(importacaoId: number): Promise<string> {
  const p = ponte();
  let res: Response;
  try { res = await p.pedir(p.apiBase + BASE + "/lista.csv" + qs({ importacaoId })); } catch { return "Não deu para baixar a lista agora. Confira a internet e tente de novo."; }
  if (!res.ok) return "Não deu para baixar a lista agora. Tente de novo.";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "importacao-sistema-pago-conferir.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "";
}

/** o texto do arquivo: UTF-8; se não for (o sistema pago pode exportar no padrão do Windows), Windows-1252 — os acentos chegam certos nos dois */
export async function lerTextoDoArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// ---- as datas no horário de Brasília ("quinta, 10/12/2026, 15h30")
const FUSO = "America/Sao_Paulo";
function partes(d: Date): Record<string, string> {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
const data = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** "quinta, 10/12/2026, 15h30" */
export function quandoLongo(v: string | Date | null | undefined): string {
  const d = data(v);
  if (!d) return "";
  const p = partes(d);
  return `${(p.weekday ?? "").split("-")[0]}, ${p.day}/${p.month}/${p.year}, ${p.hour}h${p.minute}`;
}
/** "10/12/2026, às 15h42" */
export function diaEHora(v: string | Date | null | undefined): string {
  const d = data(v);
  if (!d) return "";
  const p = partes(d);
  return `${p.day}/${p.month}/${p.year}, às ${p.hour}h${p.minute}`;
}
/** "10/12 15h42" */
export function quandoCurto(v: string | Date | null | undefined): string {
  const d = data(v);
  if (!d) return "";
  const p = partes(d);
  return `${p.day}/${p.month} ${p.hour}h${p.minute}`;
}
/** "10/12, 15h42" */
export function diaMesHora(v: string | Date | null | undefined): string {
  const d = data(v);
  if (!d) return "";
  const p = partes(d);
  return `${p.day}/${p.month}, ${p.hour}h${p.minute}`;
}

// ---- a guarda dos dados (respostas dele de 23/11/2026, LGPD): a prévia não confirmada se apaga sozinha; a lista dos de fora fica um tempo depois do fim
/** sem os prazos do servidor (ou inválidos), os das respostas dele */
export const GUARDA_PADRAO: Guarda = { diasPrevia: 7, diasFora: 90 };
const diasValidos = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;
export function guardaDe(g: Partial<Guarda> | null | undefined): Guarda {
  return { diasPrevia: diasValidos(g?.diasPrevia) ? g.diasPrevia : GUARDA_PADRAO.diasPrevia, diasFora: diasValidos(g?.diasFora) ? g.diasFora : GUARDA_PADRAO.diasFora };
}
const emDias = (n: number): string => `${numero(n)} ${n === 1 ? "dia" : "dias"}`;
export const notaDaPrevia = (g: Guarda): string => `Sem confirmar, esta prévia se apaga sozinha em ${emDias(g.diasPrevia)}.`;
export const PERGUNTA_DESCARTAR_PARADA = "Descartar esta importação? Ninguém entrou ainda: a planilha sai do sistema agora, com o CPF, o celular, a mãe e o pai. "
  + "Para importar, escolha o arquivo de novo.";
export const PERGUNTA_DESCARTAR = "Descartar esta prévia? A planilha sai do sistema agora, com o CPF, o celular, a mãe e o pai. Para importar, escolha o arquivo de novo.";
/** no resultado, com gente de fora: até quando a lista fica (o dia de Brasília do fim + os dias da guarda; a rotina diária apaga a partir desse dia) */
export function notaForaAte(imp: Importacao, g: Guarda): string {
  const fim = data(imp.concluidaEm);
  if (!fim || !imp.resumo || imp.resumo.foraApagadaEm || !((imp.resumo.resultado?.fora ?? 0) > 0)) return "";
  const p = partes(fim);
  const dia = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + g.diasFora));
  const dd = String(dia.getUTCDate()).padStart(2, "0"), mm = String(dia.getUTCMonth() + 1).padStart(2, "0");
  return `A lista dos que ficaram de fora se apaga sozinha a partir de ${dd}/${mm}/${dia.getUTCFullYear()} (${emDias(g.diasFora)} depois do fim): baixe antes, se precisar.`;
}
/** "03/12/2026" (o dia de Brasília) */
function diaBr(v: string | Date | null | undefined): string {
  const d = data(v);
  if (!d) return "";
  const p = partes(d);
  return `${p.day}/${p.month}/${p.year}`;
}
/** a tela parada (G2, decisão dele de 24/11/2026): quantos dias faltam, até quando e o que acontece depois do prazo. Com gente já importada, as linhas que
 *  faltam ficam de fora (fica o número da linha e o nome, para uma importação só com elas; na do resto, que é uma vez só, para cadastrar à mão); sem
 *  ninguém, a importação é descartada. */
export function fraseDoPrazo(prazo: Prazo | null | undefined, importadas: number | null | undefined, resto = false): string {
  if (!prazo || typeof prazo.faltam !== "number" || !Number.isInteger(prazo.faltam) || prazo.faltam < 0) return "";
  const ate = diaBr(prazo.venceEm);
  if (!ate) return "";
  const alguem = typeof importadas === "number" && importadas > 0;
  if (prazo.faltam === 0) {
    return `O prazo para continuar acabou em ${ate}: continue agora; senão, o sistema `
      + (alguem ? "deixa de fora as linhas que faltam e apaga os dados pessoais delas." : "descarta a importação e apaga os dados pessoais da planilha.");
  }
  const quanto = prazo.faltam === 1 ? "Falta 1 dia" : `Faltam ${numero(prazo.faltam)} dias`;
  return `${quanto} para continuar (até ${ate}). Depois do prazo, `
    + (!alguem ? "a importação é descartada e os dados pessoais da planilha se apagam."
      : resto ? "as linhas que faltam ficam de fora e os dados pessoais delas se apagam: fica só o número da linha e o nome, para cadastrar à mão."
        : "as linhas que faltam ficam de fora e os dados pessoais delas se apagam: o sistema guarda só o número da linha e o nome, para uma importação só com elas.");
}

// ---- a importação só das linhas que faltaram (G2, decisão dele de 24/11/2026: UMA importação nova só com elas, a exceção ao "uma vez só")
const contagem = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
/** o passo do arquivo no modo do resto: o que mandar e o que entra */
export const AVISO_ARQUIVO_RESTO = "Importação só das linhas que faltaram (uma vez): escolha o mesmo arquivo da importação, ou uma planilha só com essas linhas. "
  + "Entram só as linhas da lista, achadas pelo nome; as outras ficam fora.";
/** o bloco do resultado: quantas faltaram e a saída (enquanto pode); depois de feito, o que o resto fez. Aberto (prévia ou andamento), nada: a tela está nele */
export function fraseDoResto(r: EstadoResto | null | undefined): string {
  if (!r) return "";
  if (r.feito) {
    const quando = diaBr(r.feito.concluidaEm);
    const entraram = contagem(r.feito.importadas) ? r.feito.importadas : 0;
    const fora = contagem(r.feito.fora) ? r.feito.fora : 0;
    const naoVieram = contagem(r.feito.naoAchadas) ? r.feito.naoAchadas : 0;
    return `A importação das linhas que faltaram foi feita${quando ? ` em ${quando}` : ""}: ${numero(entraram)} ${entraram === 1 ? "entrou" : "entraram"}`
      + (fora > 0 ? ` e ${numero(fora)} ${fora === 1 ? "ficou" : "ficaram"} de fora (na lista dela para baixar)` : "")
      + (naoVieram > 0 ? `; ${numero(naoVieram)} ${naoVieram === 1 ? "não veio no arquivo (marcada" : "não vieram no arquivo (marcadas"} na lista do que aconteceu)` : "")
      + ". É uma vez só: quem ainda faltar se cadastra à mão.";
  }
  if (!r.possivel || !contagem(r.faltaram) || r.faltaram < 1) return "";
  const um = r.faltaram === 1;
  return `A importação não terminou no prazo: ${um ? "1 linha faltou" : `${numero(r.faltaram)} linhas faltaram`}, e o sistema guardou só o número da linha e o nome `
    + `${um ? "dela" : "de cada uma"}. Você pode fazer uma importação só com ${um ? "ela" : "elas"}, uma vez: mande o mesmo arquivo de novo, ou uma planilha só `
    + `com ${um ? "essa linha" : "essas linhas"}.`;
}
/** a nota da prévia do resto: quantas das que faltaram foram achadas no arquivo e quantas linhas do arquivo ficam fora da lista (quem não foi achado vem no
 *  aviso amarelo do servidor, com os outros avisos da prévia) */
export function fraseDaPreviaDoResto(r: ResumoResto | null | undefined): string {
  if (!r || !contagem(r.achadas) || !contagem(r.faltaram) || r.faltaram < 1) return "";
  const fora = contagem(r.foraDaLista) ? r.foraDaLista : 0;
  return `Importação só das linhas que faltaram (uma vez): ${numero(r.achadas)} das ${numero(r.faltaram)} ${r.achadas === 1 ? "linhas foi achada" : "linhas foram achadas"} `
    + "neste arquivo"
    + (fora > 0 ? `; ${fora === 1 ? "a outra linha do arquivo não está na lista e fica fora" : `as outras ${numero(fora)} linhas do arquivo não estão na lista e ficam fora`}` : "")
    + ".";
}
/** a parada sem ninguém importado que a rotina descartou no fim do prazo: a tela volta ao arquivo dizendo qual foi, quando e por quê (G2) */
export function fraseDescartadaPeloPrazo(d: DescartadaPeloPrazo | null | undefined): string {
  if (!d || !diasValidos(d.dias)) return "";
  const quando = diaBr(d.descartadaEm);
  if (!quando) return "";
  const confirmada = diaBr(d.confirmadaEm);
  const qual = (d.nomeArquivo ? `A importação do arquivo “${d.nomeArquivo}”` : "A importação") + (confirmada ? (d.nomeArquivo ? `, confirmada em ${confirmada},` : ` confirmada em ${confirmada}`) : "");
  return `${qual} parou sem ninguém importado e foi descartada em ${quando}, no fim do prazo de ${emDias(d.dias)}: os dados da planilha foram apagados. `
    + "Para importar, escolha o arquivo de novo.";
}
/** o dia de Brasília como número de dias (para contar os dias entre duas datas) */
function diaNumero(v: string | Date | null | undefined): number | null {
  const d = data(v);
  if (!d) return null;
  const p = partes(d);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000;
}
/** a lista já apagada pela rotina: a linha da trilha (a lista para baixar fica sem os de fora, e a tela diz por quê). Os dias são os do dia em que apagou (o
 *  prazo guardado no resumo; na apagada antes de guardá-lo, os dias entre o fim e o dia em que apagou), nunca o prazo de hoje (G4, revisão de 24/11/2026). */
export function fraseForaApagada(imp: Importacao): string {
  const apagada = imp.resumo?.foraApagadaEm;
  if (!apagada) return "";
  const guardados = imp.resumo?.foraDias;
  const fim = diaNumero(imp.concluidaEm), dia = diaNumero(apagada);
  const dias = diasValidos(guardados) ? guardados : fim !== null && dia !== null && dia - fim >= 1 ? dia - fim : null;
  return dias === null ? "A lista dos que ficaram de fora foi apagada (a guarda dos dados)"
    : `A lista dos que ficaram de fora foi apagada, ${emDias(dias)} depois do fim (a guarda dos dados)`;
}

/** a matrícula do arquivo com o ponto do milhar ("4318" -> "4.318"); o que não é número fica como veio */
export const matriculaBr = (m: string): string => (/^\d{1,9}$/.test(m.trim()) ? numero(Number(m.trim())) : m.trim());

/** "da Lúcia", "do Marcos"; sem o sexo na linha, "de" */
const artigo = (sexo: string | null | undefined): string => (sexo === "F" ? "da" : sexo === "M" ? "do" : "de");
/** o "Por quê" da matrícula a acertar (r27): o motivo e de quem é o número (quem veio antes na planilha). A linha sem congregação não entra (G3), então o
 *  motivo não fala mais da congregação que faltou */
export function porQue(i: ItemLista): string {
  const d = i.detalhe;
  let t: string;
  switch (d.motivoNumero) {
    case "ZERO": t = "veio com a matrícula 0"; break;
    case "VAZIA": t = "veio sem matrícula"; break;
    case "INVALIDA": t = `a matrícula “${i.matricula}” não é um número`; break;
    case "REPETIDA_NO_ARQUIVO":
      t = d.dono ? `a ${matriculaBr(i.matricula)} já é ${artigo(d.dono.sexo)} ${d.dono.nome}, que veio antes (linha ${numero(d.dono.linha)})` : `a ${matriculaBr(i.matricula)} veio repetida na planilha`;
      break;
    case "DE_OUTRA_FICHA": t = `a ${matriculaBr(i.matricula)} passou a ser de outra ficha do sistema`; break;
    default: t = i.motivos[0] ?? "";
  }
  return t;
}
/** de quem pode ser repetida: "da linha 977 (Lúcia Barros)" ou "da ficha nº 600 (Tito Antigo)" */
export function repetidaDe(i: ItemLista): string {
  const r = i.detalhe.repetidaDe;
  if (!r) return "";
  return r.linha != null ? `a linha ${numero(r.linha)}${r.nome ? ` (${r.nome})` : ""}` : `a ficha nº ${numero(r.matricula)}${r.nome ? ` (${r.nome})` : ""}`;
}
