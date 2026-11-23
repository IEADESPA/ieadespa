// COMPLETAR O ARROLAMENTO (FASE 10, Membros, rodada 28 aprovada em 23/11/2026): as regras da TELA, sem nenhum import (o teste carrega este arquivo direto:
// api/shared/__tests__/arrolamentoTela.test.js). Quem veio do sistema pago entra "arrolamento a completar", sem voto; a secretaria escolhe a situação, como
// e quando a pessoa entrou e o cargo, só se tiver. A tela confere antes de mandar para dizer o erro no campo; o servidor confere tudo de novo
// (api/shared/arrolamento.js) e é ele quem decide.

export type Situacao = "EM_COMUNHAO" | "CONGREGADO" | "SEM_COMUNHAO";
export type TomDepois = "ok" | "info" | "atrasado";

export interface FormCompletar {
  readonly situacao: Situacao;
  readonly formaAdmissao: string;
  readonly dataAdmissao: string;
  readonly cargo: string;
  readonly congregacaoId: number | null;
}
/** o mínimo da ficha que a regra precisa (GET /api/arrolamento/ficha) */
export interface FichaBase {
  readonly matricula: number;
  readonly nascimento: string | null;
  readonly congregacaoId: number | null;
  readonly formaAdmissao?: string | null;
  readonly dataAdmissao?: string | null;
}
export interface CorpoCompletar {
  matricula: number;
  situacao: Situacao;
  formaAdmissao?: string;
  dataAdmissao?: string;
  cargoMinisterial?: string;
  congregacaoId?: number;
}
export type CampoComErro = "situacao" | "forma" | "data" | "congregacao";

/** vieram do sistema pago, já completadas e as que faltam */
export interface Andamento { readonly vieram: number; readonly completadas: number; readonly faltam: number }
export interface LugarArrolamento extends Andamento { readonly id: number | null; readonly nome: string; readonly area?: string | null }
export interface ProximaFicha { readonly matricula: number; readonly nome: string; readonly sexo: string | null; readonly departamento: string | null }
/** GET /api/arrolamento: o andamento, o dia em que vieram, cada congregação do escopo, as 4 próximas e, para a Geral, cada área e as que vieram sem congregação */
export interface PainelArrolamento {
  readonly andamento: Andamento;
  readonly veioEm: string | null;
  readonly porCongregacao: readonly LugarArrolamento[];
  readonly proximas: readonly ProximaFicha[];
  readonly porArea: readonly LugarArrolamento[] | null;
  readonly semCongregacao: number;
}
/** GET /api/arrolamento/ficha: a ficha para completar (null quando não falta nenhuma), a próxima e o andamento da congregação dela */
export interface FichaArrolamento {
  readonly matricula: number;
  readonly nome: string;
  readonly nascimento: string | null;
  readonly idade: number | null;
  readonly sexo: string | null;
  readonly congregacaoId: number | null;
  readonly congregacao: string | null;
  readonly departamento: string | null;
  readonly formaAdmissao: string | null;
  readonly dataAdmissao: string | null;
}
export interface RespostaFichaArrolamento {
  readonly ficha: FichaArrolamento | null;
  readonly proxima: { readonly matricula: number; readonly nome: string } | null;
  readonly andamento: Andamento | null;
}

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const ehNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function lerAndamento(x: unknown): Andamento | null {
  const a = obj(x);
  return a && ehNum(a.vieram) && ehNum(a.completadas) && ehNum(a.faltam) ? { vieram: a.vieram, completadas: a.completadas, faltam: a.faltam } : null;
}
/** a resposta do painel do arrolamento, conferida: sem o andamento (servidor antigo, resposta simulada ou estranha) é null, e o painel fica como era */
export function lerPainelArrol(x: unknown): PainelArrolamento | null {
  const o = obj(x);
  const andamento = o ? lerAndamento(o.andamento) : null;
  if (!o || !andamento) return null;
  const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    andamento,
    veioEm: typeof o.veioEm === "string" ? o.veioEm : null,
    porCongregacao: lista<LugarArrolamento>(o.porCongregacao),
    proximas: lista<ProximaFicha>(o.proximas),
    porArea: Array.isArray(o.porArea) ? (o.porArea as LugarArrolamento[]) : null,
    semCongregacao: ehNum(o.semCongregacao) ? o.semCongregacao : 0
  };
}
/** a resposta da ficha, conferida: a ficha e a próxima só com matrícula e nome */
export function lerRespostaFicha(x: unknown): RespostaFichaArrolamento {
  const o = obj(x);
  const f = obj(o?.ficha), p = obj(o?.proxima);
  return {
    ficha: f && ehNum(f.matricula) && typeof f.nome === "string" ? (f as unknown as FichaArrolamento) : null,
    proxima: p && ehNum(p.matricula) && typeof p.nome === "string" ? { matricula: p.matricula, nome: p.nome } : null,
    andamento: lerAndamento(o?.andamento)
  };
}
export type Envio = { readonly ok: true; readonly corpo: CorpoCompletar } | { readonly ok: false; readonly campo: CampoComErro; readonly mensagem: string };

