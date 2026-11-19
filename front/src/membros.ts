// A ENTRADA do módulo Membros (FASE 10, telas refeitas do zero em Svelte + TypeScript). A casca (app/modulos/casca.js, abrirModuloSvelte) baixa
// este arquivo SÓ quando a pessoa entra em Membros ou abre a Minha vida, e chama montar(): o menu vai para a barra da esquerda e as telas para o conteúdo.
import "./comum/tokens.css";
import { mount, unmount } from "svelte";
import { guardarPonte, type Ponte } from "./comum/ponte";
import { vigiarTela } from "./comum/tela.svelte";
import App from "./membros/App.svelte";
import Menu from "./membros/Menu.svelte";
import { ir, zerarModulo, lerRota } from "./membros/estado.svelte";
export { limparRascunho } from "./membros/rascunho.svelte";

type Montado = ReturnType<typeof mount>;
let montados: Montado[] = [];
let minhaVida: Montado | null = null;

export interface Alvos { readonly menu: HTMLElement; readonly conteudo: HTMLElement }

/** monta o módulo (ou só leva a outra tela, se já estiver montado) */
export function montar(alvos: Alvos, p: Ponte, rota?: unknown): void {
  guardarPonte(p);
  vigiarTela();
  if (!montados.length) {
    zerarModulo();
    const menu = mount(Menu, { target: alvos.menu });
    try {
      montados = [menu, mount(App, { target: alvos.conteudo })];
    } catch (e) {
      void unmount(menu);   // nada pela metade: na próxima entrada o menu não aparece em dobro
      throw e;
    }
  }
  const r = lerRota(rota);
  if (r) ir(r, true);
}

/** desmonta ao sair do módulo (nada fica ouvindo nem guardando a pessoa aberta) */
export function desmontar(): void {
  for (const m of montados) void unmount(m);
  montados = [];
  zerarModulo();
}

/** a Minha vida na igreja (o membro vê tudo o que é dele), dentro da página da casca */
// a Minha vida vem num pedaço próprio: o membro que nunca entra em Membros não baixa as telas da secretaria
let pedidoMinhaVida = 0;
export async function montarMinhaVida(alvo: HTMLElement, p: Ponte, parte?: string): Promise<void> {
  guardarPonte(p);
  vigiarTela();
  const meu = ++pedidoMinhaVida;
  const { default: MinhaVida } = await import("./membros/minha-vida/MinhaVida.svelte");
  if (meu !== pedidoMinhaVida) return;   // outro pedido (ou a saída da página) chegou antes
  if (minhaVida) void unmount(minhaVida);
  minhaVida = mount(MinhaVida, { target: alvo, props: { parteInicial: parte ?? "linha" } });
}
export function desmontarMinhaVida(): void {
  pedidoMinhaVida++;
  if (minhaVida) void unmount(minhaVida);
  minhaVida = null;
}
