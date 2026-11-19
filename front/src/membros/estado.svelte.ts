// O estado do módulo Membros que várias telas dividem: em que tela a pessoa está (com o "voltar"), os contadores do menu e das pílulas,
// e os catálogos lidos uma vez (departamentos e congregações).
import { pedir, qs } from "../comum/api";
import { ponte } from "../comum/ponte";
import type { Congregacao, Departamento, PaginaPreCadastros, PaginaTransferencias, ResumoPainel, Sugestao } from "./tipos";

export type SecaoFicha = "resumo" | "dados" | "familia" | "vida" | "cargos" | "ministerios" | "assembleia" | "documentos" | "alteracoes";
export type AbaTransferencias = "chegando" | "saindo" | "concluidos";

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
  | { readonly tela: "carteirinhas" }
  | { readonly tela: "ficha"; readonly id: number; readonly secao: SecaoFicha };

export type ChaveMenu = "painel" | "pessoas" | "fila" | "cadastrar" | "transferencias" | "desligamentos" | "repetidas" | "sugestoes" | "carteirinhas";

/** a qual item do menu cada tela pertence (o item marcado e o caminho do topo) */
export function itemDoMenu(r: Rota): ChaveMenu {
  switch (r.tela) {
    case "ficha": return "pessoas";
    case "rapido": return "fila";
    case "transferir": case "transferencia": return "transferencias";
    case "juntar": return "repetidas";
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

export const contadores = $state({ fila: 0, transferencias: 0, repetidas: 0, sugestoes: 0, lidos: false });

/** os números do menu e das pílulas: cada um com o seu pedido curto (porPagina=1), em paralelo; o que falhar fica 0 */
export async function lerContadores(): Promise<void> {
  const [fila, tr, rep, sug] = await Promise.all([
    pedir<PaginaPreCadastros>("/pre-cadastros" + qs({ caixa: "fila", porPagina: 1 })),
    pedir<PaginaTransferencias>("/transferencias" + qs({ caixa: "chegando", porPagina: 1 })),
    pedir<{ total: number }>("/fichas-repetidas"),
    pedir<Sugestao[]>("/fila-aprovacoes")
  ]);
  contadores.fila = fila.ok ? Number(fila.dados.total) || 0 : 0;
  contadores.transferencias = tr.ok ? Number(tr.dados.total) || 0 : 0;
  contadores.repetidas = rep.ok ? Number(rep.dados.total) || 0 : 0;
  contadores.sugestoes = sug.ok && Array.isArray(sug.dados) ? sug.dados.length : 0;
  contadores.lidos = true;
}

// ---- os catálogos (lidos uma vez por entrada no módulo) ----
let depsPromessa: Promise<readonly Departamento[]> | null = null;
export function departamentos(): Promise<readonly Departamento[]> {
  depsPromessa ??= pedir<Departamento[] | { itens: Departamento[] }>("/catalogos/departamentos").then((r) => {
    if (!r.ok) { depsPromessa = null; return []; }
    const lista = Array.isArray(r.dados) ? r.dados : r.dados.itens ?? [];
    return lista.filter((d) => d.ativo !== false);
  });
  return depsPromessa;
}
let congsPromessa: Promise<readonly Congregacao[]> | null = null;
/** as congregações para onde se pode transferir (com a área) */
export function congregacoesDestino(): Promise<readonly Congregacao[]> {
  congsPromessa ??= pedir<{ congregacoes: Congregacao[] }>("/transferencias" + qs({ destinos: 1 })).then((r) => {
    if (!r.ok) { congsPromessa = null; return []; }
    return (r.dados.congregacoes ?? []).filter((c) => c.ativa !== false);
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
}
