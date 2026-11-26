<!-- O módulo Financeiro ("Finanças" no desenho): a tela de agora, o caminho no topo ("Finanças › Blocos de recibo") e o cabeçalho do módulo.
     No celular, a barra do alto mostra o título que a tela pedir ("Lançar") e, com uma peça cobrindo a tela (o seletor), o título e o voltar
     dela. -->
<script lang="ts">
  import { ponte } from "../comum/ponte";
  import { tela, sobreposta } from "../comum/tela.svelte";
  import EmConstrucao from "../comum/EmConstrucao.svelte";
  import { nav, ir, itemDe, itemDoMenu, escopo, textoEscopoModulo, barra } from "./estado.svelte";
  import Blocos from "./telas/Blocos.svelte";
  import Lancamentos from "./telas/Lancamentos.svelte";

  const rotuloAgora = $derived(itemDe(itemDoMenu(nav.rota))?.rotulo ?? "Finanças");

  $effect(() => {
    const p = ponte();
    const rotulo = rotuloAgora;
    const passo = barra.passo;
    const partes = [{ rotulo: "Finanças", ir: () => ir({ tela: "blocos", aba: "blocos" }) }, passo ? { rotulo, ir: passo.voltar } : { rotulo }, ...(passo ? [{ rotulo: passo.rotulo }] : [])];
    p.trilha(partes, sobreposta.titulo ?? barra.tituloCelular ?? rotulo, sobreposta.fechar ?? passo?.voltar ?? null);
    p.menuRecolhido(null);
  });
  $effect(() => { const t = textoEscopoModulo(escopo.tela); if (t) ponte().escopoDoModulo(t); });
</script>

<div class="sv financeiro" class:celular={tela.celular}>
  <div class="tela">
    {#if nav.rota.tela === "blocos"}
      <Blocos aba={nav.rota.aba} celular={tela.celular} />
    {:else if nav.rota.tela === "lancamentos"}
      <Lancamentos celular={tela.celular} />
    {:else}
      <div class="pilha">
        {#if !tela.celular}<h1 class="tit">{rotuloAgora}</h1>{/if}
        <EmConstrucao titulo={rotuloAgora} texto="Esta parte do Financeiro novo ainda vai ser construída, na ordem do desenho aprovado." />
      </div>
    {/if}
  </div>
</div>

<style>
  /* a cor do módulo (MODS.financas do desenho): o verde-azulado no lugar do azul de Membros */
  .financeiro { display: flex; flex-direction: column; min-height: 100%; --sv-mod: #0F766E; --sv-mod-fundo: #DDF3EF; --fin-forte: #0F766E; --fin-forte-texto: #FFFFFF; }
  :global(html[data-tema="escuro"]) .financeiro { --sv-mod: #5EEAD4; --sv-mod-fundo: #0F3D3A; --fin-forte: #5EEAD4; --fin-forte-texto: #082B28; }
  .tela { display: flex; flex-direction: column; gap: 12px; animation: aparece .18s ease-out; }
  .pilha { display: flex; flex-direction: column; gap: 14px; }
  .tit { font-size: 22px; font-weight: 700; color: var(--sv-titulo); }
  .celular .tela { padding: 12px 14px; }
  @keyframes aparece { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
</style>
