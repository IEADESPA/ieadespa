// Os textos e as contas da tela de lançar dízimos e ofertas (rodada 24, "r24-lancamento", opção 1, sem "marcada em novembro"), como o desenho
// escreve. O servidor confere tudo (a regra pura está em api/shared/finLancamentos.js); aqui só se escreve o que ele mandou e se monta o pedido.
import { pedir, qs } from "../comum/api";
import type { CongregacaoDoSeletor } from "../comum/tipos";
import type { AreaLancamentos, DizimistaAchado, FormaLancamento, HistoricoLancamento, LinhaPlanilha, PlanilhaMes, ReferenteLancamento, TipoLancamento, TotaisMes } from "./tipos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** centavos → "1.454,00" (o número da folha também vai com o ponto do milhar) */
export function reais(c: number | null | undefined): string {
  const v = Math.abs(Math.trunc(c ?? 0));
  const inteiro = Math.trunc(v / 100).toLocaleString("pt-BR");
  return `${(c ?? 0) < 0 ? "-" : ""}${inteiro},${String(v % 100).padStart(2, "0")}`;
}
/** centavos → "R$ 1.454,00" */
export const emReais = (c: number | null | undefined): string => `R$ ${reais(c)}`;
/** 70161 → "70.161" */
export const folhaTxt = (n: number): string => n.toLocaleString("pt-BR");
/** "2026-12-01" → "dezembro" */
export const nomeDoMes = (mes: string): string => MESES[Number(mes.slice(5, 7)) - 1] ?? "";
/** "2026-12-01" → "Dezembro" */
export const NomeDoMes = (mes: string): string => { const n = nomeDoMes(mes); return n.charAt(0).toUpperCase() + n.slice(1); };
/** "2026-12-02" → "quarta, 02/12/2026" */
export function diaComSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return "";
  const dia = new Date(Date.UTC(a, m - 1, d, 12));
  return `${SEMANA[dia.getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

export const NOME_TIPO: Record<TipoLancamento, string> = { DIZIMO: "Dízimo", OFERTA_CULTO: "Oferta de culto", OFERTA_VOLUNTARIA: "Oferta voluntária" };
export const NOME_FORMA: Record<FormaLancamento, string> = { PIX: "Pix", ESPECIE: "Espécie" };
/** o destino da marcada como a tela escreve ("Arrancada") */
export const NOME_MARCA: Record<string, string> = { CANCELADA: "Cancelada", ARRANCADA: "Arrancada", EXTRAVIADA: "Extraviada", INEXISTENTE: "Inexistente" };
/** as marcas que a planilha faz (a decisão 4 corrigida de 26/11/2026: a extraviada fica só na aba Folhas) */
export const MARCAS_DA_PLANILHA = [
  { chave: "cancelada", rotulo: "Cancelada", quando: "preenchida errado e anulada" },
  { chave: "arrancada", rotulo: "Arrancada", quando: "tirada do bloco" },
  { chave: "inexistente", rotulo: "Inexistente", quando: "a gráfica não imprimiu" }
] as const;
export type MarcaDaPlanilha = (typeof MARCAS_DA_PLANILHA)[number]["chave"];

/** quem deu, como a linha mostra: o membro do cadastro, o nome digitado ou a oferta sem nome */
export function quemDeu(l: LinhaPlanilha): string {
  if (l.membro) return l.membro;
  if (l.nome) return l.nome;
  return l.tipo === "OFERTA_CULTO" ? "Oferta de culto (sem nome)" : "—";
}

// ---- os pedidos ao servidor (financeiro/lancamentos) ----

const BASE = "/financeiro/lancamentos";
export const lerPlanilha = (congregacaoId: number | null, mes: string | null) =>
  pedir<PlanilhaMes & { sucesso: true }>(`${BASE}${qs({ congregacaoId: congregacaoId ?? undefined, mes: mes ?? undefined })}`);
export const lerCongregacoes = () => pedir<{ sucesso: true; congregacoes: readonly CongregacaoDoSeletor[] }>(`${BASE}/congregacoes`);
export const procurarDizimista = (procura: string, sinal?: AbortSignal) =>
  pedir<{ sucesso: true; membros: readonly DizimistaAchado[] }>(`${BASE}/membros${qs({ procura })}`, sinal ? { sinal } : {});

/** a linha que vai para o servidor: o valor como a pessoa digitou ("250,00"); o servidor lê sem número quebrado */
export interface LinhaParaSalvar {
  readonly folha: number;
  readonly referente?: ReferenteLancamento;
  readonly tipo?: TipoLancamento;
  readonly forma?: FormaLancamento;
  readonly valor?: string;
  readonly voluntaria?: string;
  readonly pessoa?: { readonly membroId: number } | { readonly nome: string };
  readonly excecao?: { readonly oQueAconteceu: MarcaDaPlanilha; readonly observacao: string };
}
/** a recusa do servidor diz a folha (`folha`), para a tela marcar a linha */
export const salvarLinhas = (congregacaoId: number, dia: string, linhas: readonly LinhaParaSalvar[]) =>
  pedir<{ sucesso: true; mensagem: string; folhas: readonly number[] }>(`${BASE}/salvar`, { metodo: "POST", corpo: { congregacaoId, dia, linhas } });
export const corrigirLinha = (corpo: { readonly folha: number; readonly motivo: string } & Omit<LinhaParaSalvar, "folha" | "referente" | "excecao">) =>
  pedir<{ sucesso: true; mensagem: string }>(`${BASE}/corrigir`, { metodo: "POST", corpo });
export const lerHistoricoLancamento = (folha: number) => pedir<HistoricoLancamento & { sucesso: true }>(`${BASE}/historico${qs({ folha })}`);
export const lerArea = (mes?: string) => pedir<AreaLancamentos & { sucesso: true }>(`${BASE}/area${qs({ mes })}`);

/** a folha recusada que o servidor apontou (o corpo da recusa traz `folha`) */
export function folhaDaRecusa(corpo: unknown): number | null {
  if (!corpo || typeof corpo !== "object") return null;
  const f = (corpo as { folha?: unknown }).folha;
  return typeof f === "number" && Number.isInteger(f) && f > 0 ? f : null;
}

// ---- o rascunho de uma folha (o que a pessoa digitou e ainda não salvou) ----

/** quem deu: o membro escolhido no cadastro, o nome digitado (não achado) ou ninguém */
export type Pessoa = { readonly membroId: number; readonly nome: string } | { readonly digitado: string } | null;

/** a linha da planilha que ainda não foi salva: "nova" (a folha livre ou a que ficou para trás) ou "preencher" (veio marcada "mês posterior") */
export interface Rascunho {
  readonly folha: number;
  readonly como: "nova" | "preencher";
  referente: ReferenteLancamento;
  /** o tipo, ou a marca da folha que não foi usada (a cancelada, a arrancada, a inexistente) */
  tipo: TipoLancamento | MarcaDaPlanilha | null;
  forma: FormaLancamento | null;
  valor: string;
  voluntaria: string;
  pessoa: Pessoa;
  motivo: string;
}

export const ehMarca = (t: Rascunho["tipo"]): t is MarcaDaPlanilha => t === "cancelada" || t === "arrancada" || t === "inexistente";

export function rascunhoNovo(folha: number, como: Rascunho["como"]): Rascunho {
  return { folha, como, referente: "ESTE_MES", tipo: null, forma: null, valor: "", voluntaria: "", pessoa: null, motivo: "" };
}

/** nada digitado: a linha não vai ao servidor (o "Este mês" já vem escolhido; o "Mês posterior" é uma escolha) */
export const rascunhoVazio = (r: Rascunho): boolean =>
  r.referente === "ESTE_MES" && r.tipo === null && r.forma === null && !r.valor.trim() && !r.voluntaria.trim() && r.pessoa === null && !r.motivo.trim();

/**
 * O que vai para o servidor, do jeito que ele confere (shared/finLancamentos.js): a marca vai só com o motivo; o "Mês posterior" vai sem nome
 * e sem valor; a folha que veio marcada vai sem o "Referente a" (já decidido); a voluntária junto, só com o dízimo; o nome digitado vai como
 * `nome`. O servidor confere tudo de novo.
 */
export function paraSalvar(r: Rascunho): LinhaParaSalvar {
  if (ehMarca(r.tipo)) return { folha: r.folha, excecao: { oQueAconteceu: r.tipo, observacao: r.motivo.trim() } };
  if (r.como === "nova" && r.referente === "MES_POSTERIOR") return { folha: r.folha, referente: "MES_POSTERIOR" };
  const p = r.pessoa;
  const pessoa = !p ? undefined : "membroId" in p ? { membroId: p.membroId } : { nome: p.digitado };
  const voluntaria = r.tipo === "DIZIMO" && r.voluntaria.trim() ? r.voluntaria.trim() : undefined;
  return {
    folha: r.folha,
    ...(r.como === "nova" ? { referente: "ESTE_MES" as const } : {}),
    ...(r.tipo ? { tipo: r.tipo } : {}),
    ...(r.forma ? { forma: r.forma } : {}),
    ...(r.valor.trim() ? { valor: r.valor.trim() } : {}),
    ...(voluntaria ? { voluntaria } : {}),
    ...(pessoa ? { pessoa } : {})
  };
}

/** o valor como se digita: só algarismos, a vírgula e o ponto do milhar ("1.250,00"), no máximo 14 caracteres */
export const soValor = (v: string): string => v.replace(/[^\d.,]/g, "").slice(0, 14);

/** o valor digitado em centavos ("1.250,00" → 125000), como o servidor lê; o que não confere fica null (o servidor recusa ao salvar) */
export function centavos(v: string): number | null {
  const t = v.trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return null;
  const [inteiro = "", frac = ""] = t.split(",");
  const c = Number(inteiro.replace(/\./g, "")) * 100 + Number(frac.padEnd(2, "0"));
  return c > 0 ? c : null;
}

/**
 * Os totais do mês com o que já está digitado (o desenho: "os totais de dezembro já contam a 70.161 e a 70.162"): a linha com o tipo, a forma
 * e o valor soma como o servidor somaria (totaisDoMes); a folha que veio marcada do mês anterior soma também no adiantado; a nova "Mês
 * posterior" e a folha marcada não somam aqui. Ao salvar, os totais voltam do servidor.
 */
export function totaisComRascunhos(t: TotaisMes, rascunhos: readonly Rascunho[]): TotaisMes {
  const n = { ...t } as { -readonly [K in keyof TotaisMes]: TotaisMes[K] };
  for (const r of rascunhos) {
    if (!r.tipo || ehMarca(r.tipo) || !r.forma || (r.como === "nova" && r.referente === "MES_POSTERIOR")) continue;
    const v = centavos(r.valor);
    if (v === null) continue;
    const vol = r.tipo === "DIZIMO" ? (centavos(r.voluntaria) ?? 0) : 0;
    if (r.tipo === "DIZIMO") n.dizimos += v;
    else if (r.tipo === "OFERTA_CULTO") n.ofertaCulto += v;
    else { n.ofertaVoluntaria += v; n.voluntariasSozinhas++; }
    if (vol) { n.ofertaVoluntaria += vol; n.voluntariasJunto++; }
    if (r.forma === "PIX") n.pix += v + vol; else n.especie += v + vol;
    if (r.como === "preencher") n.adiantado += v + vol;
    n.total += v + vol;
    n.folhas++;
  }
  return n;
}

/** "a 70.161", "a 70.161 e a 70.162", "as 3 folhas" */
export function asFolhas(folhas: readonly number[]): string {
  const [a, b] = folhas;
  if (a !== undefined && folhas.length === 1) return `a ${folhaTxt(a)}`;
  if (a !== undefined && b !== undefined && folhas.length === 2) return `a ${folhaTxt(a)} e a ${folhaTxt(b)}`;
  return `as ${folhas.length} folhas`;
}

/** o mês "aaaa-mm-01" antes (-1) ou depois (+1) */
export function mesVizinho(mes: string, passo: number): string {
  const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  const d = new Date(Date.UTC(a, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "sex 20/11, 11h15" (o último lançamento da área) */
export function quandoCurto(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  const dia = (SEMANA[d.getUTCDay()] ?? "").slice(0, 3);
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia} ${dd}/${mm}, ${String(d.getUTCHours()).padStart(2, "0")}h${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "02/12 09h40" (o histórico da linha) */
export function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}h${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
