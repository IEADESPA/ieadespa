// A ENTRADA do módulo Financeiro (FASE 10, módulo 2, telas refeitas em Svelte + TypeScript, o desenho aprovado das rodadas 13 a 26). A casca
// (app/modulos/casca.js, abrirFinanceiroSvelte) baixa este arquivo SÓ quando a pessoa entra em Finanças e chama montar(): o menu vai para a barra
// da esquerda e as telas para o conteúdo.
import "./comum/tokens.css";
import { mount, unmount } from "svelte";
import { guardarPonte, type Ponte } from "./comum/ponte";
import { vigiarTela } from "./comum/tela.svelte";
import App from "./financeiro/App.svelte";
import Menu from "./financeiro/Menu.svelte";
import { ir, zerarModulo, lerRota } from "./financeiro/estado.svelte";

type Montado = ReturnType<typeof mount>;
let montados: Montado[] = [];

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
  if (r) ir(r);
}

/** desmonta ao sair do módulo (e na saída da sessão: nada fica na página) */
export function desmontar(): void {
  for (const m of montados) void unmount(m);
  montados = [];
  zerarModulo();
}
