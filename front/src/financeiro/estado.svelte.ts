// O estado do módulo Financeiro que as telas dividem: em que tela a pessoa está, o menu aprovado (rodada 13, "por tipo de trabalho", com os
// acréscimos da rodada 17: o resumo no alto de cada grupo, os blocos de recibo e os tipos de entrada e saída) e quem está vendo.
// Os itens do menu que ainda não foram construídos abrem o aviso "em construção" (nunca a tela antiga no lugar). Os itens que as rodadas 18 a
// 26 acrescentaram (despesas congregacionais, caixa único, para o contador, saldo das congregações) entram no incremento da tela de cada um.
import { ponte } from "../comum/ponte";
import type { EscopoTela } from "./tipos";

export type Nivel = "geral" | "area" | "local";
export type AbaBlocos = "blocos" | "folhas" | "livro";

/** os itens do menu (a chave é a tela; o rótulo e o ícone são os do desenho aprovado) */
export type ChaveMenu =
  | "resumo-tesouraria" | "lancamentos" | "dizimistas" | "blocos" | "saidas" | "fechamento" | "conciliacao" | "fechamentos-area"
  | "resumo-contas" | "contas-receber" | "investimentos" | "seguros" | "obrigacoes"
  | "resumo-planejamento" | "orcamento" | "campanhas" | "obras" | "pdq"
  | "resumo-patrimonio" | "patrimonio" | "imoveis" | "frota" | "cessoes" | "receitas-acessorias"
  | "resumo-repasses" | "prebenda" | "repasses" | "repasses-area" | "rateio"
  | "resumo-relatorios" | "visao-geral" | "situacao-tesouro" | "demonstracoes" | "relatorio-mes" | "consolidado" | "consolidado-area"
  | "resumo-regras" | "plano-contas" | "tipos" | "parametros" | "parametros-monetarios" | "imunidade";

export interface ItemMenu { readonly chave: ChaveMenu; readonly rotulo: string; readonly icone: string; readonly niveis: readonly Nivel[] }
export interface GrupoMenu { readonly nome: string; readonly icone: string; readonly itens: readonly ItemMenu[] }

const T: readonly Nivel[] = ["geral", "area", "local"];   // todos os níveis
const GA: readonly Nivel[] = ["geral", "area"];
const G: readonly Nivel[] = ["geral"];
const it = (chave: ChaveMenu, rotulo: string, icone: string, niveis: readonly Nivel[] = T): ItemMenu => ({ chave, rotulo, icone, niveis });

/** o menu aprovado (rodada 17, r17-blocos op. 1): o que cada nível enxerga está em `niveis` (a Geral vê tudo) */
export const MENU: readonly GrupoMenu[] = [
  { nome: "Tesouraria do dia a dia", icone: "planilha", itens: [
    it("resumo-tesouraria", "Resumo da tesouraria", "grafico"), it("lancamentos", "Lançamentos", "planilha"), it("dizimistas", "Dizimistas", "pessoas"),
    it("blocos", "Blocos de recibo", "livro"), it("saidas", "Saídas", "dinheiro"), it("fechamento", "Fechamento do mês", "calendario"),
    it("conciliacao", "Conciliação bancária", "check"), it("fechamentos-area", "Fechamentos da área", "pasta", GA)
  ] },
  { nome: "Contas e bancos", icone: "banco", itens: [
    it("resumo-contas", "Resumo de contas", "grafico"), it("contas-receber", "Contas a receber", "calendario"), it("investimentos", "Investimentos", "grafico", G),
    it("seguros", "Seguros", "pasta", G), it("obrigacoes", "Obrigações", "pasta")
  ] },
  { nome: "Planejamento", icone: "alvo", itens: [
    it("resumo-planejamento", "Resumo do planejamento", "grafico"), it("orcamento", "Orçamento", "pasta"), it("campanhas", "Campanhas", "pasta"),
    it("obras", "Obras", "pasta"), it("pdq", "Plano (PDQ)", "pasta", G)
  ] },
  { nome: "Patrimônio", icone: "casas", itens: [
    it("resumo-patrimonio", "Resumo do patrimônio", "grafico"), it("patrimonio", "Patrimônio", "pasta"), it("imoveis", "Imóveis", "pasta", G),
    it("frota", "Frota", "pasta", G), it("cessoes", "Cessões", "igreja"), it("receitas-acessorias", "Receitas acessórias", "pasta")
  ] },
  { nome: "Pessoas e repasses", icone: "seta", itens: [
    it("resumo-repasses", "Resumo dos repasses", "grafico"), it("prebenda", "Prebenda", "pessoa", G), it("repasses", "Repasses", "seta"),
    it("repasses-area", "Repasses da área", "pasta", GA), it("rateio", "Rateio geral", "balanca", G)
  ] },
  { nome: "Relatórios", icone: "grafico", itens: [
    it("resumo-relatorios", "Resumo dos relatórios", "grafico"), it("visao-geral", "Visão geral", "grafico"), it("situacao-tesouro", "Situação do tesouro", "grafico"),
    it("demonstracoes", "Demonstrações", "doc"), it("relatorio-mes", "Relatório do mês", "doc"), it("consolidado", "Consolidado", "grafico", GA),
    it("consolidado-area", "Consolidado da área", "pasta", GA)
  ] },
  { nome: "Regras e cadastros", icone: "engrenagem", itens: [
    it("resumo-regras", "Resumo das regras", "grafico"), it("plano-contas", "Plano de contas", "pasta"), it("tipos", "Tipos de entrada e saída", "planilha"),
    it("parametros", "Parâmetros", "pasta"), it("parametros-monetarios", "Parâmetros monetários", "pasta", G), it("imunidade", "Imunidade", "pasta")
  ] }
];

