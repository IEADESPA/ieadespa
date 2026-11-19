// O estado do módulo Membros que várias telas dividem: em que tela a pessoa está (com o "voltar"), os contadores do menu e das pílulas,
// e os catálogos lidos uma vez (departamentos e congregações).
import { pedir, qs } from "../comum/api";
import { ponte } from "../comum/ponte";
import type { Congregacao, Departamento, PaginaPreCadastros, PaginaTransferencias, ResumoPainel, Sugestao } from "./tipos";

export type SecaoFicha = "resumo" | "dados" | "familia" | "vida" | "cargos" | "ministerios" | "assembleia" | "documentos" | "alteracoes";
// as caixas do servidor (GestaoTransferencias): "andamento" = todas as pendentes do escopo; "paradas" só a Geral
export type AbaTransferencias = "chegando" | "saindo" | "concluidos" | "paradas" | "andamento";

/** as telas do módulo (as do menu e as de dentro) */
export type Rota =
  | { readonly tela: "painel" }
  | { readonly tela: "pessoas" }
  | { readonly tela: "fila" }
  | { readonly tela: "cadastrar" }
  | { readonly tela: "rapido" }
  | { readonly tela: "transferencias"; readonly aba: AbaTransferencias }
  | { readonly tela: "transferir"; readonly membroId: number | null }
  | { readonly tela: "transferencia"; readonly id: number }
  | { readonly tela: "desligamentos" }
  | { readonly tela: "repetidas" }
  | { readonly tela: "juntar"; readonly a: number; readonly b: number }
  | { readonly tela: "sugestoes" }
  | { readonly tela: "carteirinhas"; readonly congregacaoId: number | null }
  | { readonly tela: "editor"; readonly modeloId: number }
  | { readonly tela: "ficha"; readonly id: number; readonly secao: SecaoFicha };

const inteiro = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const TELAS_SIMPLES = ["painel", "pessoas", "fila", "cadastrar", "rapido", "desligamentos", "repetidas", "sugestoes"] as const;
const SECOES: readonly SecaoFicha[] = ["resumo", "dados", "familia", "vida", "cargos", "ministerios", "assembleia", "documentos", "alteracoes"];
/** a rota que chega de FORA (a casca, a busca do alto): só telas conhecidas, com ids inteiros; o resto é ignorado (fica a tela de agora) */
export function lerRota(x: unknown): Rota | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const tela = o.tela;
  if ((TELAS_SIMPLES as readonly unknown[]).includes(tela)) return { tela: tela as (typeof TELAS_SIMPLES)[number] };
  if (tela === "ficha") { const id = inteiro(o.id); return id ? { tela, id, secao: SECOES.includes(o.secao as SecaoFicha) ? (o.secao as SecaoFicha) : "resumo" } : null; }
  if (tela === "transferencias") return { tela, aba: o.aba === "saindo" || o.aba === "concluidos" || o.aba === "paradas" || o.aba === "andamento" ? o.aba : "chegando" };
  if (tela === "transferir") return { tela, membroId: inteiro(o.membroId) };
  if (tela === "transferencia") { const id = inteiro(o.id); return id ? { tela, id } : null; }
  if (tela === "carteirinhas") return { tela, congregacaoId: inteiro(o.congregacaoId) };
  if (tela === "editor") { const id = inteiro(o.modeloId); return id ? { tela, modeloId: id } : null; }
  if (tela === "juntar") { const a = inteiro(o.a), b = inteiro(o.b); return a && b && a !== b ? { tela, a, b } : null; }
  return null;
}

export type ChaveMenu = "painel" | "pessoas" | "fila" | "cadastrar" | "transferencias" | "desligamentos" | "repetidas" | "sugestoes" | "carteirinhas";

/** a qual item do menu cada tela pertence (o item marcado e o caminho do topo) */
export function itemDoMenu(r: Rota): ChaveMenu {
  switch (r.tela) {
    case "ficha": return "pessoas";
    case "rapido": return "fila";
    case "transferir": case "transferencia": return "transferencias";
    case "juntar": return "repetidas";
    case "editor": return "carteirinhas";
    default: return r.tela;
  }
}

export const nav = $state<{ rota: Rota; pilha: Rota[] }>({ rota: { tela: "painel" }, pilha: [] });

/** abre uma tela; `nova` = começa o caminho de novo (item do menu), sem "voltar" */
export function ir(r: Rota, nova = false): void {
  if (nova) nav.pilha = [];
  else nav.pilha = [...nav.pilha.slice(-19), nav.rota];
  nav.rota = r;
  const conteudo = document.querySelector(".conteudo");
  if (conteudo) conteudo.scrollTop = 0;
}
export function voltar(padrao: Rota = { tela: "painel" }): void {
  const ant = nav.pilha[nav.pilha.length - 1];
  nav.pilha = nav.pilha.slice(0, -1);
  nav.rota = ant ?? padrao;
}

