<!-- O cartão branco do desenho (borda fina, cantos de 14 px): título com ícone opcional, a nota à direita e o conteúdo. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icone from "./Icone.svelte";

  interface Props { titulo?: string; nota?: string; icone?: string; pad?: "normal" | "justo" | "nenhum"; children: Snippet; direita?: Snippet; id?: string }
  let { titulo, nota, icone, pad = "normal", children, direita, id }: Props = $props();
</script>

<section class="cartao {pad}" {id}>
  {#if titulo}
    <div class="topo">
      {#if icone}<span class="ic"><Icone nome={icone} tam={18} traco={2} /></span>{/if}
      <h2>{titulo}</h2>
      {#if nota}<span class="nota">{nota}</span>{/if}
      {#if direita}{@render direita()}{/if}
    </div>
  {/if}
  {@render children()}
</section>

<style>
  .cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .normal { padding: 14px 16px; }
  .justo { padding: 4px 16px; }
  .nenhum { padding: 0; overflow: hidden; }
  .topo { display: flex; align-items: center; gap: 8px; min-height: 28px; }
  .justo .topo { padding-top: 10px; }
  h2 { font-size: 16px; font-weight: 700; color: var(--sv-titulo); flex: 1; min-width: 0; }
  .ic { color: var(--sv-titulo); display: flex; }
  .nota { font-size: 12.5px; color: var(--sv-suave); white-space: nowrap; }
</style>