const ITENS = new Map<string, ItemMenu>(MENU.flatMap((g) => g.itens.map((i) => [i.chave, i] as const)));
export const itemDe = (chave: ChaveMenu): ItemMenu | undefined => ITENS.get(chave);

/** o menu de um nível (só os grupos com algum item) */
export function menuDoNivel(n: Nivel): readonly GrupoMenu[] {
  return MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => i.niveis.includes(n)) })).filter((g) => g.itens.length > 0);
}

/** as telas do módulo: as construídas e o aviso "em construção" de um item do menu */
export type Rota =
  | { readonly tela: "blocos"; readonly aba: AbaBlocos; /** no livro: abre o "Registrar saída" já com esta folha (o bloco que voltou em parte) */ readonly saida?: number }
  | { readonly tela: "lancamentos" }
  | { readonly tela: "obra"; readonly item: ChaveMenu };

/** as telas construídas, pelo item do menu (o resto abre o aviso "em construção"). Ponto de encaixe: os itens novos (os centros de custo de
 *  dezembro, por exemplo) entram aqui, em lerRota e em irItem. */
const CONSTRUIDAS: ReadonlySet<ChaveMenu> = new Set<ChaveMenu>(["blocos", "lancamentos"]);

/** a rota que chega de FORA (a casca): só telas conhecidas; o resto é ignorado (fica a tela de agora) */
export function lerRota(x: unknown): Rota | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.tela === "blocos") return { tela: "blocos", aba: o.aba === "folhas" || o.aba === "livro" ? o.aba : "blocos" };
  if (o.tela === "lancamentos") return { tela: "lancamentos" };
  if (o.tela === "obra" && typeof o.item === "string" && ITENS.has(o.item) && !CONSTRUIDAS.has(o.item as ChaveMenu)) return { tela: "obra", item: o.item as ChaveMenu };
  return null;
}

/** o item do menu de cada tela (o item marcado e o caminho do topo) */
export const itemDoMenu = (r: Rota): ChaveMenu => (r.tela === "obra" ? r.item : r.tela);

/** a 1ª tela do módulo: os blocos de recibo (a primeira construída) */
const INICIO: Rota = { tela: "blocos", aba: "blocos" };
export const nav = $state<{ rota: Rota }>({ rota: INICIO });

/** abre uma tela (um item do menu começa o caminho de novo) */
export function ir(r: Rota): void {
  nav.rota = r;
  const conteudo = document.querySelector(".conteudo");
  if (conteudo) conteudo.scrollTop = 0;
}
export function irItem(chave: ChaveMenu): void {
  ir(chave === "blocos" ? { tela: "blocos", aba: "blocos" } : chave === "lancamentos" ? { tela: "lancamentos" } : { tela: "obra", item: chave });
}

/** o que a tela de agora pede à barra do alto: o título no celular ("Lançar") e o passo a mais do caminho, com o voltar (a área que abriu a
 *  planilha de uma congregação volta para a lista dela). A tela põe e tira. */
export const barra = $state<{ tituloCelular: string | null; passo: { readonly rotulo: string; readonly voltar: () => void } | null }>({ tituloCelular: null, passo: null });

/** o nível de quem está vendo: a Geral, a área (mais de uma congregação) ou a congregação. O servidor confere tudo de novo. */
export function nivelDaSessao(): Nivel {
  const s = ponte().sessao();
  if (s.geral) return "geral";
  if (s.nivel && !["CONGREGACAO", "LOCAL"].includes(s.nivel)) return "area";
  return "local";
}

/** o alcance de quem está vendo, como o servidor disse (a 1ª lista dos blocos o traz) */
export const escopo = $state<{ tela: EscopoTela | null }>({ tela: null });

/** o cabeçalho do módulo no menu (desenho: "Sede administrativa · Tesouraria Geral", "Área 2 · 12 congregações", "Congregação Vila Nova") */
export function textoEscopoModulo(e: EscopoTela | null): string {
  if (e?.geral || (!e && ponte().sessao().geral)) return "Sede administrativa · Tesouraria Geral";
  if (!e) return "";
  if (e.congregacao) return `Congregação ${e.congregacao}`;
  const n = `${e.congregacoes} ${e.congregacoes === 1 ? "congregação" : "congregações"}`;
  return e.area ? `${e.area} · ${n}` : n;
}

export function zerarModulo(): void {
  nav.rota = INICIO;
  escopo.tela = null;
  barra.tituloCelular = null;
  barra.passo = null;
}