export const SITUACOES: readonly { readonly valor: Situacao; readonly rotulo: string; readonly sub: string }[] = [
  { valor: "EM_COMUNHAO", rotulo: "Em comunhão", sub: "membro: ganha o voto" },
  { valor: "CONGREGADO", rotulo: "Congregado", sub: "ainda não membro: não vota" },
  { valor: "SEM_COMUNHAO", rotulo: "Sem comunhão", sub: "em disciplina ou afastado" }
];
/** as 4 formas de entrada que o sistema já tem (api/shared/edicaoFicha.js FORMAS_ADMISSAO), com os nomes do desenho */
export const FORMAS: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "BATISMO", rotulo: "Batismo nas águas" },
  { valor: "CARTA_MUDANCA", rotulo: "Carta de mudança" },
  { valor: "RECONCILIACAO", rotulo: "Reconciliação" },
  { valor: "ACLAMACAO", rotulo: "Aclamação" }
];

const RX_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_MINIMA = "1900-01-01";
/** "AAAA-MM-DD" que existe no calendário (nada de 30/02) */
function dataValida(txt: string): boolean {
  const m = RX_ISO.exec(txt);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
const soDia = (v: string | null | undefined): string => (typeof v === "string" ? v.slice(0, 10) : "");

/** o formulário ao abrir a ficha: em comunhão (como no desenho) e o que o sistema pago já trouxe (a forma da lista e a data válida) */
export function formInicial(f: FichaBase): FormCompletar {
  const forma = FORMAS.some((x) => x.valor === f.formaAdmissao) ? String(f.formaAdmissao) : "";
  const data = soDia(f.dataAdmissao);
  return { situacao: "EM_COMUNHAO", formaAdmissao: forma, dataAdmissao: dataValida(data) ? data : "", cargo: "", congregacaoId: null };
}

/** o pedido de completar, ou o campo com o erro. `hoje` = "AAAA-MM-DD". O congregado vai sem forma, sem data e sem cargo; a congregação só na ficha sem ela. */
export function montarEnvio(form: FormCompletar, ficha: FichaBase, hoje: string): Envio {
  if (!SITUACOES.some((s) => s.valor === form.situacao)) return { ok: false, campo: "situacao", mensagem: "Escolha a situação: em comunhão, congregado ou sem comunhão." };
  const corpo: CorpoCompletar = { matricula: ficha.matricula, situacao: form.situacao };
  if (ficha.congregacaoId === null) {
    if (!form.congregacaoId) return { ok: false, campo: "congregacao", mensagem: "Escolha a congregação desta pessoa." };
    corpo.congregacaoId = form.congregacaoId;
  }
  if (form.situacao !== "CONGREGADO") {
    if (!FORMAS.some((x) => x.valor === form.formaAdmissao)) return { ok: false, campo: "forma", mensagem: "Escolha como a pessoa entrou." };
    const data = form.dataAdmissao;
    if (!dataValida(data) || data < DATA_MINIMA) return { ok: false, campo: "data", mensagem: "Informe quando a pessoa entrou (dia, mês e ano)." };
    if (data > hoje) return { ok: false, campo: "data", mensagem: "A data de entrada não pode ser depois de hoje." };
    const nasc = soDia(ficha.nascimento);
    if (nasc && data < nasc) return { ok: false, campo: "data", mensagem: "A data de entrada não pode ser antes do nascimento." };
    corpo.formaAdmissao = form.formaAdmissao;
    corpo.dataAdmissao = data;
    if (form.cargo) corpo.cargoMinisterial = form.cargo;
  }
  return { ok: true, corpo };
}

/** quanto já foi completado, em %: arredondado, e nunca 100% enquanto falta alguém */
export function pctAndamento(completadas: number, vieram: number): number {
  if (!(vieram > 0)) return 0;
  const p = Math.round((completadas / vieram) * 100);
  return p >= 100 && completadas < vieram ? 99 : Math.max(0, Math.min(100, p));
}

const mil = (n: number): string => n.toLocaleString("pt-BR");
export function fraseSemCongregacao(n: number): string {
  return n === 1 ? "1 ficha veio sem congregação: a Secretaria Geral escolhe a congregação." : `${mil(n)} fichas vieram sem congregação: a Secretaria Geral escolhe a congregação.`;
}
/** "+ 6 congregações da Área 2" (as que não cabem na tabela) */
export function fraseResto(n: number, area: string | null): string {
  return `+ ${mil(n)} ${n === 1 ? "congregação" : "congregações"}${area ? ` da ${area}` : ""}`;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "2026-12-15" -> "terça, 15/12/2026" */
export function diaPorExtenso(iso: string | null | undefined): string {
  const m = iso ? RX_ISO.exec(iso.slice(0, 10)) : null;
  if (!m || !dataValida(m[0])) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()] ?? ""}, ${m[3]}/${m[2]}/${m[1]}`;
}
/** o dia de hoje em Brasília, "AAAA-MM-DD" (o mesmo dia que o servidor usa para conferir a data de entrada) */
export function hojeIso(agora: Date = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
/** "2026-12-10" -> "10/12" (o dia em que as fichas vieram do sistema pago) */
export function diaMes(iso: string | null | undefined): string {
  const m = iso ? RX_ISO.exec(iso.slice(0, 10)) : null;
  return m ? `${m[3]}/${m[2]}` : "";
}

/** o "Depois" do cartão "Ao completar": a etiqueta e o voto, pela situação escolhida */
export function depoisDe(s: Situacao): { readonly rotulo: string; readonly tom: TomDepois; readonly voto: string } {
  if (s === "CONGREGADO") return { rotulo: "congregado", tom: "info", voto: "sem voto" };
  if (s === "SEM_COMUNHAO") return { rotulo: "sem comunhão", tom: "atrasado", voto: "sem voto" };
  return { rotulo: "membro em comunhão", tom: "ok", voto: "com voto" };
}
/** a nota do cartão "Ao completar" (só para quem fica em comunhão) */
export function notaDaData(s: Situacao, dataAdmissao: string): string {
  if (s !== "EM_COMUNHAO") return "";
  const ano = dataValida(dataAdmissao) ? dataAdmissao.slice(0, 4) : "";
  return `A data de entrada é a de verdade${ano ? ` (${ano})` : ""}: com ela, o voto vale na hora.`;
}

// a cor do círculo de iniciais pelo departamento (as do desenho r28); o nome vem do catálogo, então a regra procura pelo sentido (como departamento.ts)
const CORES: readonly (readonly [RegExp, string])[] = [
  [/crian|infantil/i, "#15803D"],
  [/adolesc/i, "#0369A1"],
  [/jove|mocidade|juventude/i, "#6D28D9"],
  [/senhora|irm[aã]s|femin|mulher/i, "#BE185D"],
  [/var[õo]es|var[aã]o|homens|mascul/i, "#1D4ED8"]
];
export function corDoDepartamento(nome: string | null | undefined): string {
  const n = String(nome ?? "");
  return CORES.find(([rx]) => rx.test(n))?.[1] ?? "#1D4ED8";
}