export const contadores = $state({ fila: 0, transferencias: 0, repetidas: 0, sugestoes: 0, lidos: false, falhou: false });

/** os números do menu e das pílulas: cada um com o seu pedido curto (porPagina=1), em paralelo; o que falhar fica 0 */
let contSeq = 0;
export async function lerContadores(): Promise<void> {
  const meu = ++contSeq;
  const [fila, tr, rep, sug] = await Promise.all([
    pedir<PaginaPreCadastros>("/pre-cadastros" + qs({ caixa: "fila", porPagina: 1 })),
    pedir<PaginaTransferencias>("/transferencias" + qs({ caixa: "chegando", porPagina: 1 })),
    pedir<{ total: number }>("/fichas-repetidas"),
    pedir<Sugestao[]>("/fila-aprovacoes")
  ]);
  if (meu !== contSeq) return;
  // o que falhou fica com o número de antes (e conta como falha): um aviso não some só porque a leitura caiu
  if (fila.ok) contadores.fila = Number(fila.dados.total) || 0;
  if (tr.ok) contadores.transferencias = Number(tr.dados.total) || 0;
  if (rep.ok) contadores.repetidas = Number(rep.dados.total) || 0;
  if (sug.ok && Array.isArray(sug.dados)) contadores.sugestoes = sug.dados.length;
  contadores.falhou = !(fila.ok && tr.ok && rep.ok && sug.ok);
  contadores.lidos = true;
}

// ---- os catálogos (lidos uma vez por entrada no módulo); a falha fica guardada para a tela dizer por que a lista está vazia ----
export const falhasCatalogo = $state({ departamentos: "", destinos: "" });
let depsPromessa: Promise<readonly Departamento[]> | null = null;
export function departamentos(): Promise<readonly Departamento[]> {
  depsPromessa ??= pedir<Departamento[] | { itens: Departamento[] }>("/catalogos/departamentos").then((r) => {
    if (!r.ok) { depsPromessa = null; falhasCatalogo.departamentos = r.mensagem; return []; }
    falhasCatalogo.departamentos = "";
    const lista = Array.isArray(r.dados) ? r.dados : r.dados.itens ?? [];
    return lista.filter((d) => d.ativo !== false);
  });
  return depsPromessa;
}
/** é departamento (a faixa de idade) ou ministério/secretaria? (o catálogo antigo sem tipo conta como departamento) */
export const ehDepartamento = (d: Departamento): boolean => !d.tipo || d.tipo === "DEPARTAMENTO";
let congsPromessa: Promise<readonly Congregacao[]> | null = null;
/** as congregações para onde se pode transferir (com a área) */
export function congregacoesDestino(): Promise<readonly Congregacao[]> {
  congsPromessa ??= pedir<{ congregacoes: Congregacao[] }>("/transferencias" + qs({ destinos: 1 })).then((r) => {
    if (!r.ok) { congsPromessa = null; falhasCatalogo.destinos = r.mensagem; return []; }
    falhasCatalogo.destinos = "";
    return r.dados.congregacoes ?? [];   // o servidor já manda só as ativas
  });
  return congsPromessa;
}

// ---- o resumo do painel: guardado para o escopo do menu e para a lista saber se há várias congregações ----
export const escopo = $state<{ resumo: ResumoPainel | null }>({ resumo: null });

export function textoEscopo(r: ResumoPainel | null): string {
  const s = ponte().sessao();
  if (s.geral) return "Secretaria Geral · Igreja toda";
  const congs = r?.congregacoes ?? [];
  if (congs.length === 1 && congs[0]) return `Congregação ${congs[0].nome}`;
  if (s.nivel === "AREA") return `Área · ${congs.length} congregações`;
  return congs.length ? `${congs.length} congregações` : "";
}

/** quem vê pode cadastrar e mexer no cadastro (a permissão "pessoas"; o servidor confere de novo) */
export function cuidaDoCadastro(): boolean {
  return ponte().sessao().permissoes.includes("pessoas");
}

export function zerarModulo(): void {
  nav.rota = { tela: "painel" };
  nav.pilha = [];
  depsPromessa = null;
  congsPromessa = null;
  escopo.resumo = null;
  contadores.lidos = false;
  falhasCatalogo.departamentos = "";
  falhasCatalogo.destinos = "";
}
